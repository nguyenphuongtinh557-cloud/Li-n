/**
 * ceraContext.js — Lớp dữ liệu học tập mà FTECA được phép đọc.
 *
 * Chỉ trả về các đoạn ngắn, đúng ý định của câu hỏi:
 *   A. Ngân hàng câu hỏi + lịch sử làm bài (riêng)
 *   B. Ghi chú / highlight của chính người dùng (riêng, lưu cục bộ)
 *   C. Tóm tắt bài giảng hệ thống + lịch sử tóm tắt giáo trình (riêng)
 *   D. Tài nguyên, bài đăng, tình trạng học liệu theo môn (dùng chung)
 */

import { DB } from './db.js';
import { getAllSubjects } from './subjects.js?v=20261110-ft4498';
import { getUserRole } from './auth.js?v=20261111-authotp1';

const SUMMARY_HISTORY_KEY = 'fteca_curriculum_summary_history_v2';
const LIMITS = { history: 3, bank: 2, noteChars: 400, highlights: 4, summaryPoints: 5, pitfalls: 3, materials: 6 };

const INTENTS = {
  history: /(lịch sử|điểm|kết quả|làm bài|thi thử|đề thi|tiến độ|câu sai|sai nhiều|ôn lại)/i,
  notes: /(ghi chú|note|highlight|đánh dấu|tô sáng)/i,
  summaries: /(tóm tắt|ý chính|ôn nhanh|summary|tóm gọn)/i,
  materials: /(tài liệu|bài giảng|giáo trình|đề cương|file|pdf|docx|nội dung môn|học liệu|tài nguyên)/i,
  bank: /(ngân hàng|câu hỏi|trắc nghiệm|đáp án|câu số|chương \d)/i,
  list: /(môn nào|những môn|môn gì|có tài liệu)/i
};

// Từ chung của ngành, không đủ để nhận diện một môn cụ thể
const SUBJECT_NAME_STOPWORDS = new Set([
  'thuc', 'pham', 'cong', 'nghe', 'trong', 'cua', 'cho', 'voi', 'tai', 'lieu',
  'hoc', 'tap', 'mon', 'bai', 'giang', 'ky', 'va', 'cac', 'nhung', 'nay', 'do'
]);

// Tên gọi tắt sinh viên hay dùng, không trùng tên chính thức trong registry.
const SUBJECT_ALIASES = {
  FT4488: ['cong nghe sau thu hoach', 'cong nghe sau th', 'sau thu hoach thuc vat']
};

function plain(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value) {
  return plain(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/đ/g, 'd');
}

function tokensOf(value) {
  return normalize(value).match(/[a-z0-9]{2,}/g) || [];
}

function formatAvailability(subject, info, withIntro = false) {
  const line = `- ${subject.code} · ${plain(subject.name)}: ${info.resources} tài nguyên, ${info.articles} bài đăng, ${info.lessons} bài giảng đã phát hành${info.hasIntro ? ', có giới thiệu môn' : ', chưa có giới thiệu môn'}`;
  return withIntro && info.intro ? `${line}\n  Giới thiệu môn: "${info.intro.slice(0, 300)}"` : line;
}

function availabilityFor(subject) {
  const subjectCode = normalize(subject.code);
  const resources = DB.getResources().filter(item =>
    item.subjectId === subject.id || (subjectCode && normalize(item.subjectCode) === subjectCode)
  );
  const articles = DB.getArticles().filter(item => item.subjectId === subject.id);
  const details = DB.getSubjectDetails(subject.id);
  let lessons = 0;
  (details?.chapters || []).forEach(chapter => {
    lessons += (chapter.lessons || []).filter(lesson => lesson.status !== 'draft').length;
  });
  const intro = plain(details?.intro || details?.shortDesc);
  return {
    resources: resources.length,
    articles: articles.length,
    lessons,
    hasIntro: Boolean(intro),
    intro
  };
}

function significantNameTokens(subject) {
  return [...new Set(tokensOf(subject.name).filter(token => !SUBJECT_NAME_STOPWORDS.has(token)))];
}

export function mentionedSubjects(query) {
  const queryText = String(query || '');
  const upper = queryText.toUpperCase();
  const normalizedQuery = normalize(queryText);
  const queryTokenList = tokensOf(queryText);
  const queryTokens = new Set(queryTokenList);
  const scored = [];
  getAllSubjects().forEach(subject => {
    const code = String(subject.code || subject.id || '').toUpperCase();
    if (code && upper.includes(code)) {
      scored.push({ subject, score: 100 });
      return;
    }
    const aliases = SUBJECT_ALIASES[subject.id] || [];
    if (aliases.some(alias => normalizedQuery.includes(alias))) {
      scored.push({ subject, score: 100 });
      return;
    }
    const nameTokens = significantNameTokens(subject);
    const hits = nameTokens.filter(token => queryTokens.has(token)).length;
    if (nameTokens.length && hits >= Math.min(2, nameTokens.length)) {
      // Cụm từ liền nhau trong câu ("vi sinh đại cương") đáng tin hơn các từ rời
      // rạc, tránh nhầm "Sinh học đại cương" khi người học nói "Vi sinh đại cương".
      const run = longestAdjacentRun(nameTokens, queryTokenList);
      scored.push({ subject, score: hits + run * 2 });
    }
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, 2).map(entry => entry.subject);
}

// Một mention "mạnh" là mã môn, tên gọi tắt, tên môn đầy đủ, hoặc một cụm ≥3 từ
// liền nhau của tên môn. Từ rời rạc trong tiêu đề mục ("các … quá trình … lý …
// hóa" của bài đang đọc) không đủ để coi là người học đang hỏi môn khác.
function strongSubjectMention(query, subject) {
  const upper = String(query || '').toUpperCase();
  const code = String(subject.code || subject.id || '').toUpperCase();
  if (code && upper.includes(code)) return true;
  const normalizedQuery = normalize(query);
  const aliases = SUBJECT_ALIASES[subject.id] || [];
  if (aliases.some(alias => normalizedQuery.includes(alias))) return true;
  const fullName = normalize(subject.name);
  if (fullName.length >= 8 && normalizedQuery.includes(fullName)) return true;
  return longestAdjacentRun(significantNameTokens(subject), tokensOf(query)) >= 3;
}

export function resolveCeraSubjectForQuery(query, { reading = null, readingActive = false } = {}) {
  const mentioned = mentionedSubjects(query);
  const readingSubject = readingActive && reading?.subjectId
    ? getAllSubjects().find(subject => subject.id === reading.subjectId) || null
    : null;
  const primary = mentioned[0];
  if (readingSubject && primary && primary.id !== readingSubject.id && !strongSubjectMention(query, primary)) {
    return { primary: readingSubject, mentioned: [] };
  }
  return { primary: primary || readingSubject || null, mentioned };
}

const CERA_LAST_SUBJECT_KEY = 'fteca_cera_last_subject_v1';
const PRONOUN_SUBJECT = /\b(?:mon(?:\s+hoc)?|bai(?:\s+giang)?|tai\s+lieu|de(?:\s+thi)?|phan|chuong)\s+(?:do|nay|ay|day|kia)\b|\b(?:mon|bai|tai\s+lieu|de)\s+(?:vua\s+roi|luc\s+nay|vua\s+mo|vua\s+doc|vua\s+hoc)\b/;

// Nhớ môn CERA vừa mở để hiểu các câu nối tiếp kiểu "môn đó", "môn này".
export function rememberCeraSubject(subjectId) {
  const id = String(subjectId || '').trim();
  if (!id || !getAllSubjects().some(subject => subject.id === id)) return false;
  try {
    sessionStorage.setItem(CERA_LAST_SUBJECT_KEY, id);
  } catch {
    // sessionStorage bị chặn thì vẫn không làm hỏng điều hướng
  }
  return true;
}

export function recallCeraSubject() {
  let id = '';
  try {
    id = sessionStorage.getItem(CERA_LAST_SUBJECT_KEY) || '';
  } catch {
    return null;
  }
  return getAllSubjects().find(subject => subject.id === id) || null;
}

export function refersToPreviousSubject(query) {
  return PRONOUN_SUBJECT.test(normalize(query));
}

function longestAdjacentRun(nameTokens, queryTokens) {
  let best = 0;
  for (let start = 0; start < queryTokens.length; start += 1) {
    let run = 0;
    while (run < nameTokens.length && queryTokens[start + run] === nameTokens[run]) run += 1;
    if (run > best) best = run;
  }
  return best;
}

function bankMatches(query) {
  const queryTokens = tokensOf(query);
  if (queryTokens.length < 2) return [];
  const phrase = normalize(query);
  return DB.getBank()
    .map(item => {
      const body = `${item.q || ''} ${item.exp || ''}`;
      const bodyTokens = new Set(tokensOf(body));
      const hits = queryTokens.filter(token => bodyTokens.has(token)).length;
      const phraseBoost = phrase && normalize(body).includes(phrase) ? 3 : 0;
      return { item, score: hits + phraseBoost };
    })
    .filter(entry => entry.score >= Math.max(2, Math.min(4, Math.ceil(queryTokens.length * 0.5))))
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMITS.bank)
    .map(entry => entry.item);
}

function formatBankMatch(item) {
  const labels = ['A', 'B', 'C', 'D'];
  const answer = `${labels[item.correct] || '?'}. ${plain(item.options?.[item.correct] || '')}`;
  return `- #${item.id} · Ch.${item.chapter} · ${plain(item.q).slice(0, 160)} → đáp án ${answer}`;
}

function historySection() {
  const history = DB.getHistory().slice(0, LIMITS.history);
  if (!history.length) return '- Chưa có lượt làm bài nào trên thiết bị này.';
  return history.map(item => {
    const date = item.date ? new Date(item.date).toLocaleDateString('vi-VN') : 'Không rõ ngày';
    const subject = item.meta?.subjectCode || item.meta?.subjectId;
    const score = Number.isFinite(Number(item.score)) ? Number(item.score).toFixed(1) : '—';
    return `- ${date}${subject ? ` · ${subject}` : ''} · ${score}/10 · ${item.correct}/${item.total} câu · ${item.isPassed ? 'Đạt' : 'Chưa đạt'}`;
  }).join('\n');
}

function notesSection(userId, reading) {
  if (!userId) return '';
  const subjectId = reading?.subjectId || DB.getActiveSubject();
  if (!subjectId) return '';
  const map = DB.getUserNotesMap();
  const lines = [];
  if (reading?.lessonId || reading?.resourceId) {
    const key = DB.getUserNoteKey(userId, {
      subjectId,
      lessonId: reading.lessonId || '',
      resourceId: reading.resourceId || ''
    });
    const note = DB.normalizeUserNoteRecord(map[key] || {});
    const text = plain(note.text);
    if (text) lines.push(`- Ghi chú ở bài đang mở: "${text.slice(0, LIMITS.noteChars)}"`);
    const quotes = (note.highlights || [])
      .map(highlight => plain(highlight.quote))
      .filter(Boolean)
      .slice(0, LIMITS.highlights);
    if (quotes.length) lines.push(`- Đoạn đã highlight: ${quotes.map(quote => `"${quote.slice(0, 120)}"`).join(' | ')}`);
  }
  const prefix = `${userId}::${subjectId}::`;
  const count = Object.keys(map).filter(key => key.startsWith(prefix)).length;
  if (count) lines.unshift(`- Số ghi chú đã lưu ở môn này: ${count}`);
  return lines.join('\n');
}

function readSummaryHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(SUMMARY_HISTORY_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function summarySection(reading, readingActive) {
  const lines = [];
  if (readingActive && reading?.summary) {
    const summary = reading.summary;
    const points = (summary.mainPoints || []).map(plain).filter(Boolean).slice(0, LIMITS.summaryPoints);
    const pitfalls = (summary.pitfalls || []).map(plain).filter(Boolean).slice(0, LIMITS.pitfalls);
    lines.push(`- Tóm tắt bài đang mở${reading.title ? ` "${plain(reading.title)}"` : ''} (hệ thống): ${points.join('; ') || 'chưa có ý chính'}`);
    if (pitfalls.length) lines.push(`- Lỗi dễ nhầm: ${pitfalls.join('; ')}`);
  }
  const history = readSummaryHistory();
  if (history.length) {
    const saved = history.slice(0, 2).map(entry => {
      const rawPoints = entry.result?.mainPoints || entry.result?.key_points || [];
      const points = rawPoints.map(plain).filter(Boolean).slice(0, 3);
      return `${plain(entry.title).slice(0, 90)}${points.length ? ` (${points.join('; ')})` : ''}`;
    });
    lines.push(`- Bản tóm tắt giáo trình đã lưu (riêng): ${saved.join(' | ')}`);
  }
  return lines.join('\n');
}

function materialsListSection() {
  const counts = new Map();
  DB.getResources().forEach(resource => {
    if (!resource.subjectId) return;
    counts.set(resource.subjectId, (counts.get(resource.subjectId) || 0) + 1);
  });
  const subjects = getAllSubjects()
    .filter(subject => counts.get(subject.id))
    .sort((a, b) => counts.get(b.id) - counts.get(a.id))
    .slice(0, LIMITS.materials);
  if (!subjects.length) return '- Hiện chưa có tài nguyên học tập nào được đăng trên hệ thống.';
  return subjects.map(subject => `- ${subject.code} · ${plain(subject.name)}: ${counts.get(subject.id)} tài nguyên`).join('\n');
}

// Vai trò thật của tài khoản đang đăng nhập, để CERA không trả lời chung chung.
export function getCeraUserProfile() {
  const scope = typeof window !== 'undefined' ? window : {};
  const user = scope.NavController?.currentUser || scope.AuthModule?.user || null;
  const email = String(user?.email || '').trim();
  const role = getUserRole(email);
  const name = plain(user?.name || '').slice(0, 60) || (email ? email.split('@')[0] : 'bạn');
  return { name, email, role, isAdmin: role === 'ADMIN' };
}

function userProfileSection() {
  const profile = getCeraUserProfile();
  const roleText = profile.isAdmin
    ? 'Quản trị viên (ADMIN)'
    : (profile.role === 'PREMIUM' ? 'Premium' : 'Người học thường (NEWBIE)');
  const permission = profile.isAdmin
    ? 'Có quyền quản trị: mở trang Quản trị, quản lý môn học, người dùng, tài nguyên, bài viết, thông báo, ngân hàng câu hỏi và phản hồi.'
    : 'Không có quyền quản trị. Không hướng dẫn vào Cài đặt/Hồ sơ để tìm mục admin vì không có mục đó.';
  return `## Người dùng hiện tại\n- Tên: ${profile.name}\n- Vai trò: ${roleText}\n- Quyền: ${permission}`;
}

export function buildCeraContext({ query = '', userId = '', reading = null, readingActive = false } = {}) {
  const sections = [];
  const queryText = String(query || '');
  const wantsMaterials = INTENTS.materials.test(queryText) || INTENTS.list.test(queryText);
  const { primary, mentioned } = resolveCeraSubjectForQuery(queryText, { reading, readingActive });
  const remembered = !primary && refersToPreviousSubject(queryText) ? recallCeraSubject() : null;
  const activeSubjectId = primary?.id || remembered?.id || DB.getActiveSubject();
  const activeSubject = getAllSubjects().find(subject => subject.id === activeSubjectId);

  sections.push(userProfileSection());

  if (activeSubject) {
    sections.push(`## Học liệu môn ${activeSubject.code}\n${formatAvailability(activeSubject, availabilityFor(activeSubject), wantsMaterials)}`);
  }
  mentioned.slice(1).forEach(subject => {
    sections.push(`## Học liệu môn ${subject.code}\n${formatAvailability(subject, availabilityFor(subject), wantsMaterials)}`);
  });

  if (INTENTS.list.test(queryText)) {
    sections.push(`## Các môn đang có tài nguyên\n${materialsListSection()}`);
  }
  if (INTENTS.history.test(queryText)) {
    sections.push(`## Lịch sử làm bài của người học (riêng)\n${historySection()}`);
  }
  if (INTENTS.notes.test(queryText) || readingActive) {
    const notes = notesSection(userId, reading);
    if (notes) sections.push(`## Ghi chú của người học (riêng)\n${notes}`);
  }
  if (INTENTS.summaries.test(queryText) || readingActive) {
    const summaries = summarySection(reading, readingActive);
    if (summaries) sections.push(`## Tóm tắt bài học\n${summaries}`);
  }
  if (INTENTS.bank.test(queryText)) {
    const matches = bankMatches(queryText);
    if (matches.length) {
      sections.push(`## Câu hỏi trong ngân hàng khớp nội dung\n${matches.map(formatBankMatch).join('\n')}`);
    }
  }

  if (!sections.length) return '';
  return [
    '[DỮ LIỆU NGƯỜI HỌC — chỉ trích phần liên quan, không đọc lại toàn bộ]',
    ...sections
  ].join('\n\n');
}
