/**
 * firestoreSummary.js — Shared AI Summary Store via Firebase Firestore
 *
 * Mô hình: Admin tạo tóm tắt 1 lần → lưu Firestore → sinh viên đọc dùng chung
 *
 * Collection: lessonSummaries
 * Document ID: {subjectId}__{lessonId}
 *
 * Structure:
 * {
 *   subjectId, lessonId, contentHash, updatedAt, updatedBy,
 *   quick: { mainPoints, keywords, pitfalls, quickQuestions, source },
 *   study: { ... },
 *   exam: { ... }
 * }
 */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ─── Firebase Config (same project as auth.js) ───────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCcwxsxREppsp3KbCDnQ4ixvz3VC5lxqM4',
  authDomain: 'fifth-chalice-507108-c5.firebaseapp.com',
  projectId: 'fifth-chalice-507108-c5',
  storageBucket: 'fifth-chalice-507108-c5.appspot.com',
  messagingSenderId: '643168500906',
  appId: '1:643168500906:web:a1b2c3d4e5f6'
};

const COLLECTION = 'lessonSummaries';
const SESSION_PREFIX = 'fteca_summary_cache_';
const MODES = ['quick', 'study', 'exam'];

let _db = null;

function getDb() {
  if (_db) return _db;
  try {
    // Reuse existing Firebase app to avoid duplicate initialization
    const existing = getApps();
    const app = existing.length > 0 ? existing[0] : initializeApp(FIREBASE_CONFIG, 'fteca-summary');
    _db = getFirestore(app);
  } catch (e) {
    console.error('[FirestoreSummary] Lỗi khởi tạo Firestore:', e);
    _db = null;
  }
  return _db;
}

function docId(subjectId, lessonId) {
  return `${subjectId}__${lessonId}`;
}

function sessionKey(subjectId, lessonId) {
  return `${SESSION_PREFIX}${subjectId}__${lessonId}`;
}

// ─── Đọc tóm tắt từ sessionStorage trước, sau đó Firestore ──────────────────
export async function readSummary(subjectId, lessonId) {
  if (!subjectId || !lessonId) return null;

  // Tầng 1: sessionStorage (tức thì, không network)
  try {
    const cached = sessionStorage.getItem(sessionKey(subjectId, lessonId));
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed._cachedAt && Date.now() - parsed._cachedAt < 30 * 60 * 1000) {
        return parsed; // cache 30 phút
      }
    }
  } catch {}

  // Tầng 2: Firestore
  const db = getDb();
  if (!db) return null;

  try {
    const ref = doc(db, COLLECTION, docId(subjectId, lessonId));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    // Ghi vào sessionStorage cho lần sau
    try {
      sessionStorage.setItem(sessionKey(subjectId, lessonId), JSON.stringify({ ...data, _cachedAt: Date.now() }));
    } catch {}
    return data;
  } catch (e) {
    console.warn('[FirestoreSummary] Lỗi đọc Firestore:', e);
    return null;
  }
}

// ─── Lưu tóm tắt lên Firestore (chỉ Admin) ──────────────────────────────────
export async function writeSummary(subjectId, lessonId, summaryData) {
  if (!subjectId || !lessonId || !summaryData) return { ok: false, reason: 'invalid-data' };

  const db = getDb();
  if (!db) return { ok: false, reason: 'firestore-unavailable' };

  try {
    const ref = doc(db, COLLECTION, docId(subjectId, lessonId));
    await setDoc(ref, summaryData, { merge: true });

    // Cập nhật sessionStorage
    try {
      const updated = { ...summaryData, _cachedAt: Date.now() };
      sessionStorage.setItem(sessionKey(subjectId, lessonId), JSON.stringify(updated));
    } catch {}

    return { ok: true };
  } catch (e) {
    console.error('[FirestoreSummary] Lỗi ghi Firestore:', e);
    return { ok: false, reason: e.message || 'firestore-write-error' };
  }
}

// ─── Xoá cache sessionStorage của một bài học (dùng khi Admin tạo lại) ──────
export function clearSessionCache(subjectId, lessonId) {
  try {
    sessionStorage.removeItem(sessionKey(subjectId, lessonId));
  } catch {}
}

// ─── Kiểm tra Firestore đã có tóm tắt đủ 3 chế độ chưa ─────────────────────
export function summaryIsComplete(data) {
  if (!data) return false;
  return MODES.every(mode => data[mode] && Array.isArray(data[mode].mainPoints) && data[mode].mainPoints.length > 0);
}

// ─── Kiểm tra hash có khớp không (phát hiện nội dung bài học đã thay đổi) ──
export function summaryIsStale(data, currentHash) {
  if (!data || !data.contentHash) return true;
  return data.contentHash !== currentHash;
}
