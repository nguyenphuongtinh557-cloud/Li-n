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

export async function verifyFirebaseUser(req) {
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

  if (decoded.email_verified === false) {
    throw Object.assign(new Error('email-not-verified'), { status: 403 });
  }

  return {
    uid: decoded.uid,
    email: String(decoded.email || '').trim().toLowerCase(),
    emailVerified: decoded.email_verified
  };
}
