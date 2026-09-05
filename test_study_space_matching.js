const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const start = source.indexOf('function normalizeStudySpaceValue');
const end = source.indexOf('function getStudySpaceSubjects', start);
assert.ok(start >= 0 && end > start, 'Không tìm thấy matcher Không gian học tập trong app.js');

const matcherSource = source.slice(start, end);
const context = { console };
vm.createContext(context);
vm.runInContext(`${matcherSource}\nthis.matchArticles = studySpaceArticlesForSubject; this.matchResources = studySpaceResourcesForSubject; this.matchContent = studySpaceContentForSubject;`, context);

const subject = { id: 'subject-hoa-keo', code: 'FT4455', name: 'Hóa keo - CNTP' };
const fixtures = [
  { id: 'exact-id', subjectId: 'subject-hoa-keo' },
  { id: 'code-case', subjectCode: 'ft4455' },
  { id: 'name-whitespace', subject: '  HÓA   KEO -  cntp ' },
  { id: 'text-fallback', title: 'Tài liệu ôn tập FT4455' },
  { id: 'other-subject', subjectCode: 'FT4456', title: 'Tài liệu FT4456' },
];

const matchedIds = context.matchArticles(subject, fixtures).map(article => article.id);
assert.deepStrictEqual(matchedIds, ['exact-id', 'code-case', 'name-whitespace', 'text-fallback']);
assert.ok(!matchedIds.includes('other-subject'), 'Không được khớp bài đăng của môn khác');

const resources = [
  { id: 'resource-id', subjectId: 'subject-hoa-keo', name: 'Bài giảng Hóa keo', type: 'lecture' },
  { id: 'resource-code', subjectCode: 'FT4455', name: 'Đề thi Hóa keo', type: 'exam' },
  { id: 'resource-other', subjectId: 'FT4456', name: 'Bài giảng môn khác', type: 'lecture' },
];
const matchedResources = context.matchResources(subject, resources);
assert.deepStrictEqual(matchedResources.map(resource => resource.id), ['resource-id', 'resource-code']);
assert.deepStrictEqual(matchedResources.map(resource => resource.contentType), ['resource', 'resource']);
assert.deepStrictEqual(Array.from(context.matchContent(subject, fixtures, resources), item => item.id), ['exact-id', 'code-case', 'name-whitespace', 'text-fallback', 'resource-id', 'resource-code']);

console.log('PASS: Study Space matches linked articles and learning resources without cross-subject matches.');
