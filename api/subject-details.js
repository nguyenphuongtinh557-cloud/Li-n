import admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  const missing = [
    ['GITHUB_TOKEN', token],
    ['GITHUB_OWNER', owner],
    ['GITHUB_REPO', repo],
    ['FIREBASE_SERVICE_ACCOUNT_JSON', firebaseServiceAccount]
  ]
    .filter(([, value]) => !String(value || '').trim())
    .map(([name]) => name);

  if (missing.length) {
    return { ok: false, reason: 'missing-required-env', missing };
  }

  try {
    return {
      ok: true,
      config: { token, owner, repo, firebaseServiceAccount: JSON.parse(firebaseServiceAccount) }
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid-firebase-service-account-json',
      detail: error instanceof Error ? error.message : String(error)
    };
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

function resolveLocalSubjectDataPath() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(moduleDir, '..');
  const candidates = [
    path.resolve(process.cwd(), SUBJECT_DETAILS_FILE),
    path.resolve(process.cwd(), 'data', 'subject_details.json'),
    path.resolve(repoRoot, SUBJECT_DETAILS_FILE),
    path.resolve(repoRoot, 'data', 'subject_details.json')
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // keep checking the next candidate
    }
  }

  return candidates[0];
}

function readLocalSubjectMap() {
  const filePath = resolveLocalSubjectDataPath();

  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!String(raw || '').trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
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
  if (payload.content) return { map: decodeFile(payload.content), sha: payload.sha };

  const rawResponse = await githubRequest(config, SUBJECT_DETAILS_FILE, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github.raw+json' }
  });
  if (!rawResponse.ok) throw new Error(`github-raw-read-${rawResponse.status}`);

  let map;
  try {
    map = JSON.parse(await rawResponse.text());
  } catch {
    throw new Error('github-subject-details-invalid-json');
  }
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new Error('github-subject-details-invalid-format');
  }
  return { map, sha: payload.sha };
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!['GET', 'PUT'].includes(req.method)) return json(res, 405, { ok: false, reason: 'method-not-allowed' });

  const configStatus = getConfig();
  if (!configStatus.ok) {
    const errorBody = {
      ok: false,
      reason: configStatus.reason,
      ...(configStatus.missing ? { missing: configStatus.missing } : {}),
      ...(configStatus.detail ? { detail: configStatus.detail } : {})
    };

    if (req.method === 'GET') {
      try {
        const localMap = readLocalSubjectMap();
        return json(res, 200, {
          ok: true,
          subjectDetails: publishedOnly(localMap),
          source: 'local-fallback',
          reason: configStatus.reason,
          ...(configStatus.missing ? { missing: configStatus.missing } : {}),
          ...(configStatus.detail ? { detail: configStatus.detail } : {})
        });
      } catch {
        return json(res, 503, errorBody);
      }
    }
    return json(res, 503, errorBody);
  }

  const config = configStatus.config;

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
