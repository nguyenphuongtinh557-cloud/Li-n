/**
 * api/quiz-share.js — Chia sẻ đề thi từ câu hỏi người dùng tự tạo.
 *
 * - Chủ đề (đã đăng nhập) tạo link công khai cho một môn.
 * - Người nhận link thi trực tiếp, khách chỉ cần nhập tên; người đã đăng nhập
 *   dùng tài khoản của mình.
 * - Đáp án đúng chỉ nằm ở server: GET công khai trả câu hỏi đã bỏ `correct`,
 *   bài nộp được chấm ở server rồi mới trả điểm + đáp án để xem lại.
 *
 * Lưu trữ: Firestore (collection quizShares) khi có FIREBASE_SERVICE_ACCOUNT_JSON.
 * Khi chạy local không có service account, dùng file data/local/quiz_shares.json
 * (đã chặn truy cập tĩnh trong server.js). Trên Vercel thiếu cấu hình → 503.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { verifyFirebaseUser } from '../lib/firebaseAuth.js';

const COLLECTION = 'quizShares';
const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUESTIONS = 200;
const MAX_ATTEMPTS = 500;        // số bài chủ đề xem được
const MAX_STORED_ATTEMPTS = 2000; // kho lưu tối đa mỗi đề; đầy thì từ chối, không xoá bài cũ
const MAX_QUESTION_TEXT = 2000;
const MAX_OPTION_TEXT = 500;
const MAX_EXPLANATION = 2000;
const MAX_TITLE = 120;
const MAX_NAME = 40;
const MAX_SUBJECT_NAME = 120;
const MAX_TIME_SPENT = 24 * 60 * 60;
const rateBuckets = new Map();

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end(JSON.stringify(body));
}

function cleanText(value, max) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  // Cắt đúng biên ký tự: bỏ nửa đầu của cặp surrogate để tên emoji không bị "�".
  return /[\ud800-\udbff]$/.test(text) ? text.slice(0, -1) : text;
}

function clientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous')
    .split(',')[0]
    .trim();
}

function allowRequest(req, bucket, limitPerMinute) {
  const key = `${bucket}:${clientKey(req)}`;
  const now = Date.now();
  const hits = (rateBuckets.get(key) || []).filter(time => now - time < 60_000);
  if (hits.length >= limitPerMinute) return false;
  hits.push(now);
  rateBuckets.set(key, hits);
  if (rateBuckets.size > 5000) {
    for (const [entryKey, times] of rateBuckets) {
      if (!times.some(time => now - time < 60_000)) rateBuckets.delete(entryKey);
    }
  }
  return true;
}

function getServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    throw Object.assign(new Error('invalid-firebase-service-account-json'), { status: 503 });
  }
}

function getFirestore(serviceAccount) {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

/* ─────────────────────────── Local file store ─────────────────────────── */

function localStorePath() {
  return process.env.QUIZ_SHARE_LOCAL_FILE
    || path.resolve(process.cwd(), 'data', 'local', 'quiz_shares.json');
}

function readLocalStore() {
  try {
    const raw = fs.readFileSync(localStorePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.shares && typeof parsed.shares === 'object') {
      return parsed;
    }
  } catch {
    // File chưa có hoặc hỏng: bắt đầu rỗng, lần ghi kế tiếp sẽ tạo lại.
  }
  return { shares: {} };
}

function writeLocalStore(store) {
  const filePath = localStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store), 'utf8');
  fs.renameSync(tempPath, filePath);
}

let localWriteQueue = Promise.resolve();
function mutateLocalStore(mutator) {
  const run = async () => {
    const store = readLocalStore();
    const result = await mutator(store);
    writeLocalStore(store);
    return result;
  };
  const next = localWriteQueue.then(run, run);
  localWriteQueue = next.catch(() => {});
  return next;
}

/* ─────────────────────────── Validation ─────────────────────────── */

function cleanQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const q = cleanText(raw.q, MAX_QUESTION_TEXT);
  if (!q) return null;
  const options = Array.isArray(raw.options)
    ? raw.options.slice(0, 6).map(option => cleanText(option, MAX_OPTION_TEXT))
    : [];
  if (options.length < 2 || options.some(option => !option)) return null;
  const correct = Number(raw.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return null;
  const chapterNumber = Math.round(Number(raw.chapter) || 1);
  return {
    q,
    options,
    correct,
    exp: cleanText(raw.exp, MAX_EXPLANATION),
    chapter: Math.min(Math.max(chapterNumber, 1), 20),
    difficulty: [1, 2, 3].includes(Number(raw.difficulty)) ? Number(raw.difficulty) : 1,
  };
}

function publicQuestion(question) {
  return {
    q: question.q,
    options: question.options,
    exp: question.exp,
    chapter: question.chapter,
    difficulty: question.difficulty,
  };
}

function normalizeAnswers(raw, questions) {
  const answers = {};
  if (!raw || typeof raw !== 'object') return answers;
  const entries = Array.isArray(raw)
    ? Array.from({ length: raw.length }, (_, index) => [index, raw[index]])
    : Object.entries(raw);
  entries.forEach(([key, value]) => {
    const index = Number(key);
    const choice = Number(value);
    const question = questions[index];
    if (!question || !Number.isInteger(index) || index < 0) return;
    if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) return;
    answers[index] = choice;
  });
  return answers;
}

function grade(share, answers, timeSpent) {
  const questionResults = share.questions.map((question, index) => {
    const userAns = Object.prototype.hasOwnProperty.call(answers, index) ? answers[index] : null;
    return {
      idx: index,
      userAns,
      correct: question.correct,
      isCorrect: userAns !== null && userAns === question.correct,
      exp: question.exp,
    };
  });
  const total = questionResults.length;
  const correctCount = questionResults.filter(result => result.isCorrect).length;
  const score10 = total ? Number((correctCount / total * 10).toFixed(1)) : 0;
  return {
    total,
    correctCount,
    score10,
    pct: total ? Math.round(correctCount / total * 100) : 0,
    timeSpent: Math.min(Math.max(0, Math.round(Number(timeSpent) || 0)), MAX_TIME_SPENT),
    isPassed: score10 >= 7,
    questionResults,
  };
}

function shareSummary(share) {
  return {
    shareId: share.shareId,
    title: share.title,
    subjectId: share.subjectId,
    subjectCode: share.subjectCode,
    subjectName: share.subjectName,
    questionCount: share.questionCount,
    attemptCount: Number(share.attemptCount) || 0,
    ownerName: share.ownerName,
    createdAt: share.createdAt,
  };
}

async function requireOwner(req) {
  const user = await verifyFirebaseUser(req);
  return user;
}

/* ─────────────────────────── Handlers ─────────────────────────── */

async function handleCreate(req, res, serviceAccount) {
  const user = await requireOwner(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawQuestions = Array.isArray(body.questions) ? body.questions : [];
  if (!rawQuestions.length) {
    return json(res, 400, { ok: false, reason: 'no-questions' });
  }
  if (rawQuestions.length > MAX_QUESTIONS) {
    return json(res, 400, { ok: false, reason: 'too-many-questions', limit: MAX_QUESTIONS, count: rawQuestions.length });
  }

  const questions = rawQuestions.map(cleanQuestion).filter(Boolean);
  if (!questions.length) {
    return json(res, 400, { ok: false, reason: 'invalid-questions' });
  }

  const subjectId = cleanText(body.subjectId, 40);
  if (!subjectId) return json(res, 400, { ok: false, reason: 'missing-subject' });

  const shareId = crypto.randomUUID();
  const subjectName = cleanText(body.subjectName, MAX_SUBJECT_NAME) || subjectId;
  const subjectCode = cleanText(body.subjectCode, 20) || subjectId;
  const ownerName = cleanText(body.ownerName, 60)
    || cleanText(String(user.email || '').split('@')[0], 60)
    || 'Chủ đề';
  const record = {
    shareId,
    ownerUid: user.uid,
    ownerEmail: user.email,
    ownerName,
    subjectId,
    subjectCode,
    subjectName,
    title: cleanText(body.title, MAX_TITLE) || `Đề ôn tập · ${subjectName}`,
    questions,
    questionCount: questions.length,
    attemptCount: 0,
    createdAt: new Date().toISOString(),
  };

  if (serviceAccount) {
    const db = getFirestore(serviceAccount);
    await db.collection(COLLECTION).doc(shareId).set(record);
  } else {
    await mutateLocalStore(store => {
      store.shares[shareId] = { ...record, attempts: [] };
    });
  }

  return json(res, 201, {
    ok: true,
    shareId,
    questionCount: questions.length,
    droppedCount: rawQuestions.length - questions.length,
  });
}

async function handlePublicGet(req, res, shareId, serviceAccount) {
  let share = null;
  if (serviceAccount) {
    const db = getFirestore(serviceAccount);
    const snapshot = await db.collection(COLLECTION).doc(shareId).get();
    share = snapshot.exists ? snapshot.data() : null;
  } else {
    share = readLocalStore().shares[shareId] || null;
  }
  if (!share) return json(res, 404, { ok: false, reason: 'quiz-share-not-found' });

  return json(res, 200, {
    ok: true,
    share: {
      ...shareSummary(share),
      secondsPerQuestion: 60,
      questions: (share.questions || []).map(publicQuestion),
    },
  });
}

async function handleOwnerList(req, res, user, serviceAccount) {
  if (serviceAccount) {
    const db = getFirestore(serviceAccount);
    const snapshot = await db.collection(COLLECTION)
      .where('ownerUid', '==', user.uid)
      .limit(100)
      .get();
    const shares = snapshot.docs
      .map(doc => shareSummary({ shareId: doc.id, ...doc.data() }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return json(res, 200, { ok: true, shares });
  }

  const shares = Object.values(readLocalStore().shares)
    .filter(share => share.ownerUid === user.uid)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 100)
    .map(share => shareSummary({
      ...share,
      attemptCount: Array.isArray(share.attempts) && share.attempts.length
        ? share.attempts.length
        : share.attemptCount,
    }));
  return json(res, 200, { ok: true, shares });
}

async function handleOwnerDetail(req, res, user, shareId, serviceAccount) {
  let share = null;
  let attempts = [];
  if (serviceAccount) {
    const db = getFirestore(serviceAccount);
    const docRef = db.collection(COLLECTION).doc(shareId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) return json(res, 404, { ok: false, reason: 'quiz-share-not-found' });
    share = { shareId: snapshot.id, ...snapshot.data() };
    if (share.ownerUid !== user.uid) return json(res, 403, { ok: false, reason: 'not-share-owner' });
    const attemptSnapshot = await docRef.collection('attempts')
      .orderBy('submittedAt', 'desc')
      .limit(MAX_ATTEMPTS)
      .get();
    attempts = attemptSnapshot.docs.map(doc => doc.data());
  } else {
    share = readLocalStore().shares[shareId] || null;
    if (!share) return json(res, 404, { ok: false, reason: 'quiz-share-not-found' });
    if (share.ownerUid !== user.uid) return json(res, 403, { ok: false, reason: 'not-share-owner' });
    attempts = Array.isArray(share.attempts) ? share.attempts.slice(-MAX_ATTEMPTS).reverse() : [];
  }

  return json(res, 200, {
    ok: true,
    share: shareSummary(share),
    attempts: attempts.map(attempt => ({
      participantName: attempt.participantName,
      identityType: attempt.identityType,
      email: attempt.email || '',
      correctCount: attempt.correctCount,
      total: attempt.total,
      score10: attempt.score10,
      pct: attempt.pct,
      timeSpent: attempt.timeSpent,
      submittedAt: attempt.submittedAt,
    })),
  });
}

async function handleSubmit(req, res, shareId, serviceAccount) {
  const authHeader = String(req.headers.authorization || '');
  let identity = null;
  if (authHeader.startsWith('Bearer ')) {
    try {
      const user = await requireOwner(req);
      identity = { uid: user.uid, email: user.email, identityType: 'user' };
    } catch (error) {
      // Token hết hạn giữa giờ thi không được làm mất bài: hạ xuống khách,
      // tên người nộp vẫn lấy từ body như bình thường.
      if (![401, 403].includes(Number(error?.status))) throw error;
    }
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const participantName = cleanText(
    body.participantName
      || identity?.email?.split('@')[0]
      || '',
    MAX_NAME
  );
  if (!participantName) {
    return json(res, 400, { ok: false, reason: 'missing-participant-name' });
  }

  let share = null;
  if (serviceAccount) {
    const db = getFirestore(serviceAccount);
    const snapshot = await db.collection(COLLECTION).doc(shareId).get();
    share = snapshot.exists ? { shareId: snapshot.id, ...snapshot.data() } : null;
  } else {
    share = readLocalStore().shares[shareId] || null;
  }
  if (!share) return json(res, 404, { ok: false, reason: 'quiz-share-not-found' });

  const answers = normalizeAnswers(body.answers, share.questions || []);
  const result = grade(share, answers, body.timeSpent);
  const attempt = {
    attemptId: crypto.randomUUID(),
    participantName,
    identityType: identity?.identityType || 'guest',
    uid: identity?.uid || '',
    email: identity?.email || '',
    correctCount: result.correctCount,
    total: result.total,
    score10: result.score10,
    pct: result.pct,
    timeSpent: result.timeSpent,
    submittedAt: new Date().toISOString(),
  };

  if (serviceAccount) {
    if ((Number(share.attemptCount) || 0) >= MAX_STORED_ATTEMPTS) {
      return json(res, 409, { ok: false, reason: 'quiz-share-attempts-full' });
    }
    const db = getFirestore(serviceAccount);
    const docRef = db.collection(COLLECTION).doc(shareId);
    await docRef.collection('attempts').add(attempt);
    await docRef.update({ attemptCount: admin.firestore.FieldValue.increment(1) });
  } else {
    await mutateLocalStore(store => {
      const target = store.shares[shareId];
      if (!target) throw Object.assign(new Error('quiz-share-not-found'), { status: 404 });
      if (!Array.isArray(target.attempts)) target.attempts = [];
      if (target.attempts.length >= MAX_STORED_ATTEMPTS) {
        throw Object.assign(new Error('quiz-share-attempts-full'), { status: 409 });
      }
      target.attempts.push(attempt);
      target.attemptCount = target.attempts.length;
    });
  }

  const publicAttempt = {
    participantName: attempt.participantName,
    identityType: attempt.identityType,
    score10: attempt.score10,
    correctCount: attempt.correctCount,
    total: attempt.total,
    submittedAt: attempt.submittedAt,
  };
  return json(res, 200, { ok: true, result: { ...result, attempt: publicAttempt } });
}

async function handleDelete(req, res, user, shareId, serviceAccount) {
  if (serviceAccount) {
    const db = getFirestore(serviceAccount);
    const docRef = db.collection(COLLECTION).doc(shareId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) return json(res, 404, { ok: false, reason: 'quiz-share-not-found' });
    if (snapshot.data().ownerUid !== user.uid) return json(res, 403, { ok: false, reason: 'not-share-owner' });
    if (typeof db.recursiveDelete === 'function') {
      await db.recursiveDelete(docRef);
    } else {
      const attempts = await docRef.collection('attempts').limit(400).get();
      if (!attempts.empty) {
        const batch = db.batch();
        attempts.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      await docRef.delete();
    }
    return json(res, 200, { ok: true });
  }

  await mutateLocalStore(store => {
    const share = store.shares[shareId];
    if (!share) throw Object.assign(new Error('quiz-share-not-found'), { status: 404 });
    if (share.ownerUid !== user.uid) throw Object.assign(new Error('not-share-owner'), { status: 403 });
    delete store.shares[shareId];
  });
  return json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return json(res, 405, { ok: false, reason: 'method-not-allowed' });
  }

  let serviceAccount = null;
  try {
    serviceAccount = getServiceAccount();
  } catch (error) {
    return json(res, 503, { ok: false, reason: error.message });
  }
  if (!serviceAccount && process.env.VERCEL) {
    return json(res, 503, { ok: false, reason: 'quiz-share-service-not-configured' });
  }

  const requestUrl = new URL(req.url || '/', 'https://fteca.invalid');
  const shareId = String(req.query?.id || requestUrl.searchParams.get('id') || '').trim();
  const ownerMode = ['1', 'true'].includes(String(req.query?.owner || requestUrl.searchParams.get('owner') || ''));

  try {
    if (req.method === 'GET') {
      if (ownerMode) {
        if (!allowRequest(req, 'quiz-owner', 120)) {
          return json(res, 429, { ok: false, reason: 'rate-limited' });
        }
        const user = await requireOwner(req);
        if (shareId) {
          if (!SHARE_ID_PATTERN.test(shareId)) return json(res, 400, { ok: false, reason: 'invalid-share-id' });
          return await handleOwnerDetail(req, res, user, shareId, serviceAccount);
        }
        return await handleOwnerList(req, res, user, serviceAccount);
      }
      if (!allowRequest(req, 'quiz-public', 300)) {
        return json(res, 429, { ok: false, reason: 'rate-limited' });
      }
      if (!SHARE_ID_PATTERN.test(shareId)) return json(res, 400, { ok: false, reason: 'invalid-share-id' });
      return await handlePublicGet(req, res, shareId, serviceAccount);
    }

    if (req.method === 'POST') {
      if (!shareId) {
        if (!allowRequest(req, 'quiz-create', 20)) {
          return json(res, 429, { ok: false, reason: 'rate-limited' });
        }
        return await handleCreate(req, res, serviceAccount);
      }
      if (!SHARE_ID_PATTERN.test(shareId)) return json(res, 400, { ok: false, reason: 'invalid-share-id' });
      // Cả lớp có thể chung một IP (NAT của trường): hạn mức phải chịu được
      // ~40 học sinh nộp cùng lúc chứ không chặn oan.
      if (!allowRequest(req, 'quiz-submit', 150)) {
        return json(res, 429, { ok: false, reason: 'rate-limited' });
      }
      return await handleSubmit(req, res, shareId, serviceAccount);
    }

    if (!allowRequest(req, 'quiz-delete', 20)) {
      return json(res, 429, { ok: false, reason: 'rate-limited' });
    }
    if (!SHARE_ID_PATTERN.test(shareId)) return json(res, 400, { ok: false, reason: 'invalid-share-id' });
    const user = await requireOwner(req);
    return await handleDelete(req, res, user, shareId, serviceAccount);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('[QuizShare] Request failed:', error);
    return json(res, status, { ok: false, reason: error.message || 'quiz-share-error' });
  }
}
