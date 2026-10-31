/**
 * quizShare.js — Chia sẻ đề thi giữa các học viên.
 *
 * Chủ đề chọn một môn, toàn bộ câu hỏi do chính họ tạo trong môn đó (không gồm
 * câu seed và câu kéo từ kho cộng đồng) được đóng thành đề có link
 * `/de-thi/<shareId>`. Người nhận vào link là thi ngay; chủ đề xem bảng điểm
 * của từng người trong tab "Đề đã chia sẻ".
 */

import { AuthModule } from './auth.js';
import { DB } from './db.js';
import { getAllSubjects } from './subjects.js';
import { ExamTimer } from './exam.js';

const API = '/api/quiz-share';
const SHARE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECONDS_PER_QUESTION = 60;
const GUEST_NAME_KEY = 'qlcl_quiz_guest_name';
const DIFF_LABELS = { 1: 'Dễ', 2: 'Trung bình', 3: 'Khó' };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toast(message, type = 'info') {
  window.showToast?.(message, type);
}

function clampName(value, max = 40) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  return /[\ud800-\udbff]$/.test(text) ? text.slice(0, -1) : text;
}

function normalizeQuestionText(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Câu seed không có cờ riêng trong ngân hàng (data/seed_questions.js chỉ là mảng
 * thô), nên phải so nội dung để loại chúng khỏi đề chia sẻ của người dùng.
 */
let seedTextsPromise = null;
function ensureSeedTexts() {
  if (!seedTextsPromise) {
    seedTextsPromise = import('../data/seed_questions.js')
      .then(({ SEED_QUESTIONS }) => new Set((SEED_QUESTIONS || []).map(item => normalizeQuestionText(item.q))))
      .catch(() => new Set());
  }
  return seedTextsPromise;
}

function shareUrl(shareId) {
  return `${window.location.origin}/de-thi/${shareId}`;
}

function isLoopbackOrigin() {
  const host = String(window.location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '0.0.0.0';
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Vừa xong';
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (!minutes) return `${rest} giây`;
  return `${minutes} phút ${String(rest).padStart(2, '0')} giây`;
}

async function apiRequest(query, { method = 'GET', body = null, auth = false, authOptional = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (auth || authOptional) {
    const token = await AuthModule.getIdToken().catch(() => '');
    if (!token && auth) throw Object.assign(new Error('auth-required'), { status: 401, reason: 'auth-required' });
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API}${query}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* đáp án rỗng/không phải JSON */ }
  if (!response.ok || !payload?.ok) {
    throw Object.assign(new Error(payload?.reason || `quiz-share-${response.status}`), {
      status: response.status,
      reason: payload?.reason || '',
    });
  }
  return payload;
}

function isShareableQuestion(question, seedTexts) {
  return !question._seed
    && !question._synced
    && typeof question.q === 'string' && question.q.trim()
    && !seedTexts.has(normalizeQuestionText(question.q))
    && Array.isArray(question.options) && question.options.length >= 2
    && Number.isInteger(question.correct)
    && question.correct >= 0
    && question.correct < question.options.length;
}

async function getUserCreatedQuestions(subjectId) {
  if (!subjectId) return [];
  const seeds = await ensureSeedTexts();
  return DB.getBankBySubject(subjectId).filter(question => isShareableQuestion(question, seeds));
}

function toPayload(question) {
  return {
    q: question.q,
    options: question.options,
    correct: question.correct,
    exp: question.exp || '',
    chapter: question.chapter || 1,
    difficulty: question.difficulty || 1,
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', 'readonly');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    helper.remove();
    return copied;
  }
}

/* ════════════════════════════════════════════════════════════
   TAB CHỦ ĐỀ: tạo link + bảng điểm
════════════════════════════════════════════════════════════ */

const ownerView = {
  subjectId: '',
  shares: [],
  loading: false,
  creating: false,
  lastLink: '',
  bound: false,
  openScores: new Map(),
  scoresLoading: new Set(),
};

async function shareableSubjects() {
  const seeds = await ensureSeedTexts();
  const mine = DB.getBank().filter(question => isShareableQuestion(question, seeds));
  return getAllSubjects()
    .map(subject => ({ subject, count: mine.filter(q => (q.subjectId || 'FT4468') === subject.id).length }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.subject.code.localeCompare(b.subject.code));
}

function pickOwnerSubject(entries) {
  if (!entries.length) return '';
  const active = DB.getActiveSubject();
  if (ownerView.subjectId && entries.some(entry => entry.subject.id === ownerView.subjectId)) return ownerView.subjectId;
  if (entries.some(entry => entry.subject.id === active)) return active;
  return entries[0].subject.id;
}

function ownerLoginRequired() {
  return `
    <div class="card sq-owner-gate">
      <div class="sq-owner-gate-icon"><i class="fa-solid fa-link-slash" aria-hidden="true"></i></div>
      <h3>Đăng nhập để chia sẻ đề</h3>
      <p>Liên kết chia sẻ và bảng điểm được gắn với tài khoản Google của bạn, nên cần đăng nhập trước khi tạo đề.</p>
      <button type="button" class="btn btn-primary" data-sq-action="signin">
        <i class="fa-brands fa-google" aria-hidden="true"></i> Đăng nhập bằng Google
      </button>
    </div>`;
}

function ownerTabMarkup(entries, selectedId) {
  const selected = entries.find(entry => entry.subject.id === selectedId) || null;
  const options = entries.map(({ subject, count }) => `
    <option value="${escapeHtml(subject.id)}">${escapeHtml(subject.code)} · ${escapeHtml(subject.name)} (${count} câu)</option>`)
    .join('');

  return `
    <div class="sq-owner">
      <section class="card sq-owner-hero">
        <div>
          <span class="sq-owner-kicker">CHIA SẺ ĐỀ CỦA BẠN</span>
          <h2>Đề đã chia sẻ</h2>
          <p>Đóng toàn bộ câu hỏi bạn tự tạo trong một môn thành link thi. Người khác mở link là vào thi ngay; điểm của từng người hiện ở đây.</p>
        </div>
        <div class="sq-owner-hero-art" aria-hidden="true"><i class="fa-solid fa-share-nodes"></i></div>
      </section>

      <section class="card sq-owner-create">
        <div class="sq-owner-create-head">
          <h3><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Tạo liên kết thi</h3>
          <span class="sq-owner-scope">Chỉ tính câu bạn tự thêm · bỏ qua câu hệ thống và câu kho chung</span>
        </div>
        ${entries.length ? `
          <div class="sq-owner-form">
            <label class="sq-owner-field">
              <span>Môn học</span>
              <select id="sq-owner-subject" class="form-select">${options}</select>
            </label>
            <label class="sq-owner-field sq-owner-field-title">
              <span>Tên đề (tuỳ chọn)</span>
              <input id="sq-owner-title" class="form-input" type="text" maxlength="120" placeholder="Đề ôn tập giữa kỳ">
            </label>
            <div class="sq-owner-summary" id="sq-owner-summary"></div>
            <button type="button" class="btn btn-primary sq-owner-create-btn" id="sq-owner-create">
              <i class="fa-solid fa-link" aria-hidden="true"></i> Tạo liên kết chia sẻ
            </button>
          </div>
          <div class="sq-owner-created hidden" id="sq-owner-created"></div>
        ` : `
          <div class="sq-owner-empty">
            <p>Bạn chưa có câu hỏi tự tạo nào. Hãy vào <b>Tạo câu hỏi bằng AI</b> hoặc thêm câu hỏi vào ngân hàng trước.</p>
          </div>
        `}
      </section>

      <section class="card sq-owner-list-card">
        <div class="sq-owner-list-head">
          <h3><i class="fa-solid fa-list-check" aria-hidden="true"></i> Đề đang chia sẻ</h3>
          <button type="button" class="btn btn-secondary btn-sm" data-sq-action="reload">
            <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Làm mới
          </button>
        </div>
        <div id="sq-owner-list" class="sq-owner-list"></div>
      </section>
    </div>`;
}

function shareItemMarkup(share) {
  return `
    <article class="sq-share-item" data-share-id="${escapeHtml(share.shareId)}">
      <div class="sq-share-item-main">
        <div class="sq-share-item-copy">
          <h4>${escapeHtml(share.title)}</h4>
          <p class="sq-share-item-meta">
            <span class="badge badge-subtle">${escapeHtml(share.subjectCode)}</span>
            ${escapeHtml(share.subjectName)} · ${share.questionCount} câu · ${formatDateTime(share.createdAt)}
          </p>
          <p class="sq-share-item-link">${escapeHtml(shareUrl(share.shareId))}${isLoopbackOrigin() ? ' <span class="sq-owner-warn">(chỉ mở trên máy này)</span>' : ''}</p>
        </div>
        <div class="sq-share-item-side">
          <div class="sq-share-count"><b>${share.attemptCount}</b><span>lượt thi</span></div>
          <div class="sq-share-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-sq-action="copy"><i class="fa-regular fa-copy" aria-hidden="true"></i> Sao chép link</button>
            <button type="button" class="btn btn-secondary btn-sm" data-sq-action="scores"><i class="fa-solid fa-table-list" aria-hidden="true"></i> Xem điểm</button>
            <button type="button" class="btn btn-ghost btn-sm sq-danger" data-sq-action="delete"><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Xóa</button>
          </div>
        </div>
      </div>
      <div class="sq-share-scores hidden" data-sq-scores></div>
    </article>`;
}

function scoresTableMarkup(attempts, totalCount = attempts.length) {
  if (!attempts.length) {
    return '<p class="sq-scores-empty">Chưa có ai nộp bài cho đề này.</p>';
  }
  const rows = attempts.map((attempt, index) => {
    const identity = attempt.identityType === 'user'
      ? '<span class="sq-score-flag" title="Nộp bằng tài khoản đã đăng nhập"><i class="fa-solid fa-circle-check" aria-hidden="true"></i></span>'
      : '';
    const scoreClass = attempt.score10 >= 7 ? 'is-pass' : 'is-fail';
    return `
      <tr>
        <td class="sq-score-rank">${index + 1}</td>
        <td>${escapeHtml(attempt.participantName)} ${identity}${attempt.email ? `<small class="sq-score-email">${escapeHtml(attempt.email)}</small>` : ''}</td>
        <td class="sq-score-value ${scoreClass}">${attempt.score10.toFixed(1)}</td>
        <td>${attempt.correctCount}/${attempt.total}</td>
        <td>${formatDuration(attempt.timeSpent)}</td>
        <td class="sq-score-time">${formatDateTime(attempt.submittedAt)}</td>
      </tr>`;
  }).join('');
  return `
    <div class="sq-scores-wrap custom-scroll">
      <table class="sq-scores-table">
        <thead><tr><th>#</th><th>Người tham gia</th><th>Điểm /10</th><th>Đúng</th><th>Thời gian</th><th>Nộp lúc</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${Number(totalCount) > attempts.length
      ? `<p class="sq-scores-empty">Hiển thị ${attempts.length} bài gần nhất trong tổng ${Number(totalCount).toLocaleString('vi-VN')} lượt nộp.</p>`
      : ''}`;
}

function renderOwnerSummary(entries, selectedId) {
  const summary = document.getElementById('sq-owner-summary');
  const input = document.getElementById('sq-owner-title');
  if (!summary) return;
  const entry = entries.find(candidate => candidate.subject.id === selectedId);
  if (!entry) { summary.innerHTML = ''; return; }
  const overLimit = entry.count > 200;
  summary.innerHTML = `
    <div class="sq-owner-summary-row">
      <span><i class="fa-solid fa-circle-question" aria-hidden="true"></i> ${entry.count} câu sẵn sàng đưa vào đề</span>
      <span class="sq-owner-summary-time">${Math.round(entry.count * SECONDS_PER_QUESTION / 60)} phút làm bài</span>
    </div>
    ${overLimit ? '<p class="sq-owner-warn">Đề chỉ nhận tối đa 200 câu. Hãy bớt câu trong ngân hàng hoặc lọc theo chương trước khi chia sẻ.</p>' : ''}`;
  if (input && !input.value) {
    input.placeholder = `Đề ôn tập · ${entry.subject.name}`;
  }
}

async function loadOwnerShares() {
  const list = document.getElementById('sq-owner-list');
  if (!list) return;
  ownerView.loading = true;
  list.innerHTML = '<div class="sq-owner-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Đang tải danh sách đề…</div>';
  try {
    const payload = await apiRequest('?owner=1', { auth: true });
    ownerView.shares = payload.shares || [];
    ownerView.loading = false;
    if (!ownerView.shares.length) {
      list.innerHTML = '<p class="sq-owner-none">Chưa có đề nào được chia sẻ. Tạo liên kết ở phía trên để bắt đầu.</p>';
      return;
    }
    list.innerHTML = ownerView.shares.map(shareItemMarkup).join('');
    ownerView.openScores.forEach((attempts, shareId) => {
      const container = list.querySelector(`[data-share-id="${shareId}"] [data-sq-scores]`);
      if (container) {
        container.classList.remove('hidden');
        container.innerHTML = scoresTableMarkup(attempts);
      }
    });
  } catch (error) {
    ownerView.loading = false;
    const message = error.reason === 'auth-required'
      ? 'Cần đăng nhập bằng Google (phiên còn hiệu lực) để xem danh sách đề.'
      : error.status === 503
        ? 'Máy chủ chưa được cấu hình nơi lưu đề chia sẻ.'
        : 'Không tải được danh sách đề. Vui lòng thử lại.';
    list.innerHTML = `<p class="sq-owner-error">${escapeHtml(message)}</p>`;
  }
}

async function refreshScores(shareId) {
  const item = document.querySelector(`#sq-owner-list [data-share-id="${shareId}"]`);
  const container = item?.querySelector('[data-sq-scores]');
  if (!container || ownerView.scoresLoading.has(shareId)) return;
  ownerView.scoresLoading.add(shareId);
  container.classList.remove('hidden');
  container.innerHTML = '<div class="sq-owner-loading"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Đang tải bảng điểm…</div>';
  try {
    const payload = await apiRequest(`?owner=1&id=${encodeURIComponent(shareId)}`, { auth: true });
    const attempts = payload.attempts || [];
    const totalCount = Number(payload.share?.attemptCount) || attempts.length;
    ownerView.openScores.set(shareId, attempts);
    container.innerHTML = scoresTableMarkup(attempts, totalCount);
    const countEl = item.querySelector('.sq-share-count b');
    if (countEl) countEl.textContent = String(totalCount);
  } catch (error) {
    container.innerHTML = `<p class="sq-owner-error">${escapeHtml(error.reason === 'auth-required' ? 'Cần đăng nhập để xem bảng điểm.' : 'Không tải được bảng điểm.')}</p>`;
  } finally {
    ownerView.scoresLoading.delete(shareId);
  }
}

async function createShareFromOwnerTab() {
  const entries = await shareableSubjects();
  if (!entries.length) return;
  const selectedId = ownerView.subjectId;
  const entry = entries.find(candidate => candidate.subject.id === selectedId) || entries[0];
  const questions = await getUserCreatedQuestions(entry.subject.id);
  const button = document.getElementById('sq-owner-create');
  if (questions.length > 200) {
    toast(`Môn này có ${questions.length} câu, vượt giới hạn 200 câu của một đề.`, 'warning');
    return;
  }

  ownerView.creating = true;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Đang tạo liên kết…';
  }
  try {
    const payload = await apiRequest('', {
      method: 'POST',
      auth: true,
      body: {
        subjectId: entry.subject.id,
        subjectCode: entry.subject.code,
        subjectName: entry.subject.name,
        title: document.getElementById('sq-owner-title')?.value || '',
        ownerName: AuthModule.user?.name || '',
        questions: questions.map(toPayload),
      },
    });
    ownerView.lastLink = shareUrl(payload.shareId);
    const panel = document.getElementById('sq-owner-created');
    if (panel) {
      panel.classList.remove('hidden');
      panel.innerHTML = `
        <div class="sq-created-row">
          <input class="form-input" type="text" readonly value="${escapeHtml(ownerView.lastLink)}" id="sq-created-link">
          <button type="button" class="btn btn-secondary btn-sm" data-sq-action="copy-new">
            <i class="fa-regular fa-copy" aria-hidden="true"></i> Sao chép
          </button>
        </div>
        <p>Đã đưa ${payload.questionCount} câu vào đề.${isLoopbackOrigin()
          ? ` Link đang trỏ về <b>${escapeHtml(window.location.origin)}</b> nên chỉ mở được trên máy này — muốn gửi cho người khác, hãy dùng bản đã deploy.`
          : ' Link mở được trên mọi thiết bị, không cần đăng nhập.'}</p>`;
      panel.querySelector('#sq-created-link')?.select();
    }
    toast(payload.droppedCount
      ? `Đã tạo link, bỏ ${payload.droppedCount} câu thiếu đáp án.`
      : 'Đã tạo liên kết chia sẻ đề.', 'success');
    await loadOwnerShares();
  } catch (error) {
    const message = error.reason === 'auth-required'
      ? 'Cần đăng nhập bằng Google để tạo đề chia sẻ.'
      : error.status === 429
        ? 'Bạn vừa tạo nhiều đề quá, hãy chờ ít phút.'
        : error.status === 503
          ? 'Máy chủ chưa cấu hình nơi lưu đề chia sẻ.'
          : 'Không tạo được liên kết chia sẻ. Vui lòng thử lại.';
    toast(message, 'error');
  } finally {
    ownerView.creating = false;
    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-link" aria-hidden="true"></i> Tạo liên kết chia sẻ';
    }
  }
}

export const QuizShares = {
  async renderOwnerTab() {
    const root = document.getElementById('quiz-share-owner-root');
    if (!root) return;

    if (!AuthModule.user?.email) {
      root.innerHTML = ownerLoginRequired();
      root.querySelector('[data-sq-action="signin"]')?.addEventListener('click', () => {
        void AuthModule.signInWithGoogle();
      });
      return;
    }

    const entries = await shareableSubjects();
    ownerView.subjectId = pickOwnerSubject(entries);
    root.innerHTML = ownerTabMarkup(entries, ownerView.subjectId);

    if (entries.length) {
      const select = document.getElementById('sq-owner-subject');
      if (select) {
        select.value = ownerView.subjectId;
        select.addEventListener('change', () => {
          ownerView.subjectId = select.value;
          void shareableSubjects().then(latest => renderOwnerSummary(latest, ownerView.subjectId));
        });
      }
      document.getElementById('sq-owner-create')?.addEventListener('click', () => void createShareFromOwnerTab());
      renderOwnerSummary(entries, ownerView.subjectId);
    }

    if (ownerView.bound) return;
    ownerView.bound = true;
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-sq-action]');
      if (!button) return;
      const action = button.dataset.sqAction;
      if (action === 'reload') { void loadOwnerShares(); return; }

      if (action === 'copy-new') {
        if (ownerView.lastLink && await copyText(ownerView.lastLink)) toast('Đã sao chép liên kết đề.', 'success');
        return;
      }

      const item = button.closest('[data-share-id]');
      const shareId = item?.dataset.shareId || '';
      if (!shareId) return;
      const share = ownerView.shares.find(candidate => candidate.shareId === shareId);

      if (action === 'copy') {
        if (await copyText(shareUrl(shareId))) toast('Đã sao chép liên kết đề.', 'success');
        else toast('Trình duyệt không cho sao chép. Hãy bôi đen link và bấm Ctrl+C.', 'warning');
        return;
      }

      if (action === 'scores') {
        const container = item.querySelector('[data-sq-scores]');
        if (ownerView.openScores.has(shareId) && !container?.classList.contains('hidden')) {
          container.classList.add('hidden');
          ownerView.openScores.delete(shareId);
          button.innerHTML = '<i class="fa-solid fa-table-list" aria-hidden="true"></i> Xem điểm';
          return;
        }
        button.innerHTML = '<i class="fa-solid fa-table-list" aria-hidden="true"></i> Ẩn điểm';
        void refreshScores(shareId);
        return;
      }

      if (action === 'delete') {
        if (!window.confirm(`Xóa đề "${share?.title || ''}"? Link sẽ ngừng hoạt động và toàn bộ điểm người tham gia bị xóa.`)) return;
        button.disabled = true;
        try {
          await apiRequest(`?id=${encodeURIComponent(shareId)}`, { method: 'DELETE', auth: true });
          ownerView.openScores.delete(shareId);
          toast('Đã xóa đề chia sẻ.', 'success');
          await loadOwnerShares();
        } catch (error) {
          button.disabled = false;
          toast(error.reason === 'auth-required' ? 'Cần đăng nhập để xóa đề.' : 'Không xóa được đề.', 'error');
        }
      }
    });

    void loadOwnerShares();
  },
};

/* ════════════════════════════════════════════════════════════
   TRANG NGƯỜI NHẬN: /de-thi/<shareId>
════════════════════════════════════════════════════════════ */

const quiz = {
  shareId: '',
  share: null,
  questions: [],
  answers: {},
  flagged: {},
  index: 0,
  timer: null,
  participantName: '',
  identityType: 'guest',
  submitting: false,
  booted: false,
  paletteExpanded: false,
};

function el(id) {
  return document.getElementById(id);
}

function showSection(...ids) {
  ['sq-loading', 'sq-error', 'sq-landing', 'sq-exam', 'sq-result'].forEach(id => {
    const node = el(id);
    if (node) node.classList.toggle('hidden', !ids.includes(id));
  });
}

function stopTimer() {
  quiz.timer?.stop();
  quiz.timer = null;
}

function setQuizPauseUi(paused) {
  const button = el('sq-pause');
  if (!button) return;
  button.classList.toggle('is-paused', paused);
  button.innerHTML = paused
    ? '<i class="fa-solid fa-play" aria-hidden="true"></i> Tiếp tục'
    : '<i class="fa-solid fa-pause" aria-hidden="true"></i> Tạm dừng';
}

function resetQuizPalette() {
  quiz.paletteExpanded = false;
  el('sq-palette')?.classList.remove('is-expanded');
  const more = el('sq-palette-more');
  if (!more) return;
  more.classList.remove('hidden');
  const label = more.querySelector('span');
  const icon = more.querySelector('i');
  if (label) label.textContent = 'Xem thêm câu hỏi';
  if (icon) icon.className = 'fa-solid fa-chevron-down';
}

function toggleQuizPalette() {
  quiz.paletteExpanded = !quiz.paletteExpanded;
  el('sq-palette')?.classList.toggle('is-expanded', quiz.paletteExpanded);
  const more = el('sq-palette-more');
  if (!more) return;
  const label = more.querySelector('span');
  const icon = more.querySelector('i');
  if (label) label.textContent = quiz.paletteExpanded ? 'Thu gọn danh sách' : 'Xem thêm câu hỏi';
  if (icon) icon.className = quiz.paletteExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
}

function resetQuiz() {
  stopTimer();
  resetQuizPalette();
  resetSqResultView();
  setQuizPauseUi(false);
  quiz.shareId = '';
  quiz.share = null;
  quiz.questions = [];
  quiz.answers = {};
  quiz.flagged = {};
  quiz.index = 0;
  quiz.participantName = '';
  quiz.identityType = 'guest';
  quiz.submitting = false;
}

function renderQuizError(error) {
  const box = el('sq-error');
  if (!box) return;
  const map = {
    404: ['Không tìm thấy đề thi', 'Liên kết có thể đã bị chủ đề xóa.'],
    400: ['Liên kết đề không hợp lệ', 'Hãy kiểm tra lại đường dẫn được gửi cho bạn.'],
    429: ['Quá nhiều yêu cầu', 'Chờ ít phút rồi mở lại liên kết.'],
    503: ['Dịch vụ chia sẻ chưa sẵn sàng', 'Máy chủ chưa được cấu hình để lưu đề chia sẻ.'],
  };
  const entry = map[error?.status] || ['Không vào được đề thi', 'Đã xảy ra lỗi kết nối. Vui lòng thử lại.'];
  box.innerHTML = `
    <div class="sq-error-icon"><i class="fa-solid fa-link-slash" aria-hidden="true"></i></div>
    <h2>${escapeHtml(entry[0])}</h2>
    <p>${escapeHtml(entry[1])}</p>
    <button type="button" class="btn btn-secondary" id="sq-error-retry"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Thử lại</button>`;
  el('sq-error-retry')?.addEventListener('click', () => void QuizSharePage.open(quiz.shareId));
  showSection('sq-error');
}

async function renderLanding() {
  const share = quiz.share;
  const questions = quiz.questions || [];
  const total = questions.length;
  const secondsPerQuestion = share.secondsPerQuestion || SECONDS_PER_QUESTION;
  const minutes = Math.round(total * secondsPerQuestion / 60);

  el('sq-landing-title').textContent = share.title;
  el('sq-landing-subject').textContent = `${share.subjectCode} · ${share.subjectName}`;
  el('sq-landing-owner').textContent = `Đề do ${share.ownerName || 'một học viên'} chia sẻ · ${Number(share.attemptCount) || 0} người đã thi`;

  el('sq-info-count').textContent = `${total} câu`;
  el('sq-info-duration').textContent = `${minutes} phút`;
  el('sq-duration-footer').textContent = `${minutes} phút làm bài`;
  el('sq-count-footer').textContent = `${total} câu hỏi`;
  el('sq-landing-note').textContent = `Mỗi câu ${secondsPerQuestion} giây · Đáp án hiện sau khi nộp`;

  // Đề chia sẻ giữ nguyên cấu hình của chủ đề: chỉ hiển thị phân bố, không cho kéo chỉnh.
  const diffCounts = [0, 0, 0];
  questions.forEach(question => {
    const level = Math.min(3, Math.max(1, Number(question.difficulty) || 1));
    diffCounts[level - 1] += 1;
  });
  const diffPct = diffCounts.map(count => total ? Math.round(count / total * 100) : 0);
  el('sq-diff-easy-pct').textContent = diffPct[0];
  el('sq-diff-medium-pct').textContent = diffPct[1];
  el('sq-diff-hard-pct').textContent = diffPct[2];
  const bar = el('sq-difficulty-bar');
  if (bar) {
    const segments = bar.querySelectorAll('.diff-bar-easy, .diff-bar-medium, .diff-bar-hard');
    diffCounts.forEach((count, index) => {
      if (segments[index]) segments[index].style.flex = String(count);
    });
  }

  const userBox = el('sq-identity-user');
  const guestBox = el('sq-identity-guest');
  const token = await AuthModule.getIdToken().catch(() => '');
  const user = token ? AuthModule.user : null;
  if (user?.email) {
    userBox.classList.remove('hidden');
    guestBox.classList.add('hidden');
    userBox.innerHTML = `
      <img src="${escapeHtml(user.avatar || '')}" alt="" onerror="this.remove()">
      <div><b>${escapeHtml(user.name || user.email)}</b><small>${escapeHtml(user.email)}</small></div>
      <span class="badge badge-subtle">Tài khoản Google</span>`;
    const input = el('sq-guest-name');
    if (input) input.value = '';
  } else {
    userBox.classList.add('hidden');
    guestBox.classList.remove('hidden');
    const input = el('sq-guest-name');
    if (input) {
      input.value = localStorage.getItem(GUEST_NAME_KEY) || '';
      input.focus();
    }
  }
  showSection('sq-landing');
}

function renderExamQuestion() {
  const question = quiz.questions[quiz.index];
  if (!question) return;
  el('sq-q-position').textContent = `Câu ${quiz.index + 1} / ${quiz.questions.length}`;
  el('sq-q-chapter').textContent = question.chapter ? `Chương ${question.chapter}` : 'Không rõ chương';
  const level = Math.min(3, Math.max(1, Number(question.difficulty) || 1));
  const diffBadge = el('sq-q-diff');
  diffBadge.textContent = DIFF_LABELS[level] || 'Chưa phân mức';
  diffBadge.className = `badge badge-${['easy', 'medium', 'hard'][level - 1]}`;
  el('sq-q-text').textContent = `Câu ${quiz.index + 1}: ${question.q}`;

  const flagged = Boolean(quiz.flagged[quiz.index]);
  const flagButton = el('sq-flag');
  if (flagButton) {
    flagButton.className = flagged ? 'exam-flag-btn is-flagged' : 'exam-flag-btn';
    flagButton.innerHTML = flagged
      ? '<i class="fa-solid fa-bookmark" aria-hidden="true"></i> Đã đánh dấu'
      : '<i class="fa-regular fa-bookmark" aria-hidden="true"></i> Đánh dấu';
  }

  const selected = quiz.answers[quiz.index];
  const list = el('sq-options');
  list.textContent = '';
  question.options.forEach((text, optionIndex) => {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'option-btn' + (selected === optionIndex ? ' selected' : '');
    choice.dataset.option = String(optionIndex);
    choice.innerHTML = `<span class="option-label">${String.fromCharCode(65 + optionIndex)}</span><span>${escapeHtml(text)}</span>`;
    list.appendChild(choice);
  });

  el('sq-prev').disabled = quiz.index === 0;
  el('sq-next').disabled = quiz.index === quiz.questions.length - 1;
  renderQuizPalette();
}

function renderQuizPalette() {
  const palette = el('sq-palette');
  if (!palette) return;
  palette.textContent = '';
  quiz.questions.forEach((_, index) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.textContent = String(index + 1);
    cell.dataset.goto = String(index);
    const classes = ['palette-btn'];
    if (quiz.answers[index] !== undefined) classes.push('answered');
    if (quiz.flagged[index]) classes.push('flagged');
    if (index === quiz.index) classes.push('current');
    cell.className = classes.join(' ');
    palette.appendChild(cell);
  });
  const answered = Object.keys(quiz.answers).length;
  el('sq-answered-text').textContent = `Đã làm: ${answered}/${quiz.questions.length}`;
  const progress = el('sq-progress-bar');
  if (progress) {
    progress.style.width = `${quiz.questions.length ? answered / quiz.questions.length * 100 : 0}%`;
  }
  const more = el('sq-palette-more');
  if (more) more.classList.toggle('hidden', quiz.questions.length <= 30);
}

async function startExam() {
  const button = el('sq-start');
  if (button) button.disabled = true;
  try {
    const token = await AuthModule.getIdToken().catch(() => '');
    const user = token ? AuthModule.user : null;
    const guestInput = el('sq-guest-name');
    if (user?.email) {
      quiz.participantName = clampName(user.name || user.email.split('@')[0]);
      quiz.identityType = 'user';
    } else {
      const guestName = clampName(guestInput?.value);
      if (!guestName) {
        toast('Nhập tên của bạn để chủ đề nhận diện được điểm.', 'warning');
        guestInput?.focus();
        return;
      }
      localStorage.setItem(GUEST_NAME_KEY, guestName);
      quiz.participantName = guestName;
      quiz.identityType = 'guest';
    }

    quiz.answers = {};
    quiz.flagged = {};
    quiz.index = 0;
    resetQuizPalette();
    setQuizPauseUi(false);
    showSection('sq-exam');
    renderExamQuestion();

    const total = quiz.questions.length * (quiz.share.secondsPerQuestion || SECONDS_PER_QUESTION);
    const urgentFrom = Math.max(30, Math.floor(total * 0.2));
    stopTimer();
    quiz.timer = new ExamTimer(total,
      (left) => {
        el('sq-exam-timer-text').textContent = quiz.timer.format(left);
        el('sq-exam-timer').classList.toggle('urgent', left <= urgentFrom);
      },
      () => {
        toast('Hết thời gian, hệ thống tự nộp bài.', 'warning');
        void submitQuiz();
      }
    );
    quiz.timer.start();
    el('sq-exam-timer-text').textContent = quiz.timer.format();
    el('sq-exam-timer').classList.remove('urgent');
  } finally {
    if (button) button.disabled = false;
  }
}

async function submitQuiz() {
  if (quiz.submitting) return;
  quiz.submitting = true;
  const totalTime = quiz.questions.length * (quiz.share?.secondsPerQuestion || SECONDS_PER_QUESTION);
  const timeSpent = Math.max(0, totalTime - Math.max(0, quiz.timer?.left ?? totalTime));
  stopTimer();
  const button = el('sq-submit');
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Đang nộp…';
  }
  try {
    const payload = await apiRequest(`?id=${encodeURIComponent(quiz.shareId)}`, {
      method: 'POST',
      authOptional: quiz.identityType === 'user',
      body: { participantName: quiz.participantName, answers: quiz.answers, timeSpent },
    });
    showSection('sq-result');
    renderQuizResult(payload.result);
  } catch (error) {
    const message = error.status === 404
      ? 'Đề này đã bị chủ đề xóa trước khi nộp.'
      : error.status === 409
        ? 'Đề đã nhận đủ số bài nộp tối đa nên không nhận thêm. Hãy báo chủ đề.'
        : error.status === 429
          ? 'Bạn nộp bài quá nhiều lần trong một phút, chờ chút rồi thử lại.'
          : 'Không nộp được bài. Kiểm tra kết nối rồi bấm nộp lại.';
    toast(message, 'error');
    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Nộp bài';
    }
  } finally {
    quiz.submitting = false;
  }
}

/* ── Kết quả: dùng chung thiết kế với trang thi thử ── */
let _sqResultFilter = 'all';
let _sqResultSort = 'order';
let _sqResultOpen = new Set();
let _sqResultPaletteExpanded = false;
let _sqResultJumpIdx = null;
let _sqResultRows = [];
let _sqResultRingRaf = 0;

function fxReduced() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function sqResultCounts() {
  const counts = { correct: 0, wrong: 0, empty: 0, flagged: 0 };
  _sqResultRows.forEach(row => {
    if (row.isCorrect) counts.correct += 1;
    else if (Number.isInteger(row.userAns)) counts.wrong += 1;
    else counts.empty += 1;
    if (quiz.flagged[row.idx]) counts.flagged += 1;
  });
  counts.answered = counts.correct + counts.wrong;
  return counts;
}

function resetSqResultView() {
  _sqResultFilter = 'all';
  _sqResultSort = 'order';
  _sqResultOpen = new Set();
  _sqResultPaletteExpanded = false;
  _sqResultJumpIdx = null;
  _sqResultRows = [];
  el('sq-result-palette')?.classList.remove('is-expanded');
  const sortSelect = el('sq-result-sort');
  if (sortSelect) sortSelect.value = 'order';
  const more = el('sq-result-palette-more');
  if (more) {
    more.classList.remove('hidden');
    const label = more.querySelector('span');
    const icon = more.querySelector('i');
    if (label) label.textContent = 'Xem thêm chi tiết';
    if (icon) icon.className = 'fa-solid fa-chevron-down';
  }
}

function sqResultFilteredRows() {
  const rows = _sqResultRows.filter(row => {
    switch (_sqResultFilter) {
      case 'correct': return row.isCorrect;
      case 'wrong': return Number.isInteger(row.userAns) && !row.isCorrect;
      case 'empty': return !Number.isInteger(row.userAns);
      case 'flagged': return Boolean(quiz.flagged[row.idx]);
      default: return true;
    }
  });
  const statusRank = row => row.isCorrect ? 2 : (Number.isInteger(row.userAns) ? 0 : 1);
  return rows.slice().sort((a, b) => {
    if (_sqResultSort === 'wrong-first') return statusRank(a) - statusRank(b) || a.idx - b.idx;
    if (_sqResultSort === 'difficulty') return b.difficulty - a.difficulty || a.idx - b.idx;
    if (_sqResultSort === 'chapter') return a.chapter - b.chapter || a.idx - b.idx;
    return a.idx - b.idx;
  });
}

function renderSqResultFilterCounts() {
  const counts = sqResultCounts();
  setText('sq-result-count-all', _sqResultRows.length);
  setText('sq-result-count-correct', counts.correct);
  setText('sq-result-count-wrong', counts.wrong);
  setText('sq-result-count-empty', counts.empty);
  setText('sq-result-count-flagged', counts.flagged);
  document.querySelectorAll('#sq-result .er-filter').forEach(button => {
    const active = button.dataset.filter === _sqResultFilter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function updateSqToggleAllLabel() {
  const button = el('sq-result-toggle-all');
  if (!button) return;
  const cards = Array.from(document.querySelectorAll('#sq-result-list details.er-q'));
  button.textContent = cards.length > 0 && cards.every(card => card.open) ? 'Thu gọn tất cả' : 'Mở tất cả';
}

function animateSqResultRing(pct) {
  const ring = el('sq-result-ring');
  const value = el('sq-result-score-val');
  if (!ring || !value) return;

  cancelAnimationFrame(_sqResultRingRaf);
  ring.classList.remove('is-filling');

  if (fxReduced()) {
    value.textContent = `${pct}%`;
    return;
  }

  const duration = 1100;
  const start = performance.now();
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  value.textContent = '0%';
  void ring.offsetWidth;
  ring.classList.add('is-filling');

  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    value.textContent = `${Math.round(easeOut(t) * pct)}%`;
    if (t < 1) _sqResultRingRaf = requestAnimationFrame(step);
  };
  _sqResultRingRaf = requestAnimationFrame(step);
}

function jumpToSqQuestion(idx) {
  _sqResultFilter = 'all';
  _sqResultSort = 'order';
  _sqResultOpen = new Set([idx]);
  _sqResultJumpIdx = idx;

  const sortSelect = el('sq-result-sort');
  if (sortSelect) sortSelect.value = 'order';

  renderSqReviewList(false);
  renderSqResultPalette();

  const grid = el('sq-result-palette');
  grid?.querySelectorAll('.er-cell.is-jumped').forEach(cell => cell.classList.remove('is-jumped'));
  grid?.querySelector(`.er-cell[data-idx="${idx}"]`)?.classList.add('is-jumped');

  const target = el('sq-result-list')?.querySelector(`.er-q[data-idx="${idx}"]`);
  if (target) {
    window.requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
}

function toggleSqResultPalette() {
  _sqResultPaletteExpanded = !_sqResultPaletteExpanded;
  const grid = el('sq-result-palette');
  grid?.classList.toggle('is-expanded', _sqResultPaletteExpanded);
  const more = el('sq-result-palette-more');
  if (more) {
    const label = more.querySelector('span');
    const icon = more.querySelector('i');
    if (label) label.textContent = _sqResultPaletteExpanded ? 'Thu gọn danh sách' : 'Xem thêm chi tiết';
    if (icon) icon.className = _sqResultPaletteExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
  }
  if (_sqResultPaletteExpanded && grid && !fxReduced()) {
    grid.querySelectorAll('.er-cell:nth-child(n+26)').forEach((cell, index) => {
      cell.style.animationDelay = `${index * 12}ms`;
      cell.classList.add('fx-cell-in');
      window.setTimeout(() => {
        cell.classList.remove('fx-cell-in');
        cell.style.animationDelay = '';
      }, 360 + index * 12);
    });
  }
}

function setSqResultFilter(filter) {
  _sqResultFilter = filter;
  _sqResultOpen = new Set();
  renderSqReviewList(true);
}

function setSqResultSort(sort) {
  _sqResultSort = sort;
  renderSqReviewList(false);
}

function toggleSqAllDetails() {
  const cards = Array.from(document.querySelectorAll('#sq-result-list details.er-q'));
  if (!cards.length) return;

  const shouldOpen = cards.some(card => !card.open);
  cards.forEach(card => {
    card.open = shouldOpen;
    const idx = Number(card.dataset.idx);
    if (shouldOpen) _sqResultOpen.add(idx);
    else _sqResultOpen.delete(idx);
  });
  updateSqToggleAllLabel();
}

function renderSqResultPalette() {
  const grid = el('sq-result-palette');
  if (!grid) return;

  const counts = sqResultCounts();
  setText('sq-result-palette-summary', `Đã làm: ${counts.answered}/${_sqResultRows.length}`);
  setText('sq-result-palette-correct', counts.correct);
  setText('sq-result-palette-wrong', counts.wrong);
  setText('sq-result-palette-empty', counts.empty);
  setText('sq-result-palette-flagged', counts.flagged);

  grid.textContent = '';
  _sqResultRows.forEach(row => {
    const answered = Number.isInteger(row.userAns);
    const flagged = Boolean(quiz.flagged[row.idx]);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.dataset.idx = String(row.idx);
    cell.className = 'er-cell ' + (row.isCorrect ? 'is-correct' : answered ? 'is-wrong' : 'is-empty') + (flagged ? ' is-flagged' : '');
    cell.textContent = String(row.idx + 1);
    cell.setAttribute('aria-label', `Câu ${row.idx + 1}: ${row.isCorrect ? 'đúng' : answered ? 'sai' : 'chưa làm'}${flagged ? ', đã đánh dấu' : ''}`);
    cell.addEventListener('click', () => jumpToSqQuestion(row.idx));
    grid.appendChild(cell);
  });

  grid.classList.remove('is-expanded');
  const needsMore = grid.scrollHeight > grid.clientHeight + 1;
  grid.classList.toggle('is-expanded', _sqResultPaletteExpanded);
  el('sq-result-palette-more')?.classList.toggle('hidden', !needsMore);
}

function renderSqReviewList(openFirst = false) {
  const list = el('sq-result-list');
  if (!list) return;

  list.textContent = '';
  list.classList.remove('hidden');

  const rows = sqResultFilteredRows();
  if (openFirst && rows.length && _sqResultOpen.size === 0) {
    _sqResultOpen.add(rows[0].idx);
  }

  const labels = ['A', 'B', 'C', 'D'];

  rows.forEach(row => {
    const answered = Number.isInteger(row.userAns);
    const status = row.isCorrect
      ? { cls: 'is-correct', icon: 'fa-check', label: 'Đúng' }
      : answered
        ? { cls: 'is-wrong', icon: 'fa-xmark', label: 'Sai' }
        : { cls: 'is-empty', icon: 'fa-minus', label: 'Chưa làm' };
    const flagged = Boolean(quiz.flagged[row.idx]);
    const chapterLabel = row.chapter ? `Chương ${row.chapter}` : 'Chưa rõ chương';

    const optionsHtml = row.options.map((option, optionIndex) => {
      const isCorrect = optionIndex === row.correct;
      const isWrongPick = answered && optionIndex === row.userAns && !isCorrect;
      const cls = isCorrect ? 'er-opt is-correct' : isWrongPick ? 'er-opt is-wrong' : 'er-opt';
      const icon = isCorrect
        ? '<i class="fa-solid fa-circle-check er-opt-icon"></i>'
        : isWrongPick
          ? '<i class="fa-solid fa-circle-xmark er-opt-icon"></i>'
          : '';
      return `<div class="${cls}"><span class="er-opt-label">${labels[optionIndex] || optionIndex + 1}</span><span>${escapeHtml(option)}</span>${icon}</div>`;
    }).join('');

    const answerNote = answered
      ? `Bạn đã chọn ${labels[row.userAns] || row.userAns + 1}. ${escapeHtml(row.options[row.userAns] || '')}`
      : 'Bạn chưa trả lời câu này.';

    const card = document.createElement('details');
    card.className = 'er-q';
    card.dataset.idx = String(row.idx);
    if (_sqResultOpen.has(row.idx)) card.open = true;

    card.innerHTML = `
      <summary>
        <span class="er-q-no">Câu ${row.idx + 1}</span>
        <span class="er-q-status ${status.cls}"><i class="fa-solid ${status.icon}"></i> ${status.label}</span>
        <span class="er-q-meta">${chapterLabel} · ${DIFF_LABELS[row.difficulty]}</span>
        ${flagged ? '<i class="fa-solid fa-bookmark er-q-flag" title="Đã đánh dấu"></i>' : ''}
        <i class="fa-solid fa-chevron-down er-q-chevron"></i>
      </summary>
      <div class="er-q-body">
        <div>
          <p class="er-q-text">${escapeHtml(row.q)}</p>
          <div class="er-q-opts">${optionsHtml}</div>
        </div>
        <aside class="er-q-exp">
          <div class="er-q-exp-head"><i class="fa-solid fa-lightbulb"></i> Giải thích đáp án</div>
          <p>${escapeHtml(row.exp || 'Chưa có lời giải cho câu hỏi này.')}</p>
          <p class="er-q-answer-note">${answerNote}</p>
        </aside>
      </div>`;

    card.addEventListener('toggle', () => {
      if (card.open) _sqResultOpen.add(row.idx);
      else _sqResultOpen.delete(row.idx);
      updateSqToggleAllLabel();
    });

    list.appendChild(card);
  });

  if (!rows.length) list.classList.add('hidden');
  el('sq-result-filter-empty')?.classList.toggle('hidden', rows.length > 0);
  renderSqResultFilterCounts();
  updateSqToggleAllLabel();

  const sortSelect = el('sq-result-sort');
  if (sortSelect) sortSelect.value = _sqResultSort;

  if (_sqResultJumpIdx !== null) {
    const target = list.querySelector(`.er-q[data-idx="${_sqResultJumpIdx}"]`);
    _sqResultJumpIdx = null;
    if (target) {
      target.classList.add('is-jump');
      window.setTimeout(() => target.classList.remove('is-jump'), 1600);
    }
  }
}

function renderQuizResult(result) {
  const card = el('sq-result');
  const pct = Number(result.pct) || 0;

  resetSqResultView();
  _sqResultRows = (result.questionResults || []).map(entry => {
    const question = quiz.questions[entry.idx] || {};
    return {
      idx: entry.idx,
      userAns: Number.isInteger(entry.userAns) ? entry.userAns : null,
      isCorrect: Boolean(entry.isCorrect),
      correct: entry.correct,
      exp: entry.exp || '',
      q: question.q || '',
      options: Array.isArray(question.options) ? question.options : [],
      chapter: Number(question.chapter) || 0,
      difficulty: Math.min(3, Math.max(1, Number(question.difficulty) || 1)),
    };
  });

  if (card) card.dataset.state = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';

  const counts = sqResultCounts();
  const pctOf = value => _sqResultRows.length ? Math.round(value / _sqResultRows.length * 100) : 0;

  const ring = el('sq-result-ring');
  if (ring) {
    ring.style.setProperty('--er-ring-pct', `${pct}%`);
    ring.setAttribute('aria-label', `${pct}% câu đúng, ${counts.correct} trên ${_sqResultRows.length} câu`);
  }
  setText('sq-result-score-label', `Tổng điểm ${counts.correct}/${_sqResultRows.length}`);
  animateSqResultRing(pct);

  const verdict = el('sq-result-verdict');
  if (verdict) {
    verdict.textContent = `Điểm ${result.score10}/10 · ${result.isPassed ? 'Đạt' : 'Chưa đạt'}`;
    verdict.classList.toggle('is-fail', !result.isPassed);
  }

  setText('sq-res-correct', counts.correct);
  setText('sq-res-correct-pct', `(${pctOf(counts.correct)}%)`);
  setText('sq-res-wrong', counts.wrong);
  setText('sq-res-wrong-pct', `(${pctOf(counts.wrong)}%)`);
  setText('sq-res-empty', counts.empty);
  setText('sq-res-empty-pct', `(${pctOf(counts.empty)}%)`);

  setText('sq-result-meta', `${quiz.participantName} · làm trong ${formatDuration(result.timeSpent)}`);
  const sent = el('sq-result-sent');
  if (sent) {
    sent.innerHTML = `<i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Điểm đã được gửi tới ${escapeHtml(quiz.share?.ownerName || 'chủ đề')}. Bạn có thể xem lại đáp án bên dưới.</span>`;
  }
  setText('sq-result-details-count', `${_sqResultRows.length} câu · ${counts.correct} đúng · ${counts.wrong} sai · ${counts.empty} chưa làm`);

  const chapterWrap = el('sq-res-chapter-bars');
  if (chapterWrap) {
    chapterWrap.textContent = '';
    const barColors = { 1: '#6366f1', 2: '#8b5cf6', 3: '#06b6d4', 4: '#10b981', 5: '#f59e0b' };
    const stats = new Map();
    _sqResultRows.forEach(row => {
      const key = row.chapter || 0;
      const stat = stats.get(key) || { c: 0, t: 0 };
      stat.t += 1;
      if (row.isCorrect) stat.c += 1;
      stats.set(key, stat);
    });
    [...stats.entries()].sort((a, b) => a[0] - b[0]).forEach(([chapter, stat]) => {
      const chapterPct = stat.t ? Math.round(stat.c / stat.t * 100) : 0;
      const label = chapter ? `Chương ${chapter}` : 'Chưa rõ chương';
      const dot = chapter >= 1 && chapter <= 5
        ? `<span class="ch-dot ch-${chapter}" style="display:inline-block;margin-right:6px;"></span>`
        : '';
      const row = document.createElement('div');
      row.className = 'chapter-bar-row';
      row.innerHTML = `
        <div class="chapter-bar-label">
          <span>${dot}${escapeHtml(label)}</span>
          <span class="font-bold" style="color:${chapterPct >= 50 ? 'var(--success)' : 'var(--danger)'}">${stat.c}/${stat.t} (${chapterPct}%)</span>
        </div>
        <div class="chapter-bar-track">
          <div class="chapter-bar-fill" style="width:${chapterPct}%;background:${barColors[chapter] || '#6366f1'}"></div>
        </div>`;
      chapterWrap.appendChild(row);
    });
  }

  const diffWrap = el('sq-res-diff-stats');
  if (diffWrap) {
    diffWrap.innerHTML = [1, 2, 3].map(level => {
      const levelRows = _sqResultRows.filter(row => row.difficulty === level);
      const correct = levelRows.filter(row => row.isCorrect).length;
      const levelPct = levelRows.length ? Math.round(correct / levelRows.length * 100) : 0;
      const color = ['var(--diff-easy)', 'var(--diff-medium)', 'var(--diff-hard)'][level - 1];
      return `<div class="er-diff-row">
        <span class="er-diff-name">${DIFF_LABELS[level]}</span>
        <span class="er-diff-track"><span style="width:${levelPct}%;background:${color}"></span></span>
        <span class="er-diff-value">${correct}/${levelRows.length} · ${levelPct}%</span>
      </div>`;
    }).join('');
  }

  renderSqReviewList(true);
  renderSqResultPalette();

  el('sq-result').scrollIntoView?.({ block: 'start' });
}

function bootQuizPage() {
  if (quiz.booted) return;
  quiz.booted = true;

  // Đóng tab / tải lại giữa giờ thi sẽ mất toàn bộ câu đã chọn: chặn để hỏi lại.
  window.addEventListener('beforeunload', (event) => {
    if (!quiz.timer) return;
    event.preventDefault();
    event.returnValue = '';
  });

  el('sq-start')?.addEventListener('click', () => void startExam());
  el('sq-guest-name')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') startExam();
  });

  el('sq-options')?.addEventListener('click', (event) => {
    const option = event.target.closest('.option-btn');
    if (!option) return;
    const choice = Number(option.dataset.option);
    quiz.answers[quiz.index] = choice;
    document.querySelectorAll('#sq-options .option-btn').forEach(node => {
      node.classList.toggle('selected', Number(node.dataset.option) === choice);
    });
    renderQuizPalette();
  });
  el('sq-flag')?.addEventListener('click', () => {
    quiz.flagged[quiz.index] = !quiz.flagged[quiz.index];
    renderExamQuestion();
  });
  el('sq-pause')?.addEventListener('click', () => {
    if (!quiz.timer) return;
    setQuizPauseUi(quiz.timer.togglePause());
  });
  el('sq-palette-more')?.addEventListener('click', toggleQuizPalette);
  el('sq-prev')?.addEventListener('click', () => {
    if (quiz.index > 0) { quiz.index -= 1; renderExamQuestion(); }
  });
  el('sq-next')?.addEventListener('click', () => {
    if (quiz.index < quiz.questions.length - 1) { quiz.index += 1; renderExamQuestion(); }
  });
  el('sq-palette')?.addEventListener('click', (event) => {
    const cell = event.target.closest('[data-goto]');
    if (!cell) return;
    quiz.index = Number(cell.dataset.goto);
    renderExamQuestion();
  });
  el('sq-submit')?.addEventListener('click', () => {
    const missing = quiz.questions.length - Object.keys(quiz.answers).length;
    el('sq-confirm-missing').textContent = missing
      ? `Bạn còn ${missing} câu chưa chọn đáp án.`
      : 'Tất cả câu đã có đáp án.';
    el('sq-confirm')?.classList.add('open');
  });
  el('sq-confirm-cancel')?.addEventListener('click', () => el('sq-confirm')?.classList.remove('open'));
  el('sq-confirm-submit')?.addEventListener('click', () => {
    el('sq-confirm')?.classList.remove('open');
    void submitQuiz();
  });
  el('sq-result-retake')?.addEventListener('click', () => {
    const button = el('sq-submit');
    if (button) button.innerHTML = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Nộp bài';
    void renderLanding();
  });
  el('sq-result-home')?.addEventListener('click', () => {
    window.QuizSharePage?.leave();
    window.NavController?.navigateToPage('ontap', 'exam-tab');
  });
  el('sq-result-filters')?.addEventListener('click', (event) => {
    const filter = event.target.closest('.er-filter');
    if (filter?.dataset.filter) setSqResultFilter(filter.dataset.filter);
  });
  el('sq-result-sort')?.addEventListener('change', (event) => setSqResultSort(event.target.value));
  el('sq-result-toggle-all')?.addEventListener('click', toggleSqAllDetails);
  el('sq-result-palette-more')?.addEventListener('click', toggleSqResultPalette);
}

export const QuizSharePage = {
  async open(shareId) {
    const id = String(shareId || '');
    bootQuizPage();
    resetQuiz();
    quiz.shareId = id;
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (!SHARE_PATTERN.test(id)) {
      renderQuizError({ status: 400 });
      return;
    }

    showSection('sq-loading');
    try {
      const payload = await apiRequest(`?id=${encodeURIComponent(id)}`);
      quiz.share = payload.share;
      quiz.questions = payload.share.questions || [];
      if (!quiz.questions.length) {
        renderQuizError({ status: 404 });
        return;
      }
      await renderLanding();
    } catch (error) {
      renderQuizError(error);
    }
  },

  leave() {
    stopTimer();
    el('sq-confirm')?.classList.remove('open');
  },

  isActive() {
    return Boolean(quiz.timer);
  },
};
