const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const appSource = fs.readFileSync('app.js', 'utf8');
const dbSource = fs.readFileSync('modules/db.js', 'utf8');

function readerHelpers() {
  const start = appSource.indexOf('function isStudyReaderAllowedUrl');
  const end = appSource.indexOf('function getStudyReaderDetails', start);
  assert.ok(start >= 0 && end > start, 'Reader URL/outline helpers must exist');
  const context = { URL };
  vm.createContext(context);
  vm.runInContext(`${appSource.slice(start, end)}\nthis.allowed = isStudyReaderAllowedUrl; this.outline = buildLessonOutline;`, context);
  return context;
}

test('URL allowlist accepts only HTTP(S)', () => {
  const helpers = readerHelpers();
  assert.equal(helpers.allowed('https://example.test/file.pdf'), true);
  assert.equal(helpers.allowed('http://example.test/video'), true);
  assert.equal(helpers.allowed('javascript:alert(1)'), false);
  assert.equal(helpers.allowed('data:text/html,unsafe'), false);
  assert.equal(helpers.allowed('file:///C:/private.pdf'), false);
});

test('lesson outlines provide stable H2/H3 anchors', () => {
  const outline = readerHelpers().outline([
    { type: 'heading', content: 'Mở đầu' },
    { type: 'text', content: 'Nội dung' },
    { type: 'heading', level: 'h3', content: 'Chi tiết' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(outline)), [
    { id: 'reader-heading-0', level: 'h2', title: 'Mở đầu' },
    { id: 'reader-heading-1', level: 'h3', title: 'Chi tiết' }
  ]);
});

test('reader source extracts text, filters TOC, and falls back to first lesson', () => {
  assert.match(appSource, /function extractStudyReaderText\(/);
  assert.match(appSource, /b\.dataset\.readerLabel\.includes\(query\)/);
  assert.match(appSource, /chapter\.lessons\[0\]/);
  assert.match(appSource, /resource\?\.readerConfig\?\.lessonId/);
});

test('published reader resources hide drafts', () => {
  assert.match(appSource, /readerConfig\?\.visibility !== 'draft'/);
  assert.match(appSource, /DB\.getResources\(context\.subjectId\)/);
});

test('notes migrate into normalized reader-context records', () => {
  assert.match(dbSource, /getUserNoteKey\(userId, context\)/);
  assert.match(dbSource, /resource:\$\{normalized\.resourceId\}/);
  assert.match(dbSource, /lesson:\$\{normalized\.lessonId\}/);
  assert.match(dbSource, /highlights: Array\.isArray\(note\.highlights\) \? note\.highlights : \[\]/);
  assert.match(dbSource, /annotations: Array\.isArray\(note\.annotations\) \? note\.annotations : \[\]/);
  assert.match(dbSource, /delete map\[legacyKey\]/);
});

test('highlight and annotation persistence stores text anchors and vectors only', () => {
  assert.match(appSource, /\{ start, end, quote: selection\.toString\(\)\.slice\(0, 500\) \}/);
  assert.match(appSource, /points: \[\{ x: \(e\.clientX - box\.left\) \/ box\.width, y: \(e\.clientY - box\.top\) \/ box\.height \}\]/);
  assert.match(appSource, /function studyReaderUndoAnnotation\(/);
  assert.match(appSource, /function studyReaderClearAnnotations\(/);
  assert.doesNotMatch(appSource.slice(appSource.indexOf('function mountStudyReaderAnnotationLayer'), appSource.indexOf('function bindStudyReaderControls')), /toDataURL|base64/i);
});

test('shared note keys detect expiration', () => {
  assert.match(dbSource, /item\.expiresAt && new Date\(item\.expiresAt\) < new Date\(\)/);
  assert.match(dbSource, /Key đã hết hạn truy cập/);
});
