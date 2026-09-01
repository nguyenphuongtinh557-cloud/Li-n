/**
 * app.js — Main Application Controller
 * Điều phối toàn bộ logic của ứng dụng
 */

import { DB } from './modules/db.js';
import { Generator } from './modules/generator.js';
import { ExamEngine, ExamTimer } from './modules/exam.js';
import { SEED_QUESTIONS } from './data/seed_questions.js';
import { ceraChat, ceraAnalyzeImage, verifyAndFixQuestion, setCurrentQuestion } from './modules/cera.js';
import { pullFromGitHub, pullAdminEdits, fetchWebContent, pullResourcesFromServer, pullArticlesFromServer } from './modules/sync.js?v=20260831b';
import { initAdminAuth } from './modules/admin.js';
import { SUBJECTS_REGISTRY, KNOWLEDGE_BLOCKS, getAllSubjects, getSubjectById, getSubjectsByBlock } from './modules/subjects.js?v=20260901c';
import { NavController } from './modules/navigation.js';
import { AuthModule } from './modules/auth.js';
import { ArticlesModule } from './modules/articles.js';

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
    pendingQuestions: [],
    pendingMeta: null,
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
  // Lưu ý: skipSync=true để không push ngược seed mặc định lên GitHub
  DB.addQuestions(SEED_QUESTIONS, { skipSync: true });
  DB.markSeedLoaded();

  // Kéo dữ liệu cộng đồng từ GitHub
  pullFromGitHub(DB).then(res => {
    if (res.questions > 0 || res.sources > 0) {
      updateBankCount();
      if (document.getElementById('bank-tab').classList.contains('active')) {
        renderBank();
      }
    }
  });

  // Kéo tài nguyên học tập từ server về (sync toàn bộ, bao gồm cả xóa)
  try {
    const serverResources = await pullResourcesFromServer();
    if (serverResources && Array.isArray(serverResources)) {
      // SYNC TOÀN BỘ: Server là nguồn dữ liệu chính
      const localResources = DB.getResources();
      const serverIds = new Set(serverResources.map(r => r.id));
      const localIds = new Set(localResources.map(r => r.id));
      
      // Thêm resources mới từ server
      const newResources = serverResources.filter(r => !localIds.has(r.id));
      if (newResources.length > 0) {
        newResources.forEach(r => DB.saveResource(r, true)); // skipSync = true
        console.log(`[Resources] ✅ Đã kéo ${newResources.length} tài nguyên mới từ server`);
      }
      
      // Xóa resources local nếu không còn trên server (Admin đã xóa)
      const deletedResources = localResources.filter(r => !serverIds.has(r.id));
      if (deletedResources.length > 0) {
        deletedResources.forEach(r => DB.deleteResource(r.id, true)); // skipSync = true
        console.log(`[Resources] 🗑️ Đã xóa ${deletedResources.length} tài nguyên không còn trên server`);
      }
      
      // Re-render nếu đang ở tab resources
      if (document.getElementById('resources-tab')?.classList.contains('active')) {
        if (typeof renderResources === 'function') renderResources();
      }
    }
  } catch (e) {
    console.warn('[Resources] Không thể kéo resources từ server:', e);
  }

  // Kéo bài viết (CMS Articles) từ server về (sync toàn bộ, bao gồm cả xóa)
  try {
    const serverArticles = await pullArticlesFromServer();
    if (serverArticles && Array.isArray(serverArticles)) {
      const localArticles = DB.getArticles();
      const serverIds = new Set(serverArticles.map(a => a.id));
      const localIds = new Set(localArticles.map(a => a.id));
      
      // Thêm articles mới từ server
      const newArticles = serverArticles.filter(a => !localIds.has(a.id));
      if (newArticles.length > 0) {
        newArticles.forEach(a => DB.saveArticle(a, true)); // skipSync = true
        console.log(`[Articles] ✅ Đã kéo ${newArticles.length} bài viết mới từ server`);
      }
      
      // Update articles đã tồn tại (nếu có thay đổi)
      const existingArticles = serverArticles.filter(a => localIds.has(a.id));
      if (existingArticles.length > 0) {
        existingArticles.forEach(a => DB.saveArticle(a, true)); // skipSync = true
      }
      
      // Xóa articles local nếu không còn trên server (Admin đã xóa)
      const deletedArticles = localArticles.filter(a => !serverIds.has(a.id));
      if (deletedArticles.length > 0) {
        deletedArticles.forEach(a => DB.deleteArticle(a.id, true)); // skipSync = true
        console.log(`[Articles] 🗑️ Đã xóa ${deletedArticles.length} bài viết không còn trên server`);
      }
      
      // Re-render articles view nếu có
      if (window.ArticlesModule && window.ArticlesModule.renderArticlesView) {
        window.ArticlesModule.renderArticlesView();
      }
    }
  } catch (e) {
    console.warn('[Articles] Không thể kéo articles từ server:', e);
  }

  // Apply saved theme
  const settings = DB.getSettings();
  if (settings.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  updateThemeButton(settings.theme === 'dark' ? 'dark' : 'light');

  updateBankCount();
  initSubjectSelector();
  NavController.init();
  NavController.navigateToPage('home');

  // Kéo bản vá của admin từ server về và patch lên DB local
  // (Patch được ưu tiên hơn seed, giúp Admin sửa câu hỏi mà không cần đụng tới code)
  try {
    const adminEdits = await pullAdminEdits();
    if (adminEdits.length > 0) {
      const bank = DB.getBank();
      let patched = 0;
      adminEdits.forEach(edit => {
        const idx = bank.findIndex(q => q.id === edit.id);
        if (idx !== -1) {
          bank[idx] = { ...bank[idx], ...edit };
          patched++;
        }
      });
      if (patched > 0) {
        DB.setBank(bank);
        console.log(`[Admin] ✅ Đã áp dụng ${patched} bản vá từ Admin Panel`);
      }
    }
  } catch (e) {
    console.warn('[Admin] Không thể kéo admin edits:', e);
  }

  // Kích hoạt tính năng Kéo-Thả cho Chatbot FTECA 24 24
  initDraggableCera();

  // Kích hoạt bộ lắng nghe click ẩn 5 lần cho quyền Admin
  initAdminAuth();
}

/* ════════════════════════════════════════════════════
   TAB NAVIGATION
════════════════════════════════════════════════════ */
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-pill-btn').forEach(btn => btn.classList.remove('active'));

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

  // Đồng bộ highlight Sidebar
  document.querySelectorAll('.sidebar-nav-item').forEach(item => item.classList.remove('active'));
  let snavId = 'snav-ontap';
  if (tabId === 'source-tab') snavId = 'snav-aigen';
  if (tabId === 'history-tab') snavId = 'snav-history';
  const snavEl = document.getElementById(snavId);
  if (snavEl) snavEl.classList.add('active');

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

  // Lọc theo môn học đang chọn (Active Subject)
  const activeSubjectId = DB.getActiveSubject();
  let bank = activeSubjectId === 'ALL' ? DB.getBank() : DB.getBankBySubject(activeSubjectId);

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
    `Hiển thị ${items.length}/${total} câu · Môn: ${DB.getBankStats(activeSubjectId).total} câu`;
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
  const activeSubjectId = DB.getActiveSubject();
  const stats = DB.getBankStats(activeSubjectId);

  document.getElementById('source-bank-count').textContent = stats.total;
  document.getElementById('source-ai-count').textContent =
    DB.getBankBySubject(activeSubjectId).filter(q => q.source === 'ai_generated' || q.source === 'local_generated').length;

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
  const modelTierEl = document.getElementById('generate-model-tier');

  const title = titleEl.value.trim() || 'Tài liệu ' + new Date().toLocaleDateString('vi');
  const content = contentEl.value.trim();
  const count = parseInt(countEl.value) || 10;
  const modelTier = modelTierEl?.value || 'standard';

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
    const genOptions = modelTier !== 'standard' ? { isPremium: true, premiumModelId: modelTier } : {};
    const questions = await Generator.fromText(content, count, (pct, msg) => {
      progressBar.style.width = pct + '%';
      progressText.textContent = msg;
    }, genOptions);

    if (!questions.length) {
      showToast('Không thể sinh câu hỏi. Thử lại với nội dung khác.', 'error');
      return;
    }

    // Lưu tạm vào bộ nhớ chờ biên tập (KHÔNG lưu tự động ngay vào DB)
    State.source.pendingQuestions = questions.map(q => ({
      ...q,
      source: 'ai_generated',
    }));
    State.source.pendingMeta = { title, content };

    // Clear form
    titleEl.value = '';
    contentEl.value = '';

    showToast(`✓ AI đã sinh xong ${questions.length} câu hỏi! Mời bạn thẩm định & chọn nơi lưu.`, 'info');

    // Mở Modal Thẩm Định & Biên Tập Đề Thi AI
    openReviewGeneratedModal();

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

/* ════════════════════════════════════════════════════
   AI QUESTION REVIEW & EDIT MODAL CONTROLLER
════════════════════════════════════════════════════ */

function openReviewGeneratedModal() {
  const modal = document.getElementById('modal-review-generated-questions');
  if (!modal) return;

  // 1. Populate Subject Selector dropdown with all subjects (standard + custom)
  populateReviewSaveSubjectDropdown();

  // 2. Render questions cards
  renderReviewQuestionsList();

  // 3. Open modal
  modal.classList.add('open');
}

function closeReviewGeneratedModal() {
  const modal = document.getElementById('modal-review-generated-questions');
  if (modal) modal.classList.remove('open');
}

function populateReviewSaveSubjectDropdown() {
  const select = document.getElementById('review-save-subject-select');
  if (!select) return;

  const activeSubId = DB.getActiveSubject();
  const allSubjects = getAllSubjects(); // contains standard + custom subjects

  let html = allSubjects.map(s => {
    const isSelected = s.id === activeSubId ? 'selected' : '';
    const tag = s.isCustom ? ' (Tùy chỉnh)' : '';
    return `<option value="${s.id}" ${isSelected}>📚 ${s.code} - ${s.name}${tag}</option>`;
  }).join('');

  html += `<option value="CREATE_NEW" style="font-weight:bold;color:var(--primary);">➕ Tạo môn học / thư mục mới cùng cấp...</option>`;
  select.innerHTML = html;

  // Reset custom input box
  handleToggleCustomSubjectInput(select.value);
}

function handleToggleCustomSubjectInput(val) {
  const wrap = document.getElementById('custom-subject-inputs-wrap');
  if (!wrap) return;

  if (val === 'CREATE_NEW') {
    wrap.classList.remove('hidden');
    document.getElementById('new-subject-name-input')?.focus();
  } else {
    wrap.classList.add('hidden');
  }
}

function togglePrivacyOptionUI(mode) {
  const labelLocal = document.getElementById('label-save-local');
  const labelPublic = document.getElementById('label-save-public');
  if (mode === 'local') {
    labelLocal?.classList.add('active');
    labelPublic?.classList.remove('active');
  } else {
    labelPublic?.classList.add('active');
    labelLocal?.classList.remove('active');
  }
}

function renderReviewQuestionsList() {
  const container = document.getElementById('review-questions-container');
  const badge = document.getElementById('review-total-badge');
  const questions = State.source.pendingQuestions || [];

  if (badge) badge.textContent = `${questions.length} Câu hỏi`;

  if (!container) return;

  if (questions.length === 0) {
    container.innerHTML = `
      <div class="text-center" style="padding: 40px; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
        <div>Không có câu hỏi nào trong danh sách chờ.</div>
        <button class="btn btn-primary btn-sm margin-top-12" onclick="addPendingQuestion()">
          <i class="fa-solid fa-plus"></i> Thêm câu mới thủ công
        </button>
      </div>
    `;
    return;
  }

  const labels = ['A', 'B', 'C', 'D'];

  container.innerHTML = questions.map((q, idx) => {
    const opts = q.options || ['', '', '', ''];
    const correctIdx = typeof q.correct === 'number' ? q.correct : 0;
    const diff = q.difficulty || 1;
    const chapter = q.chapter || 1;

    return `
      <div class="review-q-card" data-idx="${idx}">
        <div class="review-q-header">
          <span class="badge badge-primary font-bold">Câu ${idx + 1}</span>
          <div class="flex items-center gap-2">
            <!-- Chọn Độ Khó -->
            <select class="form-select text-xs" style="padding:3px 8px;border-radius:6px;" onchange="updatePendingQuestion(${idx}, 'difficulty', parseInt(this.value))">
              <option value="1" ${diff === 1 ? 'selected' : ''}>🟢 Dễ</option>
              <option value="2" ${diff === 2 ? 'selected' : ''}>🟡 Trung bình</option>
              <option value="3" ${diff === 3 ? 'selected' : ''}>🔴 Khó</option>
            </select>

            <!-- Chọn Chương -->
            <select class="form-select text-xs" style="padding:3px 8px;border-radius:6px;" onchange="updatePendingQuestion(${idx}, 'chapter', parseInt(this.value))">
              <option value="1" ${chapter === 1 ? 'selected' : ''}>Chương 1</option>
              <option value="2" ${chapter === 2 ? 'selected' : ''}>Chương 3</option>
              <option value="3" ${chapter === 3 ? 'selected' : ''}>Chương 3</option>
              <option value="4" ${chapter === 4 ? 'selected' : ''}>Chương 4</option>
              <option value="5" ${chapter === 5 ? 'selected' : ''}>Chương 5</option>
            </select>

            <button class="btn-icon" onclick="deletePendingQuestion(${idx})" title="Xóa câu này" style="color:var(--danger);">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>

        <!-- Ô Sửa Tên Câu Hỏi -->
        <div class="form-group margin-bottom-8">
          <textarea class="form-input text-sm" rows="2" style="font-weight:600;resize:vertical;" placeholder="Nội dung câu hỏi..." onchange="updatePendingQuestion(${idx}, 'q', this.value)">${q.q || ''}</textarea>
        </div>

        <!-- 4 Ô Sửa Phương Án & Radio Chọn Đáp Án Đúng -->
        <div class="review-option-grid">
          ${opts.map((optText, oIdx) => `
            <div class="review-option-item ${oIdx === correctIdx ? 'correct' : ''}" id="opt-item-${idx}-${oIdx}">
              <input type="radio" name="correct-q-${idx}" value="${oIdx}" ${oIdx === correctIdx ? 'checked' : ''} onchange="updatePendingQuestion(${idx}, 'correct', ${oIdx})">
              <span class="font-bold text-xs" style="width:16px;">${labels[oIdx]}.</span>
              <input type="text" value="${(optText || '').replace(/"/g, '&quot;')}" placeholder="Phương án ${labels[oIdx]}" onchange="updatePendingOption(${idx}, ${oIdx}, this.value)">
            </div>
          `).join('')}
        </div>

        <!-- Ô Sửa Lời Giải Thích -->
        <div class="form-group margin-top-8">
          <input type="text" class="form-input text-xs" placeholder="Lời giải thích (không bắt buộc)..." value="${(q.exp || '').replace(/"/g, '&quot;')}" onchange="updatePendingQuestion(${idx}, 'exp', this.value)">
        </div>
      </div>
    `;
  }).join('');
}

function updatePendingQuestion(idx, field, val) {
  if (!State.source.pendingQuestions[idx]) return;
  State.source.pendingQuestions[idx][field] = val;

  if (field === 'correct') {
    // Re-render UI highlight for correct option
    for (let oIdx = 0; oIdx < 4; oIdx++) {
      const item = document.getElementById(`opt-item-${idx}-${oIdx}`);
      if (item) {
        if (oIdx === val) item.classList.add('correct');
        else item.classList.remove('correct');
      }
    }
  }
}

function updatePendingOption(idx, optionIdx, val) {
  if (!State.source.pendingQuestions[idx]) return;
  if (!Array.isArray(State.source.pendingQuestions[idx].options)) {
    State.source.pendingQuestions[idx].options = ['', '', '', ''];
  }
  State.source.pendingQuestions[idx].options[optionIdx] = val;
}

function addPendingQuestion() {
  if (!Array.isArray(State.source.pendingQuestions)) {
    State.source.pendingQuestions = [];
  }
  State.source.pendingQuestions.push({
    q: '',
    options: ['', '', '', ''],
    correct: 0,
    difficulty: 1,
    chapter: 1,
    exp: '',
    source: 'ai_generated',
  });
  renderReviewQuestionsList();

  // Scroll to bottom of list
  const container = document.getElementById('review-questions-container');
  if (container) container.scrollTop = container.scrollHeight;
}

function deletePendingQuestion(idx) {
  if (!State.source.pendingQuestions) return;
  State.source.pendingQuestions.splice(idx, 1);
  renderReviewQuestionsList();
}

async function saveReviewedQuestions() {
  const questions = State.source.pendingQuestions || [];
  if (!questions.length) {
    showToast('Danh sách câu hỏi trống!', 'error');
    return;
  }

  // 1. Xác định môn học lưu
  const selectSub = document.getElementById('review-save-subject-select');
  let targetSubjectId = selectSub ? selectSub.value : DB.getActiveSubject();

  if (targetSubjectId === 'CREATE_NEW') {
    const nameInput = document.getElementById('new-subject-name-input');
    const codeInput = document.getElementById('new-subject-code-input');
    const newName = nameInput ? nameInput.value.trim() : '';
    const newCode = codeInput ? codeInput.value.trim().toUpperCase() : '';

    if (!newName || !newCode) {
      showToast('Vui lòng nhập Tên và Mã cho môn học / thư mục mới!', 'error');
      return;
    }

    // Khởi tạo môn học tùy chỉnh mới
    const createdSub = DB.addCustomSubject({
      id: newCode,
      code: newCode,
      name: newName,
      credits: 3,
      semester: 1,
      blockId: 'CS_NGANH'
    });

    targetSubjectId = createdSub.id;
    showToast(`✓ Đã tạo môn học mới: "${newCode} - ${newName}"!`, 'info');
  }

  // 2. Kiểm tra tính hợp lệ
  const validQuestions = questions.filter(q => q && q.q && q.q.trim() && Array.isArray(q.options) && q.options.length === 4);
  if (!validQuestions.length) {
    showToast('Vui lòng kiểm tra lại! Cần ít nhất 1 câu hỏi có nội dung hợp lệ.', 'error');
    return;
  }

  // 3. Gán targetSubjectId & flag
  const privacyRadio = document.querySelector('input[name="review-save-privacy"]:checked');
  const isPublic = privacyRadio ? privacyRadio.value === 'public' : false;

  const finalQuestions = validQuestions.map(q => ({
    ...q,
    subjectId: targetSubjectId,
    source: 'ai_generated',
    _seed: false
  }));

  // 4. Lưu vào DB với subjectId đã chọn
  DB.setActiveSubject(targetSubjectId);
  const addedCount = DB.addQuestions(finalQuestions, { skipSync: !isPublic });

  // Lưu nguồn nếu có
  if (State.source.pendingMeta) {
    DB.addSource({
      ...State.source.pendingMeta,
      subjectId: targetSubjectId,
      questionsGenerated: addedCount
    }, { skipSync: !isPublic });
  }

  // Cập nhật lại dropdown môn học toàn ứng dụng
  initSubjectSelector();
  updateSubjectBanner(targetSubjectId);
  updateBankCount();

  closeReviewGeneratedModal();

  showToast(`🎉 Đã lưu ${addedCount} câu hỏi vào môn [${targetSubjectId}] thành công!`, 'success');

  // Reset state
  State.source.pendingQuestions = [];
  State.source.pendingMeta = null;

  // Chuyển thẳng tới tab Ngân hàng đề của môn đó
  NavController.navigateToPage('ontap', 'bank-tab');
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
  updateThemeButton(newTheme);
}

function updateThemeButton(theme) {
  const btn = document.getElementById('btn-theme-top');
  if (!btn) return;

  const isDark = theme === 'dark';
  btn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  btn.title = isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối';
  btn.setAttribute('aria-label', btn.title);
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

/* ─── Subject Selector ─── */
function initSubjectSelector() {
  const select = document.getElementById('global-subject-select');
  if (!select) return;

  // Build grouped options by block
  const blockOrder = ['CS_NGANH', 'DC_CHUNG', 'DC_TUCHON', 'GDQP'];
  const blockLabels = {
    CS_NGANH: '🧪 Cơ sở ngành',
    DC_CHUNG: '📚 Đại cương bắt buộc',
    DC_TUCHON: '💡 Đại cương tự chọn',
    GDQP: '🎖️ Quốc phòng & An ninh'
  };

  select.innerHTML = '';
  for (const blockId of blockOrder) {
    const subjects = getSubjectsByBlock(blockId);
    if (subjects.length === 0) continue;
    const group = document.createElement('optgroup');
    group.label = blockLabels[blockId] || blockId;
    subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.code} · ${s.name}`;
      group.appendChild(opt);
    });
    select.appendChild(group);
  }

  // Restore saved subject
  const saved = DB.getActiveSubject();
  if (saved) select.value = saved;

  // On change
  select.addEventListener('change', () => {
    const subjectId = select.value;
    DB.setActiveSubject(subjectId);
    updateSubjectBanner(subjectId);
    updateBankCount();
    // Re-render active tab if needed
    if (State.currentTab === 'bank-tab') renderBank();
  });

  // Init banner
  updateSubjectBanner(saved);
}

function updateSubjectBanner(subjectId) {
  const subject = getSubjectById(subjectId);
  const codeEl = document.getElementById('active-subject-code');
  const nameEl = document.getElementById('active-subject-name');
  const creditsEl = document.getElementById('active-subject-credits');
  if (codeEl) codeEl.textContent = subject.code;
  if (nameEl) nameEl.textContent = subject.name;
  if (creditsEl) creditsEl.textContent = `(${subject.credits} Tín chỉ)`;

  // Sync global select in case banner was changed from block filter
  const select = document.getElementById('global-subject-select');
  if (select && select.value !== subjectId) select.value = subjectId;
}

function onBlockFilterChange(blockId) {
  // Filter the global subject dropdown by the chosen block
  const select = document.getElementById('global-subject-select');
  if (!select) return;
  const subjects = getSubjectsByBlock(blockId);
  if (subjects.length === 0) return;
  // Select first subject of the block and apply
  const firstId = subjects[0].id;
  select.value = firstId;
  DB.setActiveSubject(firstId);
  updateSubjectBanner(firstId);
  updateBankCount();
  if (State.currentTab === 'bank-tab') renderBank();
}

function updateBankCount() {
  const activeSubjectId = DB.getActiveSubject();
  const stats = DB.getBankStats(activeSubjectId);
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

function toggleCeraMenu(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('cera-menu-dropdown');
  if (dropdown) dropdown.classList.toggle('show');
}

function hideCeraMenu() {
  const dropdown = document.getElementById('cera-menu-dropdown');
  if (dropdown) dropdown.classList.remove('show');
}

function toggleCeraExpand() {
  const panel = document.getElementById('cera-panel');
  const icon = document.getElementById('cera-expand-icon');
  const text = document.getElementById('cera-expand-text');
  if (!panel) return;

  const isExpanded = panel.classList.toggle('expanded');
  if (icon) {
    icon.className = isExpanded ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
  }
  if (text) {
    text.textContent = isExpanded ? 'Thu nhỏ màn hình' : 'Toàn màn hình';
  }
}

// Đóng menu khi click ra ngoài
document.addEventListener('click', (e) => {
  if (!e.target.closest('.cera-menu-dropdown-wrap')) {
    hideCeraMenu();
  }
});

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

let _ceraAttachedBase64 = null;

function handleCeraImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    _ceraAttachedBase64 = e.target.result;
    const previewContainer = document.getElementById('cera-image-preview-container');
    const previewImg = document.getElementById('cera-image-preview');
    if (previewContainer && previewImg) {
      previewImg.src = _ceraAttachedBase64;
      previewContainer.classList.remove('hidden');
    }
  };
  reader.readAsDataURL(file);
}

function removeCeraAttachedImage() {
  _ceraAttachedBase64 = null;
  const previewContainer = document.getElementById('cera-image-preview-container');
  const previewImg = document.getElementById('cera-image-preview');
  const fileInput = document.getElementById('cera-file-input');
  if (previewContainer) previewContainer.classList.add('hidden');
  if (previewImg) previewImg.src = '';
  if (fileInput) fileInput.value = '';
}

function getUserAvatarUrl() {
  if (NavController && NavController.currentUser && NavController.currentUser.avatar) {
    return NavController.currentUser.avatar;
  }
  try {
    const saved = localStorage.getItem('lien_google_user') || localStorage.getItem('lien_user_session') || localStorage.getItem('lien_custom_profile');
    if (saved) {
      const u = JSON.parse(saved);
      if (u && u.avatar) return u.avatar;
      if (u && u.name) return 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(u.name);
    }
  } catch (e) {}
  return 'https://api.dicebear.com/7.x/avataaars/svg?seed=User';
}

async function ceraSend() {
  const input = document.getElementById('cera-input');
  const sendBtn = document.getElementById('cera-send-btn');
  const messages = document.getElementById('cera-messages');
  const statusText = document.getElementById('cera-status-text');
  const modelSelect = document.getElementById('cera-model-select');
  if (!input || !sendBtn || !messages) return;

  const text = input.value.trim();
  const attachedImage = _ceraAttachedBase64;

  if (!text && !attachedImage) return;

  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  // Render User Message Bubble với Avatar đồng bộ của User
  const userMsg = document.createElement('div');
  userMsg.className = 'cera-msg cera-msg-user';
  let imgHtml = attachedImage ? `<img src="${attachedImage}" style="max-width:180px;max-height:180px;border-radius:8px;margin-bottom:6px;display:block;">` : '';
  const userAvatar = getUserAvatarUrl();
  userMsg.innerHTML = `
    <div class="cera-msg-avatar"><img src="${userAvatar}" alt="User Avatar" referrerpolicy="no-referrer"></div>
    <div class="cera-msg-bubble">${imgHtml}<p>${escapeHtml(text || 'Hãy phân tích hình ảnh này.')}</p></div>`;
  messages.appendChild(userMsg);
  messages.scrollTop = messages.scrollHeight;

  // Clear attached image state
  removeCeraAttachedImage();

  const typingMsg = document.createElement('div');
  typingMsg.className = 'cera-msg cera-msg-bot cera-typing';
  typingMsg.innerHTML = `
    <div class="cera-msg-avatar"><img src="chatbot.webp" alt="FTECA 24" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>
    <div class="cera-msg-bubble">
      <div class="cera-typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  messages.appendChild(typingMsg);
  messages.scrollTop = messages.scrollHeight;

  if (statusText) statusText.innerHTML = '<span class="cera-dot thinking"></span>FTECA 24 đang phân tích...';

  try {
    let reply = '';
    const selectedModel = modelSelect?.value || 'standard';

    if (attachedImage) {
      // Phân tích hình ảnh / Giải bài tập bằng Vision AI
      reply = await ceraAnalyzeImage(attachedImage, text, _ceraHistory);
    } else if (selectedModel !== 'standard') {
      // Gọi Premium AI Zone
      reply = await ceraChat(text, _ceraHistory, { isPremium: true, premiumModelId: selectedModel });
    } else {
      // Gọi Standard Cera
      reply = await ceraChat(text, _ceraHistory);
    }

    typingMsg.remove();

    _ceraHistory.push({ role: 'user', content: text || 'Hình ảnh' });
    _ceraHistory.push({ role: 'bot', content: reply });

    const botMsg = document.createElement('div');
    botMsg.className = 'cera-msg cera-msg-bot';
    botMsg.innerHTML = `
      <div class="cera-msg-avatar"><img src="chatbot.webp" alt="FTECA 24" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>
      <div class="cera-msg-bubble">${formatCeraReply(reply)}</div>`;
    messages.appendChild(botMsg);
  } catch (err) {
    typingMsg.remove();
    const errMsg = document.createElement('div');
    errMsg.className = 'cera-msg cera-msg-bot';
    errMsg.innerHTML = `
      <div class="cera-msg-avatar"><img src="chatbot.webp" alt="FTECA 24" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>
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
  toggleCeraExpand,
  toggleCeraMenu,
  hideCeraMenu,
  clearCeraChat,
  ceraSend,
  ceraKeyDown,
  handleCeraImageUpload,
  removeCeraAttachedImage,
  onBlockFilterChange,
  openReviewGeneratedModal,
  closeReviewGeneratedModal,
  handleToggleCustomSubjectInput,
  togglePrivacyOptionUI,
  updatePendingQuestion,
  updatePendingOption,
  addPendingQuestion,
  deletePendingQuestion,
  saveReviewedQuestions,
  renderAdminDashboard,
  switchAdminSubTab,
  filterAdminUserList,
  grantAdminUserPremium,
  revokeAdminUserPremium,
  handleAdminImportJSON,
  handleAdminPostAnnouncement,
  // CMS Articles
  adminOpenArticleEditor,
  adminCloseArticleEditor,
  adminSaveArticle,
  adminDeleteArticle,
  adminTogglePinArticle,
  // Feedback Inbox
  renderAdminFeedbackInbox,
  adminMarkFeedback,
  adminDeleteFeedback,
  // Resources
  adminSaveResource,
  adminDeleteResource,
  renderAdminResourceList,
  switchResourceInputMode,
  openUserResourceViewer,
  // Bank AI 4-step
  switchBankSourceMode,
  adminBankExtractFile,
  adminBankFetchURL,
  adminBankGoStep,
  adminBankGenerateQuestions,
  adminBankAddBlankQuestion,
  adminBankConfirmSave,
  setAdminBankCount,
  NavController,
  AuthModule,
  navigateToPage: (p, sub) => NavController.navigateToPage(p, sub),
  openSubjectPage: (s) => NavController.openSubjectDetail(s),
});

/* ════════════════════════════════════════════════════
   ADMIN DASHBOARD & 3-TIER ROLE MANAGEMENT CONTROLLER
════════════════════════════════════════════════════ */


/* --- ADMIN SUB-TAB SWITCHER --- */
function switchAdminSubTab(tabName) {
  // Hide all subtab content panels
  var allSubtabs = document.querySelectorAll('.admin-subtab-content');
  allSubtabs.forEach(function(el) { el.classList.add('hidden'); });

  // Remove active from all zone buttons
  var allBtns = document.querySelectorAll('.admin-zone-btn');
  allBtns.forEach(function(btn) { btn.classList.remove('active'); });

  // Show selected subtab
  var targetTab = document.getElementById('admin-subtab-' + tabName);
  if (targetTab) targetTab.classList.remove('hidden');

  // Activate matching button
  var targetBtn = document.getElementById('admin-' + tabName + '-tab-btn');
  if (targetBtn) targetBtn.classList.add('active');

  // Render content per tab
  if (tabName === 'users') { renderAdminUserList(); }
  else if (tabName === 'cms') {
    renderAdminArticleList();
    _initTinyMCEEditors();
  }
  else if (tabName === 'announcement') {
    renderAdminAnnouncementList();
    _initTinyMCEEditors();
  }
  else if (tabName === 'feedback') { renderAdminFeedbackInbox(); }
  else if (tabName === 'resources') { 
    _populateResourceSubjectDropdown();
    renderAdminResourceList(); 
  }
  else if (tabName === 'bank') { _populateBankSubjectDropdown(); }
}
function renderAdminDashboard() {
  const statUsers = document.getElementById('stat-total-users');
  const statPremium = document.getElementById('stat-premium-users');
  const statQuestions = document.getElementById('stat-total-questions');
  const statSubjects = document.getElementById('stat-total-subjects');

  const users = DB.getAllRegisteredUsers();
  const premiumEmails = DB.getPremiumEmails().map(e => (e || '').toLowerCase());
  const bank = DB.getBank();
  const subjects = getAllSubjects();

  if (statUsers) statUsers.textContent = users.length || 1;
  if (statPremium) statPremium.textContent = premiumEmails.length || 0;
  if (statQuestions) statQuestions.textContent = bank.length || 0;
  if (statSubjects) statSubjects.textContent = subjects.length || 35;

  renderAdminUserList();
  
  // Pre-populate dropdowns for all tabs
  _populateResourceSubjectDropdown();
  _populateBankSubjectDropdown();
}



function renderAdminUserList(filterText = '') {
  const tbody = document.getElementById('admin-users-table-body');
  if (!tbody) return;

  const users = DB.getAllRegisteredUsers();
  const superAdmins = ['nguyenphuongtinh557@gmail.com', 'macnghich@gmail.com'];
  const premiumEmails = DB.getPremiumEmails().map(e => (e || '').toLowerCase());

  // Merge current user if not in list
  if (NavController.currentUser && NavController.currentUser.email) {
    const exists = users.some(u => u.email.toLowerCase() === NavController.currentUser.email.toLowerCase());
    if (!exists) {
      users.unshift({
        name: NavController.currentUser.name,
        email: NavController.currentUser.email,
        avatar: NavController.currentUser.avatar,
        lastLogin: new Date().toISOString()
      });
    }
  }

  const keyword = filterText.trim().toLowerCase();
  const filteredUsers = users.filter(u => {
    if (!keyword) return true;
    return (u.name || '').toLowerCase().includes(keyword) || (u.email || '').toLowerCase().includes(keyword);
  });

  if (filteredUsers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Không tìm thấy học viên nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredUsers.map((u, idx) => {
    const emailLower = (u.email || '').toLowerCase();
    const isSuperAdmin = superAdmins.includes(emailLower);
    const isPremium = premiumEmails.includes(emailLower);

    let roleBadge = '<span class="badge badge-newbie">🌱 NEWBIE</span>';
    if (isSuperAdmin) {
      roleBadge = '<span class="badge badge-admin"><i class="fa-solid fa-shield-halved"></i> SUPER ADMIN</span>';
    } else if (isPremium) {
      roleBadge = '<span class="badge badge-premium"><i class="fa-solid fa-crown"></i> PREMIUM</span>';
    }

    const actionBtn = isSuperAdmin ? `
      <span class="text-xs text-muted font-bold">🛡️ Quản trị viên Tối cao</span>
    ` : (isPremium ? `
      <button class="btn btn-secondary btn-xs" onclick="revokeAdminUserPremium('${u.email}')">
        <i class="fa-solid fa-user-minus"></i> Hạ xuống Newbie
      </button>
    ` : `
      <button class="btn btn-success btn-xs font-bold" onclick="grantAdminUserPremium('${u.email}')">
        <i class="fa-solid fa-crown"></i> Cấp Quyền PREMIUM
      </button>
    `);

    const formattedDate = u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('vi-VN') + ' ' + new Date(u.lastLogin).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong';

    return `
      <tr>
        <td class="font-bold">${idx + 1}</td>
        <td>
          <div class="flex items-center gap-2">
            <img src="${u.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(u.name || 'User')}" referrerpolicy="no-referrer" style="width:26px;height:26px;border-radius:50%;object-fit:cover;">
            <span class="font-semibold">${escapeHtml(u.name || 'Học viên')}</span>
          </div>
        </td>
        <td class="font-mono text-xs">${escapeHtml(u.email || '')}</td>
        <td>${roleBadge}</td>
        <td class="text-xs text-muted">${formattedDate}</td>
        <td style="text-align:right;">${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

function filterAdminUserList(keyword) {
  renderAdminUserList(keyword);
}

function grantAdminUserPremium(email) {
  if (!email) return;
  DB.grantPremium(email);
  showToast(`🎉 Đã cấp quyền PREMIUM cho tài khoản [${email}] thành công! Dữ liệu đã đồng bộ lên Server Cloud.`, 'success');
  renderAdminDashboard();
  if (NavController.currentUser && NavController.currentUser.email.toLowerCase() === email.toLowerCase()) {
    NavController.renderUserAuthZone();
  }
}

function revokeAdminUserPremium(email) {
  if (!email) return;
  DB.revokePremium(email);
  showToast(`ℹ️ Đã hạ tài khoản [${email}] xuống cấp độ NEWBIE. Dữ liệu đã đồng bộ lên Server Cloud.`, 'info');
  renderAdminDashboard();
  if (NavController.currentUser && NavController.currentUser.email.toLowerCase() === email.toLowerCase()) {
    NavController.renderUserAuthZone();
  }
}

async function handleAdminImportJSON() {
  const fileInput = document.getElementById('admin-import-json-file');
  if (!fileInput || !fileInput.files.length) {
    showToast('Vui lòng chọn 1 file .json chứa ngân hàng câu hỏi!', 'error');
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) {
        showToast('File JSON không hợp lệ. Phải là một mảng mảng câu hỏi [...]', 'error');
        return;
      }

      const added = DB.addQuestions(data, { skipSync: false });
      showToast(`🎉 Đã nạp thành công ${added} câu hỏi vào hệ thống và đồng bộ Server Cloud!`, 'success');
      fileInput.value = '';
      updateBankCount();
      renderAdminDashboard();
    } catch (err) {
      showToast('Lỗi đọc file JSON: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}



/* ════════════════════════════════════════════════════
   ADMIN CMS
════════════════════════════════════════════════════ */
function _formatDateForDateInput(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return new Date().toISOString().split('T')[0];
}

function _formatInputDateForDisplay(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString('vi-VN');
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

let _adminTinyMCEArticle = null;
let _adminTinyMCEAnnouncement = null;
let _adminTinyMCEResource = null;

function _initTinyMCEEditors() {
  // TinyMCE configuration
  const tinyConfig = {
    height: 400,
    menubar: true,
    plugins: [
      'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
      'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
      'insertdatetime', 'media', 'table', 'help', 'wordcount'
    ],
    toolbar: 'undo redo | blocks | bold italic forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | table | link image media | removeformat code | help',
    content_style: 'body { font-family: Inter, sans-serif; font-size: 14px; } table { border-collapse: collapse; width: 100%; } table td, table th { border: 1px solid #ccc; padding: 8px; }',
    table_default_attributes: {
      border: '1',
      style: 'border-collapse: collapse; width: 100%;'
    },
    table_default_styles: {
      'border-collapse': 'collapse',
      'width': '100%'
    },
    images_upload_handler: (blobInfo, progress) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject('Lỗi đọc ảnh');
        reader.readAsDataURL(blobInfo.blob());
      });
    },
    file_picker_types: 'image',
    automatic_uploads: true,
    images_reuse_filename: true,
    branding: false,
  };

  // Init article editor
  if (!_adminTinyMCEArticle) {
    tinymce.init({
      ...tinyConfig,
      selector: '#admin-tinymce-article',
      height: 450,
      setup: (editor) => {
        _adminTinyMCEArticle = editor;
      }
    });
  }

  // Init announcement editor
  if (!_adminTinyMCEAnnouncement) {
    tinymce.init({
      ...tinyConfig,
      selector: '#admin-tinymce-announcement',
      height: 300,
      setup: (editor) => {
        _adminTinyMCEAnnouncement = editor;
      }
    });
  }

  // Init resource editor
  if (!_adminTinyMCEResource) {
    tinymce.init({
      ...tinyConfig,
      selector: '#admin-tinymce-resource',
      height: 350,
      setup: (editor) => {
        _adminTinyMCEResource = editor;
      }
    });
  }
}

function adminOpenArticleEditor() {
  document.getElementById('admin-article-id').value = '';
  document.getElementById('admin-article-title').value = '';
  document.getElementById('admin-article-cover').value = '';
  const excerptInput = document.getElementById('admin-article-excerpt');
  if (excerptInput) excerptInput.value = '';
  const dateInput = document.getElementById('admin-article-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  document.getElementById('admin-article-tags').value = '';
  document.getElementById('admin-article-category').value = 'Công nghệ chế biến';
  document.getElementById('admin-article-status').value = 'published';
  document.getElementById('admin-editor-title-label').textContent = '✏️ Soạn Thảo Bài Viết Mới';
  
  // Hide preview
  previewArticleCover('');
  
  if (_adminTinyMCEArticle) {
    _adminTinyMCEArticle.setContent('');
  }
  
  document.getElementById('admin-article-editor').style.display = '';
  setTimeout(() => _initTinyMCEEditors(), 100);
}

function adminEditArticle(id) {
  let articles = DB.getArticles();
  if (!articles || !articles.length) {
    if (window.ArticlesModule) articles = window.ArticlesModule.getArticlesData();
  }
  const article = articles.find(a => a.id === id);
  if (!article) return;

  console.log('[DEBUG] adminEditArticle - Setting cover URL:', article.cover);

  document.getElementById('admin-article-id').value = id;
  document.getElementById('admin-article-title').value = article.title || '';
  document.getElementById('admin-article-cover').value = article.cover || '';
  
  // Prevent auto-change by storing original value
  const coverInput = document.getElementById('admin-article-cover');
  if (coverInput) {
    coverInput.dataset.originalValue = article.cover || '';
  }
  
  // Preview ảnh bìa
  previewArticleCover(article.cover || '');
  
  const excerptInput = document.getElementById('admin-article-excerpt');
  if (excerptInput) excerptInput.value = article.excerpt || '';
  const dateInput = document.getElementById('admin-article-date');
  if (dateInput) dateInput.value = _formatDateForDateInput(article.date);
  document.getElementById('admin-article-tags').value = (article.tags || []).join(', ');
  document.getElementById('admin-article-category').value = article.category || 'Công nghệ chế biến';
  document.getElementById('admin-article-status').value = article.status || (article.featured ? 'pinned' : 'published');
  document.getElementById('admin-editor-title-label').textContent = `✏️ Chỉnh Sửa Bài Viết: ${article.title}`;
  document.getElementById('admin-article-editor').style.display = '';

  setTimeout(() => {
    _initTinyMCEEditors();
    if (_adminTinyMCEArticle && article.content) {
      _adminTinyMCEArticle.setContent(article.content);
    }
  }, 100);
}

function previewArticleCover(url) {
  const previewContainer = document.getElementById('admin-article-cover-preview');
  const previewImg = document.getElementById('admin-article-cover-img');
  
  if (!url || !url.trim()) {
    if (previewContainer) previewContainer.style.display = 'none';
    return;
  }
  
  let cleanUrl = url.trim();
  
  // Validate URL format
  try {
    new URL(cleanUrl);
  } catch {
    if (previewContainer) previewContainer.style.display = 'none';
    return;
  }
  
  if (previewImg) {
    // Show loading state
    if (previewContainer) {
      previewContainer.style.display = 'block';
      previewImg.style.opacity = '0.5';
      previewImg.style.filter = 'blur(2px)';
    }
    
    // Add cache-busting timestamp
    const cacheBuster = `${cleanUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
    const finalUrl = cleanUrl + cacheBuster;
    
    // Try loading image with cache-buster
    previewImg.onerror = () => {
      // If failed, try with CORS proxy
      const proxiedUrl = `https://corsproxy.io/?${encodeURIComponent(cleanUrl)}`;
      previewImg.src = proxiedUrl;
      
      previewImg.onerror = () => {
        // If still failed, hide preview
        if (previewContainer) previewContainer.style.display = 'none';
        showToast('⚠️ Không thể tải ảnh. URL có thể bị chặn CORS hoặc không hợp lệ.', 'warning');
      };
      
      previewImg.onload = () => {
        if (previewContainer) {
          previewContainer.style.display = 'block';
          previewImg.style.opacity = '1';
          previewImg.style.filter = 'none';
        }
        showToast('✅ Đã tải ảnh qua proxy CORS', 'info');
      };
    };
    
    previewImg.onload = () => {
      if (previewContainer) {
        previewContainer.style.display = 'block';
        previewImg.style.opacity = '1';
        previewImg.style.filter = 'none';
      }
    };
    
    // Set src to trigger load
    previewImg.src = finalUrl;
  }
}

function adminCloseArticleEditor() {
  document.getElementById('admin-article-editor').style.display = 'none';
}

function adminSaveArticle(forceStatus) {
  const title = document.getElementById('admin-article-title').value.trim();
  if (!title) { showToast('Vui lòng nhập tiêu đề bài viết!', 'error'); return; }
  
  const content = _adminTinyMCEArticle ? _adminTinyMCEArticle.getContent() : '';
  const textContent = _adminTinyMCEArticle ? _adminTinyMCEArticle.getContent({format: 'text'}).trim() : '';
  
  if (!textContent) { showToast('Nội dung bài viết không được để trống!', 'error'); return; }

  const status = forceStatus || document.getElementById('admin-article-status').value;
  const excerptInput = document.getElementById('admin-article-excerpt');
  const excerpt = excerptInput ? excerptInput.value.trim() : (textContent.slice(0, 140) + '...');
  
  // Validate cover URL - Chấp nhận mọi URL hợp lệ
  let coverUrl = document.getElementById('admin-article-cover').value.trim();
  
  if (coverUrl) {
    // Check if URL is valid
    if (!coverUrl.startsWith('http://') && !coverUrl.startsWith('https://')) {
      showToast('❌ URL ảnh bìa phải bắt đầu bằng http:// hoặc https://', 'error');
      return;
    }
    
    // Basic URL validation
    try {
      new URL(coverUrl);
    } catch (e) {
      showToast('❌ URL không hợp lệ. Vui lòng kiểm tra lại định dạng.', 'error');
      return;
    }
  } else {
    // Default cover nếu không nhập - để trống hoặc dùng placeholder
    coverUrl = '';
  }

  const articleId = document.getElementById('admin-article-id').value || ('art_' + Date.now());

  // Preserve existing views count or default to 0
  const existingArticle = DB.getArticles().find(a => a.id === articleId);
  const currentViews = existingArticle ? (existingArticle.views || 0) : 0;

  const dateInput = document.getElementById('admin-article-date');
  // Auto timestamp: new article gets today's publish date automatically
  let formattedDate;
  if (!existingArticle) {
    // Brand new article: use today as publish date
    formattedDate = new Date().toLocaleDateString('vi-VN');
  } else if (dateInput && dateInput.value) {
    // Existing article edit: respect admin's date choice
    formattedDate = _formatInputDateForDisplay(dateInput.value);
  } else {
    // Fallback: keep existing date
    formattedDate = existingArticle.date || new Date().toLocaleDateString('vi-VN');
  }

  const article = {
    id: articleId,
    title,
    excerpt,
    content,
    category: document.getElementById('admin-article-category').value || 'Công nghệ chế biến',
    status,
    featured: status === 'pinned',
    cover: coverUrl,
    date: formattedDate,
    readTime: `${Math.max(2, Math.ceil(textContent.length / 500))} phút đọc`,
    views: currentViews,
    tags: document.getElementById('admin-article-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    author: NavController.currentUser?.name || 'Admin System',
  };

  console.log('[DEBUG] Saving article with cover URL:', coverUrl);
  console.log('[DEBUG] Full article object:', article);

  DB.saveArticle(article);
  adminCloseArticleEditor();
  renderAdminArticleList();

  if (window.ArticlesModule && window.ArticlesModule.renderArticlesView) {
    window.ArticlesModule.renderArticlesView();
  }

  showToast(status === 'draft' ? '📝 Đã lưu nháp bài viết!' : '🎉 Đã đăng bài viết và đồng bộ thành công!', 'success');
}

function renderAdminArticleList() {
  const container = document.getElementById('admin-article-list');
  if (!container) return;

  let articles = DB.getArticles();
  if (!articles || !articles.length) {
    articles = ArticlesModule.getArticlesData();
  }

  if (!articles || !articles.length) {
    container.innerHTML = '<p class="text-xs text-muted text-center py-4">Chưa có bài viết nào.</p>';
    return;
  }

  const statusLabel = (article) => {
    if (article.status === 'pinned' || article.featured) return '<span class="badge badge-warning">📌 Nổi bật</span>';
    if (article.status === 'draft') return '<span class="badge badge-secondary">📝 Nháp</span>';
    return '<span class="badge badge-success">✅ Đã đăng</span>';
  };

  container.innerHTML = [...articles]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map(article => `
      <div class="article-card-admin">
        <img class="article-thumb" src="${escapeHtml(article.cover || 'https://placehold.co/300x200/e3f2fd/1976d2?text=No+Cover')}" alt="">
        <div class="article-info">
          <h4>${escapeHtml(article.title || 'Không có tiêu đề')}</h4>
          <p class="article-excerpt-preview">${escapeHtml(article.excerpt || 'Bài viết chưa có mô tả ngắn.')}</p>
          <div class="article-meta">
            <span>${escapeHtml(article.category || 'Chưa phân loại')}</span>
            <span>📅 ${escapeHtml(article.date || '')}</span>
            <span>👁️ ${Number(article.views) || 0}</span>
          </div>
        </div>
        <div class="article-actions-row">
          ${statusLabel(article)}
          <button class="btn btn-secondary btn-xs" onclick="adminEditArticle('${String(article.id).replace(/'/g, "\\'")}')">Sửa</button>
          <button class="btn btn-secondary btn-xs" onclick="adminTogglePinArticle('${String(article.id).replace(/'/g, "\\'")}')">${article.status === 'pinned' || article.featured ? 'Bỏ ghim' : 'Ghim'}</button>
          <button class="btn btn-danger btn-xs" onclick="adminDeleteArticle('${String(article.id).replace(/'/g, "\\'")}')">Xóa</button>
        </div>
      </div>
    `).join('');
}

function adminDeleteArticle(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa bài viết này khỏi hệ thống?')) return;
  DB.deleteArticle(id);
  renderAdminArticleList();

  // Force reload articles module data
  if (window.ArticlesModule) {
    // Clear any cached data
    window.ArticlesModule.currentCategory = 'Tất cả';
    window.ArticlesModule.activeArticleId = null;
    // Re-render if user is on articles page
    window.ArticlesModule.renderArticlesView();
  }

  showToast('🗑️ Đã xóa bài viết thành công.', 'info');
}

function adminTogglePinArticle(id) {
  let articles = DB.getArticles();
  if (!articles || !articles.length) {
    if (window.ArticlesModule) articles = window.ArticlesModule.getArticlesData();
  }
  const article = articles.find(a => a.id === id);
  if (!article) return;

  const isCurrentlyPinned = article.status === 'pinned' || article.featured;
  article.status = isCurrentlyPinned ? 'published' : 'pinned';
  article.featured = !isCurrentlyPinned;

  DB.saveArticle(article);
  renderAdminArticleList();

  if (window.ArticlesModule && window.ArticlesModule.renderArticlesView) {
    window.ArticlesModule.renderArticlesView();
  }

  showToast(article.featured ? '📌 Đã ghim bài viết lên vị trí Nổi Bật (Hero)!' : 'ℹ️ Đã bỏ ghim bài viết.', 'info');
}

/* ─── RICH ANNOUNCEMENT ────────────────────────────────────────────────────── */
function handleAdminPostAnnouncement() {
  const titleInput = document.getElementById('admin-announcement-title');
  const typeSelect = document.getElementById('admin-announcement-type');
  const scopeSelect = document.getElementById('admin-announcement-scope');
  const title = titleInput ? titleInput.value.trim() : '';
  const type = typeSelect ? typeSelect.value : 'info';
  const scope = scopeSelect ? scopeSelect.value : 'all';

  let content = '';
  if (_adminTinyMCEAnnouncement) {
    content = _adminTinyMCEAnnouncement.getContent();
    if (!_adminTinyMCEAnnouncement.getContent({format: 'text'}).trim()) {
      showToast('Vui lòng nhập nội dung thông báo!', 'error'); return;
    }
  } else {
    const contentInput = document.getElementById('admin-announcement-content');
    content = contentInput ? contentInput.value.trim() : '';
  }

  if (!title) { showToast('Vui lòng nhập tiêu đề thông báo!', 'error'); return; }
  if (!content) { showToast('Vui lòng nhập nội dung thông báo!', 'error'); return; }

  DB.addAnnouncement({ title, content, type, scope, author: NavController.currentUser?.name || 'Admin' });
  showToast('📢 Đã gửi thông báo lên Server Cloud!', 'success');
  if (titleInput) titleInput.value = '';
  if (_adminTinyMCEAnnouncement) _adminTinyMCEAnnouncement.setContent('');
  renderAdminAnnouncementList();
}

function renderAdminAnnouncementList() {
  const el = document.getElementById('admin-announcement-list');
  if (!el) return;
  const list = DB.getAnnouncements();
  if (!list.length) { el.innerHTML = `<div class="text-xs text-muted text-center py-3">Chưa có thông báo nào.</div>`; return; }
  const typeIcon = { info: '💡', update: '🚀', alert: '⚠️', success: '🎉' };
  el.innerHTML = list.slice(0, 20).map(a => `
    <div class="feedback-item" style="padding:10px 12px;">
      <div class="fb-icon">${typeIcon[a.type] || '📢'}</div>
      <div class="fb-body">
        <h5>${escapeHtml(a.title)}</h5>
        <p>${new Date(a.createdAt).toLocaleDateString('vi-VN')} &middot; Phạm vi: ${a.scope === 'premium' ? '💎 PREMIUM' : a.scope === 'newbie' ? '🌱 NEWBIE' : '👥 Tất cả'}</p>
      </div>
      <button class="btn btn-danger btn-xs" onclick="adminDeleteAnnouncement('${a.id}')"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join('');
}

function adminDeleteAnnouncement(id) {
  DB.deleteAnnouncement(id);
  renderAdminAnnouncementList();
  showToast('Đã xóa thông báo.', 'info');
}

/* ─── FEEDBACK INBOX ───────────────────────────────────────────────────────── */
function renderAdminFeedbackInbox() {
  const el = document.getElementById('admin-feedback-list');
  const filterEl = document.getElementById('admin-feedback-filter');
  const filter = filterEl ? filterEl.value : 'all';
  if (!el) return;

  let feedbacks = DB.getFeedbacks();
  if (filter === 'unread' || filter === 'read' || filter === 'resolved') {
    feedbacks = feedbacks.filter(f => f.status === filter);
  } else if (filter === 'bug' || filter === 'feedback') {
    feedbacks = feedbacks.filter(f => f.type === filter);
  }

  // Update badge
  const unreadCount = DB.getFeedbacks().filter(f => f.status === 'unread').length;
  const badge = document.getElementById('admin-feedback-badge');
  if (badge) { badge.textContent = unreadCount; badge.style.display = unreadCount > 0 ? 'inline-flex' : 'none'; }

  if (!feedbacks.length) {
    el.innerHTML = `<div class="text-xs text-muted text-center py-4">${filter === 'all' ? 'Chưa có phản hồi nào từ học viên.' : 'Không có phản hồi nào ở trạng thái này.'}</div>`;
    return;
  }

  const typeIcon = { bug: '🐛', feedback: '💬', other: '📝' };
  el.innerHTML = feedbacks.map(f => `
    <div class="feedback-item ${f.status}">
      <div class="fb-icon">${typeIcon[f.type] || '💬'}</div>
      <div class="fb-body">
        <h5>${escapeHtml(f.userName)} <span class="text-xs text-muted font-normal">— ${escapeHtml(f.userEmail)}</span></h5>
        <p>${escapeHtml(f.content)}</p>
        <p>${new Date(f.createdAt).toLocaleDateString('vi-VN')} &middot; <span class="font-bold" style="color:${f.status==='unread'?'var(--danger)':f.status==='resolved'?'var(--success)':'var(--text-muted)'}">${f.status === 'unread' ? '🔴 Chưa đọc' : f.status === 'resolved' ? '✅ Đã xử lý' : '👁 Đã đọc'}</span></p>
      </div>
      <div class="fb-actions">
        ${f.status !== 'resolved' ? `<button class="btn btn-success btn-xs" onclick="adminMarkFeedback('${f.id}','resolved')">✅ Xử lý</button>` : ''}
        ${f.status === 'unread' ? `<button class="btn btn-secondary btn-xs" onclick="adminMarkFeedback('${f.id}','read')">👁 Đánh dấu đọc</button>` : ''}
        <button class="btn btn-danger btn-xs" onclick="adminDeleteFeedback('${f.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function adminMarkFeedback(id, status) {
  DB.markFeedbackStatus(id, status);
  renderAdminFeedbackInbox();
  renderAdminDashboard();
}

function adminDeleteFeedback(id) {
  if (!confirm('Xóa phản hồi này?')) return;
  DB.deleteFeedback(id);
  renderAdminFeedbackInbox();
}

/* ─── RESOURCES ─────────────────────────────────────────────────────────────── */
function _populateResourceSubjectDropdown() {
  const select = document.getElementById('admin-resource-subject');
  if (!select) {
    console.warn('[Resources] Dropdown not found: admin-resource-subject');
    return;
  }
  const subjects = getAllSubjects();
  console.log('[Resources] Populating dropdown with', subjects.length, 'subjects');
  if (!subjects || subjects.length === 0) {
    select.innerHTML = '<option value="">Không có môn học nào</option>';
    return;
  }
  select.innerHTML = subjects.map(s => `<option value="${s.id}">${s.code} — ${s.name}</option>`).join('');
}

function renderAdminResourceList() {
  const el = document.getElementById('admin-resource-list');
  const subjectEl = document.getElementById('admin-resource-subject');
  if (!el || !subjectEl) return;
  const subjectId = subjectEl.value;
  const resources = DB.getResources(subjectId);

  if (!resources.length) {
    el.innerHTML = `<div class="text-xs text-muted text-center py-4">Chưa có tài nguyên nào cho môn này.</div>`;
    return;
  }
  const typeIcon = { slide: '🎞️', outline: '📄', exam: '📝', video: '▶️', reference: '📚' };
  el.innerHTML = resources.map(r => `
    <div class="resource-item">
      <div class="res-icon">${typeIcon[r.type] || '📁'}</div>
      <div class="res-body">
        <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.name)}</a>
        <div class="res-meta">${r.type}${r.year ? ' &middot; ' + r.year : ''} &middot; ${new Date(r.createdAt).toLocaleDateString('vi-VN')}</div>
      </div>
      <button class="btn btn-danger btn-xs" onclick="adminDeleteResource('${r.id}')"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join('');
}

let _currentResourceInputMode = 'url';
function switchResourceInputMode(mode) {
  _currentResourceInputMode = mode;
  ['url', 'file', 'editor'].forEach(m => {
    const box = document.getElementById(`resinput-${m}`);
    const btn = document.getElementById(`resmode-${m}`);
    if (box) box.style.display = m === mode ? '' : 'none';
    if (btn) btn.classList.toggle('active', m === mode);
  });
  if (mode === 'editor') {
    setTimeout(() => _initTinyMCEEditors(), 100);
  }
}

async function adminSaveResource() {
  const subjectId = document.getElementById('admin-resource-subject')?.value;
  const type = document.getElementById('admin-resource-type')?.value;
  const name = document.getElementById('admin-resource-name')?.value.trim();
  const year = document.getElementById('admin-resource-year')?.value.trim();

  if (!subjectId || !name) { showToast('Vui lòng chọn Môn học và nhập Tên tài nguyên!', 'error'); return; }

  let url = '';
  let content = '';
  let fileName = '';

  if (_currentResourceInputMode === 'url') {
    url = document.getElementById('admin-resource-url')?.value.trim();
    if (!url) { showToast('Vui lòng nhập Link URL tài nguyên!', 'error'); return; }
  } else if (_currentResourceInputMode === 'file') {
    const fileInput = document.getElementById('admin-resource-file-input');
    if (fileInput && fileInput.files && fileInput.files.length) {
      const file = fileInput.files[0];
      fileName = file.name;
      try {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = e => res(e.target.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        url = dataUrl;
      } catch {
        url = '';
      }
    } else {
      showToast('Vui lòng chọn File tài liệu tải lên!', 'error'); return;
    }
  } else if (_currentResourceInputMode === 'editor') {
    if (_adminTinyMCEResource) {
      content = _adminTinyMCEResource.getContent();
      if (!_adminTinyMCEResource.getContent({format: 'text'}).trim()) {
        showToast('Nội dung soạn thảo không được để trống!', 'error'); return;
      }
    }
  }

  DB.saveResource({
    subjectId,
    type,
    name,
    url,
    content,
    fileName,
    year,
    inputMode: _currentResourceInputMode,
    author: NavController.currentUser?.name || 'Admin'
  });

  showToast('🎉 Đã lưu tài nguyên và đồng bộ 100% lên Server Cloud!', 'success');
  document.getElementById('admin-resource-name').value = '';
  document.getElementById('admin-resource-url').value = '';
  document.getElementById('admin-resource-year').value = '';
  if (_adminTinyMCEResource) _adminTinyMCEResource.setContent('');
  const fileInput = document.getElementById('admin-resource-file-input');
  if (fileInput) fileInput.value = '';
  renderAdminResourceList();
}

function adminDeleteResource(id) {
  if (!confirm('Xóa tài nguyên này?')) return;
  DB.deleteResource(id);
  renderAdminResourceList();
  showToast('Đã xóa tài nguyên.', 'info');
}

/* ─── AI BANK 4-STEP WORKFLOW ──────────────────────────────────────────────── */
let _bankExtractedText = '';
let _bankGeneratedQuestions = [];

function _populateBankSubjectDropdown() {
  const select = document.getElementById('admin-bank-subject');
  if (!select) return;
  const subjects = getAllSubjects();
  select.innerHTML = subjects.map(s => `<option value="${s.id}">${s.code} — ${s.name}</option>`).join('');
}

function switchBankSourceMode(mode) {
  ['file', 'paste', 'url'].forEach(m => {
    document.getElementById(`bank-source-${m}`).style.display = m === mode ? '' : 'none';
    document.getElementById(`srcmode-${m}`).classList.toggle('active', m === mode);
  });
}

async function adminBankExtractFile() {
  const fileInput = document.getElementById('admin-bank-file');
  if (!fileInput?.files?.length) { showToast('Chọn file trước!', 'error'); return; }
  const file = fileInput.files[0];
  const preview = document.getElementById('admin-bank-file-preview');
  preview.style.display = '';
  preview.textContent = '⏳ Đang đọc file...';

  try {
    let text = '';
    if (file.name.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        text += tc.items.map(s => s.str).join(' ') + '\n';
      }
    } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      text = result.value;
    } else {
      text = await file.text();
    }
    _bankExtractedText = text.slice(0, 80000);
    preview.textContent = `✅ Đã đọc ${_bankExtractedText.length} ký tự.\n\n${_bankExtractedText.slice(0, 500)}...`;
    showToast('✅ Đã bóc tách nội dung file thành công!', 'success');
  } catch (e) {
    preview.textContent = '❌ Lỗi đọc file: ' + e.message;
    showToast('Lỗi đọc file: ' + e.message, 'error');
  }
}

async function adminBankFetchURL() {
  const urlInput = document.getElementById('admin-bank-url');
  const status = document.getElementById('admin-bank-url-status');
  const preview = document.getElementById('admin-bank-url-preview');
  const url = urlInput?.value?.trim();
  if (!url) { showToast('Nhập URL trước!', 'error'); return; }

  status.textContent = '⏳ Đang dùng Jina AI Reader để đọc trang web...';
  status.style.color = 'var(--text-muted)';
  preview.style.display = 'none';

  try {
    const content = await fetchWebContent(url);
    _bankExtractedText = content;
    preview.style.display = '';
    preview.textContent = `✅ Đã đọc ${content.length} ký tự từ URL.\n\n${content.slice(0, 600)}...`;
    status.textContent = `✅ Thành công! Đọc được ${content.length.toLocaleString()} ký tự.`;
    status.style.color = 'var(--success)';
    showToast('✅ Jina AI đã đọc xong nội dung trang web!', 'success');
  } catch (e) {
    status.textContent = '❌ Không thể đọc URL: ' + e.message + '. Hãy thử paste nội dung thủ công.';
    status.style.color = 'var(--danger)';
  }
}

function adminBankGoStep(stepNum) {
  const panels = [1, 2, 3, 4];
  panels.forEach(n => {
    const panel = document.getElementById(`admin-bank-panel-${n}`);
    const step = document.getElementById(`bank-step-${n}`);
    if (panel) panel.style.display = n === stepNum ? '' : 'none';
    if (step) {
      step.classList.toggle('active', n === stepNum);
      step.classList.toggle('done', n < stepNum);
    }
  });

  if (stepNum === 2) _populateBankSubjectDropdown();
  if (stepNum === 3) _renderBankReviewList();
  if (stepNum === 4) _renderBankSummary();
}

function setAdminBankCount(n) {
  const input = document.getElementById('admin-bank-count');
  if (input) { input.value = n; }
  const est = document.getElementById('bank-est-count');
  if (est) est.textContent = n;
}

async function adminBankGenerateQuestions() {
  const sourceText = _bankExtractedText ||
    document.getElementById('admin-bank-paste-text')?.value?.trim() ||
    '';

  if (!sourceText || sourceText.length < 100) {
    showToast('Cần ít nhất 100 ký tự nội dung nguồn để sinh câu hỏi!', 'error');
    return;
  }

  const count = parseInt(document.getElementById('admin-bank-count')?.value) || 20;
  const difficulty = document.getElementById('admin-bank-difficulty')?.value || 'mixed';
  const model = document.getElementById('admin-bank-model')?.value || 'google/gemini-2.0-flash-exp:free';
  const subjectId = document.getElementById('admin-bank-subject')?.value || DB.getActiveSubject();
  const subjectName = getAllSubjects().find(s => s.id === subjectId)?.name || subjectId;

  const difficultyText = { mixed: 'hỗn hợp (dễ/trung bình/khó)', easy: 'dễ', medium: 'trung bình', hard: 'khó' }[difficulty] || 'hỗn hợp';

  const btn = document.querySelector('#admin-bank-panel-2 .btn-success');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI đang sinh câu hỏi...'; }

  try {
    const prompt = `Bạn là chuyên gia soạn câu hỏi trắc nghiệm cho môn học "${subjectName}".
Dựa trên nội dung giáo trình sau, hãy sinh chính xác ${count} câu hỏi trắc nghiệm độ khó ${difficultyText}.

YÊU CẦU FORMAT — Trả về JSON hợp lệ (chỉ JSON, không có text khác):
[
  {
    "q": "Câu hỏi đầy đủ?",
    "options": ["A. Đáp án A", "B. Đáp án B", "C. Đáp án C", "D. Đáp án D"],
    "correct": 0,
    "difficulty": 1,
    "exp": "Giải thích ngắn gọn tại sao đáp án đúng."
  }
]
Trong đó: correct = index 0-3, difficulty = 1(dễ) 2(trung bình) 3(khó).

NỘI DUNG GIÁO TRÌNH:
---
${sourceText.slice(0, 12000)}
---

Sinh đúng ${count} câu. Chỉ trả về JSON array, không có bình luận nào khác.`;

    const settings = DB.getSettings();
    const apiKey = settings.apiKey || '';
    if (!apiKey) { showToast('Chưa cài đặt API Key! Vào Cài đặt tài khoản để thêm.', 'error'); return; }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': location.href },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 16000,
      }),
    });

    if (!res.ok) throw new Error(`API lỗi ${res.status}`);
    const data = await res.json();
    let rawText = data.choices?.[0]?.message?.content || '';

    // Parse JSON từ response
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Không tìm thấy JSON hợp lệ trong phản hồi AI');
    const questions = JSON.parse(match[0]);
    if (!Array.isArray(questions) || !questions.length) throw new Error('Danh sách câu hỏi rỗng');

    _bankGeneratedQuestions = questions.map((q, i) => ({
      ...q,
      subjectId,
      _tempIdx: i,
      _markedDelete: false,
    }));

    showToast(`🎉 AI đã sinh ${_bankGeneratedQuestions.length} câu hỏi thành công!`, 'success');
    adminBankGoStep(3);
  } catch (e) {
    showToast('Lỗi sinh câu hỏi: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-robot"></i> Bắt Đầu Sinh Câu Hỏi'; }
  }
}

function _renderBankReviewList() {
  const el = document.getElementById('admin-bank-questions-list');
  if (!el) return;
  if (!_bankGeneratedQuestions.length) {
    el.innerHTML = `<div class="text-xs text-muted text-center py-4">Không có câu hỏi nào. Quay lại bước trước và chạy AI.</div>`;
    return;
  }

  el.innerHTML = _bankGeneratedQuestions.map((q, i) => `
    <div class="bank-review-card ${q._markedDelete ? 'marked-delete' : ''}" id="brc-${i}">
      <div class="brc-header">
        <span class="brc-num">Câu ${i + 1} / ${_bankGeneratedQuestions.length} &nbsp; 
          <span class="text-xs" style="color:${q.difficulty===3?'var(--danger)':q.difficulty===2?'var(--accent)':'var(--success)'}">
            ${q.difficulty === 3 ? '🔥 Khó' : q.difficulty === 2 ? '🤔 TB' : '😊 Dễ'}
          </span>
        </span>
        <button class="btn btn-danger btn-xs" onclick="_bankToggleDelete(${i})">${q._markedDelete ? '↩️ Khôi phục' : '🗑️ Xóa câu'}</button>
      </div>
      <textarea class="brc-q" rows="2" onchange="_bankUpdateQ(${i},'q',this.value)">${escapeHtml(q.q || '')}</textarea>
      <div class="brc-options">
        ${(q.options || []).map((opt, oi) => `
          <div class="brc-option">
            <input type="radio" name="correct-${i}" value="${oi}" ${q.correct === oi ? 'checked' : ''} onchange="_bankUpdateQ(${i},'correct',${oi})">
            <input type="text" value="${escapeHtml(opt)}" onchange="_bankUpdateQ(${i},'opt${oi}',this.value)">
          </div>
        `).join('')}
      </div>
      <textarea class="brc-exp" rows="2" placeholder="Giải thích..." onchange="_bankUpdateQ(${i},'exp',this.value)">${escapeHtml(q.exp || '')}</textarea>
    </div>
  `).join('');

  _updateBankCounts();
}

function _bankToggleDelete(idx) {
  _bankGeneratedQuestions[idx]._markedDelete = !_bankGeneratedQuestions[idx]._markedDelete;
  const card = document.getElementById(`brc-${idx}`);
  if (card) card.classList.toggle('marked-delete', _bankGeneratedQuestions[idx]._markedDelete);
  _updateBankCounts();
}

function _bankUpdateQ(idx, field, val) {
  const q = _bankGeneratedQuestions[idx];
  if (!q) return;
  if (field === 'q') q.q = val;
  else if (field === 'exp') q.exp = val;
  else if (field === 'correct') q.correct = parseInt(val);
  else if (field.startsWith('opt')) {
    const oi = parseInt(field.replace('opt', ''));
    if (!q.options) q.options = [];
    q.options[oi] = val;
  }
  _updateBankCounts();
}

function _updateBankCounts() {
  const remaining = _bankGeneratedQuestions.filter(q => !q._markedDelete).length;
  const remEl = document.getElementById('bank-remaining-count');
  const confEl = document.getElementById('bank-confirm-count');
  if (remEl) remEl.textContent = remaining;
  if (confEl) confEl.textContent = remaining;
}

function adminBankAddBlankQuestion() {
  _bankGeneratedQuestions.push({
    q: 'Câu hỏi mới...',
    options: ['A. Đáp án A', 'B. Đáp án B', 'C. Đáp án C', 'D. Đáp án D'],
    correct: 0,
    difficulty: 1,
    exp: '',
    subjectId: document.getElementById('admin-bank-subject')?.value || DB.getActiveSubject(),
    _tempIdx: _bankGeneratedQuestions.length,
    _markedDelete: false,
  });
  _renderBankReviewList();
}

function _renderBankSummary() {
  const el = document.getElementById('admin-bank-summary');
  if (!el) return;
  const valid = _bankGeneratedQuestions.filter(q => !q._markedDelete);
  const subjectId = valid[0]?.subjectId || '';
  const subjectName = getAllSubjects().find(s => s.id === subjectId)?.name || subjectId;
  const byDiff = { 1: 0, 2: 0, 3: 0 };
  valid.forEach(q => { byDiff[q.difficulty || 1]++; });
  el.innerHTML = `
    <div class="grid-2 gap-3">
      <div><div class="text-xs text-muted">Môn học đích</div><div class="font-bold">${escapeHtml(subjectName)}</div></div>
      <div><div class="text-xs text-muted">Tổng câu sẽ lưu</div><div class="font-bold text-primary text-xl">${valid.length} câu</div></div>
      <div><div class="text-xs text-muted">Dễ</div><div class="font-bold text-success">${byDiff[1]} câu</div></div>
      <div><div class="text-xs text-muted">Trung bình</div><div class="font-bold" style="color:var(--accent)">${byDiff[2]} câu</div></div>
      <div><div class="text-xs text-muted">Khó</div><div class="font-bold text-danger">${byDiff[3]} câu</div></div>
    </div>
  `;
}

async function adminBankConfirmSave() {
  const valid = _bankGeneratedQuestions.filter(q => !q._markedDelete);
  if (!valid.length) { showToast('Không có câu hỏi hợp lệ để lưu!', 'error'); return; }

  const btn = document.getElementById('admin-bank-confirm-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu vào kho...'; }

  try {
    const added = DB.addQuestions(valid.map(q => {
      const { _tempIdx, _markedDelete, ...clean } = q;
      return clean;
    }), { skipSync: false });

    showToast(`🎉 Đã lưu ${added} câu hỏi vào kho và đồng bộ lên Server Cloud thành công!`, 'success');
    _bankGeneratedQuestions = [];
    _bankExtractedText = '';
    adminBankGoStep(1);
    renderAdminDashboard();
  } catch (e) {
    showToast('Lỗi lưu câu hỏi: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-database"></i> Xác Nhận Lưu Vào Kho & Đồng Bộ Server Cloud'; }
  }
}

/* ─── USER RESOURCE VIEWER MODAL CONTROLLER ───────────────────────────────── */
function openUserResourceViewer(subjectId, category) {
  const subject = getAllSubjects().find(s => s.id === subjectId) || { code: subjectId, name: 'Môn học' };
  const allResources = DB.getResources(subjectId);
  const filtered = allResources.filter(r => r.type === category);

  const categoryNames = {
    info: 'ℹ️ Thông tin môn học & Đề cương',
    lecture: '📖 Bài giảng ôn tập & Slide',
    exam: '📝 Đề thi các năm',
    quiz: '🎯 Ngân hàng kiểm tra ôn tập'
  };

  const codeEl = document.getElementById('resource-viewer-subject-code');
  const titleEl = document.getElementById('resource-viewer-title');
  const listEl = document.getElementById('resource-viewer-content-list');

  if (codeEl) codeEl.textContent = `${subject.code} — ${subject.name}`;
  if (titleEl) titleEl.textContent = categoryNames[category] || 'Nội dung tài nguyên';

  if (!filtered.length) {
    if (listEl) {
      listEl.innerHTML = `
        <div class="text-center py-5">
          <div style="font-size:36px;margin-bottom:8px;">⏳</div>
          <h4 class="font-bold text-md">Admin chưa cập nhật tài nguyên trong mục này</h4>
          <p class="text-xs text-muted mt-1">Dữ liệu sẽ được Admin cập nhật và đồng bộ lên Server Cloud sớm nhất.</p>
        </div>
      `;
    }
  } else {
    if (listEl) {
      listEl.innerHTML = filtered.map(r => `
        <div class="card card-sm mb-3" style="background:var(--bg-subtle);border:1px solid var(--border);">
          <div class="flex justify-between items-start mb-2">
            <div>
              <h4 class="font-bold text-sm text-primary">${escapeHtml(r.name)}</h4>
              <div class="text-xs text-muted mt-1">
                📅 Đăng ngày: ${new Date(r.createdAt).toLocaleDateString('vi-VN')}
                ${r.year ? ` &middot; Năm học: <strong>${escapeHtml(r.year)}</strong>` : ''}
                ${r.author ? ` &middot; Người đăng: <strong>${escapeHtml(r.author)}</strong>` : ''}
              </div>
            </div>
            ${r.url ? `
              <a href="${escapeHtml(r.url)}" download="${escapeHtml(r.fileName || r.name)}" target="_blank" rel="noopener" class="btn btn-primary btn-xs font-bold" style="white-space:nowrap;">
                <i class="${r.inputMode === 'file' ? 'fa-solid fa-download' : 'fa-solid fa-arrow-up-right-from-square'}"></i> ${r.inputMode === 'file' ? 'Tải File Về' : 'Mở Link / Xem File'}
              </a>
            ` : ''}
          </div>
          ${r.content ? `<div class="document-paper-view mt-3 mb-2">${r.content}</div>` : ''}
          ${r.description ? `<p class="text-xs text-secondary mt-2">${escapeHtml(r.description)}</p>` : ''}
        </div>
      `).join('');
    }
  }

  const modal = document.getElementById('modal-subject-resource-viewer');
  if (modal) modal.classList.add('open');
}

// Expose internal functions to window for inline event handlers
window._bankToggleDelete = _bankToggleDelete;
window._bankUpdateQ = _bankUpdateQ;
window.adminDeleteAnnouncement = adminDeleteAnnouncement;
window.adminEditArticle = adminEditArticle;
window.openUserResourceViewer = openUserResourceViewer;

// Boot
document.addEventListener('DOMContentLoaded', init);


// Debug helper: Monitor cover URL input changes
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const coverInput = document.getElementById('admin-article-cover');
      if (coverInput) {
        let lastValue = '';
        
        // Monitor all changes
        const observer = new MutationObserver(() => {
          const currentValue = coverInput.value;
          if (currentValue !== lastValue) {
            console.log('[DEBUG] Cover URL changed:', {
              from: lastValue,
              to: currentValue,
              stack: new Error().stack
            });
            lastValue = currentValue;
          }
        });
        
        observer.observe(coverInput, { 
          attributes: true, 
          attributeFilter: ['value'] 
        });
        
        // Also monitor input events
        coverInput.addEventListener('input', (e) => {
          console.log('[DEBUG] User typing cover URL:', e.target.value);
          lastValue = e.target.value;
        });
        
        // Monitor value property changes
        let internalValue = coverInput.value;
        Object.defineProperty(coverInput, 'value', {
          get() {
            return internalValue;
          },
          set(newValue) {
            if (internalValue !== newValue) {
              console.log('[DEBUG] Cover value setter called:', {
                from: internalValue,
                to: newValue,
                stack: new Error().stack.split('\n').slice(2, 5).join('\n')
              });
              internalValue = newValue;
              coverInput.setAttribute('value', newValue);
            }
          },
          configurable: true
        });
      }
    }, 1000);
  });
}


/* ════════════════════════════════════════════════════
   EXPOSE ADMIN FUNCTIONS TO WINDOW (for inline onclick)
════════════════════════════════════════════════════ */
window.previewArticleCover = previewArticleCover;
window.adminOpenArticleEditor = adminOpenArticleEditor;
window.adminEditArticle = adminEditArticle;
window.adminCloseArticleEditor = adminCloseArticleEditor;
window.adminSaveArticle = adminSaveArticle;
window.adminDeleteArticle = adminDeleteArticle;
window.renderAdminArticleList = renderAdminArticleList;
