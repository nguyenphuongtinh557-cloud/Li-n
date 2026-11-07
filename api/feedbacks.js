/**
 * api/feedbacks.js — Support tickets backed by Firestore.
 *
 * GET    : students read only their own tickets; admins read every non-deleted ticket.
 * POST   : signed-in students create a ticket. userEmail always comes from the verified token.
 * PATCH  : admin-only status/reply update. Creates a private announcement for the student.
 * DELETE : admin-only soft delete (deletedAt), so a pulled copy cannot resurrect it.
 */

import admin from 'firebase-admin';
import { verifyFirebaseUser } from '../lib/firebaseAuth.js';
import { getAdminEmails } from '../lib/adminAccess.js';

const COLLECTION = 'feedbacks';
const ANNOUNCEMENTS = 'announcements';
const ALLOWED_STATUS = new Set(['submitted', 'acknowledged', 'processing', 'fixed', 'unable']);
const ALLOWED_TYPES = new Set(['bug', 'content', 'feature', 'other']);
const ALLOWED_PRIORITY = new Set(['low', 'normal', 'high', 'urgent']);
const STATUS_LABEL = {
  acknowledged: 'Đã ghi nhận',
  processing: 'Đang xử lý',
  fixed: 'Đã sửa',
  unable: 'Không tái hiện được'
};
const STATUS_MESSAGE = {
  acknowledged: 'Chúng tôi đã tiếp nhận yêu cầu và sẽ sớm cập nhật thêm thông tin đến bạn.',
  processing: 'Yêu cầu đang được đội ngũ kiểm tra và xử lý. Cảm ơn bạn đã kiên nhẫn chờ đợi.',
  fixed: 'Vấn đề đã được xử lý. Xin cảm ơn bạn đã phản hồi để chúng tôi cải thiện hệ thống.',
  unable: 'Đội ngũ hiện chưa thể tái hiện vấn đề. Nếu thuận tiện, bạn vui lòng bổ sung thêm thông tin hoặc ảnh minh họa để chúng tôi hỗ trợ tốt hơn.'
};

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

function getParam(req, name) {
  const query = req.query && typeof req.query === 'object' ? req.query : {};
  const search = new URL(req.url || '/', 'https://fteca.invalid').searchParams;
  return String(query[name] ?? search.get(name) ?? '').trim();
}

function cleanText(value, limit) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeTicket(input, user) {
  const title = cleanText(input.title, 200);
  const content = String(input.content || '').trim().slice(0, 5_000);
  if (!title) return { error: 'title-required' };
  if (!content) return { error: 'content-required' };

  const now = new Date().toISOString();
  const id = `FB_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const userName = cleanText(input.userName, 120) || user.email.split('@')[0];
  const ticket = {
    id,
    ticketCode: `TK-${String(Date.now()).slice(-6)}`,
    type: ALLOWED_TYPES.has(String(input.type || '')) ? input.type : 'bug',
    priority: ALLOWED_PRIORITY.has(String(input.priority || '')) ? input.priority : 'normal',
    title,
    content,
    page: cleanText(input.page, 500),
    device: cleanText(input.device, 500),
    userName,
    userEmail: user.email,
    status: 'submitted',
    adminResponse: '',
    createdAt: now,
    updatedAt: now,
    history: [{
      status: 'submitted',
      message: 'Đã gửi báo cáo đến quản trị viên.',
      at: now,
      actor: userName
    }]
  };
  return { ticket };
}

function buildReplyAnnouncement(ticket, status, adminResponse, adminEmail) {
  const now = new Date().toISOString();
  const label = STATUS_LABEL[status] || status;
  const ticketCode = escapeHtml(ticket.ticketCode || ticket.id);
  const ticketTitle = escapeHtml(ticket.title || 'yêu cầu hỗ trợ của bạn');
  const responseBlock = adminResponse
    ? `<p><strong>Nội dung phản hồi từ đội ngũ:</strong><br>${escapeHtml(adminResponse)}</p>`
    : '';
  return {
    id: `ANN_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: `Cập nhật yêu cầu hỗ trợ ${ticketCode}`,
    content: `<p><strong>Xin chào bạn,</strong></p><p>Cảm ơn bạn đã gửi phản hồi về “<strong>${ticketTitle}</strong>”. Yêu cầu <strong>${ticketCode}</strong> hiện ở trạng thái: <strong>${label}</strong>.</p><p>${STATUS_MESSAGE[status] || 'Yêu cầu của bạn đã được cập nhật.'}</p>${responseBlock}<p>Trân trọng,<br><strong>Đội ngũ hỗ trợ FTECA 24</strong></p>`,
    type: status === 'fixed' ? 'success' : 'info',
    category: 'Phản hồi ticket',
    scope: 'user',
    recipientEmail: ticket.userEmail,
    excerpt: `Yêu cầu ${ticketCode} hiện ở trạng thái: ${label}.`,
    links: [],
    attachment: null,
    author: 'Đội ngũ hỗ trợ FTECA 24',
    createdAt: now,
    updatedAt: now,
    createdBy: adminEmail
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return json(res, 405, { ok: false, reason: 'method-not-allowed' });
  }

  let user;
  try {
    user = await verifyFirebaseUser(req);
  } catch (error) {
    return json(res, error.status || 401, { ok: false, reason: error.message || 'unauthorized' });
  }
  if (!user.email) return json(res, 403, { ok: false, reason: 'email-required' });

  const isAdmin = getAdminEmails().has(user.email);
  if (req.method !== 'GET' && req.method !== 'POST' && !isAdmin) {
    return json(res, 403, { ok: false, reason: 'admin-required' });
  }

  const account = getServiceAccount();
  if (!account.ok) return json(res, 503, { ok: false, reason: account.reason });

  try {
    const db = getFirestore(account.serviceAccount);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (req.method === 'GET') {
      let query = db.collection(COLLECTION);
      if (!isAdmin) query = query.where('userEmail', '==', user.email);
      const snapshot = await query.limit(isAdmin ? 500 : 200).get();
      const feedbacks = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => !item.deletedAt)
        .sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || '') || 0) - (Date.parse(a.updatedAt || a.createdAt || '') || 0));
      return json(res, 200, { ok: true, feedbacks });
    }

    if (req.method === 'POST') {
      const raw = body.feedback && typeof body.feedback === 'object' ? body.feedback : body;
      const normalized = normalizeTicket(raw, user);
      if (normalized.error) return json(res, 400, { ok: false, reason: normalized.error });
      await db.collection(COLLECTION).doc(normalized.ticket.id).set(normalized.ticket);
      return json(res, 200, { ok: true, feedback: normalized.ticket });
    }

    if (req.method === 'PATCH') {
      const id = String(body.id || getParam(req, 'id') || '').trim();
      const status = String(body.status || '').trim();
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return json(res, 400, { ok: false, reason: 'invalid-id' });
      if (!ALLOWED_STATUS.has(status)) return json(res, 400, { ok: false, reason: 'invalid-status' });

      const ref = db.collection(COLLECTION).doc(id);
      const snapshot = await ref.get();
      if (!snapshot.exists) return json(res, 404, { ok: false, reason: 'ticket-not-found' });
      const current = snapshot.data();
      if (current.deletedAt) return json(res, 404, { ok: false, reason: 'ticket-deleted' });

      const now = new Date().toISOString();
      const adminResponse = String(body.adminResponse ?? current.adminResponse ?? '').slice(0, 2_000);
      const label = STATUS_LABEL[status] || status;
      const history = Array.isArray(current.history) ? current.history.slice(-99) : [];
      history.push({
        status,
        message: adminResponse || `Ticket ${label.toLowerCase()}.`,
        at: now,
        actor: 'Admin'
      });

      const feedback = {
        ...current,
        status,
        adminResponse,
        updatedAt: now,
        history
      };
      await ref.set(feedback, { merge: true });

      let announcement = null;
      if (current.userEmail) {
        announcement = buildReplyAnnouncement(feedback, status, adminResponse, user.email);
        await db.collection(ANNOUNCEMENTS).doc(announcement.id).set(announcement);
      }

      return json(res, 200, { ok: true, feedback, announcement });
    }

    const id = String(body.id || getParam(req, 'id') || '').trim();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return json(res, 400, { ok: false, reason: 'invalid-id' });
    const ref = db.collection(COLLECTION).doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return json(res, 200, { ok: true, id, missing: true });
    await ref.set({
      deletedAt: new Date().toISOString(),
      deletedBy: user.email
    }, { merge: true });
    return json(res, 200, { ok: true, id });
  } catch (error) {
    console.error('[Feedbacks API]', error);
    return json(res, 500, { ok: false, reason: 'feedbacks-api-error' });
  }
}
