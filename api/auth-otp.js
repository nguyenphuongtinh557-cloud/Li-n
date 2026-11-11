import crypto from 'crypto';
import { verifyFirebaseUser, getAdminServices } from '../lib/firebaseAuth.js';
import { sendOtpEmail } from '../lib/mailer.js';

const COLLECTION = 'emailVerifications';
const CODE_TTL_MS = 10 * 60 * 1000;   // mã sống 10 phút
const RESEND_COOLDOWN_MS = 60 * 1000; // 60s giữa 2 lần gửi
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function hashCode(salt, code) {
  const payload = `${salt}:${code}`;
  // Pepper (env OTP_PEPPER) là bí mật chỉ server biết. Nhờ vậy dù tài liệu
  // Firestore bị lộ quyền đọc, kẻ tấn công vẫn không thể brute-force 6 chữ số.
  const pepper = String(process.env.OTP_PEPPER || '');
  if (pepper) {
    return crypto.createHmac('sha256', pepper).update(payload).digest('hex');
  }
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function timingSafeEqualHex(a, b) {
  const ba = Buffer.from(String(a || ''), 'hex');
  const bb = Buffer.from(String(b || ''), 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function handleSend(req, res, user) {
  const { auth, db } = getAdminServices();
  const ref = db.collection(COLLECTION).doc(user.uid);
  const now = Date.now();

  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() || {}) : {};

  if (existing.lastSentAt && now - Number(existing.lastSentAt) < RESEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (now - Number(existing.lastSentAt))) / 1000);
    return json(res, 429, { ok: false, reason: 'cooldown', retryAfter });
  }

  const recentSends = Array.isArray(existing.sends)
    ? existing.sends.filter(ts => now - Number(ts) < 60 * 60 * 1000)
    : [];
  if (recentSends.length >= MAX_SENDS_PER_HOUR) {
    return json(res, 429, { ok: false, reason: 'rate-limited', retryAfter: 3600 });
  }

  // Nếu tài khoản đã xác minh rồi thì không cần gửi mã nữa.
  let account;
  try {
    account = await auth.getUser(user.uid);
  } catch {
    return json(res, 503, { ok: false, reason: 'auth-unavailable' });
  }
  if (account.emailVerified) {
    return json(res, 200, { ok: true, alreadyVerified: true });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = crypto.randomBytes(16).toString('hex');

  // Gửi mail trước; chỉ ghi mã khi gửi thành công để lần gửi hỏng không bị
  // tính vào cooldown (người dùng được thử lại ngay).
  try {
    await sendOtpEmail({ to: user.email, code, name: account.displayName || '' });
  } catch (error) {
    const status = error.status || 503;
    return json(res, status, { ok: false, reason: error.message === 'mail-not-configured' ? 'mail-not-configured' : 'mail-send-failed' });
  }

  await ref.set({
    email: user.email,
    salt,
    hash: hashCode(salt, code),
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    lastSentAt: now,
    sends: [...recentSends, now]
  });

  return json(res, 200, { ok: true, expiresAt: now + CODE_TTL_MS, cooldownSeconds: RESEND_COOLDOWN_MS / 1000 });
}

async function handleVerify(req, res, user, code) {
  const cleanCode = String(code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return json(res, 400, { ok: false, reason: 'invalid-code-format' });
  }

  const { auth, db } = getAdminServices();
  const ref = db.collection(COLLECTION).doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return json(res, 400, { ok: false, reason: 'no-code', message: 'Chưa có mã nào được gửi. Hãy bấm gửi mã.' });
  }

  const data = snap.data() || {};
  const now = Date.now();
  if (now > Number(data.expiresAt || 0)) {
    return json(res, 400, { ok: false, reason: 'code-expired' });
  }
  if (Number(data.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
    return json(res, 400, { ok: false, reason: 'too-many-attempts' });
  }

  const candidate = hashCode(String(data.salt || ''), cleanCode);
  if (!timingSafeEqualHex(candidate, String(data.hash || ''))) {
    const attempts = Number(data.attempts || 0) + 1;
    await ref.set({ attempts }, { merge: true });
    return json(res, 400, {
      ok: false,
      reason: attempts >= MAX_VERIFY_ATTEMPTS ? 'too-many-attempts' : 'code-mismatch',
      attemptsLeft: Math.max(0, MAX_VERIFY_ATTEMPTS - attempts)
    });
  }

  try {
    await auth.updateUser(user.uid, { emailVerified: true });
  } catch {
    return json(res, 503, { ok: false, reason: 'verify-update-failed' });
  }
  await ref.delete().catch(() => {});

  return json(res, 200, { ok: true, verified: true });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, reason: 'method-not-allowed' });
  }

  let user;
  try {
    user = await verifyFirebaseUser(req, { requireVerifiedEmail: false });
  } catch (error) {
    return json(res, error.status || 401, { ok: false, reason: error.message || 'unauthorized' });
  }
  if (!user.email) {
    return json(res, 400, { ok: false, reason: 'no-email-on-account' });
  }

  const { action, code } = req.body || {};
  try {
    if (action === 'send') return await handleSend(req, res, user);
    if (action === 'verify') return await handleVerify(req, res, user, code);
    return json(res, 400, { ok: false, reason: 'invalid-action' });
  } catch (error) {
    const status = error.status || 500;
    return json(res, status, { ok: false, reason: error.message || 'server-error' });
  }
}