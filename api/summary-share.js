import admin from 'firebase-admin';

const COLLECTION = 'summaryShares';
const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SUMMARY_BYTES = 450_000;
const MAX_DOCUMENT_HTML_BYTES = 450_000;
const MAX_SHARE_BYTES = 850_000;
const rateBuckets = new Map();

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function getServiceAccount() {
  const serialized = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serialized) return null;
  try {
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}

function getFirestore(serviceAccount) {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.firestore();
}

async function requireUser(req, serviceAccount) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) throw Object.assign(new Error('authentication-required'), { status: 401 });
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const decoded = await admin.auth().verifyIdToken(token);
  if (!decoded.uid) throw Object.assign(new Error('authentication-required'), { status: 401 });
  return decoded.uid;
}

function allowRequest(req) {
  const client = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous').split(',')[0].trim();
  const now = Date.now();
  const requests = (rateBuckets.get(client) || []).filter(time => now - time < 60_000);
  if (requests.length >= 30) return false;
  requests.push(now);
  rateBuckets.set(client, requests);
  return true;
}

function cleanSummary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const overview = typeof value.overview === 'string' ? value.overview.slice(0, 30_000) : '';
  const chapters = Array.isArray(value.chapters) ? value.chapters.slice(0, 100).map(chapter => ({
    title: String(chapter?.title || '').slice(0, 500),
    content: String(chapter?.content || '').slice(0, 30_000)
  })) : [];
  if (!overview && !chapters.length) return null;
  const summary = { overview, chapters };
  if (Buffer.byteLength(JSON.stringify(summary), 'utf8') > MAX_SUMMARY_BYTES) return null;
  return summary;
}

function cleanDocumentHtml(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_DOCUMENT_HTML_BYTES) return null;
  return value;
}

function getShareId(req) {
  const requestUrl = new URL(req.url || '/', 'https://fteca.invalid');
  const shareId = String(req.query?.id || requestUrl.searchParams.get('id') || '');
  return SHARE_ID_PATTERN.test(shareId) ? shareId : '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return json(res, 405, { ok: false, reason: 'method-not-allowed' });
  }
  if (!allowRequest(req)) return json(res, 429, { ok: false, reason: 'rate-limited' });

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) return json(res, 503, { ok: false, reason: 'share-service-not-configured' });

  try {
    const db = getFirestore(serviceAccount);
    if (req.method === 'GET') {
      const shareId = getShareId(req);
      if (!shareId) return json(res, 400, { ok: false, reason: 'invalid-share-id' });
      const snapshot = await db.collection(COLLECTION).doc(shareId).get();
      if (!snapshot.exists) return json(res, 404, { ok: false, reason: 'summary-share-not-found' });
      const data = snapshot.data();
      return json(res, 200, {
        ok: true,
        summary: { title: data.title, result: data.result, documentHtml: data.documentHtml || null, createdAt: data.createdAt }
      });
    }

    const uid = await requireUser(req, serviceAccount);
    if (req.method === 'POST') {
      const { shareId, title, result, documentHtml: rawDocumentHtml } = req.body || {};
      if (!SHARE_ID_PATTERN.test(String(shareId || ''))) {
        return json(res, 400, { ok: false, reason: 'invalid-share-id' });
      }
      const summary = cleanSummary(result);
      const documentHtml = cleanDocumentHtml(rawDocumentHtml);
      const cleanTitle = String(title || '').trim().slice(0, 180);
      if (!cleanTitle || !summary || (rawDocumentHtml != null && rawDocumentHtml !== '' && !documentHtml)
        || Buffer.byteLength(JSON.stringify({ summary, documentHtml }), 'utf8') > MAX_SHARE_BYTES) {
        return json(res, 400, { ok: false, reason: 'invalid-summary' });
      }

      const ref = db.collection(COLLECTION).doc(shareId);
      const existing = await ref.get();
      if (existing.exists && existing.data().ownerUid !== uid) {
        return json(res, 409, { ok: false, reason: 'share-id-conflict' });
      }
      const createdAt = existing.exists ? existing.data().createdAt : new Date().toISOString();
      await ref.set({ ownerUid: uid, title: cleanTitle, result: summary, documentHtml, createdAt, updatedAt: new Date().toISOString() });
      return json(res, 200, { ok: true, shareId, createdAt });
    }

    const sourceIds = Array.isArray(req.body?.sourceIds)
      ? [...new Set(req.body.sourceIds.filter(id => typeof id === 'string' && SHARE_ID_PATTERN.test(id)))]
      : [];
    if (!sourceIds.length || sourceIds.length > 30) {
      return json(res, 400, { ok: false, reason: 'invalid-source-ids' });
    }
    const refs = sourceIds.map(id => db.collection(COLLECTION).doc(id));
    const snapshots = await db.getAll(...refs);
    const ownedRefs = snapshots.filter(snapshot => snapshot.exists && snapshot.data().ownerUid === uid).map(snapshot => snapshot.ref);
    if (ownedRefs.length) {
      const batch = db.batch();
      ownedRefs.forEach(ref => batch.delete(ref));
      await batch.commit();
    }
    return json(res, 200, { ok: true, deleted: ownedRefs.length });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('[SummaryShare] Request failed:', error);
    return json(res, status, { ok: false, reason: error.message || 'summary-share-error' });
  }
}
