/**
 * app.js — Main Application Controller
 * Điều phối toàn bộ logic của ứng dụng
 */

import { DB } from './modules/db.js';
import { Generator } from './modules/generator.js';
import { ExamEngine, ExamTimer } from './modules/exam.js';
import { SEED_QUESTIONS } from './data/seed_questions.js';
import { ceraChat, verifyAndFixQuestion, setCurrentQuestion } from './modules/cera.js';

/* ════════════════════════════════════════════════════
   APP STATE
════════════════════════════════════════════════════ */
const State = {
  currentTab: 'exam-tab',
  exam: {
    questions: [],
    userAnswers: {},
    flagged: {},
    currentIndex: 0,
    timer: null,
    result: null,
    meta: null,
  },
  practice: {
    selectedCount: 10,
    selectedChapter: 0,
  },
  bank: {
    page: 1,
    pageSize: 15,
    filterChapter: 0,
    filterDiff: 0,
    searchText: '',
  },
  source: {
    generating: false,
  },
};

const CHAPTERS = {
  1: 'Chương 1: Tổng Quan CL & ATTP',
  2: 'Chương 2: Hệ Thống QLCL',
  3: 'Chương 3: Điều Kiện Tiên Quyết',
  4: 'Chương 4: HACCP & ISO 22000',
  5: 'Chương 5: Luật ATTP Việt Nam',
};

/* ════════════════════════════════════════════════════
   INITIALIZATION
════════════════════════════════════════════════════ */
async function init() {
  // Luôn tự động hòa trộn các câu hỏi mới nhất từ hệ thống vào máy người dùng (chống lệch số lượng)
  DB.addQuestions(SEED_QUESTIONS);
  DB.markSeedLoaded();

  // Apply saved theme
  const settings = DB.getSettings();
  if (settings.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  updateBankCount();
  switchTab('exam-tab');

  // Kích hoạt tính năng Kéo-Thả cho Chatbot Liên
  initDraggableCera();
}

/* ════════════════════════════════════════════════════
   TAB NAVIGATION
════════════════════════════════════════════════════ */
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  const el = document.getElementById(tabId);
  if (el) el.classList.add('active');

  const navMap = {
    'exam-tab': 'nav-exam',
    'practice-tab': 'nav-practice',
    'bank-tab': 'nav-bank',
    'source-tab': 'nav-source',
    'history-tab': 'nav-history',
  };
  const navEl = document.getElementById(navMap[tabId]);
  if (navEl) navEl.classList.add('active');

  State.currentTab = tabId;

  if (tabId === 'bank-tab') renderBankTab();
  if (tabId === 'source-tab') renderSourceTab();
  if (tabId === 'history-tab') renderHistoryTab();
}

/* ════════════════════════════════════════════════════
   EXAM MODE
════════════════════════════════════════════════════ */
function initiateExam() {
  const count = parseInt(document.getElementById('exam-question-count').value) || 50;
  const chFilter = parseInt(document.getElementById('exam-chapter-filter')?.value || 0);
  const settings = DB.getSettings();

  const result = ExamEngine.buildBalancedPaper(count, settings.diffRatio, chFilter);

  if (!result || result.questions.length === 0) {
    showToast('Ngân hàng câu hỏi chưa đủ! Vui lòng thêm câu hỏi trước.', 'error');
    return;
  }

  const duration = result.questions.length * 60; // 1 phút/câu
  State.exam.questions = result.questions;
  State.exam.userAnswers = {};
  State.exam.flagged = {};
  State.exam.currentIndex = 0;
  State.exam.meta = result.meta;

  // Update duration display
  document.getElementById('exam-duration-text').textContent = result.questions.length + ' phút';

  // Update difficulty ratio display
  const m = result.meta;
  updateDifficultyBar('exam-diff-bar', m.ratioActual);

  hide('exam-start-card');
  hide('exam-result-card');
  show('exam-active-card');

  renderExamQuestion();
  renderPalette();

  if (State.exam.timer) State.exam.timer.stop();
  State.exam.timer = new ExamTimer(duration,
    (left) => {
      document.getElementById('exam-timer-display').textContent = State.exam.timer.format(left);
      const timerEl = document.getElementById('exam-timer-display');
      if (State.exam.timer.isUrgent) {
        timerEl.classList.add('urgent');
      } else {
        timerEl.classList.remove('urgent');
      }
    },
    () => {
      showToast('Hết thời gian! Hệ thống tự động nộp bài.', 'warning');
      finishExam();
    }
  );
  State.exam.timer.start();
}

function renderExamQuestion() {
  const { questions, userAnswers, flagged, currentIndex } = State.exam;
  const q = questions[currentIndex];

  setCurrentQuestion(q);
  updateCeraContextUI(q);

  document.getElementById('q-chapter-badge').textContent = CHAPTERS[q.chapter] || ('Chương ' + q.chapter);
  document.getElementById('q-diff-badge').textContent = getDiffLabel(q.difficulty);
  document.getElementById('q-diff-badge').className = 'badge badge-' + getDiffClass(q.difficulty);
  document.getElementById('q-title').textContent = `Câu ${currentIndex + 1}: ${q.q}`;
  document.getElementById('q-progress-text').textContent = `Câu ${currentIndex + 1} / ${questions.length}`;

  const flagBtn = document.getElementById('btn-flag');
  if (flagged[currentIndex]) {
    flagBtn.className = 'btn btn-sm';
    flagBtn.style.background = 'var(--accent-light)';
    flagBtn.style.color = '#b45309';
    flagBtn.style.border = '1.5px solid #fde68a';
    flagBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Đã đánh dấu';
  } else {
    flagBtn.className = 'btn btn-secondary btn-sm';
    flagBtn.style = '';
    flagBtn.innerHTML = '<i class="fa-regular fa-bookmark"></i> Đánh dấu';
  }

  const container = document.getElementById('q-options-container');
  container.innerHTML = '';
  const labels = ['A', 'B', 'C', 'D'];

  q.options.forEach((optText, optIdx) => {
    const isSelected = userAnswers[currentIndex] === optIdx;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn' + (isSelected ? ' selected' : '');
    btn.onclick = () => selectExamOption(optIdx);
    btn.innerHTML = `<span class="option-label">${labels[optIdx]}</span><span>${optText}</span>`;
    container.appendChild(btn);
  });

  document.getElementById('btn-prev-q').disabled = currentIndex === 0;
  document.getElementById('btn-next-q').disabled = currentIndex === questions.length - 1;

  renderPalette();
}

function selectExamOption(optIdx) {
  State.exam.userAnswers[State.exam.currentIndex] = optIdx;
  renderExamQuestion();
}

function toggleFlagCurrentQuestion() {
  const idx = State.exam.currentIndex;
  State.exam.flagged[idx] = !State.exam.flagged[idx];
  renderExamQuestion();
}

function navExamQuestion(dir) {
  const newIdx = State.exam.currentIndex + dir;
  if (newIdx >= 0 && newIdx < State.exam.questions.length) {
    State.exam.currentIndex = newIdx;
    renderExamQuestion();
  }
}

function renderPalette() {
  const { questions, userAnswers, flagged, currentIndex } = State.exam;
  const grid = document.getElementById('palette-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const answered = Object.keys(userAnswers).length;
  document.getElementById('palette-summary').textContent = `Đã làm: ${answered}/${questions.length}`;

  // Cập nhật thanh tiến trình (progress bar)
  const pb = document.getElementById('exam-progress-bar');
  if (pb) {
    const progressPct = questions.length ? (answered / questions.length) * 100 : 0;
    pb.style.width = progressPct + '%';
  }

  questions.forEach((_, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = idx + 1;
    btn.onclick = () => { State.exam.currentIndex = idx; renderExamQuestion(); };

    let cls = 'palette-btn';
    if (flagged[idx]) cls += ' flagged';
    else if (userAnswers.hasOwnProperty(idx)) cls += ' answered';
    if (currentIndex === idx) cls += ' current';
    btn.className = cls;
    grid.appendChild(btn);
  });
}

function confirmSubmitExam() {
  const total = State.exam.questions.length;
  const answered = Object.keys(State.exam.userAnswers).length;
  const remaining = total - answered;
  const text = remaining > 0
    ? `Bạn còn ${remaining} câu chưa trả lời. Xác nhận nộp bài?`
    : `Bạn đã hoàn thành tất cả ${total} câu. Xác nhận nộp bài?`;

  document.getElementById('modal-submit-text').textContent = text;
  openModal('modal-confirm-submit');
}

function finishExam() {
  State.exam.timer?.stop();
  closeModal('modal-confirm-submit');

  const { questions, userAnswers, timer } = State.exam;
  const result = ExamEngine.gradeExam(
    questions, userAnswers,
    timer?.total || 0, timer?.left || 0
  );

  State.exam.result = result;

  // Lưu kết quả vào lịch sử
  DB.saveResult({
    score: result.score10,
    correct: result.correctCount,
    total: result.total,
    pct: result.pct,
    timeSpent: result.timeSpent,
    isPassed: result.isPassed,
    chapterStats: result.chapterStats,
    diffStats: result.diffStats,
    meta: State.exam.meta,
  });

  hide('exam-active-card');
  show('exam-result-card');
  renderExamResult(result);
}

function renderExamResult(result) {
  const score10 = result.score10;
  const pct = result.pct;

  // Vòng điểm conic gradient
  const ring = document.getElementById('result-score-ring');
  ring.style.setProperty('--score-pct', `${pct}%`);
  ring.style.background = `conic-gradient(${result.isPassed ? 'var(--success)' : 'var(--danger)'} ${pct}%, var(--bg-subtle) 0%)`;

  document.getElementById('result-score-val').textContent = score10 + '/10';
  document.getElementById('result-score-label').textContent = result.isPassed ? '✓ Đạt' : '✗ Chưa đạt';
  document.getElementById('result-score-label').style.color = result.isPassed ? 'var(--success)' : 'var(--danger)';

  document.getElementById('res-correct').textContent = `${result.correctCount}/${result.total}`;
  document.getElementById('res-pct').textContent = `${pct}%`;

  const m = Math.floor(result.timeSpent / 60);
  const s = result.timeSpent % 60;
  document.getElementById('res-time').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

  const badge = document.getElementById('result-status-badge');
  badge.textContent = result.isPassed ? 'ĐẠT YÊU CẦU' : 'CHƯA ĐẠT';
  badge.className = 'badge ' + (result.isPassed ? 'badge-success' : 'badge-danger');

  // Chapter bars
  const barsEl = document.getElementById('res-chapter-bars');
  barsEl.innerHTML = '';
  const chColors = ['', '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];
  Object.entries(result.chapterStats).forEach(([ch, st]) => {
    if (!st.t) return;
    const chPct = Math.round(st.c / st.t * 100);
    const row = document.createElement('div');
    row.className = 'chapter-bar-row';
    row.innerHTML = `
      <div class="chapter-bar-label">
        <span><span class="ch-dot ch-${ch}" style="display:inline-block;margin-right:6px;"></span>${CHAPTERS[ch] || 'Chương ' + ch}</span>
        <span class="font-bold" style="color:${chPct >= 50 ? 'var(--success)' : 'var(--danger)'}">${st.c}/${st.t} (${chPct}%)</span>
      </div>
      <div class="chapter-bar-track">
        <div class="chapter-bar-fill" style="width:${chPct}%;background:${chColors[ch] || '#6366f1'}"></div>
      </div>`;
    barsEl.appendChild(row);
  });

  // Diff stats
  const diffEl = document.getElementById('res-diff-stats');
  if (diffEl) {
    const { diffStats } = result;
    diffEl.innerHTML = [1, 2, 3].map(d => {
      const st = diffStats[d] || { c: 0, t: 0 };
      const p = st.t ? Math.round(st.c / st.t * 100) : 0;
      return `<div class="stat-card">
        <div class="stat-value" style="color:var(--diff-${getDiffClass(d)})">${p}%</div>
        <div class="stat-label">${getDiffLabel(d)} (${st.c}/${st.t})</div>
      </div>`;
    }).join('');
  }

  // Hiển thị Phân tích điểm yếu (Mistake Analysis)
  const feedbackSection = document.getElementById('exam-feedback-section');
  const feedbackContent = document.getElementById('exam-feedback-content');
  if (feedbackSection && feedbackContent) {
    const wrongQuestions = result.questionResults.filter(qr => !qr.isCorrect);
    
    if (wrongQuestions.length === 0) {
      feedbackSection.style.display = 'block';
      feedbackContent.innerHTML = `<div style="color:var(--success);font-weight:600;"><i class="fa-solid fa-medal"></i> Tuyệt vời! Bạn không sai câu nào. Kiến thức của bạn rất vững.</div>`;
    } else {
      feedbackSection.style.display = 'block';
      const hints = _generateMistakeHints(wrongQuestions);
      
      let html = `<p style="margin-bottom:12px;">Bạn đã làm sai ${wrongQuestions.length} câu. Dưới đây là các phần kiến thức bạn cần ưu tiên ôn tập lại:</p><ul style="padding-left:20px;list-style-type:disc;">`;
      hints.forEach(hint => {
        html += `<li style="margin-bottom:6px;">${hint}</li>`;
      });
      html += `</ul>`;
      
      feedbackContent.innerHTML = html;
    }
  }

  // Ẩn review
  document.getElementById('exam-review-container').classList.add('hidden');
}

function toggleReviewDetails() {
  const container = document.getElementById('exam-review-container');
  const isHidden = container.classList.contains('hidden');
  container.classList.toggle('hidden');

  if (isHidden) {
    renderExamReviewList();
  }
}

function renderExamReviewList() {
  const list = document.getElementById('review-questions-list');
  list.innerHTML = '';
  const labels = ['A', 'B', 'C', 'D'];

  State.exam.result.questionResults.forEach((qr, idx) => {
    const card = document.createElement('div');
    const borderColor = qr.isCorrect ? 'var(--success)' : 'var(--danger)';
    card.style.cssText = `padding:16px;border-radius:var(--radius-lg);border:1.5px solid ${borderColor};background:${qr.isCorrect ? 'var(--success-light)' : 'var(--danger-light)'};margin-bottom:12px;`;

    const optsHtml = qr.options.map((opt, oi) => {
      let style = 'padding:8px 12px;border-radius:var(--radius-sm);font-size:12px;margin-top:4px;display:flex;gap:8px;';
      if (oi === qr.correct) style += 'background:var(--success-light);border:1px solid #a7f3d0;color:#065f46;font-weight:600;';
      else if (oi === qr.userAns && !qr.isCorrect) style += 'background:var(--danger-light);border:1px solid #fca5a5;color:#991b1b;font-weight:600;';
      else style += 'background:var(--bg-subtle);border:1px solid var(--border);color:var(--text-muted);';
      return `<div style="${style}"><b>${labels[oi]}.</b> ${opt}</div>`;
    }).join('');

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:700;color:${qr.isCorrect ? 'var(--success)' : 'var(--danger)'};font-size:13px;">
          ${qr.isCorrect ? '✓ Câu ' : '✗ Câu '}${idx + 1}
        </span>
        <span class="badge badge-${getDiffClass(qr.difficulty)}">${getDiffLabel(qr.difficulty)}</span>
      </div>
      <p style="font-weight:600;font-size:14px;margin-bottom:10px;">${qr.q}</p>
      ${optsHtml}
      <div style="margin-top:10px;padding:10px 12px;background:var(--bg-card);border-radius:var(--radius-sm);border-left:3px solid var(--primary);font-size:12px;color:var(--text-secondary);">
        <strong style="color:var(--primary);">Giải thích:</strong> ${qr.exp}
      </div>`;
    list.appendChild(card);
  });
}

/* ════════════════════════════════════════════════════
   PRACTICE MODE
════════════════════════════════════════════════════ */
function startPracticeMode() {
  const chVal = parseInt(document.getElementById('practice-chapter-select').value);
  const count = State.practice.selectedCount === 'all'
    ? DB.getBank().length
    : parseInt(State.practice.selectedCount);

  const questions = ExamEngine.buildPracticePaper(count, chVal);

  if (!questions.length) {
    showToast('Không có câu hỏi phù hợp!', 'error');
    return;
  }

  const wrapper = document.getElementById('practice-questions-wrapper');
  wrapper.innerHTML = '';
  show('practice-session-container');

  const labels = ['A', 'B', 'C', 'D'];
  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '16px';

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span class="badge badge-primary">${CHAPTERS[q.chapter] || 'Chương ' + q.chapter}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span class="badge badge-${getDiffClass(q.difficulty)}">${getDiffLabel(q.difficulty)}</span>
          <span class="text-xs text-muted">Câu ${idx + 1}/${questions.length}</span>
        </div>
      </div>
      <h3 style="font-weight:600;font-size:14px;margin-bottom:14px;line-height:1.6;">${q.q}</h3>
      <div id="prac-opts-${idx}" class="space-y-3">
        ${q.options.map((opt, oi) => `
          <button type="button" class="option-btn" onclick="checkPracticeAnswer(${idx}, ${oi}, ${q.correct})">
            <span class="option-label">${labels[oi]}</span>
            <span>${opt}</span>
          </button>`).join('')}
      </div>
      <div id="prac-exp-${idx}" class="hidden" style="margin-top:12px;padding:12px;background:var(--primary-light);border-radius:var(--radius-md);border-left:3px solid var(--primary);font-size:12px;color:var(--text-primary);">
        <strong style="color:var(--primary);">Giải thích:</strong> ${q.exp}
      </div>`;

    wrapper.appendChild(card);
  });

  // Scroll to practice session
  document.getElementById('practice-session-container').scrollIntoView({ behavior: 'smooth' });
}

function checkPracticeAnswer(qIdx, selectedOpt, correctOpt) {
  const container = document.getElementById(`prac-opts-${qIdx}`);
  if (!container) return;
  const buttons = container.querySelectorAll('.option-btn');

  buttons.forEach((btn, idx) => {
    btn.classList.add('disabled');
    if (idx === correctOpt) btn.classList.add('correct');
    else if (idx === selectedOpt && selectedOpt !== correctOpt) btn.classList.add('wrong');
    else btn.style.opacity = '0.5';
  });

  document.getElementById(`prac-exp-${qIdx}`).classList.remove('hidden');
}

function selectPracticeCount(val) {
  State.practice.selectedCount = val;
  document.querySelectorAll('.count-btn').forEach(btn => btn.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
}

/* ════════════════════════════════════════════════════
   QUESTION BANK TAB
════════════════════════════════════════════════════ */
function renderBankTab() {
  State.bank.page = 1;
  renderBankList();
}

function renderBankList() {
  const { page, pageSize, filterChapter, filterDiff, searchText } = State.bank;
  const labels = ['A', 'B', 'C', 'D'];

  let bank = DB.getBank();

  // Filters
  if (filterChapter > 0) bank = bank.filter(q => q.chapter === filterChapter);
  if (filterDiff > 0) bank = bank.filter(q => (q.difficulty || 1) === filterDiff);
  if (searchText) {
    const kw = searchText.toLowerCase();
    bank = bank.filter(q => q.q.toLowerCase().includes(kw) || (q.exp || '').toLowerCase().includes(kw));
  }

  const total = bank.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  if (State.bank.page < 1) State.bank.page = 1;
  if (State.bank.page > totalPages) State.bank.page = totalPages;

  const start = (State.bank.page - 1) * pageSize;
  const items = bank.slice(start, start + pageSize);

  document.getElementById('bank-count-text').textContent =
    `Hiển thị ${items.length}/${total} câu (Tổng: ${DB.getBank().length})`;
  document.getElementById('bank-page-info').textContent = `Trang ${State.bank.page}/${totalPages}`;
  document.getElementById('bank-prev-btn').disabled = State.bank.page <= 1;
  document.getElementById('bank-next-btn').disabled = State.bank.page >= totalPages;

  const container = document.getElementById('bank-list-container');
  if (!items.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">🔍</div>
      <div class="empty-state-title">Không tìm thấy câu hỏi</div>
      <div class="empty-state-desc">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</div>
    </div>`;
    return;
  }

  container.innerHTML = '';
  items.forEach(q => {
    const card = document.createElement('div');
    card.className = 'bank-question-card';

    const highlight = (text) => {
      if (!searchText) return text;
      return text.replace(new RegExp(`(${searchText})`, 'gi'), '<mark class="highlight">$1</mark>');
    };

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="ch-dot ch-${q.chapter}"></span>
          <span class="badge badge-primary" style="font-size:11px;">#${q.id} · Ch.${q.chapter}</span>
          <span class="badge badge-${getDiffClass(q.difficulty)}">${getDiffLabel(q.difficulty)}</span>
        </div>
        <span class="text-xs text-muted">${CHAPTERS[q.chapter] || ''}</span>
      </div>
      <p class="bank-question-text">${highlight(q.q)}</p>
      <div class="bank-answer-grid">
        ${q.options.map((opt, oi) => `
          <div class="bank-answer-item ${oi === q.correct ? 'correct' : ''}">
            <span style="font-weight:700;flex-shrink:0;">${labels[oi]}.</span>
            <span>${opt}</span>
          </div>`).join('')}
      </div>
      <div class="bank-explanation">
        <strong style="color:var(--primary);">Giải thích:</strong> ${highlight(q.exp || '')}
      </div>`;

    container.appendChild(card);
  });
}

function changeBankPage(dir) {
  State.bank.page += dir;
  renderBankList();
}

function onBankFilter() {
  State.bank.filterChapter = parseInt(document.getElementById('bank-filter-chapter').value);
  State.bank.filterDiff = parseInt(document.getElementById('bank-filter-diff').value);
  State.bank.searchText = document.getElementById('bank-search-input').value.trim().toLowerCase();
  State.bank.page = 1;
  renderBankList();
}

/* ════════════════════════════════════════════════════
   SOURCE & AI GENERATION TAB
════════════════════════════════════════════════════ */
function renderSourceTab() {
  const sources = DB.getSources();
  const list = document.getElementById('source-list');
  const stats = DB.getBankStats();

  document.getElementById('source-bank-count').textContent = stats.total;
  document.getElementById('source-ai-count').textContent =
    DB.getBank().filter(q => q.source === 'ai_generated' || q.source === 'local_generated').length;

  if (!sources.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📄</div>
      <div class="empty-state-title">Chưa có nguồn tài liệu</div>
      <div class="empty-state-desc">Thêm tài liệu để hệ thống tự sinh câu hỏi</div>
    </div>`;
    return;
  }

  list.innerHTML = sources.map(s => `
    <div class="source-item">
      <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--primary-light);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">📄</div>
      <div style="flex:1;min-width:0;">
        <p style="font-weight:600;font-size:13px;">${s.title || 'Nguồn không tên'}</p>
        <p class="text-xs text-muted">${s.questionsGenerated || 0} câu đã sinh · ${_formatDate(s.addedAt)}</p>
        <p class="text-xs text-secondary" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">
          ${(s.content || '').slice(0, 80)}...
        </p>
      </div>
      <button onclick="deleteSource(${s.id})" class="btn btn-ghost btn-sm" style="color:var(--danger);flex-shrink:0;">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>`).join('');
}

async function handleGenerateQuestions() {
  if (State.source.generating) return;

  const titleEl = document.getElementById('source-title');
  const contentEl = document.getElementById('source-content');
  const countEl = document.getElementById('generate-count');

  const title = titleEl.value.trim() || 'Tài liệu ' + new Date().toLocaleDateString('vi');
  const content = contentEl.value.trim();
  const count = parseInt(countEl.value) || 10;

  if (!content || content.length < 50) {
    showToast('Vui lòng nhập nội dung tài liệu (ít nhất 50 ký tự)', 'error');
    return;
  }

  State.source.generating = true;
  const progressEl = document.getElementById('generation-progress');
  const progressBar = document.getElementById('generation-bar');
  const progressText = document.getElementById('generation-text');
  const generateBtn = document.getElementById('btn-generate');

  show(progressEl);
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="spinner"></span> Đang sinh câu hỏi...';

  try {
    const questions = await Generator.fromText(content, count, (pct, msg) => {
      progressBar.style.width = pct + '%';
      progressText.textContent = msg;
    });

    if (!questions.length) {
      showToast('Không thể sinh câu hỏi. Thử lại với nội dung khác.', 'error');
      return;
    }

    // Thêm source flag
    const taggedQ = questions.map(q => ({
      ...q,
      source: 'ai_generated',
    }));

    const added = DB.addQuestions(taggedQ);

    // Lưu nguồn
    DB.addSource({ title, content, questionsGenerated: added });

    showToast(`✓ Đã sinh và lưu ${added} câu hỏi mới vào ngân hàng!`, 'success');
    updateBankCount();

    // Clear form
    titleEl.value = '';
    contentEl.value = '';

    // Refresh source list
    renderSourceTab();

  } catch (err) {
    console.error(err);
    showToast('Lỗi khi sinh câu hỏi: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    State.source.generating = false;
    hide(progressEl);
    generateBtn.disabled = false;
    generateBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Sinh Câu Hỏi AI';
  }
}

function deleteSource(id) {
  DB.deleteSource(id);
  renderSourceTab();
  showToast('Đã xóa nguồn tài liệu', 'info');
}

/* ════════════════════════════════════════════════════
   FILE UPLOAD & PARSING (PDF/Word)
════════════════════════════════════════════════════ */
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const progressEl = document.getElementById('file-extract-progress');
  const contentEl = document.getElementById('source-content');
  const titleEl = document.getElementById('source-title');
  
  if (progressEl) progressEl.classList.remove('hidden');
  
  try {
    let extractedText = '';
    
    // Đặt tên tài liệu theo tên file
    if (titleEl && !titleEl.value) {
      titleEl.value = file.name.replace(/\.[^/.]+$/, "");
    }

    if (file.name.toLowerCase().endsWith('.pdf')) {
      extractedText = await extractTextFromPDF(file);
    } else if (file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc')) {
      extractedText = await extractTextFromWord(file);
    } else {
      throw new Error('Chỉ hỗ trợ file định dạng PDF hoặc Word (.docx)');
    }

    if (contentEl) {
      contentEl.value = extractedText;
      showToast(`Trích xuất thành công ${extractedText.length} ký tự từ file!`, 'success');
    }
  } catch (error) {
    console.error(error);
    showToast('Lỗi khi đọc file: ' + error.message, 'error');
  } finally {
    if (progressEl) progressEl.classList.add('hidden');
    event.target.value = ''; // Reset input
  }
}

async function extractTextFromPDF(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('Thư viện PDF.js chưa được tải.');
  }
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  
  // Rút trích text từ từng trang (giới hạn 50 trang để tránh lag)
  const numPages = Math.min(pdf.numPages, 50);
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    text += strings.join(' ') + '\n\n';
  }
  
  return text.trim();
}

async function extractTextFromWord(file) {
  if (typeof mammoth === 'undefined') {
    throw new Error('Thư viện Mammoth chưa được tải.');
  }
  
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
  return result.value.trim();
}

/* ════════════════════════════════════════════════════
   HISTORY TAB
════════════════════════════════════════════════════ */
function renderHistoryTab() {
  const history = DB.getHistory();
  const container = document.getElementById('history-list');

  if (!history.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📊</div>
      <div class="empty-state-title">Chưa có lịch sử thi</div>
      <div class="empty-state-desc">Hoàn thành bài thi để xem lịch sử</div>
    </div>`;
    return;
  }

  container.innerHTML = history.map(r => {
    const m = Math.floor((r.timeSpent || 0) / 60);
    const s = (r.timeSpent || 0) % 60;
    const timeStr = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    const meta = r.meta || {};

    return `
    <div class="card card-sm" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
            <span class="badge ${r.isPassed ? 'badge-success' : 'badge-danger'}">${r.isPassed ? 'ĐẠT' : 'CHƯA ĐẠT'}</span>
            <span class="text-xs text-muted">${_formatDate(r.date)}</span>
          </div>
          <span style="font-size:22px;font-weight:800;color:${r.isPassed ? 'var(--success)' : 'var(--danger)'};">${r.score}/10</span>
          <span class="text-xs text-muted" style="margin-left:8px;">${r.correct}/${r.total} câu đúng · ${timeStr}</span>
        </div>
        ${meta.ratioActual ? `<div style="text-align:right;font-size:11px;color:var(--text-muted);">
          <div>Dễ ${meta.ratioActual.easy}% · TB ${meta.ratioActual.medium}% · Khó ${meta.ratioActual.hard}%</div>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ════════════════════════════════════════════════════
   SETTINGS
════════════════════════════════════════════════════ */
function openSettings() {
  const settings = DB.getSettings();
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');

  // Populate settings
  const apiInput = document.getElementById('settings-api-key');
  if (apiInput) apiInput.value = settings.apiKey || '';

  const themeToggle = document.getElementById('settings-theme');
  if (themeToggle) themeToggle.checked = settings.theme === 'dark';

  panel.classList.add('open');
  overlay.classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-panel').classList.remove('open');
  document.getElementById('settings-overlay').classList.remove('open');
}

function saveSettings() {
  const apiKey = document.getElementById('settings-api-key')?.value.trim() || '';
  const isDark = document.getElementById('settings-theme')?.checked || false;

  DB.saveSettings({ apiKey, theme: isDark ? 'dark' : 'light' });
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

  closeSettings();
  showToast('Đã lưu cài đặt!', 'success');
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  DB.saveSettings({ theme: newTheme });

  const btn = document.getElementById('btn-theme');
  if (btn) btn.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

function togglePauseExam() {
  if (!State.exam.timer) return;
  const isPaused = State.exam.timer.togglePause();
  const btn = document.getElementById('btn-pause');
  if (btn) {
    btn.innerHTML = isPaused
      ? '<i class="fa-solid fa-play"></i> Tiếp tục'
      : '<i class="fa-solid fa-pause"></i> Tạm dừng';
    btn.style.background = isPaused ? 'var(--accent)' : '';
    btn.style.color = isPaused ? 'white' : '';
  }
}

/* ════════════════════════════════════════════════════
   MODALS
════════════════════════════════════════════════════ */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

/* ════════════════════════════════════════════════════
   TOAST SYSTEM
════════════════════════════════════════════════════ */
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════ */
function updateBankCount() {
  const stats = DB.getBankStats();
  const el = document.getElementById('header-bank-count');
  if (el) el.textContent = stats.total;
}

function updateDifficultyBar(id, ratioActual) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `
    <div class="diff-bar-easy" style="flex:${ratioActual.easy};" title="Dễ: ${ratioActual.easy}%"></div>
    <div class="diff-bar-medium" style="flex:${ratioActual.medium};" title="Trung bình: ${ratioActual.medium}%"></div>
    <div class="diff-bar-hard" style="flex:${ratioActual.hard};" title="Khó: ${ratioActual.hard}%"></div>`;
}

function getDiffLabel(diff) {
  return { 1: 'Dễ', 2: 'Trung Bình', 3: 'Khó' }[diff] || 'Dễ';
}

function getDiffClass(diff) {
  return { 1: 'easy', 2: 'medium', 3: 'hard' }[diff] || 'easy';
}

function show(el) {
  const e = typeof el === 'string' ? document.getElementById(el) : el;
  if (e) e.classList.remove('hidden');
}

function hide(el) {
  const e = typeof el === 'string' ? document.getElementById(el) : el;
  if (e) e.classList.add('hidden');
}

function _formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return iso; }
}

/** 
 * Sinh gợi ý ôn tập dựa trên các câu hỏi làm sai (Rule-based)
 */
function _generateMistakeHints(wrongQuestions) {
  const chapterMistakes = {};
  const keywords = {
    'HACCP': 'Hệ thống HACCP (Các nguyên tắc, các bước triển khai)',
    'ISO': 'Hệ thống tiêu chuẩn ISO 9001 và ISO 22000',
    'GMP': 'Thực hành sản xuất tốt GMP (Thiết kế nhà xưởng, điều kiện sản xuất)',
    'SSOP': 'Quy trình vệ sinh tiêu chuẩn SSOP',
    'Luật': 'Luật An toàn Thực phẩm và Nghị định 15/2018/NĐ-CP',
    'Nghị định': 'Các Nghị định quản lý ATTP, ghi nhãn và xử phạt vi phạm',
    'Nấm mốc': 'Độc tố nấm mốc (Mycotoxin, Aflatoxin)',
    'Vi khuẩn': 'Mối nguy sinh học (Các loại vi khuẩn gây ngộ độc)',
    'Dị ứng': 'Mối nguy dị ứng thực phẩm (Allergen)',
    'Hóa học': 'Mối nguy hóa học (Phụ gia cấm, dư lượng hóa chất)',
    'Vật lý': 'Mối nguy vật lý và biện pháp kiểm soát (Máy dò kim loại)'
  };
  
  const hintsSet = new Set();
  
  wrongQuestions.forEach(q => {
    // Đếm lỗi theo chương
    chapterMistakes[q.chapter] = (chapterMistakes[q.chapter] || 0) + 1;
    
    // Tìm keyword trong câu hỏi và giải thích
    const textToSearch = (q.q + " " + (q.exp || '')).toLowerCase();
    
    for (const [kw, hint] of Object.entries(keywords)) {
      if (textToSearch.includes(kw.toLowerCase())) {
        hintsSet.add(hint);
      }
    }
  });
  
  const results = [];
  
  // Gợi ý theo chương (nếu sai > 2 câu trong 1 chương)
  for (const [ch, count] of Object.entries(chapterMistakes)) {
    if (count >= 2) {
      results.push(`<strong>Chương ${ch}:</strong> Bạn đã sai ${count} câu. Cần ôn tập lại toàn bộ kiến thức nền tảng của ${CHAPTERS[ch] || 'Chương ' + ch}.`);
    }
  }
  
  // Gợi ý theo chủ đề chuyên sâu
  if (hintsSet.size > 0) {
    let kwStr = Array.from(hintsSet).map(h => `<span style="color:var(--primary);font-weight:600;">${h}</span>`).join('; ');
    results.push(`<strong>Chủ đề chuyên sâu cần đọc lại:</strong> ${kwStr}.`);
  }
  
  // Fallback nếu không bắt được rule nào
  if (results.length === 0) {
    results.push('Hãy xem lại chi tiết giải thích của từng câu sai ở bên dưới để khắc phục.');
  }
  
  return results;
}

/* ════════════════════════════════════════════════════
   CERA CHATBOT UI CONTROLLER
════════════════════════════════════════════════════ */
let _ceraHistory = [];

function toggleCeraChat() {
  const panel = document.getElementById('cera-panel');
  const fab = document.getElementById('cera-fab');
  const badge = document.getElementById('cera-badge');
  if (!panel || !fab) return;

  // Nếu người dùng vừa thực hiện hành động Kéo-Thả (Drag) FAB thì không toggle mở panel
  if (fab.dataset.dragged === 'true') return;

  const isOpen = panel.classList.toggle('is-open');
  fab.classList.toggle('is-open', isOpen);
  panel.setAttribute('aria-hidden', !isOpen);
  if (badge) badge.style.display = 'none';

  if (isOpen) {
    document.getElementById('cera-input')?.focus();
    updateCeraContextUI();
  }
}

/* ════════════════════════════════════════════════════
   DRAGGABLE CERA CHATBOT (KÉO-THẢ BẤT KỲ ĐÂU MÀN HÌNH)
════════════════════════════════════════════════════ */
function initDraggableCera() {
  const fab = document.getElementById('cera-fab');
  const panel = document.getElementById('cera-panel');
  const header = document.querySelector('.cera-header');

  if (fab) {
    let dragMoved = false;

    // Drag logic cho FAB
    makeDraggable(fab, fab, (moved) => { dragMoved = moved; });

    // Click chỉ toggle nếu KHÔNG kéo
    fab.addEventListener('click', () => {
      if (!dragMoved) toggleCeraChat();
    });
  }

  // Drag cả panel qua header
  if (panel && header) makeDraggable(panel, header, () => {});
}

function makeDraggable(el, handle, onEndCallback) {
  let isDragging = false;
  let hasMoved = false;
  let startX, startY, initLeft, initTop;

  function onPointerDown(e) {
    // Chỉ bỏ qua nếu click vào các element tương tác BÊN TRONG (input, link, select)
    // Không block button nếu handle chính nó là button (FAB)
    if (el !== handle && e.target.closest('input, textarea, a, select')) return;
    if (el === handle && e.target !== el && e.target.closest('input, textarea, a, select')) return;
    isDragging = true;
    hasMoved = false;

    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    startX = cx; startY = cy;

    const rect = el.getBoundingClientRect();
    initLeft = rect.left;
    initTop = rect.top;

    // Chuyển sang vị trí tuyệt đối để kéo tự do
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = initLeft + 'px';
    el.style.top = initTop + 'px';
    el.style.transition = 'none';

    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('touchend', onPointerUp);
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();

    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = cx - startX;
    const dy = cy - startY;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;

    const newLeft = Math.max(8, Math.min(initLeft + dx, window.innerWidth - el.offsetWidth - 8));
    const newTop = Math.max(8, Math.min(initTop + dy, window.innerHeight - el.offsetHeight - 8));

    el.style.left = newLeft + 'px';
    el.style.top = newTop + 'px';
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    el.style.transition = '';

    document.removeEventListener('mousemove', onPointerMove);
    document.removeEventListener('mouseup', onPointerUp);
    document.removeEventListener('touchmove', onPointerMove);
    document.removeEventListener('touchend', onPointerUp);

    onEndCallback(hasMoved);
    setTimeout(() => { hasMoved = false; }, 50);
  }

  handle.addEventListener('mousedown', onPointerDown);
  handle.addEventListener('touchstart', onPointerDown, { passive: false });
}

function clearCeraChat() {
  _ceraHistory = [];
  const msgContainer = document.getElementById('cera-messages');
  if (msgContainer) {
    msgContainer.innerHTML = `
      <div class="cera-msg cera-msg-bot">
        <div class="cera-msg-avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="cera-msg-bubble">
          <p>Lịch sử trò chuyện đã được xóa. Tôi sẵn sàng hỗ trợ tiếp!</p>
        </div>
      </div>`;
  }
}

function updateCeraContextUI(q = null) {
  if (q) setCurrentQuestion(q);
  const contextEl = document.getElementById('cera-context');
  const contextTextEl = document.getElementById('cera-context-text');
  if (!contextEl || !contextTextEl) return;

  const currentQ = q || (State.exam.questions[State.exam.currentIndex]);
  if (currentQ && (State.currentTab === 'exam-tab' || State.currentTab === 'practice-tab')) {
    contextTextEl.textContent = `Đang xem: "${currentQ.q.slice(0, 36)}..."`;
    contextEl.style.display = 'flex';
  } else {
    contextEl.style.display = 'none';
  }
}

async function ceraSend() {
  const input = document.getElementById('cera-input');
  const sendBtn = document.getElementById('cera-send-btn');
  const messages = document.getElementById('cera-messages');
  const statusText = document.getElementById('cera-status-text');
  if (!input || !sendBtn || !messages) return;

  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  const userMsg = document.createElement('div');
  userMsg.className = 'cera-msg cera-msg-user';
  userMsg.innerHTML = `
    <div class="cera-msg-avatar"><i class="fa-solid fa-user"></i></div>
    <div class="cera-msg-bubble"><p>${escapeHtml(text)}</p></div>`;
  messages.appendChild(userMsg);
  messages.scrollTop = messages.scrollHeight;

  const typingMsg = document.createElement('div');
  typingMsg.className = 'cera-msg cera-msg-bot cera-typing';
  typingMsg.innerHTML = `
    <div class="cera-msg-avatar"><img src="chatbot.webp" alt="Liên" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>
    <div class="cera-msg-bubble">
      <div class="cera-typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  messages.appendChild(typingMsg);
  messages.scrollTop = messages.scrollHeight;

  if (statusText) statusText.innerHTML = '<span class="cera-dot thinking"></span>Liên đang suy nghĩ...';

  try {
    const reply = await ceraChat(text, _ceraHistory);
    typingMsg.remove();

    _ceraHistory.push({ role: 'user', content: text });
    _ceraHistory.push({ role: 'bot', content: reply });

    const botMsg = document.createElement('div');
    botMsg.className = 'cera-msg cera-msg-bot';
    botMsg.innerHTML = `
      <div class="cera-msg-avatar"><img src="chatbot.webp" alt="Liên" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>
      <div class="cera-msg-bubble">${formatCeraReply(reply)}</div>`;
    messages.appendChild(botMsg);
  } catch (err) {
    typingMsg.remove();
    const errMsg = document.createElement('div');
    errMsg.className = 'cera-msg cera-msg-bot';
    errMsg.innerHTML = `
      <div class="cera-msg-avatar"><img src="chatbot.webp" alt="Liên" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>
      <div class="cera-msg-bubble" style="background:#fee2e2;color:#991b1b;"><p>❌ Rất tiếc, đã có lỗi: ${escapeHtml(err.message)}</p></div>`;
    messages.appendChild(errMsg);
  } finally {
    sendBtn.disabled = false;
    if (statusText) statusText.innerHTML = '<span class="cera-dot"></span>Sẵn sàng hỗ trợ bạn';
    messages.scrollTop = messages.scrollHeight;
  }
}

function ceraKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    ceraSend();
  }
}

function formatCeraReply(text) {
  let h = escapeHtml(text);
  h = h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.*?)\*/g, '<em>$1</em>');
  h = h.replace(/^-\s+(.*)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  h = h.replace(/<\/ul>\s*<ul>/g, '');
  h = h.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => {
    if (p.startsWith('<ul>') || p.startsWith('<ol>')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');
  return h;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ════════════════════════════════════════════════════
   EXPOSE TO GLOBAL (for HTML onclick handlers)
════════════════════════════════════════════════════ */
Object.assign(window, {
  switchTab,
  initiateExam,
  navExamQuestion,
  selectExamOption,
  toggleFlagCurrentQuestion,
  confirmSubmitExam,
  finishExam,
  toggleReviewDetails,
  startPracticeMode,
  checkPracticeAnswer,
  selectPracticeCount,
  onBankFilter,
  changeBankPage,
  handleGenerateQuestions,
  handleFileUpload,
  deleteSource,
  openSettings,
  closeSettings,
  saveSettings,
  toggleTheme,
  togglePauseExam,
  openModal,
  closeModal,
  toggleCeraChat,
  clearCeraChat,
  ceraSend,
  ceraKeyDown,
});

// Boot
document.addEventListener('DOMContentLoaded', init);
