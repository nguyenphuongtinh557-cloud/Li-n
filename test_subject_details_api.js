import assert from 'node:assert/strict';
import fs from 'node:fs';

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
console.log('subject details API checks passed');
