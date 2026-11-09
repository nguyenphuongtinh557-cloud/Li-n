import admin from 'firebase-admin';
import { verifyFirebaseUser } from '../lib/firebaseAuth.js';
import { getAdminEmails } from '../lib/adminAccess.js';

const ALLOWED_ROLES = new Set(['PREMIUM', 'NEWBIE']);
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function getServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return { ok: false, reason: 'missing-firebase-service-account' };
  try {
    return { ok: true, serviceAccount: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, reason: 'invalid-firebase-service-account-json' };
  }
}

function emailToDocId(email) {
  return String(email || '').trim().toLowerCase().replace(/[^a-z0-9_@.-]/g, '_');
}

// Vercel tự đổ query vào req.query; node server.js local thì không, nên đọc
// thẳng từ req.url để cùng chạy được ở cả hai môi trường.
function getParams(req) {
  const query = req.query && typeof req.query === 'object' ? req.query : {};
  const search = new URL(req.url || '/', 'https://fteca.invalid').searchParams;
  return {
    pageSize: query.pageSize ?? search.get('pageSize') ?? '',
    cursor: query.cursor ?? search.get('cursor') ?? '',
    self: query.self ?? search.get('self') ?? ''
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!['GET', 'PATCH'].includes(req.method)) {
    return json(res, 405, { ok: false, reason: 'method-not-allowed' });
  }

  let callerEmail;
  try {
    callerEmail = (await verifyFirebaseUser(req)).email;
  } catch (error) {
    return json(res, error.status || 401, { ok: false, reason: error.message || 'unauthorized' });
  }
  const cleanCallerEmail = String(callerEmail || '').trim().toLowerCase();
  const isAdmin = getAdminEmails().has(cleanCallerEmail);

  const params = getParams(req);
  if (req.method === 'PATCH' && !isAdmin) {
    return json(res, 403, { ok: false, reason: 'admin-required' });
  }
  if (req.method === 'GET' && !isAdmin && String(params.self || '') !== '1') {
    return json(res, 403, { ok: false, reason: 'admin-required' });
  }

  const account = getServiceAccount();
  if (!account.ok) return json(res, 503, { ok: false, reason: account.reason });

  try {
    const db = admin.firestore();

    if (req.method === 'GET') {
      // Người dùng đã đăng nhập chỉ được đọc role của chính mình. Đây là nguồn
      // quyền PREMIUM/NEWBIE để thiết bị học viên nhận thay đổi ngay, không phụ
      // thuộc file GitHub cũ đã ngừng ghi.
      if (String(params.self || '') === '1') {
        const selfSnap = await db.collection('users').doc(emailToDocId(cleanCallerEmail)).get();
        const selfData = selfSnap.exists ? (selfSnap.data() || {}) : {};
        return json(res, 200, {
          ok: true,
          self: true,
          email: cleanCallerEmail,
          role: selfData.role === 'PREMIUM' ? 'PREMIUM' : 'NEWBIE',
          found: Boolean(selfSnap.exists)
        });
      }

      const parsedPageSize = Number.parseInt(String(params.pageSize), 10);
      const pageSize = Number.isFinite(parsedPageSize) && parsedPageSize >= 1
        ? Math.min(parsedPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;
      const cursor = String(params.cursor || '').trim();

      // Đọc theo thứ tự mặc định __name__ của Firestore (không orderBy) để
      // không cần composite index. Con trỏ vẫn là id tuyệt đối nên không bỏ rơi
      // hồ sơ ở ranh giới trang (lastLogin có thể trùng mốc giờ tới mili giây).
      // Dashboard tự sắp xếp theo lastLogin sau khi nhận dữ liệu.
      const usersRef = db.collection('users');
      let page = usersRef.limit(pageSize + 1);
      if (cursor) page = page.startAfter(usersRef.doc(cursor));
      const snap = await page.get();

      const docs = snap.docs;
      const hasMore = docs.length > pageSize;
      const rows = hasMore ? docs.slice(0, pageSize) : docs;

      const users = [];
      for (const docSnap of rows) {
        const data = docSnap.data();
        if (data && data.email) {
          users.push({ ...data, email: String(data.email).trim().toLowerCase() });
        }
      }

      const lastDoc = rows[rows.length - 1];

      return json(res, 200, {
        ok: true,
        users,
        pageSize,
        hasMore,
        nextCursor: hasMore && lastDoc ? String(lastDoc.id || '') : '',
        requestedBy: cleanCallerEmail
      });
    }

    const { email, role } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !ALLOWED_ROLES.has(role)) {
      return json(res, 400, { ok: false, reason: 'invalid-role-update' });
    }

    await db.collection('users').doc(emailToDocId(cleanEmail)).set({
      role,
      email: cleanEmail,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return json(res, 200, { ok: true, email: cleanEmail, role });
  } catch (error) {
    const status = error.status || 500;
    return json(res, status, { ok: false, reason: error.message || 'server-error' });
  }
}
