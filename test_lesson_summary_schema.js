import assert from 'node:assert/strict';
import { normalizeInteractiveLesson } from './modules/db.js';

const legacy = normalizeInteractiveLesson({ id: 'legacy', title: 'Bài cũ', blocks: [{ type: 'text', content: 'Nội dung bài cũ' }] });
assert.equal(legacy.aiSummary.enabled, false);
assert.equal(legacy.aiSummary.status, 'none');
assert.deepEqual(legacy.aiSummary.cache, {});

const ready = normalizeInteractiveLesson({ id: 'ready', title: 'Bài mới', aiSummary: { enabled: true, contentHash: 'v1-demo', status: 'ready', cache: { quick: { contentHash: 'v1-demo', result: { mainPoints: ['Ý 1'] } } }, updatedAt: '2026-01-01T00:00:00.000Z' } });
assert.equal(ready.aiSummary.enabled, true);
assert.equal(ready.aiSummary.contentHash, 'v1-demo');
assert.equal(ready.aiSummary.cache.quick.result.mainPoints[0], 'Ý 1');
console.log('lesson summary schema checks passed');
