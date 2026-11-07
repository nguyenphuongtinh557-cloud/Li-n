/**
 * api/resources.js — Learning resources backed by Firestore.
 *
 * GET    : public list for the study pages (legacy resources imported once).
 * POST   : admin-only create/update.
 * DELETE : admin-only soft delete so a cached copy cannot resurrect it.
 *
 * Firestore documents are capped at 1 MiB, so very large embedded files are
 * rejected with `resource-too-large`; the client keeps those on the device only.
 */

import admin from 'firebase-admin';
import { verifyFirebaseUser } from '../lib/firebaseAuth.js';
import { getAdminEmails } from '../lib/adminAccess.js';

const COLLECTION = 'resources';
const MAX_ITEMS = 1_000;
const MAX_DOC_BYTES = 900_000;
const ALLOWED_TYPES = new Set(['info', 'lecture', 'exam', 'quiz', 'slide', 'outline', 'video', 'reference']);
const ALLOWED_MODES = new Set(['url', 'file', 'editor']);
const LEGACY_RESOURCES_URL = 'https://raw.githubusercontent.com/nguyenphuongtinh557-cloud/Li-n/main/data/learning_resources.json';

let legacySeedPromise = null;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function getServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return { ok: false, reason: 'missing-firebase-service-account' };
  try {
    return { ok: true, serviceAccount: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: 'invalid-firebase-service-account-json' };
  }
}

function getFirestore(serviceAccount) {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

function cleanText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function getParam(req, name) {
  const query = req.query && typeof req.query === 'object' ? req.query : {};
  const search = new URL(req.url || '/', 'https://fteca.invalid').searchParams;
  return String(query[name] ?? search.get(name) ?? '').trim();
}

function normalizeResource(input, adminEmail, existing = null) {
  const subjectId = cleanText(input.subjectId, 80);
  const name = cleanText(input.name, 300);
  if (!subjectId) return { error: 'subject-required' };
  if (!name) return { error: 'name-required' };

  const now = new Date().toISOString();
  const rawId = String(input.id || '').trim();
  const id = /^[A-Za-z0-9_-]{1,100}$/.test(rawId)
    ? rawId
    : `RES_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const resource = {
    id,
    subjectId,
    name,
    type: ALLOWED_TYPES.has(String(input.type || '')) ? input.type : 'lecture',
    url: String(input.url || '').slice(0, 1_000_000),
    content: String(input.content || '').slice(0, 500_000),
    fileName: cleanText(input.fileName, 300),
    year: cleanText(input.year, 80),
    inputMode: ALLOWED_MODES.has(String(input.inputMode || '')) ? input.inputMode : 'url',
    author: cleanText(input.author || 'Admin', 120) || 'Admin',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || adminEmail
  };

  if (Buffer.byteLength(JSON.stringify(resource), 'utf8') > MAX_DOC_BYTES) {
    return { error: 'resource-too-large' };
  }
  return { resource };
}

async function importLegacyResources(db) {
  const probe = await db.collection(COLLECTION).limit(1).get();
  if (!probe.empty) return true;
  try {
    const response = await fetch(`${LEGACY_RESOURCES_URL}?t=${Date.now()}`, {
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return false;
    const legacy = await response.json();
    if (!Array.isArray(legacy) || !legacy.length) return false;

    const batch = db.batch();
    for (const raw of legacy.slice(0, MAX_ITEMS)) {
      const normalized = normalizeResource(raw, 'legacy-import');
      if (normalized.error) continue;
      const resource = normalized.resource;
      if (raw.createdAt) resource.createdAt = raw.createdAt;
      resource.updatedAt = raw.updatedAt || raw.createdAt || resource.createdAt;
      batch.set(db.collection(COLLECTION).doc(resource.id), resource);
    }
    await batch.commit();
    console.log('[Resources API] Imported legacy resources:', legacy.length);
    return true;
  } catch (error) {
    console.warn('[Resources API] Legacy import skipped:', error?.message || error);
    return false;
  }
}

async function ensureLegacyResources(db) {
  if (!legacySeedPromise) {
    legacySeedPromise = importLegacyResources(db)
      .then(seeded => {
        if (!seeded) legacySeedPromise = null;
        return seeded;
      })
      .catch(error => {
        legacySeedPromise = null;
        console.warn('[Resources API] Legacy import failed:', error?.message || error);
      });
  }
  return legacySeedPromise;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return json(res, 405, { ok: false, reason: 'method-not-allowed' });
  }

  const account = getServiceAccount();
  if (!account.ok) return json(res, 503, { ok: false, reason: account.reason });

  let user = null;
  if (req.method !== 'GET') {
    try {
      user = await verifyFirebaseUser(req);
    } catch (error) {
      return json(res, error.status || 401, { ok: false, reason: error.message || 'unauthorized' });
    }
    if (!getAdminEmails().has(String(user.email || '').toLowerCase())) {
      return json(res, 403, { ok: false, reason: 'admin-required' });
    }
  }

  try {
    const db = getFirestore(account.serviceAccount);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (req.method === 'GET') {
      await ensureLegacyResources(db);
      const snapshot = await db.collection(COLLECTION).limit(MAX_ITEMS).get();
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const resources = docs
        .filter(item => !item.deletedAt)
        .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
      const deletedIds = docs.filter(item => item.deletedAt).map(item => item.id);
      return json(res, 200, { ok: true, resources, deletedIds });
    }

    const raw = body.resource && typeof body.resource === 'object' ? body.resource : body;

    if (req.method === 'POST') {
      const rawId = String(raw.id || '').trim();
      const id = /^[A-Za-z0-9_-]{1,100}$/.test(rawId)
        ? rawId
        : `RES_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const ref = db.collection(COLLECTION).doc(id);
      const current = await ref.get();
      const normalized = normalizeResource({ ...raw, id }, user.email, current.exists ? current.data() : null);
      if (normalized.error) {
        return json(res, normalized.error === 'resource-too-large' ? 413 : 400, { ok: false, reason: normalized.error });
      }
      await ref.set(normalized.resource);
      return json(res, 200, { ok: true, resource: normalized.resource });
    }

    const id = String(raw.id || getParam(req, 'id') || '').trim();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
      return json(res, 400, { ok: false, reason: 'invalid-id' });
    }
    const ref = db.collection(COLLECTION).doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return json(res, 200, { ok: true, id, missing: true });
    await ref.set({
      deletedAt: new Date().toISOString(),
      deletedBy: user.email
    }, { merge: true });
    return json(res, 200, { ok: true, id });
  } catch (error) {
    console.error('[Resources API]', error);
    return json(res, 500, { ok: false, reason: 'resources-api-error' });
  }
}
