import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isLocalSubjectDetailsWriteRequest, writeLocalSubjectDetails } from './modules/localSubjectDetailsStore.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fteca-local-subjects-'));
const filePath = path.join(tempDir, 'subject_details.json');

try {
  fs.writeFileSync(filePath, JSON.stringify({ GE4150: { subjectId: 'GE4150', status: 'published' } }));
  const saved = writeLocalSubjectDetails(filePath, 'FTTEST', { status: 'draft', name: 'Local test' });
  const subjectMap = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.equal(saved.subjectId, 'FTTEST');
  assert.equal(subjectMap.GE4150.status, 'published');
  assert.equal(subjectMap.FTTEST.name, 'Local test');
  assert.equal(subjectMap.FTTEST.status, 'draft');
  assert.ok(subjectMap.FTTEST.updatedAt);

  const beforeInvalidWrite = fs.readFileSync(filePath, 'utf8');
  assert.throws(() => writeLocalSubjectDetails(filePath, '../outside', { status: 'draft' }), /invalid-subject-id/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), beforeInvalidWrite);

  const localRequest = {
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    socket: { remoteAddress: '::ffff:127.0.0.1' }
  };
  assert.equal(isLocalSubjectDetailsWriteRequest(localRequest), true);
  assert.equal(isLocalSubjectDetailsWriteRequest({ ...localRequest, socket: { remoteAddress: '192.168.1.10' } }), false);
  assert.equal(isLocalSubjectDetailsWriteRequest({ ...localRequest, headers: { ...localRequest.headers, origin: 'https://attacker.example' } }), false);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('local subject-details store checks passed');