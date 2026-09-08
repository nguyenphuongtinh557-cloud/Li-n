const admin = require('firebase-admin');

const SUBJECT_DETAILS_FILE = 'data/subject_details.json';
const DEFAULT_ADMINS = ['nguyenphuongtinh557@gmail.com', 'macnghich@gmail.com'];

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!token || !owner || !repo || !firebaseServiceAccount) return null;
  try {
    return { token, owner, repo, firebaseServiceAccount: JSON.parse(firebaseServiceAccount) };
  } catch {
    return null;
  }
}

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || DEFAULT_ADMINS.join(','))
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
}

function getFirebaseApp(serviceAccount) {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.app();
}

async function githubRequest(config, path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  return response;
}

function decodeFile(content) {
  return JSON.parse(Buffer.from(String(content || ''), 'base64').toString('utf8'));
}

function publishedOnly(map) {
  return Object.fromEntries(Object.entries(map && typeof map === 'object' ? map : {})
    .filter(([, details]) => details && details.status === 'published'));
}

async function readSubjectMap(config) {
  const response = await githubRequest(config, SUBJECT_DETAILS_FILE, { cache: 'no-store' });
  if (response.status === 404) return { map: {}, sha: null };
  if (!response.ok) throw new Error(`github-read-${response.status}`);
  const payload = await response.json();
  return { map: decodeFile(payload.content), sha: payload.sha };
}

async function requireAdmin(req, config) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw Object.assign(new Error('missing-auth-token'), { status: 401 });
  getFirebaseApp(config.firebaseServiceAccount);
  const decoded = await admin.auth().verifyIdToken(token);
  const email = String(decoded.email || '').trim().toLowerCase();
  if (!decoded.email_verified || !getAdminEmails().includes(email)) {
    throw Object.assign(new Error('admin-required'), { status: 403 });
  }
  return email;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!['GET', 'PUT'].includes(req.method)) return json(res, 405, { ok: false, reason: 'method-not-allowed' });

  const config = getConfig();
  if (!config) return json(res, 503, { ok: false, reason: 'server-not-configured' });

  try {
    if (req.method === 'GET') {
      const { map } = await readSubjectMap(config);
      return json(res, 200, { ok: true, subjectDetails: publishedOnly(map) });
    }

    await requireAdmin(req, config);
    const { subjectId, details } = req.body || {};
    if (!subjectId || !details || details.status !== 'published') {
      return json(res, 400, { ok: false, reason: 'invalid-published-subject-details' });
    }

    const { map, sha } = await readSubjectMap(config);
    map[subjectId] = { ...details, subjectId, status: 'published', updatedAt: new Date().toISOString() };
    const content = Buffer.from(JSON.stringify(map, null, 2), 'utf8').toString('base64');
    const update = await githubRequest(config, SUBJECT_DETAILS_FILE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `sync: publish subject details for ${subjectId}`,
        content,
        branch: process.env.GITHUB_BRANCH || 'main',
        ...(sha ? { sha } : {})
      })
    });
    if (update.status === 409 || update.status === 422) return json(res, 409, { ok: false, reason: 'write-conflict' });
    if (!update.ok) return json(res, 502, { ok: false, reason: `github-write-${update.status}` });
    return json(res, 200, { ok: true, subjectDetails: map[subjectId] });
  } catch (error) {
    const status = error.status || 500;
    return json(res, status, { ok: false, reason: error.message || 'server-error' });
  }
};
