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

function collectSources(details, subjectId) {
  const sources = [];
  const add = (id, title, content) => {
    const text = plainText(content);
    if (text) sources.push({ id, title: plainText(title) || id, text });
  };

  add(`${subjectId}:intro`, `${details.name || subjectId} — Giới thiệu`, details.intro);
  Object.entries(details.cards || {}).forEach(([key, card]) => {
    add(`${subjectId}:card:${key}`, `${details.name || subjectId} — ${card?.title || key}`, card?.content);
  });
  (Array.isArray(details.chapters) ? details.chapters : []).forEach((chapter, chapterIndex) => {
    const chapterTitle = chapter.title || `Chương ${chapterIndex + 1}`;
    add(`${subjectId}:chapter:${chapter.id || chapterIndex}`, chapterTitle, chapter.description);
    (Array.isArray(chapter.lessons) ? chapter.lessons : [])
      .filter(lesson => lesson.status !== 'draft')
      .forEach((lesson, lessonIndex) => {
        const lessonTitle = lesson.title || `Bài ${lessonIndex + 1}`;
        const content = [
          lesson.description,
          lesson.content,
          ...(Array.isArray(lesson.blocks) ? lesson.blocks.map(block => block.content) : [])
        ].join(' ');
        add(
          `${subjectId}:lesson:${lesson.id || `${chapterIndex}-${lessonIndex}`}`,
          `${chapterTitle} — ${lessonTitle}`,
          content
        );
      });
  });
  return sources;
}

export function searchSubjectKnowledge(query, subjectId = DB.getActiveSubject(), limit = 4) {
  const details = DB.getSubjectDetails(subjectId);
  if (!details) return [];
  const queryTokens = tokenize(query);
  if (!queryTokens.size) return [];

  return collectSources(details, subjectId)
    .map(source => {
      const sourceTokens = tokenize(source.text);
      const matches = [...queryTokens].filter(token => sourceTokens.has(token)).length;
      const phraseBoost = plainText(source.text).toLocaleLowerCase('vi-VN').includes(plainText(query).toLocaleLowerCase('vi-VN')) ? 2 : 0;
      return { ...source, score: matches + phraseBoost };
    })
    .filter(source => source.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'vi'))
    .slice(0, limit)
    .map(source => ({
      ...source,
      excerpt: source.text.length > 420 ? `${source.text.slice(0, 417)}...` : source.text
    }));
}

export function formatKnowledgeContext(results) {
  if (!Array.isArray(results) || !results.length) return '';
  return [
    '[NGUỒN QLCL ĐÃ XUẤT BẢN]',
    ...results.map((source, index) => `[${index + 1}] ${source.title} (${source.id})\n${source.excerpt}`),
    'Chỉ sử dụng các nguồn trên khi chúng trả lời được câu hỏi. Nếu không đủ dữ liệu, nói rõ là chưa tìm thấy trong nguồn QLCL; không tự bịa.'
  ].join('\n\n');
}
