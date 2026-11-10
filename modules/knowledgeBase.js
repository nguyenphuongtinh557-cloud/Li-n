/**
 * Local knowledge retrieval for QLCL.
 *
 * This is an application-owned, deterministic index over published subject
 * details. It does not copy or depend on an external RAG platform.
 */

import { DB } from './db.js';

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

function relevantExcerpt(text, query) {
  if (text.length <= EXCERPT_CHARS) return text;
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
  if (!anchors.length) return `${text.slice(0, EXCERPT_CHARS - 1).trimEnd()}\u2026`;
  let best = null;
  for (const anchor of anchors) {
    const start = Math.max(0, anchor - 140);
    const end = Math.min(text.length, start + EXCERPT_CHARS);
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

function collectSources(details, subjectId) {
  const sources = [];
  const add = (id, title, content, kind = 'reference', readerContext = null) => {
    const text = plainText(content);
    if (text) sources.push({ id, title: plainText(title) || id, text, kind, readerContext });
  };

  add(`${subjectId}:intro`, `${details.name || subjectId} — Giới thiệu`, details.intro);
  Object.entries(details.cards || {}).forEach(([key, card]) => {
    add(`${subjectId}:card:${key}`, `${details.name || subjectId} — ${card?.title || key}`, card?.content);
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

export function formatKnowledgeContext(results) {
  if (!Array.isArray(results) || !results.length) return '';
  return [
    '[NGUỒN QLCL — BÀI GIẢNG & HỌC LIỆU TRÊN WEB]',
    ...results.map((source, index) => `[${index + 1}] ${source.title} (${source.id})\n${source.excerpt}`),
    'Chỉ sử dụng các nguồn trên khi chúng trả lời được câu hỏi. Nếu không đủ dữ liệu, nói rõ là chưa tìm thấy trong nguồn QLCL; không tự bịa.'
  ].join('\n\n');
}
