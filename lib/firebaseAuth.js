import admin from 'firebase-admin';

const DEFAULT_FIREBASE_PROJECT_ID = 'fifth-chalice-507108-c5';

function getFirebaseConfig() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (raw) {
    try {
      return { ok: true, serviceAccount: JSON.parse(raw) };
    } catch {
      return { ok: false, reason: 'invalid-firebase-service-account-json' };
    }
  }
  return {
    ok: true,
    projectId: String(process.env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID).trim()
  };
}

function getFirebaseApp(config) {
  if (!admin.apps.length) {
    admin.initializeApp(config.serviceAccount
      ? { credential: admin.credential.cert(config.serviceAccount) }
      : { projectId: config.projectId });
  }
  return admin.app();
}

/**
 * Xác thực Firebase ID token từ header Authorization.
 * requireVerifiedEmail=false dùng cho chính endpoint xác minh email (OTP):
 * người dùng chưa xác minh vẫn phải gọi được để nhận/nhập mã.
 */
export async function verifyFirebaseUser(req, { requireVerifiedEmail = true } = {}) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    throw Object.assign(new Error('missing-auth-token'), { status: 401 });
  }

  const config = getFirebaseConfig();
  if (!config.ok) {
    throw Object.assign(new Error(config.reason), { status: 503 });
  }

  getFirebaseApp(config);

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    throw Object.assign(new Error('invalid-token'), { status: 401 });
  }

  if (requireVerifiedEmail && decoded.email_verified === false) {
    throw Object.assign(new Error('email-not-verified'), { status: 403 });
  }

  return {
    uid: decoded.uid,
    email: String(decoded.email || '').trim().toLowerCase(),
    emailVerified: decoded.email_verified,
    provider: String(decoded.firebase?.sign_in_provider || '')
  };
}

/**
 * Trả về admin.auth() + admin.firestore() với credential service account.
 * Bắt buộc phải có FIREBASE_SERVICE_ACCOUNT_JSON vì updateUser/emailVerified
 * và ghi Firestore phía server không chạy được với khởi tạo chỉ projectId.
 */
export function getAdminServices() {
  const config = getFirebaseConfig();
  if (!config.ok) {
    throw Object.assign(new Error(config.reason), { status: 503 });
  }
  if (!config.serviceAccount) {
    throw Object.assign(new Error('missing-firebase-service-account'), { status: 503 });
  }
  getFirebaseApp(config);
  return { auth: admin.auth(), db: admin.firestore() };
}