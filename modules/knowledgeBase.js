/**
 * Local knowledge retrieval for QLCL.
 *
 * This is an application-owned, deterministic index over published subject
 * details and the question bank. It does not copy or depend on an external RAG
 * platform.
 */

import { DB } from './db.js';
import { getAllSubjects } from './subjects.js?v=20261110-ft4498';

function plainText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return new Set(
    plainText(value)
      .toLocaleLowerCase('vi-VN')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9]{2,}/g) || []
  );
}

const EXCERPT_CHARS = 700;

// Gi\u1eef \u0111\u1ed9 d\u00e0i 1:1 v\u1edbi chu\u1ed7i g\u1ed1c \u0111\u1ec3 c\u1eeda s\u1ed5 kh\u1edbp \u00e1nh x\u1ea1 ng\u01b0\u1ee3c l\u1ea1i \u0111\u00fang v\u1ecb tr\u00ed.
function foldText(value) {
  let out = '';
  for (const ch of String(value)) {
    let folded = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (folded === '\u0111') folded = 'd';
    out += folded.length === 1 ? folded : (folded.charAt(0) || ' ');
  }
  return out;
}

function relevantExcerpt(text, query, windowChars = EXCERPT_CHARS) {
  if (text.length <= windowChars) return text;
  const folded = foldText(text);
  const queryTokens = [...tokenize(query)];
  const phrase = foldText(plainText(query)).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const anchors = [];
  if (phrase.length >= 6) {
    let i = folded.indexOf(phrase);
    while (i !== -1 && anchors.length < 16) { anchors.push(i); i = folded.indexOf(phrase, i + phrase.length); }
  }
  for (const token of queryTokens) {
    const re = new RegExp(token, 'g');
    let match;
    let count = 0;
    while ((match = re.exec(folded)) !== null && count < 16) { anchors.push(match.index); count += 1; }
  }
  if (!anchors.length) return `${text.slice(0, windowChars - 1).trimEnd()}\u2026`;
  let best = null;
  for (const anchor of anchors) {
    const start = Math.max(0, anchor - 140);
    const end = Math.min(text.length, start + windowChars);
    const window = folded.slice(start, end);
    const hits = queryTokens.filter(token => new RegExp(`\\b${token}\\b`).test(window)).length;
    const score = hits + (phrase.length >= 6 && window.includes(phrase) ? 3 : 0);
    if (!best || score > best.score) best = { start, end, score };
  }
  let { start, end } = best;
  while (start > 0 && !/\s/.test(text[start - 1])) start -= 1;
  while (end < text.length && !/\s/.test(text[end])) end += 1;
  return `${start > 0 ? '\u2026 ' : ''}${text.slice(start, end).trim()}${end < text.length ? ' \u2026' : ''}`;
}

function collectSources(details, subjectId, subjectMeta = null) {
  const sources = [];
  const meta = {
    subjectId,
    subjectCode: subjectMeta?.code || details?.code || subjectId,
    subjectName: subjectMeta?.name || details?.name || subjectId
  };
  const add = (id, title, content, kind = 'reference', readerContext = null) => {
    const text = plainText(content);
    if (text) sources.push({ id, title: plainText(title) || id, text, kind, readerContext, ...meta });
  };

  add(`${subjectId}:intro`, `${details.name || subjectId} — Giới thiệu`, details.intro, 'intro');
  Object.entries(details.cards || {}).forEach(([key, card]) => {
    add(`${subjectId}:card:${key}`, `${details.name || subjectId} — ${card?.title || key}`, card?.content, 'card');
  });
  (Array.isArray(details.chapters) ? details.chapters : []).forEach((chapter, chapterIndex) => {
    const chapterTitle = chapter.title || `Chương ${chapterIndex + 1}`;
    // Reader hiển thị cả bài nháp trong mục lục, nên chỉ mục của CERA phải khớp
    // với những gì người học nhìn thấy trên web.
    const lessons = Array.isArray(chapter.lessons) ? chapter.lessons : [];
    add(`${subjectId}:chapter:${chapter.id || chapterIndex}`, chapterTitle, chapter.description, 'chapter');
    lessons.forEach((lesson, lessonIndex) => {
      const lessonTitle = lesson.title || `Bài ${lessonIndex + 1}`;
      const content = [
        lesson.description,
        lesson.content,
        ...(Array.isArray(lesson.blocks) ? lesson.blocks.map(block => block.content) : [])
      ].join(' ');
      add(
        `${subjectId}:lesson:${lesson.id || `${chapterIndex}-${lessonIndex}`}`,
        `${chapterTitle} — ${lessonTitle}`,
        content,
        'lesson',
        lesson.id ? { subjectId, ...(chapter.id ? { chapterId: chapter.id } : {}), lessonId: lesson.id } : null
      );
    });
  });
  return sources;
}

export function searchSubjectKnowledge(query, subjectId = DB.getActiveSubject(), limit = 4, focusLessonId = null) {
  const details = DB.getSubjectDetails(subjectId);
  if (!details) return [];
  const queryTokens = tokenize(query);
  const sources = collectSources(details, subjectId);
  const focused = focusLessonId ? sources.find(source => source.readerContext?.lessonId === focusLessonId) : null;
  if (!queryTokens.size) return focused ? [{ ...focused, excerpt: relevantExcerpt(focused.text, query) }] : [];

  return sources
    .map(source => {
      const sourceTokens = tokenize(source.text);
      const matches = [...queryTokens].filter(token => sourceTokens.has(token)).length;
      const phraseBoost = plainText(source.text).toLocaleLowerCase('vi-VN').includes(plainText(query).toLocaleLowerCase('vi-VN')) ? 2 : 0;
      const focusBoost = focused && source.id === focused.id ? 1 : 0;
      return { ...source, score: matches + phraseBoost + focusBoost };
    })
    .filter(source => source.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'vi'))
    .slice(0, limit)
    .map(source => ({
      ...source,
      excerpt: relevantExcerpt(source.text, query)
    }));
}

// ─── Chỉ mục toàn bộ môn học + ngân hàng câu hỏi ──────────────────────────────

// Từ chức năng/giới thiệu không giúp phân biệt nội dung; bỏ để tránh khớp mọi nguồn.
const QUERY_STOPWORDS = new Set([
  'cua', 'va', 'la', 'cho', 'voi', 'cac', 'nhung', 'khi', 'de', 'khong', 'mot', 'nay', 'thi', 'ma',
  'nhu', 'hay', 'hoac', 'boi', 'vi', 'nen', 'se', 'dang', 'duoc', 'cung', 'rat', 'hon', 'nhat',
  'minh', 'gi', 'ai', 'sao', 'the', 'vay', 'nhe', 'nha', 'nhi', 'roi', 'vua', 'moi', 'giup', 'dum',
  'cau', 'hoi', 'bai', 'mon', 'phan', 'chuong', 'noi', 'dung', 'trinh', 'giang', 'tai', 'lieu',
  'trac', 'nghiem', 'dap', 'an', 'giai', 'thich', 'thong', 'tin', 'kien', 'thuc', 'hoc', 'on',
  'tap', 'thi', 'thu', 'ban', 'muon', 'can', 'tim', 'xem', 'biet', 'ra', 'nao', 'do', 'day'
]);

function meaningfulTokens(value) {
  return [...tokenize(value)].filter(token => !QUERY_STOPWORDS.has(token));
}

// Chuẩn hóa cả chuỗi một lần để tìm bằng regex biên từ, tránh dựng Set cho
// từng bài giảng (chậm trên dữ liệu giáo trình lớn).
function searchableText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function tokenWeight(token) {
  if (token.length >= 6) return 3;
  if (token.length >= 4) return 2;
  return 1;
}

const INDEX_TTL_MS = 30_000;
let allKnowledgeCache = null;

function knowledgeSignature() {
  try {
    const detailsLength = (localStorage.getItem('qlcl_subject_details') || '').length;
    const bankLength = (localStorage.getItem('qlcl_question_bank') || '').length;
    return `${detailsLength}|${bankLength}|${DB.getBank().length}`;
  } catch {
    return '';
  }
}

function buildBankSources(subjectById) {
  const sources = [];
  const labels = ['A', 'B', 'C', 'D'];
  DB.getBank().forEach(item => {
    const subjectId = item.subjectId || 'FT4468';
    const subject = subjectById.get(subjectId);
    const subjectCode = subject?.code || subjectId;
    const options = (Array.isArray(item.options) ? item.options : [])
      .map((option, index) => `${labels[index] || index + 1}. ${plainText(option)}`)
      .join('\n');
    const text = [
      plainText(item.q),
      options,
      Number.isInteger(item.correct)
        ? `Đáp án: ${labels[item.correct] || item.correct}. ${plainText(item.options?.[item.correct] || '')}`
        : '',
      item.exp ? `Giải thích: ${plainText(item.exp)}` : ''
    ].filter(Boolean).join('\n');
    if (!text) return;
    const titleParts = [`${subjectCode} — Trắc nghiệm`];
    if (item.chapter) titleParts.push(`chương ${item.chapter}`);
    titleParts.push(`câu #${item.id}`);
    sources.push({
      id: `${subjectCode}:quiz:${item.id}`,
      title: titleParts.join(' · '),
      text,
      kind: 'quiz',
      readerContext: null,
      subjectId,
      subjectCode,
      subjectName: subject?.name || subjectId
    });
  });
  return sources;
}

function buildAllSources() {
  const sources = [];
  const subjectById = new Map(getAllSubjects().map(subject => [subject.id, subject]));
  Object.entries(DB.getAllSubjectDetailsMap()).forEach(([subjectId, details]) => {
    const subject = subjectById.get(subjectId);
    sources.push(...collectSources(details, subjectId, {
      code: subject?.code || details?.code || subjectId,
      name: subject?.name || details?.name || subjectId
    }));
  });
  sources.push(...buildBankSources(subjectById));
  return sources.map(source => ({
    ...source,
    haystack: searchableText(source.text),
    titleHaystack: searchableText(source.title)
  }));
}

function getAllSourcesIndex() {
  const signature = knowledgeSignature();
  const now = Date.now();
  if (allKnowledgeCache && allKnowledgeCache.signature === signature && now - allKnowledgeCache.builtAt < INDEX_TTL_MS) {
    return allKnowledgeCache.sources;
  }
  const sources = buildAllSources();
  allKnowledgeCache = { signature, builtAt: now, sources };
  return sources;
}

/**
 * Tra cứu trên toàn bộ bài giảng của mọi môn + toàn bộ ngân hàng câu hỏi.
 * Môn/bài đang mở được cộng điểm ưu tiên nhưng không chặn nguồn môn khác.
 */
export function searchAllKnowledge(query, {
  limit = 5,
  focusSubjectId = '',
  focusLessonId = '',
  restrictSubjectId = '',
  excerptChars = 520
} = {}) {
  const queryTokens = meaningfulTokens(query);
  if (!queryTokens.length) return [];
  const sources = getAllSourcesIndex();
  const tokenMatchers = queryTokens.map(token => new RegExp(`\\b${token}\\b`));
  const phrase = searchableText(plainText(query)).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const phraseMatcher = queryTokens.length >= 2 && phrase.length >= 6
    ? new RegExp(`\\b${phrase.split(' ').join('[^a-z0-9]+')}\\b`)
    : null;
  const totalWeight = queryTokens.reduce((sum, token) => sum + tokenWeight(token), 0);

  const candidates = [];
  sources.forEach(source => {
    if (restrictSubjectId && source.subjectId !== restrictSubjectId) return;
    const matched = [];
    queryTokens.forEach((token, index) => {
      if (tokenMatchers[index].test(source.haystack)) matched.push(index);
    });
    if (!matched.length) return;
    let titleHits = 0;
    queryTokens.forEach((token, index) => {
      if (tokenMatchers[index].test(source.titleHaystack)) titleHits += 1;
    });
    candidates.push({
      source,
      matched,
      titleHits,
      phraseHit: Boolean(phraseMatcher && phraseMatcher.test(source.haystack))
    });
  });
  if (!candidates.length) return [];

  // Từ phổ biến ("chất", "lượng", "thực phẩm") có mặt ở gần như mọi bài nên
  // trọng số giảm mạnh; từ hiếm mới quyết định nguồn nào thật sự liên quan.
  const docFreq = new Array(queryTokens.length).fill(0);
  candidates.forEach(candidate => candidate.matched.forEach(index => { docFreq[index] += 1; }));
  const total = candidates.length;
  const logTotal = Math.log(total + 1) || 1;
  const adjustedWeights = queryTokens.map((token, index) => {
    const idf = Math.max(0, Math.log((total + 1) / (docFreq[index] + 1)) / logTotal);
    return tokenWeight(token) * (0.35 + 0.65 * idf);
  });
  const totalAdjusted = adjustedWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  // Truy vấn 1-2 từ ngắn hợp lệ (pH, nhựa, bao bì) có tổng trọng số thấp;
  // hạ ngưỡng để không bỏ sót nguồn thật.
  const minScore = queryTokens.length <= 2 ? 1.5 : 2.5;

  return candidates
    .map(candidate => {
      const { source, matched, titleHits, phraseHit } = candidate;
      let score = matched.reduce((sum, index) => sum + adjustedWeights[index], 0);
      if (source.subjectId === focusSubjectId) score += 2.5;
      if (focusLessonId && source.readerContext?.lessonId === focusLessonId) score += 2.5;
      score += titleHits * 0.75;
      if (phraseHit) score += 4;
      score += (matched.reduce((sum, index) => sum + tokenWeight(queryTokens[index]), 0) / totalWeight) * 1.5;
      return { source, score };
    })
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score || a.source.title.localeCompare(b.source.title, 'vi'))
    .slice(0, Math.max(1, limit))
    .map(({ source, score }) => {
      const { haystack, titleHaystack, text, ...rest } = source;
      return {
        ...rest,
        score: Number(score.toFixed(2)),
        excerpt: relevantExcerpt(text, query, excerptChars)
      };
    });
}

const SOURCE_KIND_LABELS = {
  lesson: 'Bài giảng',
  chapter: 'Chương',
  intro: 'Giới thiệu môn',
  card: 'Thông tin môn',
  quiz: 'Trắc nghiệm'
};

export function formatKnowledgeContext(results) {
  if (!Array.isArray(results) || !results.length) return '';
  return [
    '[NGUỒN QLCL — BÀI GIẢNG & NGÂN HÀNG CÂU HỎI CỦA CÁC MÔN]',
    ...results.map((source, index) => {
      const subjectLabel = source.subjectCode
        ? `${source.subjectCode}${source.subjectName ? ` · ${source.subjectName}` : ''}`
        : '';
      const typeLabel = SOURCE_KIND_LABELS[source.kind] || 'Tài liệu';
      return `[${index + 1}] [${typeLabel}] ${subjectLabel ? `${subjectLabel} — ` : ''}${source.title} (${source.id})\n${source.excerpt}`;
    }),
    'Chỉ sử dụng các nguồn trên khi chúng thực sự liên quan tới câu hỏi; khi trích dẫn phải nêu mã môn và tên bài/chương hoặc số câu trắc nghiệm. Nếu không đủ dữ liệu, nói rõ là chưa tìm thấy trong nguồn QLCL; không tự bịa và không gợi ý mã môn khác nếu người học chưa nhắc tới.'
  ].join('\n\n');
}
