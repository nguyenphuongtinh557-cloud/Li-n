import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSummaryDocumentVersion,
  readSummaryDocumentHistory,
  SUMMARY_DOCUMENT_HISTORY_LIMIT
} from './modules/summaryDocumentHistory.js';

class MemoryStorage {
  constructor(maxCharacters = Infinity) {
    this.maxCharacters = maxCharacters;
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    if (value.length > this.maxCharacters) {
      const error = new Error('Storage quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.values.set(key, value);
  }
}

function makeDate(day) {
  return new Date(`2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`);
}

test('named document versions are stored newest-first and bounded to the configured history limit', () => {
  const storage = new MemoryStorage();
  for (let index = 1; index <= SUMMARY_DOCUMENT_HISTORY_LIMIT + 2; index += 1) {
    createSummaryDocumentVersion(storage, 'doc-history', `<p>Revision ${index}</p>`, `Version ${index}`, makeDate(index));
  }

  const versions = readSummaryDocumentHistory(storage, 'doc-history');
  assert.equal(versions.length, SUMMARY_DOCUMENT_HISTORY_LIMIT);
  assert.equal(versions[0].label, `Version ${SUMMARY_DOCUMENT_HISTORY_LIMIT + 2}`);
  assert.equal(versions.at(-1).label, 'Version 3');
});

test('history labels are trimmed and invalid or empty versions are rejected', () => {
  const storage = new MemoryStorage();
  const result = createSummaryDocumentVersion(storage, 'doc-history', '<p>Saved</p>', '  Chốt nội dung  ', makeDate(1));
  assert.equal(result.version.label, 'Chốt nội dung');
  assert.throws(() => createSummaryDocumentVersion(storage, 'doc-history', '', 'Empty', makeDate(2)), /rỗng/);
  assert.throws(() => createSummaryDocumentVersion(storage, 'doc-history', '<p>x</p>', ' '.repeat(2), makeDate(2)), /Tên phiên bản/);
  assert.throws(() => createSummaryDocumentVersion(storage, 'doc-history', '<p>x</p>', 'x'.repeat(81), makeDate(2)), /Tên phiên bản/);
});

test('quota pressure prunes old snapshots but retains the newly saved version', () => {
  const storage = new MemoryStorage(250);
  createSummaryDocumentVersion(storage, 'doc-history', '<p>First</p>', 'First saved', makeDate(1));
  createSummaryDocumentVersion(storage, 'doc-history', '<p>Second</p>', 'Second saved', makeDate(2));
  const result = createSummaryDocumentVersion(storage, 'doc-history', '<p>Third</p>', 'Third saved', makeDate(3));

  assert.ok(result.removed > 0);
  assert.equal(readSummaryDocumentHistory(storage, 'doc-history')[0].label, 'Third saved');
  assert.ok(readSummaryDocumentHistory(storage, 'doc-history').length < 3);
});

test('history remains unchanged when even one version cannot fit in storage', () => {
  const storage = new MemoryStorage();
  createSummaryDocumentVersion(storage, 'doc-history', '<p>Existing</p>', 'Existing', makeDate(1));
  const before = storage.getItem('doc-history');
  storage.maxCharacters = 1;

  assert.throws(
    () => createSummaryDocumentVersion(storage, 'doc-history', '<p>New</p>', 'New', makeDate(2)),
    /Không đủ dung lượng/
  );
  assert.equal(storage.getItem('doc-history'), before);
});

test('malformed stored JSON is surfaced rather than silently replaced', () => {
  const storage = new MemoryStorage();
  storage.setItem('doc-history', '{broken');

  assert.throws(() => readSummaryDocumentHistory(storage, 'doc-history'), /bị lỗi/);
  assert.throws(
    () => createSummaryDocumentVersion(storage, 'doc-history', '<p>New</p>', 'New', makeDate(2)),
    /bị lỗi/
  );
  assert.equal(storage.getItem('doc-history'), '{broken');
});

test('a single snapshot that exceeds the history budget is rejected', () => {
  const storage = new MemoryStorage();
  assert.throws(
    () => createSummaryDocumentVersion(storage, 'doc-history', `<p>${'x'.repeat(2_800_000)}</p>`, 'Too large', makeDate(1)),
    /vượt giới hạn/
  );
  assert.equal(storage.getItem('doc-history'), null);
});
