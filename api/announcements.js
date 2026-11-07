/**
 * api/announcements.js — System announcements backed by Firestore.
 *
 * GET    : public announcements for guests; scoped announcements for signed-in users;
 *          admins see everything.
 * POST   : admin-only create.
 * DELETE : admin-only soft delete (deletedAt) so restored/pulled data cannot resurrect it.
 */

import admin from 'firebase-admin';
import { verifyFirebaseUser } from '../lib/firebaseAuth.js';
import { getAdminEmails } from '../lib/adminAccess.js';

const COLLECTION = 'announcements';
const MAX_ITEMS = 500;
const ALLOWED_SCOPES = new Set(['all', 'premium', 'newbie', 'user']);
const ALLOWED_TYPES = new Set(['info', 'update', 'alert', 'success']);

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

function emailToDocId(email) {
  return String(email || '').trim().toLowerCase().replace(/[^a-z0-9_@.-]/g, '_');
}

function cleanText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function getParam(req, name) {
  const query = req.query && typeof req.query === 'object' ? req.query : {};
  const search = new URL(req.url || '/', 'https://fteca.invalid').searchParams;
  return String(query[name] ?? search.get(name) ?? '').trim();
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function getOptionalUser(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  try {
    return await verifyFirebaseUser(req);
  } catch {
    return null;
  }
}

async function getUserRole(db, email) {
  if (!email) return 'NEWBIE';
  if (getAdminEmails().has(email)) return 'ADMIN';
  const snapshot = await db.collection('users').doc(emailToDocId(email)).get();
  if (!snapshot.exists) return 'NEWBIE';
  const role = String(snapshot.get('role') || '').trim().toUpperCase();
  return role === 'PREMIUM' || role === 'ADMIN' ? role : 'NEWBIE';
}

function isVisible(announcement, user, role) {
  const scope = announcement.scope || 'all';
  if (scope === 'all') return true;
  if (!user?.email) return false;
  if (scope === 'user') return announcement.recipientEmail === user.email;
  if (scope === 'premium') return role === 'PREMIUM' || role === 'ADMIN';
  if (scope === 'newbie') return role === 'NEWBIE';
  return false;
}

function normalizeAnnouncement(input, adminEmail) {
  const scope = ALLOWED_SCOPES.has(String(input.scope || 'all')) ? String(input.scope || 'all') : 'all';
  const title = cleanText(input.title, 300);
  if (!title) return { error: 'title-required' };

  const recipientEmail = scope === 'user'
    ? String(input.recipientEmail || '').trim().toLowerCase()
    : '';
  if (scope === 'user' && !recipientEmail) return { error: 'recipient-required' };

  const now = new Date().toISOString();
  const rawId = String(input.id || '').trim();
  const id = /^[A-Za-z0-9_-]{1,80}$/.test(rawId) ? rawId : `ANN_${Date.now()}`;
  const content = String(input.content || '').slice(0, 200_000);
  const attachment = input.attachment && typeof input.attachment === 'object'
    ? {
        name: cleanText(input.attachment.name, 200),
        url: String(input.attachment.url || '').slice(0, 2_000)
      }
    : null;

  return {
    announcement: {
      id,
      title,
      content,
      type: ALLOWED_TYPES.has(String(input.type || '')) ? input.type : 'info',
      category: cleanText(input.category || input.type || 'info', 120) || 'info',
      scope,
      recipientEmail,
      excerpt: cleanText(input.excerpt || stripHtml(content), 200),
      links: Array.isArray(input.links)
        ? input.links.slice(0, 20).map(link => String(link || '').slice(0, 1_000)).filter(Boolean)
        : [],
      attachment,
      author: cleanText(input.author || 'Admin', 120) || 'Admin',
      createdAt: now,
      updatedAt: now,
      createdBy: adminEmail
    }
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return json(res, 405, { ok: false, reason: 'method-not-allowed' });
  }

  const account = getServiceAccount();
  if (!account.ok) return json(res, 503, { ok: false, reason: account.reason });

  let user = null;
  if (req.method === 'GET') {
    user = await getOptionalUser(req);
  } else {
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

    if (req.method === 'GET') {
      const isAdmin = Boolean(user && getAdminEmails().has(user.email));
      const role = isAdmin ? 'ADMIN' : await getUserRole(db, user?.email);
      const snapshot = await db.collection(COLLECTION).limit(MAX_ITEMS).get();
      const visible = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => isAdmin || isVisible(item, user, role));
      const announcements = visible
        .filter(item => !item.deletedAt)
        .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
      // Chỉ trả id của thông báo người dùng đã từng thấy, để máy khác xoá bản cache.
      const deletedIds = visible.filter(item => item.deletedAt).map(item => item.id);
      return json(res, 200, { ok: true, announcements, deletedIds, role });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const raw = body.announcement && typeof body.announcement === 'object' ? body.announcement : body;

    if (req.method === 'POST') {
      const normalized = normalizeAnnouncement(raw, user.email);
      if (normalized.error) return json(res, 400, { ok: false, reason: normalized.error });
      const announcement = normalized.announcement;
      await db.collection(COLLECTION).doc(announcement.id).set(announcement);
      return json(res, 200, { ok: true, announcement });
    }

    const id = String(raw.id || getParam(req, 'id') || '').trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
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
    console.error('[Announcements API]', error);
    return json(res, 500, { ok: false, reason: 'announcements-api-error' });
  }
}
