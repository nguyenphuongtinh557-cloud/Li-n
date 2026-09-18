/**
 * firestoreUsers.js — Real-time User Registry via Firebase Firestore
 *
 * Đồng bộ danh sách học viên lên Firestore collection 'users'
 * Document ID: sanitizeEmail(email)
 */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

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
      role: user.role || existingData.role || 'NEWBIE',
      lastLogin: now,
      firstSeen: existingData.firstSeen || user.firstSeen || user.signedInAt || now,
      updatedAt: now
    };

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
  const db = getDb();
  if (!db) return { ok: false, reason: 'no-db' };

  const cleanEmail = String(email).trim().toLowerCase();
  const docId = emailToDocId(cleanEmail);
  const ref = doc(db, COLLECTION_NAME, docId);

  try {
    await setDoc(ref, { role, email: cleanEmail, updatedAt: new Date().toISOString() }, { merge: true });
    console.log(`[FirestoreUsers] ✅ Đã cập nhật quyền [${role}] cho [${cleanEmail}] trên Cloud`);
    return { ok: true };
  } catch (e) {
    console.warn('[FirestoreUsers] Lỗi cập nhật role:', e);
    return { ok: false, reason: e.message };
  }
}

/**
 * Lấy danh sách tất cả học viên từ Firestore collection 'users'
 * @returns {Array} Mảng các object user
 */
export async function fetchAllUsersFromFirestore() {
  const db = getDb();
  if (!db) return [];

  try {
    const colRef = collection(db, COLLECTION_NAME);
    const q = query(colRef, orderBy('lastLogin', 'desc'), limit(100));
    const snap = await getDocs(q);

    const users = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && data.email) {
        users.push(data);
      }
    });

    console.log(`[FirestoreUsers] ✅ Đã tải ${users.length} học viên từ Cloud`);
    return users;
  } catch (e) {
    console.warn('[FirestoreUsers] Lỗi lấy danh sách học viên từ Firestore:', e);
    return [];
  }
}
