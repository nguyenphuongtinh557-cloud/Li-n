import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const api = fs.readFileSync('api/subject-details.js', 'utf8');
const sync = fs.readFileSync('modules/sync.js', 'utf8');
const db = fs.readFileSync('modules/db.js', 'utf8');
const auth = fs.readFileSync('modules/auth.js', 'utf8');

async function testMissingConfigDiagnostics() {
  const originalEnv = { ...process.env };
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_OWNER;
  delete process.env.GITHUB_REPO;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.ADMIN_EMAILS;

  const { default: subjectDetailsHandler } = await import('./api/subject-details.js');
  const res = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(body) {
      this.body = body;
      return body;
    },
    statusCode: 200,
    body: ''
  };

  await subjectDetailsHandler({ method: 'GET', headers: {} }, res);

  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.reason, 'missing-required-env');
  assert.deepEqual(payload.missing, ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'FIREBASE_SERVICE_ACCOUNT_JSON']);
  assert.equal(payload.source, 'local-fallback');

  Object.assign(process.env, originalEnv);
}

async function testFallbackWorksOutsideRepoRoot() {
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fteca-subject-details-'));

  try {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_OWNER;
    delete process.env.GITHUB_REPO;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.ADMIN_EMAILS;

    process.chdir(tempDir);

    const { default: subjectDetailsHandler } = await import('./api/subject-details.js');
    const res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      end(body) {
        this.body = body;
        return body;
      },
      statusCode: 200,
      body: ''
    };

    await subjectDetailsHandler({ method: 'GET', headers: {} }, res);

    const payload = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.reason, 'missing-required-env');
    assert.equal(payload.source, 'local-fallback');
  } finally {
    process.chdir(originalCwd);
    Object.assign(process.env, originalEnv);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function testLargeGitHubFileUsesRawContents() {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  const requiredEnv = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'ADMIN_EMAILS'];
  const fetchCalls = [];

  try {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_OWNER = 'test-owner';
    process.env.GITHUB_REPO = 'test-repo';
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
    process.env.ADMIN_EMAILS = '';
    global.fetch = async (_url, options = {}) => {
      fetchCalls.push(options.headers?.Accept || '');
      if (fetchCalls.length === 1) {
        return { ok: true, status: 200, json: async () => ({ sha: 'test-sha', encoding: 'none', content: '' }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ FTTEST: { subjectId: 'FTTEST', status: 'published' } }) };
    };

    const { default: subjectDetailsHandler } = await import('./api/subject-details.js');
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      end(body) { this.body = body; return body; },
      statusCode: 200,
      body: ''
    };

    await subjectDetailsHandler({ method: 'GET', headers: {} }, res);

    const payload = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.subjectDetails.FTTEST.status, 'published');
    assert.equal(fetchCalls[1], 'application/vnd.github.raw+json');
  } finally {
    global.fetch = originalFetch;
    for (const key of requiredEnv) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
}

assert.match(api, /req\.method === 'GET'/);
assert.match(api, /req\.method === 'GET'/);
assert.match(api, /verifyIdToken/);
assert.match(api, /admin-required/);
assert.match(api, /details\.status !== 'published'/);
assert.match(api, /write-conflict/);
assert.match(api, /GITHUB_TOKEN/);
assert.match(api, /FIREBASE_SERVICE_ACCOUNT_JSON/);
assert.match(api, /missing-required-env/);
assert.match(api, /import admin from 'firebase-admin'/);
assert.match(api, /export default async function handler/);
assert.match(sync, /fetch\('\/api\/subject-details/);
assert.match(sync, /method: 'PUT'/);
assert.match(sync, /Authorization: `Bearer \$\{idToken \|\| ''\}`/);
assert.match(db, /pushSubjectDetailsToServer\(subjectId, normalized, idToken\)/);
assert.match(auth, /async getIdToken\(\)/);

await testMissingConfigDiagnostics();
await testFallbackWorksOutsideRepoRoot();
await testLargeGitHubFileUsesRawContents();
console.log('subject details API checks passed');
