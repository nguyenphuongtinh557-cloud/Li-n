/**
 * app.js — Main Application Controller
 * Điều phối toàn bộ logic của ứng dụng
 */

import { DB } from './modules/db.js?v=20260908subject-details-api1';
import { Generator } from './modules/generator.js';
import { ExamEngine, ExamTimer } from './modules/exam.js';
import { SEED_QUESTIONS } from './data/seed_questions.js';
import { ceraChat, ceraAnalyzeImage, verifyAndFixQuestion, setCurrentQuestion } from './modules/cera.js';
import { pullFromGitHub, pullAdminEdits, fetchWebContent, pullResourcesFromServer, pullArticlesFromServer, pullAnnouncementsFromServer, pullUserRolesFromServer, pullFeedbacksFromServer, pullSubjectDetailsFromServer } from './modules/sync.js?v=20260908subject-details-api1';
import { initAdminAuth } from './modules/admin.js';
import { SUBJECTS_REGISTRY, KNOWLEDGE_BLOCKS, getAllSubjects, getSubjectById, getSubjectsByBlock } from './modules/subjects.js?v=20260901c';
import { NavController } from './modules/navigation.js';
import { AuthModule, getUserRole } from './modules/auth.js';
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

  // Cấu hình trang môn học công khai là nguồn dữ liệu dùng chung cho tất cả phiên.
  // Không ghi ngược lên server tại đây: chỉ merge bản đã được Admin xuất bản.
  try {
    const remoteSubjectDetails = await pullSubjectDetailsFromServer();
    if (remoteSubjectDetails && !Array.isArray(remoteSubjectDetails)) {
      DB.mergeSubjectDetailsFromServer(remoteSubjectDetails);
      console.log('[Subject details] Đã tải cấu hình môn học công khai từ server.');
    }
  } catch (e) {
    console.warn('[Subject details] Không thể tải cấu hình môn học từ server:', e);
  }

  // Kéo thông báo hệ thống mới nhất; nếu server chưa có file, giữ/tạo 2 thư trải nghiệm cục bộ.
  const demoAnnouncements = [
    { id: 'DEMO_WELCOME_2026', title: 'Chào mừng bạn đến với FTECA 24', content: '<p><strong>Xin chào sinh viên,</strong></p><p>Chúng tôi rất vui khi bạn đã có mặt tại FTECA 24. Hãy bắt đầu khám phá tài liệu, ngân hàng câu hỏi và các khu vực ôn tập phù hợp với mình.</p><p>Chúc bạn học tập hiệu quả!</p><p><strong>Ban Quản trị FTECA 24</strong></p>', type: 'success', category: 'Thông báo hệ thống', scope: 'all', excerpt: 'Cùng bắt đầu hành trình học tập và ôn luyện trên FTECA 24.', createdAt: '2026-09-02T05:00:00.000Z', author: 'Admin' },
    { id: 'DEMO_MATERIALS_2026', title: 'Tài liệu học tập mới đã sẵn sàng', content: '<p><strong>Thông báo mới,</strong></p><p>Một số tài liệu và nội dung ôn tập đã được cập nhật. Bạn có thể truy cập khu vực Ôn tập & kiểm tra để xem các nội dung phù hợp.</p><p>Nếu cần hỗ trợ, hãy gửi phản hồi cho đội ngũ quản trị.</p>', type: 'update', category: 'Cập nhật học tập', scope: 'all', excerpt: 'Khám phá các tài liệu và nội dung ôn tập vừa được cập nhật.', createdAt: '2026-09-01T08:30:00.000Z', author: 'Admin' }
  ];
  try {
    const announcements = await pullAnnouncementsFromServer();
    if (Array.isArray(announcements) && announcements.length) {
      DB.mergeAnnouncementsFromServer(announcements);
    } else if (!DB.getAnnouncements().length) {
      localStorage.setItem('qlcl_system_announcements', JSON.stringify(demoAnnouncements));
    }
  } catch (e) {
    console.warn('[Announcements] Không thể kéo thông báo từ server, dùng thư trải nghiệm cục bộ:', e);
    if (!DB.getAnnouncements().length) localStorage.setItem('qlcl_system_announcements', JSON.stringify(demoAnnouncements));
  }
  if (window.renderNotificationCenter) window.renderNotificationCenter();

  // Apply saved theme
  const settings = DB.getSettings();
  if (settings.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  updateThemeButton(settings.theme === 'dark' ? 'dark' : 'light');

  updateBankCount();
  initSubjectSelector();
  await NavController.init();
  await window.refreshUserRolesFromServer?.();
  await window.refreshAnnouncementsFromServer?.();
  NavController.navigateToPage('home');

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void window.refreshUserRolesFromServer?.();
    void window.refreshAnnouncementsFromServer?.();
  });

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
  let snavId = 'snav-study-space';
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
  else if (tabName === 'feedback') { void openAdminFeedbackInbox(); }
  else if (tabName === 'resources') { 
    _populateResourceSubjectDropdown();
    renderAdminResourceList(); 
  }
  else if (tabName === 'bank') { _populateBankSubjectDropdown(); }
  else if (tabName === 'subject-config') { _initSubjectConfigTab(); }
  else if (tabName === 'interactive-lessons') { adminLoadInteractiveLessons(); }
}
window.refreshUserRolesFromServer = async function() {
  try {
    const serverRoles = await pullUserRolesFromServer();
    if (serverRoles && typeof serverRoles === 'object') DB.mergeUserRolesFromServer(serverRoles);
    if (NavController.currentUser?.email) {
      NavController.currentUser.role = getUserRole(NavController.currentUser.email);
      localStorage.setItem('lien_google_user', JSON.stringify(NavController.currentUser));
      NavController.renderUserAuthZone();
    }
    if (document.getElementById('admin-users-table-body')) renderAdminDashboard();
    return true;
  } catch (error) {
    console.warn('[User roles] Không thể làm mới dữ liệu cloud:', error);
    return false;
  }
};

function renderAdminDashboard() {
  const statUsers = document.getElementById('stat-total-users');
  const statPremium = document.getElementById('stat-premium-users');
  const statQuestions = document.getElementById('stat-total-questions');
  const statSubjects = document.getElementById('stat-total-subjects');

  const users = DB.getAllRegisteredUsers();
  const premiumEmails = DB.getPremiumEmails().map(e => (e || '').toLowerCase());
  const bank = DB.getBank();
  const subjects = getAllSubjects();

  if (statUsers) statUsers.textContent = users.length;
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

async function grantAdminUserPremium(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return;
  if (DB.getPremiumEmails().map(item => String(item || '').trim().toLowerCase()).includes(cleanEmail)) {
    showToast(`[${cleanEmail}] đã có quyền PREMIUM. Không tạo thông báo mới.`, 'info');
    return;
  }

  const result = await DB.grantPremium(cleanEmail);
  const announcement = await DB.createPremiumRoleAnnouncement(cleanEmail, 'premium_granted');
  const isSynced = result.synced && announcement.synced;
  showToast(isSynced ? `🎉 Đã cấp quyền PREMIUM cho [${cleanEmail}] và gửi thông báo riêng.` : `⚠️ Đã cấp PREMIUM cho [${cleanEmail}] và tạo thông báo cục bộ, nhưng cloud chưa đồng bộ đầy đủ.`, isSynced ? 'success' : 'warning');
  await window.refreshUserRolesFromServer?.();
  renderAdminDashboard();
  if (document.getElementById('notification-center-shell')) renderNotificationCenter();
  if (NavController.currentUser?.email?.toLowerCase() === cleanEmail) NavController.renderUserAuthZone();
}

async function revokeAdminUserPremium(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return;
  if (!DB.getPremiumEmails().map(item => String(item || '').trim().toLowerCase()).includes(cleanEmail)) {
    showToast(`[${cleanEmail}] không có quyền PREMIUM. Không tạo thông báo mới.`, 'info');
    return;
  }

  const result = await DB.revokePremium(cleanEmail);
  const announcement = await DB.createPremiumRoleAnnouncement(cleanEmail, 'premium_revoked');
  const isSynced = result.synced && announcement.synced;
  showToast(isSynced ? `ℹ️ Đã hạ [${cleanEmail}] xuống NEWBIE và gửi thông báo riêng.` : `⚠️ Đã hạ [${cleanEmail}] xuống NEWBIE và tạo thông báo cục bộ, nhưng cloud chưa đồng bộ đầy đủ.`, isSynced ? 'info' : 'warning');
  await window.refreshUserRolesFromServer?.();
  renderAdminDashboard();
  if (document.getElementById('notification-center-shell')) renderNotificationCenter();
  if (NavController.currentUser?.email?.toLowerCase() === cleanEmail) NavController.renderUserAuthZone();
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
  if (!previewContainer || !previewImg) return;

  // Always clear the previous image first: a changed URL must never appear to use the old cover.
  previewContainer.style.display = 'none';
  previewImg.removeAttribute('src');
  previewImg.style.opacity = '1';
  previewImg.style.filter = 'none';

  const cleanUrl = (url || '').trim();
  if (!cleanUrl) return;

  let parsedUrl;
  try {
    parsedUrl = new URL(cleanUrl);
    if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error('unsupported protocol');
  } catch {
    return;
  }

  // Ignore stale asynchronous results when the admin changes the URL again while an image loads.
  const requestId = String(Date.now());
  previewImg.dataset.previewRequestId = requestId;
  const loader = new Image();
  loader.onload = () => {
    if (previewImg.dataset.previewRequestId !== requestId) return;
    previewImg.src = cleanUrl;
    previewImg.alt = 'Xem trước ảnh bìa đã chọn';
    previewContainer.style.display = 'block';
  };
  loader.onerror = () => {
    if (previewImg.dataset.previewRequestId !== requestId) return;
    previewContainer.style.display = 'none';
    showToast('⚠️ Không thể tải ảnh từ URL này. Hãy dùng liên kết ảnh trực tiếp (HTTPS).', 'warning');
  };
  loader.src = cleanUrl;
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

  DB.addAnnouncement({ title, content, type, category: type, scope, author: NavController.currentUser?.name || 'Admin' });
  if (document.getElementById('notification-center-shell')) renderNotificationCenter();
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
        <p>${new Date(a.createdAt).toLocaleDateString('vi-VN')} · ${a.category || a.type || 'info'} · Phạm vi: ${a.scope === 'premium' ? '💎 PREMIUM' : a.scope === 'newbie' ? '🌱 NEWBIE' : '👥 Tất cả'}</p>
      </div>
      <button class="btn btn-danger btn-xs" onclick="adminDeleteAnnouncement('${a.id}')"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join('');
}

function adminDeleteAnnouncement(id) {
  DB.deleteAnnouncement(id);
  if (NotificationCenterState.selectedId === id) NotificationCenterState.selectedId = null;
  renderAdminAnnouncementList();
  if (document.getElementById('notification-center-shell')) renderNotificationCenter();
  showToast('Đã xóa thông báo.', 'info');
}

/* ─── SUPPORT TICKETS ─────────────────────────────────────────────────────── */
async function refreshFeedbacksFromServer({ render = true } = {}) {
  try {
    const remoteFeedbacks = await pullFeedbacksFromServer();
    const merged = DB.mergeFeedbacksFromServer(remoteFeedbacks);
    if (render && document.getElementById('report-ticket-history-list')) renderUserTicketHistory();
    if (render && document.getElementById('admin-feedback-list')) renderAdminFeedbackInbox();
    return merged;
  } catch (error) {
    console.warn('[Feedback] Không thể tải ticket từ cloud:', error);
    return null;
  }
}
window.refreshFeedbacksFromServer = refreshFeedbacksFromServer;

function renderUserTicketHistory() {
  const container = document.getElementById('report-ticket-history-list'); if (!container) return;
  const user = NavController.currentUser || {}; const email = (user.email || '').toLowerCase();
  const tickets = DB.getFeedbacks().filter(f => email && (f.userEmail || '').toLowerCase() === email);
  document.getElementById('report-ticket-count').textContent = tickets.length;
  const statusLabel = { submitted:'Đã gửi', acknowledged:'Đã ghi nhận', processing:'Đang xử lý', fixed:'Đã sửa', unable:'Không tái hiện được' };
  container.innerHTML = tickets.length ? tickets.map(t => `<article class="report-history-item"><div><strong>${escapeHtml(t.ticketCode || t.id)}</strong><span class="report-status ${t.status}">${statusLabel[t.status] || t.status}</span></div><h3>${escapeHtml(t.title || t.content)}</h3><p>${new Date(t.updatedAt || t.createdAt).toLocaleString('vi-VN')}</p></article>`).join('') : '<div class="report-history-empty">Chưa có ticket nào. Ticket mới sẽ xuất hiện ở đây.</div>';
}
async function submitSupportTicket(event) {
  event.preventDefault(); const user = NavController.currentUser;
  if (!user?.email) { showToast('Vui lòng đăng nhập trước khi gửi ticket để nhận phản hồi riêng.', 'error'); return; }
  const content = document.getElementById('report-ticket-content').value.trim(); const title = document.getElementById('report-ticket-title').value.trim();
  if (!title || !content) return;
  const result = await DB.submitFeedback({ type: document.getElementById('report-ticket-type').value, priority: document.getElementById('report-ticket-priority').value, title, content, page: document.getElementById('report-ticket-page').value || location.pathname, device: navigator.userAgent, userName: user.name || user.displayName || user.email, userEmail: user.email });
  document.getElementById('report-ticket-result').textContent = result.synced ? `Đã gửi ${result.item.ticketCode}. Bạn sẽ nhận phản hồi riêng tại Trung tâm Thông báo.` : `Đã lưu ${result.item.ticketCode} trên thiết bị, nhưng chưa đồng bộ đến Admin.`;
  event.target.reset(); document.getElementById('report-ticket-page').value = location.pathname; document.getElementById('report-ticket-device').value = navigator.userAgent;
  renderUserTicketHistory(); showToast(result.synced ? 'Đã gửi ticket hỗ trợ đến Admin.' : 'Ticket chưa đến Admin vì đồng bộ cloud thất bại.', result.synced ? 'success' : 'warning');
}
async function initSupportTicketPage() { const page = document.getElementById('report-ticket-page'), device = document.getElementById('report-ticket-device'); if (page) page.value = location.pathname; if (device) device.value = navigator.userAgent; await refreshFeedbacksFromServer(); renderUserTicketHistory(); }
window.submitSupportTicket = submitSupportTicket;
window.initSupportTicketPage = initSupportTicketPage;

/* ─── FEEDBACK INBOX ───────────────────────────────────────────────────────── */
async function openAdminFeedbackInbox() {
  await refreshFeedbacksFromServer({ render: false });
  renderAdminFeedbackInbox();
}
window.openAdminFeedbackInbox = openAdminFeedbackInbox;

function renderAdminFeedbackInbox() {
  const el = document.getElementById('admin-feedback-list');
  const filterEl = document.getElementById('admin-feedback-filter');
  const filter = filterEl ? filterEl.value : 'all';
  if (!el) return;

  let feedbacks = DB.getFeedbacks();
  if (['submitted', 'acknowledged', 'processing', 'fixed', 'unable'].includes(filter)) {
    feedbacks = feedbacks.filter(f => f.status === filter);
  } else if (['bug', 'content', 'feature', 'other'].includes(filter)) {
    feedbacks = feedbacks.filter(f => f.type === filter);
  }

  // Update badge
  const unreadCount = DB.getFeedbacks().filter(f => f.status === 'submitted').length;
  const badge = document.getElementById('admin-feedback-badge');
  if (badge) { badge.textContent = unreadCount; badge.style.display = unreadCount > 0 ? 'inline-flex' : 'none'; }

  if (!feedbacks.length) {
    el.innerHTML = `<div class="text-xs text-muted text-center py-4">${filter === 'all' ? 'Chưa có phản hồi nào từ học viên.' : 'Không có phản hồi nào ở trạng thái này.'}</div>`;
    return;
  }

  const typeIcon = { bug: '🐛', content: '📚', feature: '✨', other: '📝' };
  const statusLabel = { submitted:'Mới gửi', acknowledged:'Đã ghi nhận', processing:'Đang xử lý', fixed:'Đã sửa', unable:'Không tái hiện được' };
  el.innerHTML = feedbacks.map(f => `
    <article class="support-admin-ticket">
      <header><div><span class="fb-icon">${typeIcon[f.type] || '💬'}</span><strong>${escapeHtml(f.ticketCode || f.id)} · ${escapeHtml(f.title || 'Phản hồi')}</strong></div><span class="report-status ${f.status}">${statusLabel[f.status] || f.status}</span></header>
      <p class="support-admin-user">${escapeHtml(f.userName)} · ${escapeHtml(f.userEmail)} · ${escapeHtml(f.priority || 'normal')}</p><p>${escapeHtml(f.content)}</p><small>${escapeHtml(f.page || '')} · ${new Date(f.createdAt).toLocaleString('vi-VN')}</small>
      <div class="support-admin-history">${(f.history || []).map(h => `<span>${escapeHtml(h.status)} · ${escapeHtml(h.message)} · ${new Date(h.at).toLocaleString('vi-VN')}</span>`).join('')}</div>
      <textarea id="admin-response-${f.id}" class="form-textarea" rows="2" placeholder="Ghi chú gửi riêng cho người báo lỗi...">${escapeHtml(f.adminResponse || '')}</textarea>
      <div class="fb-actions">${[['acknowledged','Ghi nhận'],['processing','Đang xử lý'],['fixed','Đã sửa'],['unable','Không tái hiện được']].map(([s,l]) => `<button class="btn btn-secondary btn-xs" onclick="adminMarkFeedback('${f.id}','${s}')">${l}</button>`).join('')}<button class="btn btn-danger btn-xs" onclick="adminDeleteFeedback('${f.id}')"><i class="fa-solid fa-trash"></i></button></div>
    </article>`).join('');
}

async function adminMarkFeedback(id, status) {
  const feedback = DB.getFeedbacks().find(f => f.id === id); if (!feedback) return;
  const response = document.getElementById(`admin-response-${id}`)?.value.trim() || '';
  const label = { acknowledged:'Đã ghi nhận', processing:'Đang xử lý', fixed:'Đã sửa', unable:'Không tái hiện được' }[status] || status;
  const result = await DB.updateFeedback(id, { status, adminResponse: response, historyEntry: { status, message: response || `Ticket ${label.toLowerCase()}.`, actor: 'Admin' } });
  if (!result.synced) { showToast('Cập nhật chỉ lưu cục bộ; chưa gửi phản hồi đến học viên.', 'warning'); renderAdminFeedbackInbox(); return; }
  if (feedback.userEmail) {
    const ticketCode = escapeHtml(feedback.ticketCode || feedback.id);
    const ticketTitle = escapeHtml(feedback.title || 'yêu cầu hỗ trợ của bạn');
    const responseBlock = response ? `<p><strong>Nội dung phản hồi từ đội ngũ:</strong><br>${escapeHtml(response)}</p>` : '';
    const statusMessage = {
      acknowledged: 'Chúng tôi đã tiếp nhận yêu cầu và sẽ sớm cập nhật thêm thông tin đến bạn.',
      processing: 'Yêu cầu đang được đội ngũ kiểm tra và xử lý. Cảm ơn bạn đã kiên nhẫn chờ đợi.',
      fixed: 'Vấn đề đã được xử lý. Xin cảm ơn bạn đã phản hồi để chúng tôi cải thiện hệ thống.',
      unable: 'Đội ngũ hiện chưa thể tái hiện vấn đề. Nếu thuận tiện, bạn vui lòng bổ sung thêm thông tin hoặc ảnh minh họa để chúng tôi hỗ trợ tốt hơn.'
    }[status] || 'Yêu cầu của bạn đã được cập nhật.';
    await DB.addAnnouncement({ title: `Cập nhật yêu cầu hỗ trợ ${ticketCode}`, content: `<p><strong>Xin chào bạn,</strong></p><p>Cảm ơn bạn đã gửi phản hồi về “<strong>${ticketTitle}</strong>”. Yêu cầu <strong>${ticketCode}</strong> hiện ở trạng thái: <strong>${label}</strong>.</p><p>${statusMessage}</p>${responseBlock}<p>Trân trọng,<br><strong>Đội ngũ hỗ trợ FTECA 24</strong></p>`, type: status === 'fixed' ? 'success' : 'info', category: 'Phản hồi ticket', scope: 'user', recipientEmail: feedback.userEmail, author: 'Đội ngũ hỗ trợ FTECA 24' });
  }
  await refreshFeedbacksFromServer(); renderAdminDashboard(); if (document.getElementById('notification-center-shell')) renderNotificationCenter();
  showToast('Đã đồng bộ phản hồi ticket.', 'success');
}

async function adminDeleteFeedback(id) {
  if (!confirm('Xóa phản hồi này?')) return;
  const result = await DB.deleteFeedback(id);
  showToast(result.synced ? 'Đã xóa ticket và đồng bộ cloud.' : 'Đã xóa cục bộ, cloud chưa đồng bộ.', result.synced ? 'info' : 'warning');
  if (result.synced) await refreshFeedbacksFromServer(); else renderAdminFeedbackInbox();
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

/* ─── STUDY READER ───────────────────────────────────────────────────────── */
let _studyReaderContext = null;
let _studyReaderNoteTimer = null;
let _studyReaderAnnotationEnabled = false;
let _studyReaderAnnotationColor = '#10b981';

function isStudyReaderAllowedUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(String(value || '')).protocol); } catch { return false; }
}
function buildLessonOutline(blocks = []) {
  return (Array.isArray(blocks) ? blocks : []).filter(b => b?.type === 'heading')
    .map((b, i) => ({ id: `reader-heading-${i}`, level: String(b.level || 'h2').toLowerCase() === 'h3' ? 'h3' : 'h2', title: String(b.content || '').replace(/<[^>]*>/g, '').trim() || `Phần ${i + 1}` }));
}
function getStudyReaderDetails(context = {}) {
  const details = DB.getSubjectDetails(context.subjectId) || {};
  const resources = DB.getResources(context.subjectId).filter(r => r.readerConfig?.visibility !== 'draft');
  const resource = context.resourceId ? resources.find(r => r.id === context.resourceId) : null;
  let found = null;
  for (const chapter of details.chapters || []) for (const lesson of chapter.lessons || []) if (lesson.id === (context.lessonId || resource?.readerConfig?.lessonId)) found = { chapter, lesson };
  if (!found && !resource) { const chapter = (details.chapters || []).find(c => c.lessons?.length); if (chapter) found = { chapter, lesson: chapter.lessons[0] }; }
  return { ...context, details, resources, resource, lesson: found?.lesson || null, chapterId: found?.chapter?.id || context.chapterId || resource?.readerConfig?.chapterId || null };
}
function stripStudyReaderText(value) { const el = document.createElement('div'); el.innerHTML = String(value || ''); return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
function extractStudyReaderText(context = _studyReaderContext || {}) {
  const data = getStudyReaderDetails(context);
  return data.resource ? [data.resource.name, stripStudyReaderText(data.resource.content), data.resource.description].filter(Boolean).join('\n\n') : [data.lesson?.title, ...(data.lesson?.blocks || []).map(b => stripStudyReaderText(b.content))].filter(Boolean).join('\n\n');
}
function safeStudyReaderRichText(html) {
  const template = document.createElement('template'); template.innerHTML = String(html || '');
  const allowed = new Set(['P','BR','STRONG','B','EM','I','U','UL','OL','LI','H2','H3','BLOCKQUOTE','PRE','CODE','A','IMG']);
  template.content.querySelectorAll('*').forEach(node => {
    if (!allowed.has(node.tagName)) return node.replaceWith(document.createTextNode(node.textContent || ''));
    [...node.attributes].forEach(attr => { const valid = (node.tagName === 'A' && attr.name === 'href' && isStudyReaderAllowedUrl(attr.value)) || (node.tagName === 'IMG' && ['src','alt','title'].includes(attr.name) && (attr.name !== 'src' || isStudyReaderAllowedUrl(attr.value))); if (!valid) node.removeAttribute(attr.name); });
    if (node.tagName === 'A') { node.target = '_blank'; node.rel = 'noopener noreferrer'; }
  }); return template.innerHTML;
}
function studyReaderExternalButton(url) { return isStudyReaderAllowedUrl(url) ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> Mở tài liệu gốc</a>` : ''; }
function renderStudyReaderContent(context = _studyReaderContext || {}) {
  const data = getStudyReaderDetails(context); _studyReaderContext = { ...data, resourceId: data.resource?.id || null, lessonId: data.lesson?.id || null };
  const content = document.getElementById('study-reader-content'); if (!content) return data;
  if (data.resource) {
    const r = data.resource, url = isStudyReaderAllowedUrl(r.url) ? r.url : '', embeddable = url && (/\.pdf(?:[?#]|$)/i.test(url) || /drive\.google\.com|youtu(?:\.be|be\.com)/i.test(url));
    content.innerHTML = `<header class="study-reader-document-head"><span class="study-reader-kicker"><i class="fa-solid fa-file-lines"></i> TÀI LIỆU HỌC TẬP</span><div class="study-reader-doc-number">${escapeHtml(String(r.readerConfig?.order || '•'))}</div><div><h1>${escapeHtml(r.name || 'Tài liệu')}</h1><p>${escapeHtml(r.description || '')}</p></div></header>${r.content ? `<section class="student-reader-body">${safeStudyReaderRichText(r.content)}</section>` : '<div class="study-reader-empty"><div><i class="fa-solid fa-pen-to-square"></i><p>Admin chưa đăng nội dung trọng tâm cho tài liệu này.</p><small>File gốc có thể tải từ nút ở góc trên bên phải.</small></div></div>'}`;
  } else if (data.lesson) {
    const outline = buildLessonOutline(data.lesson.blocks); let n = 0;
    const body = (data.lesson.blocks || []).map(b => { const text = escapeHtml(b.content || '').replace(/\n/g, '<br>'); if (b.type === 'heading') { const h = outline[n++]; return `<${h.level} id="${h.id}" class="interactive-reader-heading">${text}</${h.level}>`; } return b.type === 'legacyHtml' ? `<div class="student-reader-body">${safeStudyReaderRichText(b.content)}</div>` : `<p class="interactive-reader-text">${text}</p>`; }).join('') || '<p class="interactive-reader-text">Bài học chưa có nội dung soạn thảo.</p>';
    content.innerHTML = `<header class="study-reader-document-head"><span class="study-reader-kicker"><i class="fa-solid fa-book-open"></i> BÀI GIẢNG TƯƠNG TÁC</span><div class="study-reader-doc-number">01</div><div><h1>${escapeHtml(data.lesson.title || 'Bài giảng')}</h1></div></header><section class="student-reader-body">${body}</section>`;
  } else content.innerHTML = '<div class="study-reader-empty"><div><i class="fa-solid fa-book-open-reader"></i><p>Chưa có bài giảng hoặc tài liệu đã xuất bản.</p></div></div>';
  restoreStudyReaderHighlights(); mountStudyReaderAnnotationLayer(); return data;
}
function renderStudyReaderToc(context = _studyReaderContext || {}) {
  const data = getStudyReaderDetails(context), list = document.getElementById('study-reader-toc-list'); if (!list) return; list.innerHTML = '';
  const add = (label, action, active = false) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.readerLabel = label.toLocaleLowerCase('vi-VN'); button.textContent = label; button.classList.toggle('active', active); button.onclick = action; list.appendChild(button); };
  (data.details.chapters || []).forEach(chapter => { const heading = document.createElement('div'); heading.className = 'study-reader-toc-chapter'; heading.textContent = chapter.title || 'Chương học'; list.appendChild(heading); (chapter.lessons || []).forEach(lesson => { add(lesson.title || 'Bài học', () => renderStudyReader({ subjectId: data.subjectId, chapterId: chapter.id, lessonId: lesson.id, returnPage: data.returnPage || 'subject-detail' }), data.lesson?.id === lesson.id); if (data.lesson?.id === lesson.id) buildLessonOutline(lesson.blocks).forEach(item => add(`↳ ${item.title}`, () => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))); }); });
  data.resources.forEach(r => add(`📎 ${r.name || 'Tài liệu'}`, () => renderStudyReader({ subjectId: data.subjectId, resourceId: r.id, returnPage: data.returnPage || 'subject-detail' }), data.resource?.id === r.id));
}
function renderStudyReaderLessonSwitcher(context = _studyReaderContext || {}) {
  const data = getStudyReaderDetails(context), rail = document.getElementById('study-reader-lesson-switcher');
  if (!rail) return;
  const lessons = [];
  (data.details.chapters || []).forEach(chapter => (chapter.lessons || []).forEach(lesson => lessons.push({ id: lesson.id, chapterId: chapter.id, title: lesson.title || 'Bài giảng', chapter: chapter.title || 'Bài học' })));
  rail.innerHTML = '';
  rail.hidden = lessons.length < 2;
  lessons.forEach((lesson, index) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `study-reader-lesson-tab${data.lesson?.id === lesson.id ? ' active' : ''}`;
    button.innerHTML = `<b>${String(index + 1).padStart(2, '0')}</b><span><small>${escapeHtml(lesson.chapter)}</small>${escapeHtml(lesson.title)}</span>`;
    button.onclick = () => renderStudyReader({ subjectId: data.subjectId, chapterId: lesson.chapterId, lessonId: lesson.id, returnPage: data.returnPage || 'subject-detail' });
    rail.appendChild(button);
  });
}
function getStudyReaderNote() { return DB.getUserNote('guest', _studyReaderContext); }
function saveStudyReaderNote(patch) { const note = DB.saveUserNote('guest', _studyReaderContext, patch); const status = document.getElementById('study-reader-note-status'); if (status) status.textContent = `Đã lưu ${new Date(note.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`; return note; }
function loadStudyReaderNote() { const input = document.getElementById('study-reader-note-input'), note = getStudyReaderNote(); if (input) input.value = note.text; const status = document.getElementById('study-reader-note-status'); if (status) status.textContent = note.updatedAt ? 'Đã lưu' : 'Chưa lưu'; }
function textOffset(root, node, offset) { const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let total = 0, item; while ((item = walker.nextNode())) { if (item === node) return total + offset; total += item.nodeValue.length; } return -1; }
function rangeForTextAnchor(anchor) { const root = document.getElementById('study-reader-content'); if (!root) return null; const nodes = []; const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node, total = 0, start, end, so, eo; while ((node = walker.nextNode())) nodes.push(node); for (const item of nodes) { const next = total + item.nodeValue.length; if (!start && anchor.start >= total && anchor.start <= next) { start = item; so = anchor.start - total; } if (anchor.end >= total && anchor.end <= next) { end = item; eo = anchor.end - total; break; } total = next; } if (!start || !end) return null; const range = document.createRange(); range.setStart(start, so); range.setEnd(end, eo); return range; }
function restoreStudyReaderHighlights() { getStudyReaderNote().highlights.forEach(anchor => { const range = rangeForTextAnchor(anchor); if (!range || range.collapsed) return; const mark = document.createElement('mark'); mark.className = 'study-reader-highlight'; try { range.surroundContents(mark); } catch {} }); }
function studyReaderCreateNoteFromSelection() { const text = String(window.getSelection?.() || '').trim(), input = document.getElementById('study-reader-note-input'); if (!text || !input) return showToast('Chọn đoạn văn trước khi tạo ghi chú.', 'info'); input.value += `${input.value ? '\n\n' : ''}${text}`; saveStudyReaderNote({ text: input.value }); input.focus(); }
function studyReaderApplyHighlight() { const root = document.getElementById('study-reader-content'), selection = window.getSelection(); if (!root || !selection?.rangeCount || selection.isCollapsed || !root.contains(selection.anchorNode)) return showToast('Chọn đoạn văn trong bài giảng trước khi highlight.', 'info'); const range = selection.getRangeAt(0), start = textOffset(root, range.startContainer, range.startOffset), end = textOffset(root, range.endContainer, range.endOffset); if (start < 0 || end <= start) return; saveStudyReaderNote({ highlights: [...getStudyReaderNote().highlights, { start, end, quote: selection.toString().slice(0, 500) }] }); const mark = document.createElement('mark'); mark.className = 'study-reader-highlight'; try { range.surroundContents(mark); selection.removeAllRanges(); } catch { renderStudyReaderContent(_studyReaderContext); } }
function mountStudyReaderAnnotationLayer() { const root = document.getElementById('study-reader-content'); if (!root) return; root.querySelector('.study-reader-annotation-layer')?.remove(); root.style.position = 'relative'; const canvas = document.createElement('canvas'); canvas.className = 'study-reader-annotation-layer'; canvas.width = root.clientWidth; canvas.height = root.scrollHeight; canvas.style.pointerEvents = _studyReaderAnnotationEnabled ? 'auto' : 'none'; const ctx = canvas.getContext('2d'), strokes = getStudyReaderNote().annotations || []; const draw = stroke => { if (!stroke.points?.length) return; ctx.beginPath(); stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x * canvas.width, p.y * canvas.height) : ctx.moveTo(p.x * canvas.width, p.y * canvas.height)); ctx.strokeStyle = stroke.color || '#1a9b71'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke(); }; strokes.forEach(draw); let active; canvas.onpointerdown = e => { if (!_studyReaderAnnotationEnabled) return; const box = canvas.getBoundingClientRect(); canvas.setPointerCapture(e.pointerId); active = { color: _studyReaderAnnotationColor, points: [{ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }] }; }; canvas.onpointermove = e => { if (!active) return; const box = canvas.getBoundingClientRect(); active.points.push({ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }); ctx.clearRect(0, 0, canvas.width, canvas.height); [...strokes, active].forEach(draw); }; canvas.onpointerup = () => { if (active?.points.length > 1) { strokes.push(active); saveStudyReaderNote({ annotations: strokes }); } active = null; }; root.appendChild(canvas); }
function studyReaderToggleAnnotation() { _studyReaderAnnotationEnabled = !_studyReaderAnnotationEnabled; mountStudyReaderAnnotationLayer(); showToast(_studyReaderAnnotationEnabled ? 'Chế độ vẽ đã bật.' : 'Chế độ vẽ đã tắt.', 'info'); }
function studyReaderUndoAnnotation() { saveStudyReaderNote({ annotations: getStudyReaderNote().annotations.slice(0, -1) }); mountStudyReaderAnnotationLayer(); }
function studyReaderClearAnnotations() { saveStudyReaderNote({ annotations: [] }); mountStudyReaderAnnotationLayer(); }
function bindStudyReaderControls() { document.getElementById('study-reader-back').onclick = () => NavController.closeStudyReader(); const input = document.getElementById('study-reader-note-input'); if (input) input.oninput = () => { clearTimeout(_studyReaderNoteTimer); _studyReaderNoteTimer = setTimeout(() => saveStudyReaderNote({ text: input.value }), 450); }; const find = document.getElementById('study-reader-find'); if (find) find.oninput = () => { const query = find.value.trim().toLocaleLowerCase('vi-VN'); document.querySelectorAll('#study-reader-toc-list button').forEach(b => { const match = !query || b.dataset.readerLabel.includes(query); b.hidden = !match; b.classList.toggle('reader-search-match', Boolean(query && match)); }); }; document.querySelectorAll('[data-reader-action]').forEach(b => b.onclick = ({ note: studyReaderCreateNoteFromSelection, highlight: studyReaderApplyHighlight, annotate: studyReaderToggleAnnotation, undo: studyReaderUndoAnnotation, clear: studyReaderClearAnnotations }[b.dataset.readerAction] || (() => {}))); document.querySelectorAll('[data-annotation-color]').forEach(button => button.onclick = () => { _studyReaderAnnotationColor = button.dataset.annotationColor; document.querySelectorAll('[data-annotation-color]').forEach(item => item.classList.toggle('active', item === button)); if (_studyReaderAnnotationEnabled) mountStudyReaderAnnotationLayer(); }); }
function bindStudyReaderDrawers() {
  const pairs = [['study-reader-toc-toggle', 'study-reader-toc'], ['study-reader-panel-toggle', 'study-reader-right-panel']];
  const close = (trigger, panel) => { panel.classList.remove('open'); trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); };
  pairs.forEach(([triggerId, panelId]) => {
    const trigger = document.getElementById(triggerId), panel = document.getElementById(panelId);
    if (!trigger || !panel) return;
    trigger.onclick = () => { const open = !panel.classList.contains('open'); pairs.forEach(([otherTriggerId, otherPanelId]) => { const other = document.getElementById(otherPanelId), otherTrigger = document.getElementById(otherTriggerId); if (other && other !== panel) other.classList.remove('open'); if (otherTrigger && otherTrigger !== trigger) otherTrigger.setAttribute('aria-expanded', 'false'); }); panel.classList.toggle('open', open); trigger.setAttribute('aria-expanded', String(open)); if (open) panel.focus({ preventScroll: true }); };
    panel.tabIndex = -1;
    panel.onkeydown = event => { if (event.key === 'Escape') { event.preventDefault(); close(trigger, panel); } };
  });
  document.onkeydown = event => { if (event.key !== 'Escape') return; pairs.forEach(([triggerId, panelId]) => { const trigger = document.getElementById(triggerId), panel = document.getElementById(panelId); if (trigger && panel?.classList.contains('open')) { event.preventDefault(); close(trigger, panel); } }); };
}

function renderStudyReaderHeaderResourceLink(context = _studyReaderContext || {}) {
  const link = document.getElementById('study-reader-resource-link');
  if (!link) return;
  const data = getStudyReaderDetails(context);
  const resource = [data.resource, ...(data.resources || [])].find(item => item && isStudyReaderAllowedUrl(item.url));
  if (!resource) { link.hidden = true; link.removeAttribute('href'); return; }
  link.hidden = false;
  link.href = resource.url;
  link.title = `Tải / mở: ${resource.name || 'tài liệu'}`;
  link.querySelector('span').textContent = resource.name ? `Tải: ${resource.name}` : 'Tải tài liệu';
}

function renderStudyReader(context = {}) { _studyReaderContext = { ...context, returnPage: context.returnPage || 'subject-detail' }; const subject = getAllSubjects().find(s => s.id === context.subjectId) || {}; const crumb = document.getElementById('study-reader-crumb'); if (crumb) crumb.textContent = `${subject.code || context.subjectId || ''} · ${subject.name || 'Tài liệu học tập'}`; renderStudyReaderContent(_studyReaderContext); renderStudyReaderToc(_studyReaderContext); renderStudyReaderHeaderResourceLink(_studyReaderContext); bindStudyReaderControls(); bindStudyReaderDrawers(); loadStudyReaderNote(); }
function isReaderResourceSupported(r) { return Boolean(r?.content || isStudyReaderAllowedUrl(r?.url)); }
function openUnsupportedResourceViewer(subjectId, resource) { const modal = document.getElementById('modal-subject-resource-viewer'); if (!modal) return; document.getElementById('resource-viewer-title').textContent = resource.name || 'Tài liệu'; document.getElementById('resource-viewer-subject-code').textContent = subjectId; document.getElementById('resource-viewer-content').innerHTML = `<p>Định dạng này chưa được hỗ trợ trong Study Reader.</p>${studyReaderExternalButton(resource.url)}`; modal.classList.add('open'); }
function openUserResourceViewer(subjectId, category) { if (category === 'quiz') return NavController.startSubjectExam(subjectId); const resources = DB.getResources(subjectId).filter(r => r.type === category && r.readerConfig?.visibility !== 'draft'); const picker = document.createElement('div'); picker.className = 'modal-overlay open study-reader-resource-picker'; picker.innerHTML = '<div class="modal-box"><div class="modal-header"><h2>Chọn tài liệu</h2><button class="btn-icon" type="button" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></div><div class="study-reader-picker-list"></div></div>'; const close = () => picker.remove(); picker.querySelector('.btn-icon').onclick = close; const list = picker.querySelector('.study-reader-picker-list'); (resources.length ? resources : [{ name: category === 'exam' ? 'Chưa có đề thi các năm được đăng' : 'Bài giảng tương tác', fallback: true, empty: category === 'exam' }]).forEach(r => { const button = document.createElement('button'); button.className = 'btn btn-outline'; button.type = 'button'; button.textContent = r.name; button.onclick = () => { close(); if (r.empty) return showToast('Đề thi các năm đang được cập nhật.', 'info'); if (r.fallback) NavController.openStudyReader({ subjectId, returnPage: 'subject-detail' }); else if (isReaderResourceSupported(r)) NavController.openStudyReader({ subjectId, resourceId: r.id, returnPage: 'subject-detail' }); else openUnsupportedResourceViewer(subjectId, r); }; list.appendChild(button); }); document.body.appendChild(picker); }
window.renderStudyReader = renderStudyReader;
window.openUserResourceViewer = openUserResourceViewer;
window.extractStudyReaderText = extractStudyReaderText;
window.renderStudyReaderContent = renderStudyReaderContent;
window.renderStudyReaderToc = renderStudyReaderToc;
window.studyReaderCreateNoteFromSelection = studyReaderCreateNoteFromSelection;
window.studyReaderApplyHighlight = studyReaderApplyHighlight;
window.studyReaderToggleAnnotation = studyReaderToggleAnnotation;
window.studyReaderUndoAnnotation = studyReaderUndoAnnotation;
window.studyReaderClearAnnotations = studyReaderClearAnnotations;


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


/* ═══════════════════════════════════════════════════════════════════
   STUDY SPACE
   ═══════════════════════════════════════════════════════════════════ */
const StudySpace = { query: '', blockId: 'ALL', hasArticlesOnly: false, selectedId: null };

function normalizeStudySpaceValue(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .trim()
    .replace(/\s+/g, ' ');
}

function studySpaceArticlesForSubject(subject, articles = DB.getArticles()) {
  const subjectId = normalizeStudySpaceValue(subject.id);
  const subjectCode = normalizeStudySpaceValue(subject.code);
  const subjectName = normalizeStudySpaceValue(subject.name);

  return (Array.isArray(articles) ? articles : []).filter(article => {
    if (subjectId && normalizeStudySpaceValue(article.subjectId) === subjectId) return true;
    if (subjectCode && normalizeStudySpaceValue(article.subjectCode) === subjectCode) return true;
    if (subjectName && normalizeStudySpaceValue(article.subject) === subjectName) return true;

    // Bài cũ chưa có trường liên kết: chỉ nhận diện mã môn như một token độc lập
    // trong nội dung mô tả, tránh "FT445" khớp nhầm "FT4455".
    const text = [article.tags, article.title, article.excerpt]
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(normalizeStudySpaceValue)
      .join(' ');
    const tokens = text.split(/[^a-z0-9]+/i);
    return Boolean(subjectCode) && tokens.includes(subjectCode);
  });
}

function studySpaceResourcesForSubject(subject, resources = DB.getResources()) {
  const subjectId = normalizeStudySpaceValue(subject.id);
  const subjectCode = normalizeStudySpaceValue(subject.code);
  return (Array.isArray(resources) ? resources : []).filter(resource => {
    const resourceSubjectId = normalizeStudySpaceValue(resource.subjectId);
    const resourceSubjectCode = normalizeStudySpaceValue(resource.subjectCode);
    return Boolean(subjectId && resourceSubjectId === subjectId) || Boolean(subjectCode && resourceSubjectCode === subjectCode);
  }).map(resource => ({
    ...resource,
    contentType: 'resource',
    title: resource.name || resource.title || 'Tài nguyên học tập',
    excerpt: resource.description || ({ lecture: 'Bài giảng do quản trị viên cập nhật.', exam: 'Đề thi do quản trị viên cập nhật.' }[resource.type] || 'Nội dung do quản trị viên cập nhật.')
  }));
}

function studySpaceContentForSubject(subject, articles, resources) {
  return [
    ...studySpaceArticlesForSubject(subject, articles).map(article => ({ ...article, contentType: 'article' })),
    ...studySpaceResourcesForSubject(subject, resources)
  ];
}

function getStudySpaceSubjects() {
  const query = StudySpace.query.trim().toLocaleLowerCase('vi-VN');
  const articles = DB.getArticles();
  const resources = DB.getResources();
  return getAllSubjects().map(subject => ({ ...subject, articles: studySpaceContentForSubject(subject, articles, resources) }))
    .filter(subject => StudySpace.blockId === 'ALL' || subject.blockId === StudySpace.blockId)
    .filter(subject => !StudySpace.hasArticlesOnly || subject.articles.length)
    .filter(subject => !query || `${subject.code} ${subject.name}`.toLocaleLowerCase('vi-VN').includes(query));
}

function studySpaceSubjectIcon(subject) {
  const name = normalizeStudySpaceValue(subject.name);
  if (/vat ly|xac suat|thong ke|dien/.test(name)) return 'fa-atom';
  if (/hoa|phu gia|doc to/.test(name)) return 'fa-flask';
  if (/sinh|vi sinh|enzyme|dinh duong/.test(name)) return 'fa-dna';
  if (/quoc phong|quan su|chien dau/.test(name)) return 'fa-shield-halved';
  if (/quan ly|marketing|kinh te/.test(name)) return 'fa-chart-line';
  return 'fa-book-open';
}

function studySpaceAIAction(action) {
  const messages = { summary:'Tóm tắt AI sẽ sẵn sàng khi bạn chọn một tài liệu trong môn học.', plan:'Lộ trình ôn tập sẽ được cá nhân hóa theo môn bạn chọn.', chat:'Trợ lý AI đang sẵn sàng hỗ trợ bạn tìm môn học phù hợp.', flashcard:'Flashcard AI sẽ xuất hiện khi môn học có tài liệu.', recommend:'Gợi ý tài liệu sẽ dựa trên tài nguyên của từng môn.' };
  if (action === 'quiz') return NavController.navigateToPage('aigen');
  showToast(messages[action] || 'Tính năng AI đang được chuẩn bị.', 'info');
}

function renderStudySpace() {
  const root = document.getElementById('study-space-root');
  if (!root) return;
  const subjects = getStudySpaceSubjects();
  const allSubjects = getAllSubjects();
  const contentCount = subjects.reduce((total, subject) => total + subject.articles.length, 0);
  const aiTools = [['quiz','fa-file-circle-plus','Tạo đề thi AI','Tạo đề trắc nghiệm theo chương, chủ đề hoặc môn học.','violet'],['summary','fa-wand-magic-sparkles','Tóm tắt giáo trình AI','Chắt lọc nội dung dài thành bản ngắn gọn, dễ hiểu.','green'],['plan','fa-calendar-check','Lên kế hoạch ôn thi','Xây lộ trình phù hợp với mục tiêu của bạn.','blue'],['chat','fa-comments','Hỏi đáp cùng AI','Giải đáp nhanh mọi thắc mắc trong quá trình học.','orange'],['flashcard','fa-layer-group','Flashcard AI','Tự động tạo thẻ ghi nhớ từ tài liệu môn học.','teal'],['recommend','fa-lightbulb','Gợi ý tài liệu','Đề xuất tài liệu theo môn bạn đang quan tâm.','rose']];
  root.innerHTML = `<div class="study-hub-shell"><main class="study-hub-main"><section class="study-hub-hero"><div class="study-hub-hero-copy"><span class="study-hub-kicker"><i class="fa-solid fa-graduation-cap"></i> KHÔNG GIAN HỌC TẬP</span><h1>Khám phá môn học<br>theo <em>cách của bạn</em></h1><p>Học nhanh hơn, hiểu sâu hơn với kho tài liệu được chọn lọc và cập nhật liên tục dành riêng cho sinh viên Công nghệ Thực phẩm.</p><div class="study-hub-hero-actions"><button onclick="studySpaceAIAction('chat')"><i class="fa-solid fa-sparkles"></i> Hỏi trợ lý AI</button><span><b>${allSubjects.length}</b> môn học trong chương trình</span></div></div><div class="study-hub-hero-art" aria-label="Vùng minh họa nhân vật sẽ được bổ sung"><div class="study-hub-art-orb orb-one"></div><div class="study-hub-art-orb orb-two"></div><div class="study-hub-art-dots"></div><div class="study-hub-art-placeholder"><i class="fa-solid fa-user-graduate"></i><span>Khu vực minh họa<br>nhân vật</span></div><div class="study-hub-hero-stat"><b>${allSubjects.length}</b><span>môn học phù hợp</span></div></div></section><section class="study-hub-catalog"><div class="study-hub-search"><i class="fa-solid fa-magnifying-glass"></i><input id="study-space-search" type="search" value="${StudySpace.query.replace(/"/g, '&quot;')}" placeholder="Tìm theo tên hoặc mã môn học" oninput="searchStudySpaceSubjects(this.value)"></div><div class="study-hub-filter-row"><div class="study-space-filter-row"><button class="study-space-filter ${StudySpace.blockId === 'ALL' ? 'active' : ''}" onclick="setStudySpaceFilter('ALL')">Tất cả</button>${Object.values(KNOWLEDGE_BLOCKS).map(block => `<button class="study-space-filter ${StudySpace.blockId === block.id ? 'active' : ''}" onclick="setStudySpaceFilter('${block.id}')">${block.icon} ${block.name}</button>`).join('')}</div><button class="study-hub-more-filter" onclick="showToast('Bộ lọc nâng cao đang được chuẩn bị.', 'info')"><i class="fa-solid fa-sliders"></i> Thêm bộ lọc</button></div><div class="study-hub-list-meta"><label class="study-space-article-toggle"><input id="study-space-has-articles" type="checkbox" ${StudySpace.hasArticlesOnly ? 'checked' : ''} onchange="setStudySpaceFilter(null, this.checked)"><span>Chỉ hiện môn đã có bài đăng</span></label><span>${subjects.length} môn phù hợp · ${contentCount} tài nguyên</span></div></section><section class="study-hub-subject-grid">${subjects.length ? subjects.map(subject => `<button class="study-hub-subject-card" data-subject-id="${subject.id}" data-has-articles="${subject.articles.length > 0}" onclick="selectStudySpaceSubject('${subject.id}')"><span class="study-hub-subject-icon"><i class="fa-solid ${studySpaceSubjectIcon(subject)}"></i></span><span class="study-hub-subject-top"><b>${subject.code}</b><small>HK ${subject.semester || '—'}</small></span><strong>${subject.name}</strong><span class="study-hub-subject-meta">${KNOWLEDGE_BLOCKS[subject.blockId]?.icon || '📘'} ${KNOWLEDGE_BLOCKS[subject.blockId]?.name || 'Khối kiến thức'} · ${subject.credits || 0} tín chỉ</span><span class="study-hub-subject-foot"><span><i class="fa-solid ${subject.articles.length ? 'fa-file-lines' : 'fa-clock'}"></i> ${subject.articles.length ? `${subject.articles.length} bài đăng` : 'Chưa có bài đăng'}</span><i class="fa-solid fa-arrow-right"></i></span></button>`).join('') : '<div class="study-space-empty">Không tìm thấy môn học phù hợp.</div>'}</section><section class="study-hub-support"><div><span>HỌC CÙNG TRỢ LÝ THÔNG MINH</span><h2>Bạn cần hỗ trợ tìm môn học?</h2><p>Trợ lý AI luôn sẵn sàng giúp bạn định hướng và lựa chọn môn học phù hợp.</p><button onclick="studySpaceAIAction('chat')"><i class="fa-solid fa-comment-dots"></i> Trò chuyện với AI</button></div><div class="study-hub-support-visual"><i class="fa-solid fa-robot"></i><i class="fa-solid fa-book-open"></i></div></section></main><aside class="study-hub-ai-panel"><div class="study-hub-ai-heading"><span>TRUNG TÂM HỌC TẬP AI</span><p>Công cụ đồng hành cùng bạn</p></div>${aiTools.map(([action,icon,title,description,theme]) => `<button class="study-hub-ai-tool ${theme}" onclick="studySpaceAIAction('${action}')"><i class="fa-solid ${icon}"></i><span><b>${title}</b><small>${description}</small></span><em><i class="fa-solid fa-arrow-right"></i></em></button>`).join('')}<div class="study-hub-stats"><span>THỐNG KÊ HỌC TẬP</span><div><b>${allSubjects.length}</b><small>Môn học</small><b>${contentCount}</b><small>Tài nguyên</small><b>${subjects.filter(s => s.articles.length).length}</b><small>Môn có nội dung</small></div><button onclick="showToast('Báo cáo học tập đang được chuẩn bị.', 'info')">Xem báo cáo chi tiết <i class="fa-solid fa-arrow-up-right-from-square"></i></button></div></aside></div>`;
}

function setStudySpaceFilter(blockId, hasArticlesOnly) { if (blockId) StudySpace.blockId = blockId; if (typeof hasArticlesOnly === 'boolean') StudySpace.hasArticlesOnly = hasArticlesOnly; renderStudySpace(); }
function searchStudySpaceSubjects(query) { StudySpace.query = String(query || ''); renderStudySpace(); }
function selectStudySpaceSubject(subjectId) {
  StudySpace.selectedId = subjectId;
  NavController.openSubjectDetail(subjectId, 'study-space');
}
Object.assign(window, { renderStudySpace, setStudySpaceFilter, searchStudySpaceSubjects, selectStudySpaceSubject });

/* ═══════════════════════════════════════════════════════════════════
   NOTIFICATIONS PAGE FUNCTIONS
   ═══════════════════════════════════════════════════════════════════ */

const NotificationCenterState = { filter: 'all', selectedId: null };
// Thư/Thông báo giữ bộ ảnh cũ. Trang nâng cấp dùng bộ ảnh riêng trong Downloads đã đưa vào project.
const NOTIFICATION_CHARACTER_ASSETS = {
  male: 'notification-character-1.webp',
  female: 'notification-character-2.webp'
};
const UPGRADE_CHARACTER_ASSETS = {
  male: 'upgrade-character-male.webp',
  female: 'upgrade-character-female.webp'
};
let notificationCharacterAsset = null;
let notificationCharacterGender = null;
const notificationCharacterEntries = Object.entries(NOTIFICATION_CHARACTER_ASSETS);
Promise.all(notificationCharacterEntries.map(([, src]) => new Promise(resolve => { const image = new Image(); image.onload = () => resolve(src); image.onerror = () => resolve(null); image.src = src; }))).then(results => {
  if (results.every(Boolean)) {
    const [illustrationGender, illustrationAsset] = notificationCharacterEntries[Math.floor(Math.random() * notificationCharacterEntries.length)];
    notificationCharacterGender = illustrationGender;
    notificationCharacterAsset = illustrationAsset;
    const upgradeCharacter = document.getElementById('upgrade-contact-character');
    if (upgradeCharacter) {
      upgradeCharacter.src = UPGRADE_CHARACTER_ASSETS[notificationCharacterGender];
      upgradeCharacter.dataset.gender = notificationCharacterGender;
    }
    if (document.getElementById('notification-center-shell')) renderNotificationCenter();
  }
});

function notificationUser() {
  const user = NavController.currentUser || { email: 'guest', role: 'NEWBIE', name: 'Khách' };
  return { ...user, email: String(user.email || 'guest').trim().toLowerCase() };
}

function updateNotificationBadge() {
  const badge = document.querySelector('#snav-notifications .badge-dot');
  if (!badge) return 0;
  const user = notificationUser();
  const read = DB.getNotificationReadState(user.email || user.id || 'guest');
  const unreadCount = DB.getVisibleAnnouncements(user).filter(item => !read[item.id]).length;
  badge.hidden = unreadCount === 0;
  badge.setAttribute('aria-label', unreadCount ? `${unreadCount} thông báo chưa đọc` : 'Không có thông báo chưa đọc');
  return unreadCount;
}

window.refreshAnnouncementsFromServer = async function() {
  try {
    const announcements = await pullAnnouncementsFromServer();
    if (Array.isArray(announcements) && announcements.length) DB.mergeAnnouncementsFromServer(announcements);
    const unreadCount = updateNotificationBadge();
    if (document.getElementById('notification-center-shell')) renderNotificationCenter();
    return { synced: true, unreadCount };
  } catch (error) {
    console.warn('[Announcements] Không thể làm mới dữ liệu cloud:', error);
    return { synced: false, unreadCount: updateNotificationBadge() };
  }
};

function notificationIcon(type) { return ({ info: 'fa-bell', update: 'fa-code-branch', alert: 'fa-triangle-exclamation', success: 'fa-circle-check' })[type] || 'fa-bell'; }
function notificationText(html = '') { const el = document.createElement('div'); el.innerHTML = html; return (el.textContent || '').trim(); }
function notificationTime(value) { return value ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : ''; }

function renderNotificationCenter() {
  const shell = document.getElementById('notification-center-shell');
  if (!shell) return;
  const user = notificationUser();
  const key = user.email || user.id || 'guest';
  const read = DB.getNotificationReadState(key);
  const all = DB.getVisibleAnnouncements(user);
  const items = NotificationCenterState.filter === 'unread' ? all.filter(a => !read[a.id]) : NotificationCenterState.filter === 'read' ? all.filter(a => read[a.id]) : all;
  if (!NotificationCenterState.selectedId || !all.some(a => a.id === NotificationCenterState.selectedId)) NotificationCenterState.selectedId = all[0]?.id || null;
  const selected = all.find(a => a.id === NotificationCenterState.selectedId);
  const counts = { all: all.length, unread: all.filter(a => !read[a.id]).length, read: all.filter(a => read[a.id]).length };
  shell.innerHTML = `<div class="notification-center-list-pane"><div class="notification-center-heading"><div><h1>Thông báo</h1><p>Các thông báo và thư từ quản trị viên</p></div><span class="notification-count">${counts.unread} mới</span></div><div class="notification-center-tabs">${['all','unread','read'].map(f => `<button class="notification-center-tab ${NotificationCenterState.filter === f ? 'active' : ''}" aria-pressed="${NotificationCenterState.filter === f}" onclick="filterNotifications('${f}')">${f === 'all' ? 'Tất cả' : f === 'unread' ? 'Chưa đọc' : 'Đã đọc'} <b>${counts[f]}</b></button>`).join('')}</div><div class="notification-center-list">${items.length ? items.map(a => `<button class="notification-center-item ${a.id === selected?.id ? 'selected' : ''} ${read[a.id] ? 'is-read' : 'is-unread'}" onclick="openNotificationDetail(event, '${a.id}')"><span class="notification-center-item-icon"><i class="fa-solid ${notificationIcon(a.type)}"></i></span><span class="notification-center-item-copy"><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.excerpt || notificationText(a.content).slice(0, 92))}</small></span><time>${notificationTime(a.createdAt)}</time></button>`).join('') : '<div class="notification-center-empty">Không có thông báo phù hợp.</div>'}</div></div><div class="notification-center-detail-pane">${selected ? `<div class="notification-detail-toolbar"><button onclick="toggleAnnouncementRead('${selected.id}')"><i class="fa-solid fa-check"></i> ${read[selected.id] ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc'}</button></div><div class="notification-detail-content-card"><div class="notification-detail-eyebrow"><i class="fa-solid ${notificationIcon(selected.type)}"></i><span>${escapeHtml(selected.category || selected.type || 'Thông báo hệ thống')}</span></div><h2>${escapeHtml(selected.title)}</h2><p class="notification-detail-byline">Quản trị viên ${escapeHtml(selected.author || 'FTECA 24')} · ${notificationTime(selected.createdAt)}</p><article>${selected.content || '<p>Chưa có nội dung chi tiết.</p>'}</article>${notificationCharacterAsset ? `<div class="notification-detail-art" aria-hidden="true"><span class="notification-art-orb notification-art-orb-one"></span><span class="notification-art-orb notification-art-orb-two"></span><span class="notification-art-dots notification-art-dots-top"></span><span class="notification-art-dots notification-art-dots-bottom"></span><img class="notification-detail-character" src="${notificationCharacterAsset}" alt=""></div>` : ''}</div>` : '<div class="notification-center-empty">Chọn một thông báo để xem nội dung.</div>'}</div>`;
}
function filterNotifications(filter) { NotificationCenterState.filter = filter; renderNotificationCenter(); }
function openNotificationDetail(event, notificationId) { event?.preventDefault(); NotificationCenterState.selectedId = notificationId; const user = notificationUser(); DB.setAnnouncementRead(user.email || user.id || 'guest', notificationId, true); updateNotificationBadge(); renderNotificationCenter(); }
function toggleAnnouncementRead(id) { const user = notificationUser(); const key = user.email || user.id || 'guest'; const read = DB.getNotificationReadState(key); DB.setAnnouncementRead(key, id, !read[id]); updateNotificationBadge(); renderNotificationCenter(); }
function markAsRead(btn) { const id = btn?.dataset?.notificationId; if (id) toggleAnnouncementRead(id); }
function showMoreFilters() { filterNotifications('all'); }
Object.assign(window, { filterNotifications, showMoreFilters, markAsRead, openNotificationDetail, toggleAnnouncementRead, renderNotificationCenter, updateNotificationBadge });


/* ================================================
   ADMIN SUBJECT CONFIG (THIET LAP TRANG MON HOC)
================================================= */

var _introCanvasItems = [];
var _introCanvasSelectedId = null;
var _introCanvasDrag = null;
var _introCanvasHeight = 620;
function adminIntroCanvasLoad(details) { _introCanvasItems = JSON.parse(JSON.stringify(details?.introCanvas || [])); _introCanvasHeight = Math.min(2400, Math.max(360, Number(details?.introCanvasHeight) || 620)); var heightInput=document.getElementById('admin-intro-canvas-height'); if(heightInput) heightInput.value=_introCanvasHeight; _introCanvasSelectedId = null; adminIntroCanvasRender(); }
function adminIntroCanvasSetHeight(value) { _introCanvasHeight = Math.min(2400, Math.max(360, Number(value) || 620)); var heightInput=document.getElementById('admin-intro-canvas-height'); if(heightInput) heightInput.value=_introCanvasHeight; adminIntroCanvasRender(); }
function adminIntroCanvasHeightPointerDown(event) { event.preventDefault(); event.stopPropagation(); var startY=event.clientY, startHeight=_introCanvasHeight; function move(e) { adminIntroCanvasSetHeight(startHeight + e.clientY - startY); } function up() { window.removeEventListener('pointermove',move); } window.addEventListener('pointermove',move); window.addEventListener('pointerup',up,{once:true}); }
function _introItem(id) { return _introCanvasItems.find(function(item) { return item.id === id; }); }
function _introClamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || min)); }
function adminIntroCanvasAdd(type) { var count = _introCanvasItems.length; var item = { id:'intro_' + Date.now(), type:type, content:type === 'text' ? 'Nhập nội dung tại đây' : '', src:'', alt:'', x:8 + (count % 3) * 12, y:8 + (count % 4) * 12, width:type === 'text' ? 42 : 36, height:type === 'text' ? 18 : 28, zIndex:count + 1, settings:{ fontSize:18, textAlign:'left' } }; _introCanvasItems.push(item); _introCanvasSelectedId=item.id; adminIntroCanvasRender(); }
function adminIntroCanvasRender() { var canvas=document.getElementById('admin-intro-canvas'), properties=document.getElementById('admin-intro-canvas-properties'); if(!canvas||!properties)return; canvas.style.minHeight=_introCanvasHeight+'px'; if(!_introCanvasItems.length) canvas.innerHTML='<div class="subject-canvas-empty">Thêm Text, Ảnh hoặc Video để bắt đầu bố cục.</div>'; else canvas.innerHTML=_introCanvasItems.map(function(item){ var selected=item.id===_introCanvasSelectedId?' selected':''; var content=item.type==='text'?'<div class="subject-canvas-text">'+escapeHtml(item.content||'Text')+'</div>':item.type==='image'?(item.src?'<img src="'+escapeHtml(item.src)+'" alt="'+escapeHtml(item.alt)+'">':'<span>Nhập URL ảnh</span>'):(item.src?'<span class="subject-canvas-video-label"><i class="fa-solid fa-video"></i> Video đã liên kết</span>':'<span>Nhập URL video</span>'); return '<div class="subject-canvas-item '+item.type+selected+'" data-id="'+item.id+'" style="left:'+item.x+'%;top:'+item.y+'%;width:'+item.width+'%;height:'+item.height+'%;z-index:'+item.zIndex+'" onpointerdown="adminIntroCanvasPointerDown(event,\''+item.id+'\')">'+content+'<span class="subject-canvas-resize" onpointerdown="adminIntroCanvasPointerDown(event,\''+item.id+'\',true)"></span></div>'; }).join(''); canvas.insertAdjacentHTML('beforeend','<button type="button" class="subject-canvas-height-resize" aria-label="Kéo để đổi chiều cao canvas" title="Kéo để đổi chiều cao canvas" onpointerdown="adminIntroCanvasHeightPointerDown(event)"><i class="fa-solid fa-up-down"></i></button>'); var selected=_introItem(_introCanvasSelectedId); properties.innerHTML=selected?'<h5>Thuộc tính</h5><label>Nội dung / URL<textarea oninput="adminIntroCanvasUpdate(\''+selected.id+'\',\''+(selected.type==='text'?'content':'src')+'\',this.value)">'+escapeHtml(selected.type==='text'?selected.content:selected.src)+'</textarea></label>' +(selected.type==='image'?'<label>Alt text<input value="'+escapeHtml(selected.alt)+'" oninput="adminIntroCanvasUpdate(\''+selected.id+'\',\'alt\',this.value)"></label>':'')+'<div class="subject-canvas-size"><label>Rộng %<input type="number" min="12" max="100" value="'+selected.width+'" oninput="adminIntroCanvasUpdate(\''+selected.id+'\',\'width\',this.value)"></label><label>Cao %<input type="number" min="8" max="100" value="'+selected.height+'" oninput="adminIntroCanvasUpdate(\''+selected.id+'\',\'height\',this.value)"></label></div>':'<p>Chọn một phần tử để chỉnh thuộc tính.</p>'; }
function adminIntroCanvasUpdate(id,key,value){var item=_introItem(id);if(!item)return;if(['x','y','width','height'].includes(key))item[key]=_introClamp(value,key==='width'?12:8,100);else item[key]=value;adminIntroCanvasRender();}
function adminIntroCanvasPointerDown(event,id,resize){event.stopPropagation();var item=_introItem(id),canvas=document.getElementById('admin-intro-canvas');if(!item||!canvas)return;_introCanvasSelectedId=id;var rect=canvas.getBoundingClientRect();_introCanvasDrag={id:id,resize:!!resize,startX:event.clientX,startY:event.clientY,x:item.x,y:item.y,width:item.width,height:item.height,rect:rect};window.addEventListener('pointermove',adminIntroCanvasPointerMove);window.addEventListener('pointerup',adminIntroCanvasPointerUp,{once:true});adminIntroCanvasRender();}
function adminIntroCanvasPointerMove(event){if(!_introCanvasDrag)return;var d=_introCanvasDrag,item=_introItem(d.id),dx=(event.clientX-d.startX)/d.rect.width*100,dy=(event.clientY-d.startY)/d.rect.height*100;if(d.resize){item.width=_introClamp(d.width+dx,12,100-item.x);item.height=_introClamp(d.height+dy,8,100-item.y)}else{item.x=_introClamp(d.x+dx,0,100-item.width);item.y=_introClamp(d.y+dy,0,100-item.height)}adminIntroCanvasRender();}
function adminIntroCanvasPointerUp(){window.removeEventListener('pointermove',adminIntroCanvasPointerMove);_introCanvasDrag=null;}
function adminIntroCanvasDelete(){if(!_introCanvasSelectedId)return;_introCanvasItems=_introCanvasItems.filter(function(item){return item.id!==_introCanvasSelectedId});_introCanvasSelectedId=null;adminIntroCanvasRender();}
function adminIntroCanvasAlign(mode){var items=_introCanvasItems.filter(function(item){return item.id===_introCanvasSelectedId});if(!items.length)return;items.forEach(function(item){if(mode==='left')item.x=0;if(mode==='center')item.x=(100-item.width)/2;if(mode==='right')item.x=100-item.width;if(mode==='top')item.y=0;if(mode==='middle')item.y=(100-item.height)/2;if(mode==='bottom')item.y=100-item.height});adminIntroCanvasRender();}
function adminIntroCanvasDistribute(axis){var items=_introCanvasItems.slice().sort(function(a,b){return axis==='horizontal'?a.x-b.x:a.y-b.y});if(items.length<3)return;var first=items[0],last=items[items.length-1],start=axis==='horizontal'?first.x:first.y,end=axis==='horizontal'?last.x:last.y,step=(end-start)/(items.length-1);items.forEach(function(item,index){item[axis==='horizontal'?'x':'y']=start+step*index});adminIntroCanvasRender();}

function _initSubjectConfigTab() {
  var select = document.getElementById('admin-subject-config-select');
  if (!select) return;
  var subjects = getAllSubjects();
  select.innerHTML = subjects.map(function(s) { return '<option value="' + s.id + '">' + s.code + ' - ' + (s.name || 'Mon hoc') + '</option>'; }).join('');
  renderAdminSubjectConfig();
}

function renderAdminSubjectConfig() {
  var select = document.getElementById('admin-subject-config-select');
  if (!select) return;
  var subjectId = select.value;
  if (!subjectId) return;
  var d = DB.getSubjectDetails(subjectId);
  if (!d) return;
  function setVal(id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; }
  setVal('cfg-code', d.code || subjectId);
  setVal('cfg-banner', d.banner);
  setVal('cfg-shortDesc', d.shortDesc);
  setVal('cfg-credits', d.credits);
  setVal('cfg-semester', d.semester);
  setVal('cfg-program', d.program);
  setVal('cfg-intro', d.intro);
  setVal('cfg-instructor-name', d.instructor && d.instructor.name);
  setVal('cfg-instructor-role', d.instructor && d.instructor.role);
  setVal('cfg-instructor-avatar', d.instructor && d.instructor.avatar);
  setVal('cfg-instructor-email', d.instructor && d.instructor.email);
  var cards = d.cards || {};
  var cardMap = [
    { key: 'objectives', t: 'cfg-card-obj-title', c: 'cfg-card-obj-content' },
    { key: 'mainContent', t: 'cfg-card-main-title', c: 'cfg-card-main-content' },
    { key: 'targetAudience', t: 'cfg-card-target-title', c: 'cfg-card-target-content' },
    { key: 'learningFormat', t: 'cfg-card-format-title', c: 'cfg-card-format-content' },
  ];
  cardMap.forEach(function(cm) { setVal(cm.t, cards[cm.key] && cards[cm.key].title); setVal(cm.c, cards[cm.key] && cards[cm.key].content); });
  _renderSubjectConfigChapters(subjectId, d.chapters || []);
  adminIntroCanvasLoad(d);
}

function _renderSubjectConfigChapters(subjectId, chapters) {
  var container = document.getElementById('admin-chapters-container');
  if (!container) return;
  if (!chapters || chapters.length === 0) {
    container.innerHTML = '<div class="text-xs text-muted text-center p-4">Chua co chuong nao. Bam "Them Chuong Moi" de bat dau.</div>';
    return;
  }
  var html = '';
  chapters.forEach(function(chap, ci) {
    var lessonsHtml = '';
    if (chap.lessons && chap.lessons.length > 0) {
      chap.lessons.forEach(function(les, li) {
        var safeTitle = (les.title || '').replace(/"/g, '&quot;');
        lessonsHtml += '<div class="flex items-center gap-2 p-2 rounded" style="background:var(--bg-subtle);">' +
          '<span class="text-xs text-muted">' + (ci+1) + '.' + (li+1) + '</span>' +
          '<input type="text" class="form-input text-xs" style="flex:1;" value="' + safeTitle + '" ' +
          'onchange="_scUpdateLessonTitle(\'' + subjectId + '\',\'' + chap.id + '\',\'' + les.id + '\',this.value)" placeholder="Ten bai hoc...">' +
          '<button class="block-btn delete" onclick="_scDeleteLesson(\'' + subjectId + '\',\'' + chap.id + '\',\'' + les.id + '\')">' +
          '<i class="fa-solid fa-xmark"></i></button></div>';
      });
    } else {
      lessonsHtml = '<div class="text-xs text-muted italic pl-2">Chua co bai hoc</div>';
    }
    var safeChapTitle = (chap.title || '').replace(/"/g, '&quot;');
    html += '<div class="card p-3" style="border-left:3px solid var(--primary);">' +
      '<div class="flex justify-between items-center mb-2">' +
      '<input type="text" class="form-input text-xs font-bold" style="max-width:70%;" value="' + safeChapTitle + '" ' +
      'onchange="_scUpdateChapterTitle(\'' + subjectId + '\',\'' + chap.id + '\',this.value)" placeholder="Ten chuong...">' +
      '<div class="flex gap-2">' +
      '<button class="btn btn-primary btn-xs" onclick="_scAddLesson(\'' + subjectId + '\',\'' + chap.id + '\')">' +
      '<i class="fa-solid fa-plus"></i> Bai hoc</button>' +
      '<button class="btn btn-danger btn-xs" onclick="_scDeleteChapter(\'' + subjectId + '\',\'' + chap.id + '\')">' +
      '<i class="fa-solid fa-trash"></i></button>' +
      '</div></div>' +
      '<div class="space-y-1 pl-2">' + lessonsHtml + '</div></div>';
  });
  container.innerHTML = html;
}

function adminAddChapter() {
  var select = document.getElementById('admin-subject-config-select');
  if (!select || !select.value) { showToast('Vui long chon mon hoc truoc!', 'error'); return; }
  var subjectId = select.value;
  var title = prompt('Nhap ten chuong moi:');
  if (!title) return;
  var details = DB.getSubjectDetails(subjectId);
  if (!details.chapters) details.chapters = [];
  details.chapters.push({ id: 'chap_' + Date.now(), title: title.trim(), lessons: [] });
  DB.saveSubjectDetails(subjectId, details);
  _renderSubjectConfigChapters(subjectId, details.chapters);
  showToast('Da them chuong moi!', 'success');
}

function _scAddLesson(subjectId, chapId) {
  var title = prompt('Nhap ten bai hoc moi:');
  if (!title) return;
  var details = DB.getSubjectDetails(subjectId);
  var chap = details.chapters.find(function(c) { return c.id === chapId; });
  if (!chap) return;
  if (!chap.lessons) chap.lessons = [];
  chap.lessons.push({ id: 'les_' + Date.now(), title: title.trim(), duration: '10:00', status: 'published', type: 'editor', blocks: [], content: '' });
  DB.saveSubjectDetails(subjectId, details);
  _renderSubjectConfigChapters(subjectId, details.chapters);
  showToast('Da them bai hoc!', 'success');
}

function _scDeleteChapter(subjectId, chapId) {
  if (!confirm('Xoa chuong nay va tat ca bai hoc ben trong?')) return;
  var details = DB.getSubjectDetails(subjectId);
  details.chapters = details.chapters.filter(function(c) { return c.id !== chapId; });
  DB.saveSubjectDetails(subjectId, details);
  _renderSubjectConfigChapters(subjectId, details.chapters);
  showToast('Da xoa chuong!', 'success');
}

function _scDeleteLesson(subjectId, chapId, lesId) {
  if (!confirm('Xoa bai hoc nay?')) return;
  var details = DB.getSubjectDetails(subjectId);
  var chap = details.chapters.find(function(c) { return c.id === chapId; });
  if (chap) chap.lessons = chap.lessons.filter(function(l) { return l.id !== lesId; });
  DB.saveSubjectDetails(subjectId, details);
  _renderSubjectConfigChapters(subjectId, details.chapters);
  showToast('Da xoa bai hoc!', 'success');
}

function _scUpdateChapterTitle(subjectId, chapId, newTitle) {
  var details = DB.getSubjectDetails(subjectId);
  var chap = details.chapters.find(function(c) { return c.id === chapId; });
  if (chap) chap.title = newTitle.trim();
  DB.saveSubjectDetails(subjectId, details);
}

function _scUpdateLessonTitle(subjectId, chapId, lesId, newTitle) {
  var details = DB.getSubjectDetails(subjectId);
  var chap = details.chapters.find(function(c) { return c.id === chapId; });
  if (chap) { var les = chap.lessons.find(function(l) { return l.id === lesId; }); if (les) les.title = newTitle.trim(); }
  DB.saveSubjectDetails(subjectId, details);
}

async function adminSaveSubjectConfig(status) {
  var select = document.getElementById('admin-subject-config-select');
  if (!select || !select.value) { showToast('Vui long chon mon hoc!', 'error'); return; }
  var subjectId = select.value;
  var details = DB.getSubjectDetails(subjectId);
  function getVal(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
  details.banner = getVal('cfg-banner');
  details.shortDesc = getVal('cfg-shortDesc');
  details.credits = parseInt(getVal('cfg-credits')) || 0;
  details.semester = parseInt(getVal('cfg-semester')) || 0;
  details.program = getVal('cfg-program');
  details.intro = getVal('cfg-intro');
  details.introCanvas = JSON.parse(JSON.stringify(_introCanvasItems));
  details.introCanvasHeight = _introCanvasHeight;
  details.instructor = { name: getVal('cfg-instructor-name'), role: getVal('cfg-instructor-role'), avatar: getVal('cfg-instructor-avatar'), email: getVal('cfg-instructor-email') };
  details.cards = {
    objectives:     { title: getVal('cfg-card-obj-title'),    content: getVal('cfg-card-obj-content') },
    mainContent:    { title: getVal('cfg-card-main-title'),   content: getVal('cfg-card-main-content') },
    targetAudience: { title: getVal('cfg-card-target-title'), content: getVal('cfg-card-target-content') },
    learningFormat: { title: getVal('cfg-card-format-title'), content: getVal('cfg-card-format-content') },
  };
  details.status = status || 'draft';
  // Bản nháp chỉ lưu tại phiên Admin; chỉ bản xuất bản mới được phép đồng bộ công khai.
  const idToken = details.status === 'published' ? await AuthModule.getIdToken() : '';
  const result = await DB.saveSubjectDetails(subjectId, details, details.status !== 'published', idToken);
  if (details.status === 'published' && !result.ok) {
    const reason = result.sync?.reason ? ` (${result.sync.reason})` : '';
    showToast(`Chưa thể đăng công khai vì đồng bộ dữ liệu thất bại${reason}. Bản lưu cục bộ vẫn còn.`, 'error');
    return result;
  }
  showToast(details.status === 'published' ? 'Đã đăng công khai và đồng bộ dữ liệu.' : 'Đã lưu nháp trên thiết bị Admin.', 'success');
  return result;
}

async function adminPreviewSubjectConfig() {
  var select = document.getElementById('admin-subject-config-select');
  if (!select || !select.value) { showToast('Vui long chon mon hoc!', 'error'); return; }
  const result = await adminSaveSubjectConfig('draft');
  if (!result?.details) return;
  window._adminSubjectPreview = { subjectId: select.value, details: result.details };
  NavController.openSubjectDetail(select.value);
}

Object.assign(window, {
  adminAddChapter, adminSaveSubjectConfig, adminPreviewSubjectConfig,
  renderAdminSubjectConfig, adminIntroCanvasAdd, adminIntroCanvasUpdate, adminIntroCanvasPointerDown, adminIntroCanvasDelete, adminIntroCanvasAlign, adminIntroCanvasDistribute, adminIntroCanvasSetHeight, adminIntroCanvasHeightPointerDown,
  _scAddLesson, _scDeleteChapter, _scDeleteLesson,
  _scUpdateChapterTitle, _scUpdateLessonTitle,
});

/* ================================================
   ADMIN INTERACTIVE LESSONS (3-COLUMN LAYOUT)
================================================= */

var _interactiveCurrentSubjectId = null;
var _interactiveCurrentChapterId = null;
var _interactiveCurrentLessonId = null;
var _interactiveBlocks = [];

function adminLoadInteractiveLessons() {
  var select = document.getElementById('admin-interactive-subject-select');
  if (!select) return;
  var subjects = getAllSubjects();
  if (subjects.length === 0) { select.innerHTML = '<option value="">Khong co mon hoc</option>'; return; }
  select.innerHTML = subjects.map(function(s) { return '<option value="' + s.id + '">' + s.code + ' - ' + (s.name || 'Mon hoc') + '</option>'; }).join('');
  adminOnInteractiveSubjectChange(subjects[0].id);
}

function adminOnInteractiveSubjectChange(subjectId) {
  _interactiveCurrentSubjectId = subjectId;
  _interactiveCurrentLessonId = null;
  adminRenderInteractiveChaptersTree();
  adminHideInteractiveEditor();
}

function adminRenderInteractiveChaptersTree() {
  var treeContainer = document.getElementById('admin-interactive-chapters-tree');
  if (!treeContainer) return;
  var details = DB.getSubjectDetails(_interactiveCurrentSubjectId);
  if (!details || !details.chapters || details.chapters.length === 0) {
    treeContainer.innerHTML = '<div class="text-xs text-muted text-center p-4">Chua co chuong nao. Hay them chuong moi.</div>';
    return;
  }
  var html = '';
  details.chapters.forEach(function(chap, cIndex) {
    var lessHtml = '';
    if (chap.lessons && chap.lessons.length > 0) {
      chap.lessons.forEach(function(les) {
        var isActive = _interactiveCurrentLessonId === les.id ? 'active' : '';
        var badge = les.status === 'draft' ? '<span class="badge badge-warning" style="font-size:9px;padding:2px 4px;">Nhap</span>' : '';
        lessHtml += '<div class="lesson-item ' + isActive + '" onclick="adminSelectInteractiveLesson(\'' + chap.id + '\',\'' + les.id + '\')">' +
          '<span><i class="fa-regular fa-file-lines text-muted mr-1"></i> ' + les.title + '</span>' +
          '<div class="flex gap-1 items-center">' + badge +
          '<button class="block-btn delete" onclick="event.stopPropagation(); adminDeleteLesson(\'' + chap.id + '\',\'' + les.id + '\')"><i class="fa-solid fa-xmark"></i></button>' +
          '</div></div>';
      });
    } else { lessHtml = '<div class="text-xs text-muted pl-4 italic">Chua co bai hoc</div>'; }
    html += '<div class="chapter-item">' +
      '<div class="chapter-header"><span>' + (chap.title || ('Chuong ' + (cIndex+1))) + '</span>' +
      '<div class="flex gap-1">' +
      '<button class="block-btn" onclick="adminOpenAddLessonModal(\'' + chap.id + '\')" title="Them bai hoc"><i class="fa-solid fa-plus"></i></button>' +
      '<button class="block-btn delete" onclick="adminDeleteChapter(\'' + chap.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
      '</div></div><div class="lesson-list">' + lessHtml + '</div></div>';
  });
  treeContainer.innerHTML = html;
}

function adminHideInteractiveEditor() {
  var emptyHint = document.getElementById('admin-interactive-empty-hint');
  var editorForm = document.getElementById('admin-interactive-editor-form');
  var settingsPanel = document.getElementById('admin-block-settings-panel');
  if (emptyHint) emptyHint.style.display = 'block';
  if (editorForm) editorForm.classList.add('hidden');
  if (settingsPanel) settingsPanel.innerHTML = '<div class="text-center text-muted py-8 text-xs"><i class="fa-solid fa-hand-pointer text-xl mb-2"></i><p>Chon mot khoi noi dung de xem va chinh sua.</p></div>';
}

function adminSelectInteractiveLesson(chapterId, lessonId) {
  _interactiveCurrentChapterId = chapterId;
  _interactiveCurrentLessonId = lessonId;
  var details = DB.getSubjectDetails(_interactiveCurrentSubjectId);
  var chap = details.chapters.find(function(c) { return c.id === chapterId; });
  var les = chap.lessons.find(function(l) { return l.id === lessonId; });
  adminRenderInteractiveChaptersTree();
  document.getElementById('admin-interactive-empty-hint').style.display = 'none';
  document.getElementById('admin-interactive-editor-form').classList.remove('hidden');
  document.getElementById('admin-edit-chapter-id').value = chapterId;
  document.getElementById('admin-edit-lesson-id').value = lessonId;
  document.getElementById('admin-lesson-title-input').value = les.title || '';
  document.getElementById('admin-lesson-duration-input').value = les.duration || '';
  document.getElementById('admin-lesson-status-select').value = les.status || 'published';
  var badge = document.getElementById('admin-lesson-status-badge');
  badge.style.display = 'inline-block';
  if (les.status === 'draft') { badge.className = 'badge badge-sm badge-warning'; badge.textContent = 'Nhap'; }
  else { badge.className = 'badge badge-sm badge-success'; badge.textContent = 'Cong khai'; }
  if (les.blocks && Array.isArray(les.blocks)) {
    _interactiveBlocks = JSON.parse(JSON.stringify(les.blocks));
  } else if (les.content) {
    var parsedBlocks = []; var div = document.createElement('div'); div.innerHTML = les.content;
    var canParse = true;
    for (var node of div.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim() === '') continue;
      var tag = (node.tagName || '').toLowerCase();
      if (!['p','h2','h3'].includes(tag)) { canParse = false; break; }
    }
    if (canParse && div.childNodes.length > 0) {
      div.childNodes.forEach(function(node) {
        if (node.nodeType === 3 && node.textContent.trim() === '') return;
        var tag2 = (node.tagName || '').toLowerCase();
        var bid = 'block_' + Date.now() + Math.random().toString().slice(2,8);
        if (tag2 === 'h2' || tag2 === 'h3') parsedBlocks.push({ id: bid, type: 'heading', content: node.innerHTML, settings: { level: tag2.toUpperCase() } });
        else if (tag2 === 'p') parsedBlocks.push({ id: bid, type: 'text', content: node.innerHTML, settings: {} });
      });
      _interactiveBlocks = parsedBlocks;
    } else { _interactiveBlocks = [{ id: 'block_' + Date.now(), type: 'legacyHtml', content: les.content, settings: {} }]; }
  } else { _interactiveBlocks = []; }
  adminRenderBlocks();
}

function adminRenderBlocks() {
  var container = document.getElementById('admin-block-editor-container');
  if (!container) return;
  if (_interactiveBlocks.length === 0) {
    container.innerHTML = '<div class="text-center text-muted text-xs p-4 border border-dashed rounded">Chua co noi dung. Bam them tieu de hoac doan van ben duoi.</div>';
    return;
  }
  var html = '';
  _interactiveBlocks.forEach(function(block, index) {
    var blockContentHtml = '';
    if (block.type === 'heading') {
      var level = (block.settings && block.settings.level) || 'H2';
      var htag = level.toLowerCase();
      blockContentHtml = '<div class="block-content block-heading-' + htag + '" contenteditable="true" data-placeholder="Nhap tieu de..." onblur="adminUpdateBlockContent(\'' + block.id + '\',this.innerText)" style="text-align:' + ((block.settings && block.settings.align) || 'left') + ';color:' + ((block.settings && block.settings.color) || 'inherit') + '">' + (block.content || '') + '</div>';
    } else if (block.type === 'text') {
      blockContentHtml = '<div class="block-content block-text" contenteditable="true" data-placeholder="Nhap doan van..." onblur="adminUpdateBlockContent(\'' + block.id + '\',this.innerText)" style="text-align:' + ((block.settings && block.settings.align) || 'left') + ';color:' + ((block.settings && block.settings.color) || 'inherit') + '">' + (block.content || '') + '</div>';
    } else if (block.type === 'legacyHtml') {
      blockContentHtml = '<div class="block-legacy-html"><strong>Noi dung cu (HTML):</strong><br>' + (block.content || '') + '</div>';
    } else {
      blockContentHtml = '<div class="text-muted text-xs p-2">Block type ' + block.type + ' chua duoc ho tro</div>';
    }
    html += '<div class="lesson-block" id="interactive-block-' + block.id + '" onclick="adminSelectBlock(\'' + block.id + '\')">' +
      '<div class="lesson-block-controls">' +
      '<button class="block-btn" onclick="event.stopPropagation();adminMoveBlock(' + index + ',-1)" ' + (index === 0 ? 'disabled' : '') + '><i class="fa-solid fa-arrow-up"></i></button>' +
      '<button class="block-btn" onclick="event.stopPropagation();adminMoveBlock(' + index + ',1)" ' + (index === _interactiveBlocks.length - 1 ? 'disabled' : '') + '><i class="fa-solid fa-arrow-down"></i></button>' +
      '<button class="block-btn" onclick="event.stopPropagation();adminDuplicateBlock(\'' + block.id + '\')"><i class="fa-solid fa-copy"></i></button>' +
      '<button class="block-btn delete" onclick="event.stopPropagation();adminDeleteBlock(\'' + block.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
      '</div>' + blockContentHtml + '</div>';
  });
  container.innerHTML = html;
}

function adminAddBlock(type) {
  var newBlock = { id: 'block_' + Date.now() + Math.floor(Math.random()*1000), type: type, content: '', settings: type === 'heading' ? { level: 'H2' } : {} };
  _interactiveBlocks.push(newBlock);
  adminRenderBlocks();
  adminSelectBlock(newBlock.id);
  setTimeout(function() { var el = document.querySelector('#interactive-block-' + newBlock.id + ' .block-content'); if (el) el.focus(); }, 50);
}

function adminUpdateBlockContent(id, text) {
  var block = _interactiveBlocks.find(function(b) { return b.id === id; });
  if (block) block.content = text.trim();
}

function adminDeleteBlock(id) {
  _interactiveBlocks = _interactiveBlocks.filter(function(b) { return b.id !== id; });
  adminRenderBlocks();
  var panel = document.getElementById('admin-block-settings-panel');
  if (panel) panel.innerHTML = '<div class="text-center text-muted py-8 text-xs"><p>Chon mot khoi noi dung de chinh sua cai dat.</p></div>';
}

function adminDuplicateBlock(id) {
  var idx = _interactiveBlocks.findIndex(function(b) { return b.id === id; });
  if (idx !== -1) {
    var newBlock = JSON.parse(JSON.stringify(_interactiveBlocks[idx]));
    newBlock.id = 'block_' + Date.now() + Math.floor(Math.random()*1000);
    _interactiveBlocks.splice(idx + 1, 0, newBlock);
    adminRenderBlocks();
  }
}

function adminMoveBlock(index, direction) {
  if (index + direction < 0 || index + direction >= _interactiveBlocks.length) return;
  var temp = _interactiveBlocks[index];
  _interactiveBlocks[index] = _interactiveBlocks[index + direction];
  _interactiveBlocks[index + direction] = temp;
  adminRenderBlocks();
}

function adminSelectBlock(id) {
  document.querySelectorAll('.lesson-block').forEach(function(el) { el.classList.remove('active'); });
  var el = document.getElementById('interactive-block-' + id);
  if (el) el.classList.add('active');
  var block = _interactiveBlocks.find(function(b) { return b.id === id; });
  if (!block) return;
  var panel = document.getElementById('admin-block-settings-panel');
  var html = '<div class="font-bold text-xs mb-3 text-primary uppercase border-b pb-2">Cai dat khoi ' + block.type + '</div>';
  if (block.type === 'heading') {
    var selH2 = (block.settings && block.settings.level === 'H2') ? 'selected' : '';
    var selH3 = (block.settings && block.settings.level === 'H3') ? 'selected' : '';
    html += '<div class="form-group mb-3"><label class="text-xs font-bold">Cap do tieu de</label><select class="form-select text-xs" onchange="adminUpdateBlockSetting(\'' + id + '\',\'level\',this.value)"><option value="H2" ' + selH2 + '>Heading 2</option><option value="H3" ' + selH3 + '>Heading 3</option></select></div>';
  }
  if (block.type === 'heading' || block.type === 'text') {
    var aLeft = (block.settings && block.settings.align === 'left') ? 'selected' : '';
    var aCenter = (block.settings && block.settings.align === 'center') ? 'selected' : '';
    var aRight = (block.settings && block.settings.align === 'right') ? 'selected' : '';
    html += '<div class="form-group mb-3"><label class="text-xs font-bold">Can le</label><select class="form-select text-xs" onchange="adminUpdateBlockSetting(\'' + id + '\',\'align\',this.value)"><option value="left" ' + aLeft + '>Trai</option><option value="center" ' + aCenter + '>Giua</option><option value="right" ' + aRight + '>Phai</option></select></div>';
    html += '<div class="form-group mb-3"><label class="text-xs font-bold">Mau chu</label><input type="color" value="' + ((block.settings && block.settings.color) || '#000000') + '" onchange="adminUpdateBlockSetting(\'' + id + '\',\'color\',this.value)" style="width:100%;height:32px;border:none;cursor:pointer;background:transparent;"></div>';
  }
  if (block.type === 'legacyHtml') html += '<div class="text-xs text-muted">Khoi nay chua ma HTML cu. Se duoc ho tro chinh sua nang cao o cac ban cap nhat sau.</div>';
  panel.innerHTML = html;
}

function adminUpdateBlockSetting(id, key, value) {
  var block = _interactiveBlocks.find(function(b) { return b.id === id; });
  if (block) { if (!block.settings) block.settings = {}; block.settings[key] = value; adminRenderBlocks(); adminSelectBlock(id); }
}

function adminSaveInteractiveLesson(status) {
  if (!_interactiveCurrentSubjectId || !_interactiveCurrentChapterId || !_interactiveCurrentLessonId) return;
  var title = document.getElementById('admin-lesson-title-input').value.trim();
  if (!title) { showToast('Vui long nhap ten bai hoc!', 'error'); return; }
  var duration = document.getElementById('admin-lesson-duration-input').value.trim();
  var formStatus = status || document.getElementById('admin-lesson-status-select').value;
  var details = DB.getSubjectDetails(_interactiveCurrentSubjectId);
  var chap = details.chapters.find(function(c) { return c.id === _interactiveCurrentChapterId; });
  var les = chap.lessons.find(function(l) { return l.id === _interactiveCurrentLessonId; });
  les.title = title; les.duration = duration; les.status = formStatus;
  les.blocks = JSON.parse(JSON.stringify(_interactiveBlocks));
  var genHtml = '';
  _interactiveBlocks.forEach(function(b) {
    if (b.type === 'heading') { var htag = (b.settings && b.settings.level && b.settings.level.toLowerCase()) || 'h2'; genHtml += '<' + htag + ' style="text-align:' + ((b.settings && b.settings.align) || 'left') + ';color:' + ((b.settings && b.settings.color) || 'inherit') + '">' + (b.content || '') + '</' + htag + '>'; }
    else if (b.type === 'text') genHtml += '<p style="text-align:' + ((b.settings && b.settings.align) || 'left') + ';color:' + ((b.settings && b.settings.color) || 'inherit') + '">' + (b.content || '') + '</p>';
    else if (b.type === 'legacyHtml') genHtml += b.content || '';
  });
  les.content = genHtml; les.type = 'editor';
  DB.saveSubjectDetails(_interactiveCurrentSubjectId, details);
  showToast('Da luu bai hoc (' + formStatus + ')!', 'success');
  adminRenderInteractiveChaptersTree();
  document.getElementById('admin-lesson-status-select').value = formStatus;
  var badge = document.getElementById('admin-lesson-status-badge');
  if (formStatus === 'draft') { badge.className = 'badge badge-sm badge-warning'; badge.textContent = 'Nhap'; }
  else { badge.className = 'badge badge-sm badge-success'; badge.textContent = 'Cong khai'; }
}

function adminOpenAddChapterModal() {
  var title = prompt('Nhap ten chuong moi:');
  if (!title) return;
  var details = DB.getSubjectDetails(_interactiveCurrentSubjectId);
  if (!details.chapters) details.chapters = [];
  details.chapters.push({ id: 'chap_' + Date.now(), title: title, lessons: [] });
  DB.saveSubjectDetails(_interactiveCurrentSubjectId, details);
  adminRenderInteractiveChaptersTree();
  showToast('Da them chuong moi', 'success');
}

function adminDeleteChapter(chapterId) {
  if (!confirm('Ban co chac chan muon xoa chuong nay?')) return;
  var details = DB.getSubjectDetails(_interactiveCurrentSubjectId);
  details.chapters = details.chapters.filter(function(c) { return c.id !== chapterId; });
  if (_interactiveCurrentChapterId === chapterId) { adminHideInteractiveEditor(); _interactiveCurrentChapterId = null; _interactiveCurrentLessonId = null; }
  DB.saveSubjectDetails(_interactiveCurrentSubjectId, details);
  adminRenderInteractiveChaptersTree();
}

function adminOpenAddLessonModal(chapterId) {
  var title = prompt('Nhap ten bai hoc moi:');
  if (!title) return;
  var details = DB.getSubjectDetails(_interactiveCurrentSubjectId);
  var chap = details.chapters.find(function(c) { return c.id === chapterId; });
  if (!chap) return;
  if (!chap.lessons) chap.lessons = [];
  var newLesson = { id: 'les_' + Date.now(), title: title, duration: '10:00', status: 'draft', type: 'editor', blocks: [], content: '' };
  chap.lessons.push(newLesson);
  DB.saveSubjectDetails(_interactiveCurrentSubjectId, details);
  adminRenderInteractiveChaptersTree();
  adminSelectInteractiveLesson(chapterId, newLesson.id);
  showToast('Da them bai hoc moi', 'success');
}

function adminDeleteLesson(chapterId, lessonId) {
  if (!confirm('Ban co chac chan muon xoa bai hoc nay?')) return;
  var details = DB.getSubjectDetails(_interactiveCurrentSubjectId);
  var chap = details.chapters.find(function(c) { return c.id === chapterId; });
  if (!chap) return;
  chap.lessons = chap.lessons.filter(function(l) { return l.id !== lessonId; });
  if (_interactiveCurrentLessonId === lessonId) { adminHideInteractiveEditor(); _interactiveCurrentLessonId = null; }
  DB.saveSubjectDetails(_interactiveCurrentSubjectId, details);
  adminRenderInteractiveChaptersTree();
}

function adminPreviewLessonAsStudent() {
  if (!_interactiveCurrentSubjectId || !_interactiveCurrentLessonId) { showToast('Vui long chon bai hoc de xem truoc.', 'error'); return; }
  adminSaveInteractiveLesson('draft');
  NavController.openSubjectDetail(_interactiveCurrentSubjectId);
  var lesId = _interactiveCurrentLessonId;
  setTimeout(function() { if (typeof studySelectLesson === 'function') studySelectLesson(_interactiveCurrentSubjectId, null, lesId); }, 300);
}

Object.assign(window, {
  adminLoadInteractiveLessons, adminOnInteractiveSubjectChange, adminOpenAddChapterModal,
  adminOpenAddLessonModal, adminSelectInteractiveLesson, adminDeleteChapter, adminDeleteLesson,
  adminAddBlock, adminUpdateBlockContent, adminUpdateBlockSetting, adminDeleteBlock,
  adminDuplicateBlock, adminMoveBlock, adminSelectBlock, adminSaveInteractiveLesson,
  adminPreviewLessonAsStudent,
});
