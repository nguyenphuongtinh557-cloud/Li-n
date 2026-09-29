import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { renderMarkdownTables } from './modules/markdownTables.js';

const appSource = fs.readFileSync('app.js', 'utf8');
const htmlSource = fs.readFileSync('index.html', 'utf8');
const markdownStart = appSource.indexOf('function _csMarkdown(md) {');
const markdownEnd = appSource.indexOf('// ─ Render Deep Study UI', markdownStart);
const feedbackStart = appSource.indexOf('function renderSummaryStudyExplanationFeedback(feedback) {');
const feedbackEnd = appSource.indexOf('function openSummaryStudySelfExplain()', feedbackStart);
assert.ok(markdownStart >= 0 && markdownEnd > markdownStart);
assert.ok(feedbackStart >= 0 && feedbackEnd > feedbackStart);

const context = {
  escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  },
  renderMarkdownTables
};
vm.createContext(context);
vm.runInContext(`${appSource.slice(markdownStart, markdownEnd)}\n${appSource.slice(feedbackStart, feedbackEnd)}\nthis.renderFeedback = renderSummaryStudyExplanationFeedback;`, context);

test('self-explanation feedback renders headings, paragraphs, and lists as Markdown', () => {
  const feedback = [
    '**Điểm đúng:** Bạn đã nắm được vai trò của acetyl-CoA.',
    '- Là nguyên liệu đầu vào của con đường.',
    '- **Đúng:** có tham gia phản ứng.',
    '**Cần bổ sung:** cần nêu rõ enzyme xúc tác.'
  ].join('\n');
  const html = context.renderFeedback(feedback);
  assert.match(html, /class="summary-study-self-explain-markdown"/);
  assert.match(html, /class="cs-markdown-h3">Điểm đúng<\/h3>/);
  assert.match(html, /<ul class="cs-markdown-ul">/);
  assert.match(html, /<strong>Đúng:<\/strong>/);
  assert.doesNotMatch(html, /\*\*/);
});

test('self-explanation feedback escapes untrusted HTML before rendering', () => {
  const html = context.renderFeedback('**Kết quả:** <img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<img\b/i);
  assert.match(html, /&lt;img/);
});

test('summary chat quick-action chips are removed while the chat form remains', () => {
  assert.doesNotMatch(htmlSource, /summary-study-quick-actions|data-ai-action|data-summary-chat-prompt/);
  assert.match(htmlSource, /id="summary-study-chat-form"/);
  assert.doesNotMatch(appSource, /querySelectorAll\('\[data-ai-action\]'\)|querySelectorAll\('\[data-summary-chat-prompt\]'\)/);
});
