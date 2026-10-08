import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLocalSubjectDetailsWriteRequest(req) {
  const requestHost = String(req.headers?.host || '').toLowerCase();
  const remoteAddress = String(req.socket?.remoteAddress || '').toLowerCase();
  if (!LOOPBACK_ADDRESSES.has(remoteAddress)) return false;

  try {
    const host = new URL(`http://${requestHost}`);
    const origin = new URL(String(req.headers?.origin || ''));
    return LOOPBACK_HOSTS.has(host.hostname)
      && origin.protocol === 'http:'
      && origin.host.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

export function writeLocalSubjectDetails(filePath, subjectId, details) {
  const id = String(subjectId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('invalid-subject-id');
  if (!details || typeof details !== 'object' || Array.isArray(details)) throw new Error('invalid-subject-details');

  let subjectMap = {};
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (raw.trim()) {
      subjectMap = JSON.parse(raw);
      if (!subjectMap || typeof subjectMap !== 'object' || Array.isArray(subjectMap)) {
        throw new Error('invalid-subject-details-map');
      }
    }
  }

  const savedDetails = { ...details, subjectId: id, updatedAt: new Date().toISOString() };
  subjectMap[id] = savedDetails;
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(subjectMap, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
  return savedDetails;
}