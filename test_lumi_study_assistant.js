import assert from 'node:assert/strict';
import { AIPool } from './modules/aiPool.js';

const originalFetch = globalThis.fetch;
let routeMode = 'summary';
let emptySearchResults = false;
let searchCalls = 0;

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.startsWith('https://api.groq.com/openai/v1/chat/completions')) {
    const request = JSON.parse(options.body);
    assert.equal(request.model, 'openai/gpt-oss-120b');
    assert.match(options.headers.Authorization, /^Bearer /);
    const isRouter = request.messages[0].content.includes('bộ định tuyến nguồn kiến thức');
    const content = isRouter
      ? JSON.stringify(routeMode === 'summary'
        ? { mode: 'summary', answer: 'Câu trả lời căn cứ trên tài liệu.' }
        : { mode: 'web', query: 'quy định an toàn thực phẩm hiện hành' })
      : 'Câu trả lời tổng hợp từ nguồn [1].';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (url.startsWith('https://api.duckduckgo.com/')) {
    searchCalls++;
    const payload = emptySearchResults
      ? { Heading: '', AbstractText: '', RelatedTopics: [] }
      : {
        Heading: 'Nguồn tham khảo',
        AbstractText: 'Thông tin từ nguồn thử nghiệm.',
        AbstractURL: 'https://example.org/source',
        RelatedTopics: []
      };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  throw new Error(`Unexpected request URL: ${url}`);
};

try {
  const summaryAnswer = await AIPool.answerSummaryStudyQuestion({
    question: 'Khái niệm này được giải thích thế nào?',
    documentTitle: 'Tài liệu thử nghiệm',
    summary: 'Bản tóm tắt thử nghiệm.'
  });
  assert.equal(summaryAnswer.mode, 'summary');
  assert.equal(summaryAnswer.answer, 'Câu trả lời căn cứ trên tài liệu.');
  assert.equal(searchCalls, 0, 'Should not search the web when the summary is sufficient');

  routeMode = 'web';
  const webAnswer = await AIPool.answerSummaryStudyQuestion({
    question: 'Quy định hiện hành là gì?',
    documentTitle: 'Tài liệu thử nghiệm',
    summary: 'Bản tóm tắt thử nghiệm.'
  });
  assert.equal(webAnswer.mode, 'web');
  assert.equal(webAnswer.answer, 'Câu trả lời tổng hợp từ nguồn [1].');
  assert.equal(webAnswer.sources[0].url, 'https://example.org/source');
  assert.equal(searchCalls, 1);

  const comparison = await AIPool.compareSummaryStudyExplanation({
    documentTitle: 'Tài liệu thử nghiệm',
    sourceText: 'Amylase thủy phân tinh bột thành maltose.',
    summary: 'Amylase là enzyme có vai trò trong thủy phân tinh bột.',
    studentExplanation: 'Amylase phân giải tinh bột thành maltose.'
  });
  assert.match(comparison, /Câu trả lời tổng hợp từ nguồn/);
  assert.equal(searchCalls, 1, 'Self-explanation comparison should use Groq without web search');

  emptySearchResults = true;
  await assert.rejects(
    AIPool.answerSummaryStudyQuestion({ question: 'Tra cứu nội dung ngoài tài liệu' }),
    /web-search-no-results/
  );
  assert.equal(searchCalls, 2);
  console.log('Lumi study assistant routing tests passed.');
} finally {
  globalThis.fetch = originalFetch;
}
