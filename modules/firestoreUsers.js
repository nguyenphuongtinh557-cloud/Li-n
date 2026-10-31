/**
 * firestoreUsers.js — Real-time User Registry via Firebase Firestore
 *
 * Đồng bộ danh sách học viên lên Firestore collection 'users'
 * Document ID: sanitizeEmail(email)
 */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCcwxsxREppsp3KbCDnQ4ixvz3VC5lxqM4',
  authDomain: 'fifth-chalice-507108-c5.firebaseapp.com',
  projectId: 'fifth-chalice-507108-c5',
  storageBucket: 'fifth-chalice-507108-c5.appspot.com',
  messagingSenderId: '643168500906',
  appId: '1:643168500906:web:a1b2c3d4e5f6'
};

const COLLECTION_NAME = 'users';
let _db = null;

function getDb() {
  if (_db) return _db;
  try {
    const existing = getApps();
    const app = existing.length > 0 ? existing[0] : initializeApp(FIREBASE_CONFIG, 'fteca-users');
    _db = getFirestore(app);
  } catch (e) {
    console.error('[FirestoreUsers] Lỗi khởi tạo Firestore:', e);
    _db = null;
  }
  return _db;
}

function emailToDocId(email) {
  if (!email) return '';
  return String(email).trim().toLowerCase().replace(/[^a-z0-9_@.-]/g, '_');
}

function isLocalDevHost() {
  return typeof window !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

async function getIdToken() {
  try {
    if (window.AuthModule?.getIdToken) return await window.AuthModule.getIdToken();
    const { AuthModule } = await import('./auth.js');
    return await AuthModule.getIdToken();
  } catch {
    return '';
  }
}

async function requestAdminUsers(method, body, path = '/api/admin-users') {
  const token = await getIdToken();
  if (!token) throw new Error('missing-auth-token');

  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.reason || `admin-users-${response.status}`);
  }
  return payload;
}

/**
 * Đẩy/Cập nhật học viên lên Firestore collection 'users'
 * @param {object} user - Object thông tin học viên { name, email, avatar, provider, ... }
 */
export async function upsertUserToFirestore(user) {
  if (!user || !user.email) return { ok: false, reason: 'no-email' };
  const db = getDb();
  if (!db) return { ok: false, reason: 'no-db' };

  const cleanEmail = String(user.email).trim().toLowerCase();
  const docId = emailToDocId(cleanEmail);
  const ref = doc(db, COLLECTION_NAME, docId);

  const now = new Date().toISOString();
  
  try {
    // Đọc thông tin cũ để giữ firstSeen nếu có
    const snap = await getDoc(ref).catch(() => null);
    const existingData = snap && snap.exists() ? snap.data() : {};

    const userData = {
      name: user.name || existingData.name || cleanEmail.split('@')[0],
      email: cleanEmail,
      avatar: user.avatar || existingData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail)}`,
      provider: user.provider || existingData.provider || 'google.com',
      lastLogin: now,
      firstSeen: existingData.firstSeen || user.firstSeen || user.signedInAt || now,
      updatedAt: now
    };
    if (!existingData.role) userData.role = 'NEWBIE';

    await setDoc(ref, userData, { merge: true });
    console.log('[FirestoreUsers] ✅ Đã lưu học viên lên Cloud:', cleanEmail);
    return { ok: true, user: userData };
  } catch (e) {
    console.warn('[FirestoreUsers] Lỗi ghi Firestore:', e);
    return { ok: false, reason: e.message || 'write-error' };
  }
}

/**
 * Cập nhật vai trò/cấp quyền học viên (ADMIN, PREMIUM, NEWBIE) trên Firestore Cloud
 * @param {string} email
 * @param {string} role - 'PREMIUM' | 'NEWBIE' | 'ADMIN'
 */
export async function updateUserRoleInFirestore(email, role) {
  if (!email) return { ok: false, reason: 'no-email' };
  const cleanEmail = String(email).trim().toLowerCase();

  try {
    await requestAdminUsers('PATCH', { email: cleanEmail, role });
    console.log(`[FirestoreUsers] ✅ Đã cập nhật quyền [${role}] cho [${cleanEmail}] qua API admin`);
    return { ok: true };
  } catch (e) {
    if (isLocalDevHost()) {
      const db = getDb();
      if (db) {
        try {
          await setDoc(doc(db, COLLECTION_NAME, emailToDocId(cleanEmail)), {
            role,
            email: cleanEmail,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          console.warn('[FirestoreUsers] API admin chưa chạy local — đã ghi trực tiếp Firestore.');
          return { ok: true, localFallback: true };
        } catch (fallbackError) {
          return { ok: false, reason: fallbackError.message || 'write-error' };
        }
      }
    }
    console.warn('[FirestoreUsers] Lỗi cập nhật role:', e);
    return { ok: false, reason: e.message || 'admin-api-unavailable' };
  }
}

/**
 * Lấy toàn bộ học viên qua API admin, đọc hết từng trang.
 * @returns {Array} Mảng các object user
 */
export async function fetchAllUsersFromFirestore() {
  const users = [];
  const seen = new Set();
  const pageSize = 200;
  const maxPages = 25; // trần tự vệ: 5.000 hồ sơ

  try {
    let cursor = '';
    for (let page = 0; page < maxPages; page += 1) {
      const path = `/api/admin-users?pageSize=${pageSize}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const payload = await requestAdminUsers('GET', undefined, path);
      for (const user of Array.isArray(payload.users) ? payload.users : []) {
        const key = String(user?.email || user?.id || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        users.push(user);
      }
      if (!payload.hasMore || !payload.nextCursor) {
        console.log(`[FirestoreUsers] ✅ Đã tải ${users.length} học viên qua API admin (${page + 1} trang)`);
        return users;
      }
      cursor = payload.nextCursor;
    }
    console.warn(`[FirestoreUsers] Danh sách vượt ${maxPages} trang — dừng ở ${users.length} học viên`);
    return users;
  } catch (e) {
    console.warn('[FirestoreUsers] Không thể lấy hết danh sách học viên:', e.message || e);
    return users;
  }
}
