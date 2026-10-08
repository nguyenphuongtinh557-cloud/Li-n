import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fteca-local-api-'));
const dataFile = path.join(tempDir, 'subject_details.json');
fs.writeFileSync(dataFile, JSON.stringify({ GE4150: { subjectId: 'GE4150', status: 'published' } }));

const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));

const child = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
  cwd: projectRoot,
  env: { ...process.env, PORT: String(port), FTECA_LOCAL_SUBJECT_DETAILS_FILE: dataFile },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

try {
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('local server did not start')), 10000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes(`Server: http://localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`local server exited before ready (${code}): ${output}`));
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const payload = { subjectId: 'FTTEST', details: { status: 'draft', name: 'Persisted by local API' } };
  const response = await fetch(`${baseUrl}/api/subject-details`, {
    method: 'PUT',
    headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  const stored = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

  assert.equal(response.status, 200);
  assert.equal(result.source, 'local-file');
  assert.equal(stored.GE4150.status, 'published');
  assert.equal(stored.FTTEST.name, 'Persisted by local API');

  const rejected = await fetch(`${baseUrl}/api/subject-details`, {
    method: 'PUT',
    headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ subjectId: 'BLOCKED', details: { status: 'draft' } })
  });
  assert.equal(rejected.status, 403);
  assert.equal('BLOCKED' in JSON.parse(fs.readFileSync(dataFile, 'utf8')), false);
} finally {
  if (child.exitCode === null) {
    child.kill();
    await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('local subject-details server checks passed');