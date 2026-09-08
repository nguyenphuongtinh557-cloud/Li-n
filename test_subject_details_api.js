import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('api/subject-details.js', 'utf8');
const sync = fs.readFileSync('modules/sync.js', 'utf8');
const db = fs.readFileSync('modules/db.js', 'utf8');
const auth = fs.readFileSync('modules/auth.js', 'utf8');

assert.match(api, /req\.method === 'GET'/);
assert.match(api, /req\.method === 'GET'/);
assert.match(api, /verifyIdToken/);
assert.match(api, /admin-required/);
assert.match(api, /details\.status !== 'published'/);
assert.match(api, /write-conflict/);
assert.match(api, /GITHUB_TOKEN/);
assert.match(api, /FIREBASE_SERVICE_ACCOUNT_JSON/);
assert.match(sync, /fetch\('\/api\/subject-details/);
assert.match(sync, /method: 'PUT'/);
assert.match(sync, /Authorization: `Bearer \$\{idToken \|\| ''\}`/);
assert.match(db, /pushSubjectDetailsToServer\(subjectId, normalized, idToken\)/);
assert.match(auth, /async getIdToken\(\)/);
console.log('subject details API checks passed');
