/**
 * app.js — Main Application Controller
 * Điều phối toàn bộ logic của ứng dụng
 */

import { DB } from './modules/db.js?v=20260908review-editor-fix2';
import { AIPool } from './modules/aiPool.js?v=20260926-approved-study-tools';
import { Generator } from './modules/generator.js';
import { ExamEngine, ExamTimer } from './modules/exam.js';
import { ceraChat, ceraAnalyzeImage, verifyAndFixQuestion, setCurrentQuestion } from './modules/cera.js';
import { pullFromGitHub, pullAdminEdits, fetchWebContent, pullResourcesFromServer, pullArticlesFromServer, pullAnnouncementsFromServer, pullUserRolesFromServer, pullFeedbacksFromServer, pullSubjectDetailsFromServer } from './modules/sync.js?v=20260908subject-details-api1';
import { initAdminAuth } from './modules/admin.js';
import { SUBJECTS_REGISTRY, KNOWLEDGE_BLOCKS, getAllSubjects, getSubjectById, getSubjectsByBlock } from './modules/subjects.js?v=20260901c';
import { NavController } from './modules/navigation.js?v=20260921-deep-link-history';
import { AuthModule, getUserRole, SUPER_ADMIN_EMAILS } from './modules/auth.js?v=20260920-profile-hero-cleanup';
import { ArticlesModule } from './modules/articles.js?v=20260921-deep-link-history';
import { readSummary, writeSummary, clearSessionCache, summaryIsComplete, summaryIsStale } from './modules/firestoreSummary.js';
import { renderMindmap, renderStructuredMindmap, initMindmapControls } from './modules/mindmap.js';
import { updateUserRoleInFirestore } from './modules/firestoreUsers.js';

const _lazyAssets = new Map();

function loadExternalScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if (_lazyAssets.has(src)) return _lazyAssets.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (globalName && !window[globalName]) {
        reject(new Error(`Thư viện không tạo được ${globalName}`));
        return;
      }
      resolve(globalName ? window[globalName] : true);
    };
    script.onerror = () => reject(new Error(`Không thể tải thư viện: ${src}`));
    document.head.appendChild(script);
  });
  _lazyAssets.set(src, promise);
  return promise;
}

async function ensurePdfJs() {
  const pdfjs = await loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
  if (pdfjs?.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  return pdfjs;
}
window.ensurePdfJs = window.ensurePdfJs || ensurePdfJs;

function ensureMammoth() {
  return loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', 'mammoth');
}
window.ensureMammoth = window.ensureMammoth || ensureMammoth;

function ensureTinyMCE() {
  return loadExternalScript('https://cdnjs.cloudflare.com/ajax/libs/tinymce/6.8.2/tinymce.min.js', 'tinymce');
}

window.ensureAdminDashboard = window.ensureAdminDashboard || (() => import('./modules/adminDashboard.js?v=20260912-admin-redesign'));
let _seedQuestionsPromise = null;
async function ensureStudySeed() {
  if (!_seedQuestionsPromise) {
    _seedQuestionsPromise = import('./data/seed_questions.js').then(({ SEED_QUESTIONS }) => {
      DB.addQuestions(SEED_QUESTIONS, { skipSync: true });
      DB.markSeedLoaded();
      return SEED_QUESTIONS.length;
    });
  }
  return _seedQuestionsPromise;
}
window.ensureStudySeed = window.ensureStudySeed || ensureStudySeed;

async function shareUrl(url, title) {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
    } else {
      await navigator.clipboard.writeText(url);
      showToast('Đã sao chép liên kết chia sẻ.', 'success');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('[Share] Không thể chia sẻ liên kết:', error);
      showToast('Không thể chia sẻ liên kết trên trình duyệt này.', 'error');
    }
  }
}

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
  const initialRoute = NavController.getSharedRoute();
  if (['ontap', 'aigen', 'history'].includes(initialRoute.page)) {
    void ensureStudySeed().catch(error => {
      console.error('[Study] Không thể tải ngân hàng câu hỏi:', error);
      window.showToast?.('Không thể tải ngân hàng câu hỏi. Vui lòng thử lại.', 'error');
    });
  }

  // Dữ liệu không bắt buộc cho route đầu tiên được đồng bộ nền, không chặn
  // việc hiển thị deep-link hoặc trang chủ.
  async function syncNonCriticalData() {
  // Kéo dữ liệu cộng đồng từ GitHub
  pullFromGitHub(DB).then(res => {
    if (res.questions > 0 || res.sources > 0) {
      updateBankCount();
      if (document.getElementById('bank-tab').classList.contains('active')) {
        renderBank();
      }
    }
  }).catch(error => {
    console.warn('[Community] Không thể đồng bộ dữ liệu cộng đồng:', error);
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
  }

  // Apply saved theme
  const settings = DB.getSettings();
  if (settings.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  updateThemeButton(settings.theme === 'dark' ? 'dark' : 'light');

  updateBankCount();
  initSubjectSelector();
  await NavController.init();
  await NavController.restoreSharedRoute();
  window.setTimeout(() => {
    void syncNonCriticalData().catch(error => {
      console.warn('[Startup] Đồng bộ dữ liệu nền thất bại:', error);
    });
    void Promise.resolve(window.refreshUserRolesFromServer?.()).catch(error => {
      console.warn('[Roles] Đồng bộ nền thất bại:', error);
    });
    void Promise.resolve(window.refreshAnnouncementsFromServer?.()).catch(error => {
      console.warn('[Announcements] Đồng bộ nền thất bại:', error);
    });
  }, 1200);
  setTimeout(() => updateHomeStats(), 150);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void window.refreshUserRolesFromServer?.();
    void window.refreshAnnouncementsFromServer?.();
  });

  // Kéo bản vá của admin từ server về và patch lên DB local
  // (Patch được ưu tiên hơn seed, giúp Admin sửa câu hỏi mà không cần đụng tới code)
  window.setTimeout(async () => {
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
  }, 1800);

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
  await ensurePdfJs();
  
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
  await ensureMammoth();
  
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

  if (!window.requireLoggedInForFeature || !window.requireLoggedInForFeature('trợ lý AI')) {
    return;
  }

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
        <div class="cera-msg-avatar"><img src="chatbot.webp" alt="FTECA" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"></div>
        <div class="cera-msg-bubble">
          <p>Đã dọn dẹp xong lịch sử chat cũ rồi nè! ✨ Cần tám chuyện hay hỏi bài gì cậu cứ nhắn tớ tiếp nha~ 🪷</p>
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

  if (!window.requireLoggedInForFeature || !window.requireLoggedInForFeature('trợ lý AI')) {
    return;
  }

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
  shareUrl,
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
  if (tabName === 'overview') { renderAdminDashboard(); }
  else if (tabName === 'users') { renderAdminUserList(); }
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
  else if (tabName === 'review-lessons') { initReviewLessonAdmin(); }
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

  if (window.renderAdminDashboardExtras) window.renderAdminDashboardExtras();
}



function formatRelativeTime(iso) {
  const ts = Date.parse(iso || '');
  if (!ts) return 'Chưa ghi nhận';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(ts).toLocaleDateString('vi-VN');
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
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Không tìm thấy học viên nào phù hợp.</td></tr>`;
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
    const lastLoginTs = Date.parse(u.lastLogin || '') || 0;
    const online = lastLoginTs && (Date.now() - lastLoginTs) < 30 * 60 * 1000;

    return `
      <tr>
        <td class="font-bold">${idx + 1}</td>
        <td>
          <div class="adm-user-cell">
            <img class="adm-avatar" src="${u.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(u.name || 'User')}" referrerpolicy="no-referrer" alt="">
            <span class="font-semibold">${escapeHtml(u.name || 'Học viên')}</span>
          </div>
        </td>
        <td class="font-mono text-xs">${escapeHtml(u.email || '')}</td>
        <td>${roleBadge}</td>
        <td class="text-xs text-muted" title="${escapeHtml(formattedDate)}">${formatRelativeTime(u.lastLogin)}</td>
        <td><span class="adm-status ${online ? 'online' : 'offline'}"><i></i>${online ? 'Online' : 'Offline'}</span></td>
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
  const firestoreResult = await updateUserRoleInFirestore(cleanEmail, 'PREMIUM');
  const announcement = await DB.createPremiumRoleAnnouncement(cleanEmail, 'premium_granted');
  const isSynced = (result.synced || firestoreResult.ok) && announcement.synced;
  showToast(isSynced ? `🎉 Đã cấp quyền PREMIUM cho [${cleanEmail}] và đồng bộ Cloud!` : `⚠️ Đã cấp PREMIUM cho [${cleanEmail}] cục bộ, nhưng cloud chưa đồng bộ đầy đủ.`, isSynced ? 'success' : 'warning');
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
  const firestoreResult = await updateUserRoleInFirestore(cleanEmail, 'NEWBIE');
  const announcement = await DB.createPremiumRoleAnnouncement(cleanEmail, 'premium_revoked');
  const isSynced = (result.synced || firestoreResult.ok) && announcement.synced;
  showToast(isSynced ? `ℹ️ Đã hạ [${cleanEmail}] xuống NEWBIE và đồng bộ Cloud!` : `⚠️ Đã hạ [${cleanEmail}] xuống NEWBIE cục bộ, nhưng cloud chưa đồng bộ đầy đủ.`, isSynced ? 'info' : 'warning');
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

async function _initTinyMCEEditors() {
  await ensureTinyMCE();
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
      await ensurePdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        text += tc.items.map(s => s.str).join(' ') + '\n';
      }
    } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
      await ensureMammoth();
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
  if (context.summaryResult) {
    return {
      ...context,
      details: { chapters: [] },
      resources: [],
      resource: null,
      lesson: null,
      summaryResult: context.summaryResult
    };
  }
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
  if (data.summaryResult) {
    const result = data.summaryResult;
    return [
      result.title,
      result.overview,
      ...(result.key_points || []),
      ...(result.chapters || []).flatMap(chapter => [chapter.title, chapter.content, ...(chapter.key_points || [])])
    ].filter(Boolean).join('\n\n');
  }
  return data.resource ? [data.resource.name, stripStudyReaderText(data.resource.content), data.resource.description].filter(Boolean).join('\n\n') : [data.lesson?.title, ...(data.lesson?.blocks || []).map(b => stripStudyReaderText(b.content))].filter(Boolean).join('\n\n');
}
function safeStudyReaderRichText(html) {
  const template = document.createElement('template'); template.innerHTML = String(html || '');
  const allowed = new Set(['P','DIV','BR','STRONG','B','EM','I','U','UL','OL','LI','H2','H3','H4','BLOCKQUOTE','PRE','CODE','A','IMG','TABLE','THEAD','TBODY','TR','TH','TD','VIDEO','SOURCE','IFRAME']);
  template.content.querySelectorAll('*').forEach(node => {
    if (!allowed.has(node.tagName)) return node.replaceWith(document.createTextNode(node.textContent || ''));
    [...node.attributes].forEach(attr => { const floating = node.tagName === 'IMG' && ((attr.name === 'class' && attr.value === 'review-floating-media') || (['data-review-float-x','data-review-float-y'].includes(attr.name) && /^-?\d{1,4}$/.test(attr.value))); const media = ['IMG','VIDEO','SOURCE','IFRAME'].includes(node.tagName) && ['src','alt','title','width','height','controls','allowfullscreen'].includes(attr.name) && (attr.name !== 'src' || (isStudyReaderAllowedUrl(attr.value) && (node.tagName !== 'IFRAME' || /youtube\.com|youtu\.be|vimeo\.com/i.test(new URL(attr.value).hostname)))); const valid = (node.tagName === 'A' && attr.name === 'href' && isStudyReaderAllowedUrl(attr.value)) || media || floating; if (!valid) node.removeAttribute(attr.name); });
    if (node.tagName === 'A') { node.target = '_blank'; node.rel = 'noopener noreferrer'; } if (node.tagName === 'IMG' && node.classList.contains('review-floating-media')) { const x = Number(node.getAttribute('data-review-float-x') || 0), y = Number(node.getAttribute('data-review-float-y') || 0); node.style.position = 'absolute'; node.style.left = Math.max(-240, Math.min(900, x)) + 'px'; node.style.top = Math.max(-240, Math.min(1600, y)) + 'px'; }
  }); return template.innerHTML;
}
function studyReaderExternalButton(url) { return isStudyReaderAllowedUrl(url) ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> Mở tài liệu gốc</a>` : ''; }
function renderStudyReaderContent(context = _studyReaderContext || {}) {
  const data = getStudyReaderDetails(context); _studyReaderContext = { ...data, resourceId: data.resource?.id || null, lessonId: data.lesson?.id || null };
  const content = document.getElementById('study-reader-content'); if (!content) return data;
  if (data.summaryResult) {
    const result = data.summaryResult;
    const chapters = Array.isArray(result.chapters) ? result.chapters : [];
    const chapterHtml = chapters.map((chapter, index) => `<section class="summary-study-chapter" id="summary-study-chapter-${index + 1}"><h2>${escapeHtml(chapter.title || `Chương ${index + 1}`)}</h2>${chapter.content ? `<div class="student-reader-body">${_csMarkdown(chapter.content)}</div>` : ''}${Array.isArray(chapter.key_points) && chapter.key_points.length ? `<ul>${chapter.key_points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}</section>`).join('');
    content.innerHTML = `<header class="study-reader-document-head"><span class="study-reader-kicker"><i class="fa-solid fa-graduation-cap"></i> KHÔNG GIAN ÔN TẬP</span><div class="study-reader-doc-number">01</div><div><h1>${escapeHtml(result.title || context.title || 'Tài liệu ôn tập')}</h1><p>Đọc tài liệu, ghi chú và trao đổi với AI Tutor trong cùng một không gian.</p></div></header><section class="student-reader-body summary-study-overview">${result.overview ? _csMarkdown(result.overview) : ''}${Array.isArray(result.key_points) && result.key_points.length ? `<h2>Điểm cần nhớ</h2><ul>${result.key_points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}</section>${chapterHtml || '<p class="interactive-reader-text">Bản tóm tắt chưa có nội dung chương.</p>'}`;
  } else if (data.resource) {
    const r = data.resource, url = isStudyReaderAllowedUrl(r.url) ? r.url : '', embeddable = url && (/\.pdf(?:[?#]|$)/i.test(url) || /drive\.google\.com|youtu(?:\.be|be\.com)/i.test(url));
    content.innerHTML = `<header class="study-reader-document-head"><span class="study-reader-kicker"><i class="fa-solid fa-file-lines"></i> TÀI LIỆU HỌC TẬP</span><div class="study-reader-doc-number">${escapeHtml(String(r.readerConfig?.order || '•'))}</div><div><h1>${escapeHtml(r.name || 'Tài liệu')}</h1><p>${escapeHtml(r.description || '')}</p></div></header>${r.content ? `<section class="student-reader-body">${safeStudyReaderRichText(r.content)}</section>` : '<div class="study-reader-empty"><div><i class="fa-solid fa-pen-to-square"></i><p>Admin chưa đăng nội dung trọng tâm cho tài liệu này.</p><small>File gốc có thể tải từ nút ở góc trên bên phải.</small></div></div>'}`;
  } else if (data.lesson) {
    const outline = buildLessonOutline(data.lesson.blocks); let n = 0;
    const body = (data.lesson.blocks || []).map(b => { const text = escapeHtml(b.content || '').replace(/\n/g, '<br>'); if (b.type === 'lessonDocument') return `<article class="review-lesson-document">${safeStudyReaderRichText(b.content)}</article>`; if (b.type === 'image' && isStudyReaderAllowedUrl(b.src)) return `<figure class="review-lesson-media-reader"><img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.alt || '')}"></figure>`; if (b.type === 'video' && isStudyReaderAllowedUrl(b.src)) return `<p class="review-lesson-media-reader"><a href="${escapeHtml(b.src)}" target="_blank" rel="noopener noreferrer">Mở video bài giảng</a></p>`; if (b.type === 'heading') { const h = outline[n++]; return `<${h.level} id="${h.id}" class="interactive-reader-heading">${text}</${h.level}>`; } return b.type === 'legacyHtml' ? `<div class="student-reader-body">${safeStudyReaderRichText(b.content)}</div>` : `<p class="interactive-reader-text">${text}</p>`; }).join('') || '<p class="interactive-reader-text">Bài học chưa có nội dung soạn thảo.</p>';
    content.innerHTML = `<header class="study-reader-document-head"><span class="study-reader-kicker"><i class="fa-solid fa-book-open"></i> BÀI GIẢNG TƯƠNG TÁC</span><div class="study-reader-doc-number">01</div><div><h1>${escapeHtml(data.lesson.title || 'Bài giảng')}</h1></div></header><section class="student-reader-body">${body}</section>`;
  } else content.innerHTML = '<div class="study-reader-empty"><div><i class="fa-solid fa-book-open-reader"></i><p>Chưa có bài giảng hoặc tài liệu đã xuất bản.</p></div></div>';
  restoreStudyReaderHighlights(); mountStudyReaderAnnotationLayer(); return data;
}
function renderStudyReaderToc(context = _studyReaderContext || {}) {
  const data = getStudyReaderDetails(context), list = document.getElementById('study-reader-toc-list'); if (!list) return; list.innerHTML = '';
  const add = (label, action, active = false) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.readerLabel = label.toLocaleLowerCase('vi-VN'); button.textContent = label; button.classList.toggle('active', active); button.onclick = action; list.appendChild(button); };
  if (data.summaryResult) {
    add('Tổng quan', () => document.getElementById('study-reader-content')?.scrollTo({ top: 0, behavior: 'smooth' }), true);
    (data.summaryResult.chapters || []).forEach((chapter, index) => add(chapter.title || `Chương ${index + 1}`, () => document.getElementById(`summary-study-chapter-${index + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
    return;
  }
  (data.details.chapters || []).forEach(chapter => { const heading = document.createElement('div'); heading.className = 'study-reader-toc-chapter'; heading.textContent = chapter.title || 'Chương học'; list.appendChild(heading);  (chapter.lessons || []).forEach(lesson => { add(lesson.title || 'Bài học', () => renderStudyReader({ subjectId: data.subjectId, chapterId: chapter.id, lessonId: lesson.id, returnPage: data.returnPage || 'subject-detail' }), data.lesson?.id === lesson.id); if (data.lesson?.id === lesson.id) buildLessonOutline(lesson.blocks).forEach(item => add(`↳ ${item.title}`, () => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))); }); });
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

let _studyReaderSummaryMode = 'study'; // ✅ DEFAULT: Tóm tắt chi tiết (thay vì 'quick')
let _studyReaderSummary = null;
function getLessonSummarySource(lesson = {}) {
  const allowed = new Set(['heading', 'text', 'lessonDocument', 'legacyHtml']);
  return (Array.isArray(lesson.blocks) ? lesson.blocks : []).filter(block => allowed.has(block?.type))
    .map(block => stripStudyReaderText(block.content)).filter(Boolean).join('\n\n') || stripStudyReaderText(lesson.content);
}
function lessonSummaryHash(chapter = {}, lesson = {}) {
  const value = `${chapter.title || ''}\n${lesson.title || ''}\n${getLessonSummarySource(lesson)}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `v1-${(hash >>> 0).toString(16)}-${value.length}`;
}
function renderStudyReaderSummary(summary) {
  const result = document.getElementById('study-reader-ai-result');
  if (!result) return;
  if (!summary) { result.innerHTML = ''; return; }
  const section = (title, items) => items?.length ? `<section><b>${title}</b><ul>${items.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul></section>` : '';
  result.innerHTML = `${section('Ý chính', summary.mainPoints)}${section('Từ khóa cần nhớ', summary.keywords)}${section('Lưu ý dễ nhầm', summary.pitfalls)}${section('Câu hỏi ôn nhanh', summary.quickQuestions)}<small>Nguồn: ${escapeHtml(summary.source || '')}</small>`;
}
function setStudyReaderSummaryStatus(text, state = '') {
  const status = document.getElementById('study-reader-ai-status');
  if (status) { status.textContent = text; status.dataset.state = state; }
}
async function loadStudyReaderSummaryCache() {
  const data = getStudyReaderDetails(_studyReaderContext || {}), lesson = data.lesson;
  const saveBtn = document.getElementById('study-reader-ai-save');
  const regenBtn = document.getElementById('study-reader-ai-regenerate');
  if (saveBtn) saveBtn.disabled = true;

  if (!lesson) {
    setStudyReaderSummaryStatus('Chỉ hỗ trợ tóm tắt bài giảng chính thức.', 'empty');
    if (regenBtn) regenBtn.disabled = true;
    renderStudyReaderSummary(null);
    return;
  }
  const ai = lesson.aiSummary || {};
  if (!ai.enabled) {
    setStudyReaderSummaryStatus('Admin chưa bật AI tóm tắt cho bài này.', 'disabled');
    if (regenBtn) regenBtn.disabled = true;
    renderStudyReaderSummary(null);
    return;
  }

  if (regenBtn) regenBtn.disabled = false;

  const subjectId = data.subjectId;
  const lessonId = lesson.id;

  setStudyReaderSummaryStatus('Đang tải tóm tắt…', 'loading');
  try {
    const firestoreData = await readSummary(subjectId, lessonId);
    if (firestoreData && firestoreData[_studyReaderSummaryMode]) {
      const summaryObj = firestoreData[_studyReaderSummaryMode];
      _studyReaderSummary = summaryObj;
      renderStudyReaderSummary(summaryObj);
      setStudyReaderSummaryStatus('Bản tóm tắt tiêu chuẩn từ hệ thống.', 'ready');
      if (saveBtn) saveBtn.disabled = false;
    } else {
      _studyReaderSummary = null;
      renderStudyReaderSummary(null);
      setStudyReaderSummaryStatus('Bản tóm tắt cho bài này đang được chuẩn bị. Bạn có thể bấm "Tạo lại bằng AI".', 'empty');
    }
  } catch (err) {
    console.warn('[StudyReader] Lỗi tải tóm tắt:', err);
    _studyReaderSummary = null;
    renderStudyReaderSummary(null);
    setStudyReaderSummaryStatus('Bản tóm tắt cho bài này đang được chuẩn bị.', 'empty');
  }
}

async function requestStudentSummaryRegenerate() {
  const data = getStudyReaderDetails(_studyReaderContext || {}), lesson = data.lesson;
  if (!lesson) return showToast('Không tìm thấy bài giảng.', 'error');
  const source = getLessonSummarySource(lesson);
  if (source.length < 40) return showToast('Bài học chưa có đủ nội dung để tóm tắt.', 'info');

  const chapter = data.details?.chapters?.find(ch => ch.id === data.chapterId) || {};
  const btnRegen = document.getElementById('study-reader-ai-regenerate');
  const btnSave = document.getElementById('study-reader-ai-save');
  if (btnRegen) btnRegen.disabled = true;

  const modeLabels = { quick: '1 phút', study: 'Chi tiết' }; // ✅ XÓA 'exam': 'Học kỹ'
  const modeName = modeLabels[_studyReaderSummaryMode] || 'bài học';
  setStudyReaderSummaryStatus(`Đang tạo tóm tắt mới bằng AI (${modeName})…`, 'loading');

  try {
    const result = await AIPool.generateLessonSummary({
      mode: _studyReaderSummaryMode,
      chapterTitle: chapter.title || 'Chương học',
      lessonTitle: lesson.title || 'Bài học',
      source,
      instruction: ''
    });

    _studyReaderSummary = result;
    renderStudyReaderSummary(result);
    setStudyReaderSummaryStatus('Đã tạo bản tóm tắt mới thành công bằng AI.', 'ready');
    if (btnSave) btnSave.disabled = false;
    showToast('✨ Đã tạo bản tóm tắt mới thành công!', 'success');
  } catch (error) {
    console.error('[Student Summary Regenerate] Lỗi:', error);
    setStudyReaderSummaryStatus(error.message || 'Không thể tạo lại tóm tắt. Vui lòng thử lại!', 'error');
  } finally {
    if (btnRegen) btnRegen.disabled = false;
  }
}

function initStudyReaderSummaryControls() {
  document.querySelectorAll('[data-summary-mode]').forEach(button => {
    button.onclick = () => {
      // 🚧 KHÓA NÚT "ÔN THI" (exam mode)
      if (button.dataset.summaryMode === 'exam') {
        alert('🚧 Tính năng "Ôn thi" đang được nâng cấp. Vui lòng sử dụng chế độ "Chi tiết" hoặc "1 phút".');
        return;
      }
      
      _studyReaderSummaryMode = button.dataset.summaryMode;
      document.querySelectorAll('[data-summary-mode]').forEach(item => item.classList.toggle('active', item === button));
      loadStudyReaderSummaryCache();
    };
  });

  const btnSummary = document.getElementById('study-reader-ai-summary');
  if (btnSummary) btnSummary.style.display = 'none';

  const btnRegen = document.getElementById('study-reader-ai-regenerate');
  if (btnRegen) {
    btnRegen.style.display = 'inline-flex';
    btnRegen.onclick = requestStudentSummaryRegenerate;
  }

  const instructionInput = document.getElementById('study-reader-ai-instruction');
  if (instructionInput) instructionInput.style.display = 'none';

  document.getElementById('study-reader-ai-save')?.addEventListener('click', () => {
    if (!_studyReaderSummary) return;
    const text = [
      'Ý chính', ...(_studyReaderSummary.mainPoints || []), '',
      'Từ khóa cần nhớ', ...(_studyReaderSummary.keywords || []), '',
      'Lưu ý dễ nhầm', ...(_studyReaderSummary.pitfalls || []), '',
      'Câu hỏi ôn nhanh', ...(_studyReaderSummary.quickQuestions || []), '',
      `Nguồn: ${_studyReaderSummary.source || ''}`
    ].join('\n');
    const input = document.getElementById('study-reader-note-input');
    if (input) {
      input.value += `${input.value ? '\n\n' : ''}${text}`;
      saveStudyReaderNote({ text: input.value });
    }
  });

  document.getElementById('study-reader-ai-explain')?.addEventListener('click', () => showToast('Tính năng giải thích phần bôi đen sẽ hoàn thiện ở giai đoạn tiếp theo.', 'info'));

  loadStudyReaderSummaryCache();
}

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

function renderStudyReader(context = {}) { _studyReaderContext = { ...context, returnPage: context.returnPage || 'curriculum-summary' }; const subject = getAllSubjects().find(s => s.id === context.subjectId) || {}; const crumb = document.getElementById('study-reader-crumb'); if (crumb) crumb.textContent = context.summaryResult ? 'Ôn tập · Tóm tắt chi tiết' : `${subject.code || context.subjectId || ''} · ${subject.name || 'Tài liệu học tập'}`; renderStudyReaderContent(_studyReaderContext); renderStudyReaderToc(_studyReaderContext); renderStudyReaderHeaderResourceLink(_studyReaderContext); bindStudyReaderControls(); bindStudyReaderDrawers(); loadStudyReaderNote(); initStudyReaderSummaryControls(); }
function isReaderResourceSupported(r) { return Boolean(r?.content || isStudyReaderAllowedUrl(r?.url)); }
function openUnsupportedResourceViewer(subjectId, resource) {
  const modal = document.getElementById('modal-subject-resource-viewer');
  if (!modal) return;
  const titleEl = document.getElementById('resource-viewer-title');
  const codeEl = document.getElementById('resource-viewer-subject-code');
  if (titleEl) titleEl.textContent = resource.name || 'Tài liệu';
  if (codeEl) codeEl.textContent = subjectId;
  const target = document.getElementById('resource-viewer-content-list') || document.getElementById('resource-viewer-content');
  if (target) {
    target.innerHTML = `
      <div class="picker-item-card empty-card" style="margin: 10px 0;">
        <div class="empty-icon-wrap" style="background:#fff7ed;color:#ea580c;">
          <i class="fa-solid fa-file-arrow-down"></i>
        </div>
        <div class="empty-text-wrap">
          <h4>Định dạng tài liệu bên ngoài</h4>
          <p>Tài liệu này không hỗ trợ chế độ xem trực tiếp. Bạn có thể mở liên kết gốc hoặc tải về máy để xem.</p>
          <div style="margin-top:12px;">
            ${studyReaderExternalButton(resource.url)}
          </div>
        </div>
      </div>
    `;
  }
  modal.classList.add('open');
}
function openUserResourceViewer(subjectId, category) {
  if (category === 'quiz') return NavController.startSubjectExam(subjectId);
  
  const resources = DB.getResources(subjectId).filter(r => r.type === category && r.readerConfig?.visibility !== 'draft');
  const allSubs = typeof getAllSubjects === 'function' ? getAllSubjects() : [];
  const subject = allSubs.find(s => s.id === subjectId) || { id: subjectId, name: subjectId, code: subjectId };
  
  const categoryTitle = category === 'exam' ? 'Chọn Đề Thi Ôn Tập' : 'Chọn Tài Liệu Học Tập';
  const categoryBadge = category === 'exam' ? 'Đề Thi Các Năm' : 'Bài Giảng Interactive';
  const headerIcon = category === 'exam' ? 'fa-file-signature' : 'fa-book-open-reader';
  
  const picker = document.createElement('div');
  picker.className = 'modal-overlay open study-reader-resource-picker';
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-modal', 'true');

  const itemsList = (resources.length ? resources : [{
    name: category === 'exam' ? 'Chưa có đề thi các năm được đăng' : 'Bài giảng tương tác',
    fallback: true,
    empty: category === 'exam'
  }]);

  picker.innerHTML = `
    <div class="modal-box picker-modal-box">
      <div class="picker-modal-header">
        <div class="picker-header-meta">
          <span class="picker-subject-tag">
            <i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(subject.code || subjectId)} · ${escapeHtml(subject.name || '')}
          </span>
          <span class="picker-category-chip">${categoryBadge}</span>
        </div>
        <div class="picker-title-row">
          <h2 class="picker-title"><i class="fa-solid ${headerIcon} picker-title-icon"></i> ${categoryTitle}</h2>
          <button class="picker-close-btn" type="button" aria-label="Đóng">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <p class="picker-subtitle">Vui lòng chọn tài liệu bạn muốn mở đọc và ghi chú trực tiếp.</p>
      </div>

      <div class="study-reader-picker-list"></div>

      <div class="picker-handwritten-footer">
        <div class="picker-handwritten-note">
          <div class="picker-handwritten-wrap">
            <span class="picker-handwritten-text">Học tốt nhé! ✨</span>
            <svg class="picker-doodle-underline" viewBox="0 0 100 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 10 C 25 15, 65 14, 96 6" stroke="#08bd79" stroke-width="2.2" stroke-linecap="round"/>
              <path d="M88 4 L90 7 L93 8 L90 9 L88 12 L86 9 L83 8 L86 7 Z" fill="#34d399" opacity="0.9"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  `;

  const close = () => picker.remove();
  picker.querySelector('.picker-close-btn').onclick = close;
  picker.onclick = (e) => {
    if (e.target === picker) close();
  };

  const list = picker.querySelector('.study-reader-picker-list');
  
  itemsList.forEach((r) => {
    const itemCard = document.createElement('div');
    
    if (r.empty) {
      itemCard.className = 'picker-item-card empty-card';
      itemCard.innerHTML = `
        <div class="empty-icon-wrap">
          <i class="fa-solid fa-folder-open"></i>
        </div>
        <div class="empty-text-wrap">
          <h4>${escapeHtml(r.name)}</h4>
          <p>Đề thi cho môn học này đang được đội ngũ FTECA cập nhật. Vui lòng quay lại sau!</p>
        </div>
      `;
    } else {
      itemCard.className = 'picker-item-card';
      const fileExt = r.url ? r.url.split('.').pop().toUpperCase() : (r.fallback ? 'DOC' : 'DOC');
      const iconClass = category === 'exam' ? 'fa-file-lines' : (r.fallback ? 'fa-book-bookmark' : 'fa-file-pdf');
      
      itemCard.innerHTML = `
        <div class="picker-item-icon">
          <i class="fa-solid ${iconClass}"></i>
        </div>
        <div class="picker-item-info">
          <div class="picker-item-title">${escapeHtml(r.name)}</div>
          <div class="picker-item-meta">
            <span class="picker-item-type-badge">${r.fallback ? 'Tài liệu' : escapeHtml(fileExt)}</span>
            <span class="picker-item-status"><i class="fa-solid fa-circle-check"></i> Đã sẵn sàng</span>
          </div>
        </div>
        <button type="button" class="picker-item-action-btn">
          <span>Xem ngay</span>
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      `;

      itemCard.onclick = () => {
        close();
        if (r.empty) return showToast('Đề thi các năm đang được cập nhật.', 'info');
        if (r.fallback) NavController.openStudyReader({ subjectId, returnPage: 'subject-detail' });
        else if (isReaderResourceSupported(r)) NavController.openStudyReader({ subjectId, resourceId: r.id, returnPage: 'subject-detail' });
        else openUnsupportedResourceViewer(subjectId, r);
      };
    }

    list.appendChild(itemCard);
  });

  document.body.appendChild(picker);
}
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

// ── Yêu cầu đăng nhập trước khi sử dụng các tính năng AI ───────────────────
window.requireLoggedInForFeature = function(featureName = 'tính năng này') {
  const user = NavController?.currentUser || AuthModule?.user;
  if (user && user.email) return true;

  showToast(`🔒 Vui lòng đăng nhập bằng Google để sử dụng ${featureName}.`, 'error');

  const loginBtn = document.querySelector('.btn-google-signin');
  if (loginBtn) {
    loginBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    loginBtn.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.25)';
    setTimeout(() => {
      if (loginBtn) loginBtn.style.boxShadow = '';
    }, 1600);
  }
  return false;
};

// ── Khoá tính năng đang phát triển với user thường ───────────────────────────
window._guardDevFeature = function(featureName = 'Tính năng này') {
  const user = NavController?.currentUser;
  const isAdmin = user && user.email && SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase());
  if (isAdmin) {
    showToast(`🛠️ [Admin] Đang phát triển: ${featureName}`, 'info');
    return true;
  }
  showToast(`🚧 ${featureName} đang được phát triển — sẽ sớm ra mắt!`, 'info');
  return false;
};

// ── Cập nhật stats trang chủ theo thời gian thực ──────────────────────────────
function updateHomeStats() {
  const elSubjects  = document.getElementById('stat-subjects');
  const elQuestions = document.getElementById('stat-questions');
  const elUsers     = document.getElementById('stat-users');

  if (!elSubjects && !elQuestions && !elUsers) return; // chưa render

  const subjects  = getAllSubjects();
  const bank      = DB.getBank();
  const users     = DB.getAllRegisteredUsers();

  // Môn học hỗ trợ
  if (elSubjects) {
    const count = subjects.length || 0;
    elSubjects.textContent = count > 0 ? count + '+' : '35+';
  }
  // Floating card môn học
  const elFloat = document.getElementById('stat-subjects-float');
  if (elFloat) {
    const count = subjects.length || 0;
    elFloat.textContent = count > 0 ? count + '+' : '35+';
  }

  // Câu hỏi ngân hàng đề
  if (elQuestions) {
    const count = bank.length || 0;
    if (count >= 1000) {
      elQuestions.textContent = (count / 1000).toFixed(1).replace('.0','') + 'K+';
    } else if (count > 0) {
      elQuestions.textContent = count.toLocaleString('vi-VN') + '+';
    } else {
      elQuestions.textContent = '5.000+';
    }
  }

  // Sinh viên đang học
  if (elUsers) {
    const count = users.length || 0;
    if (count >= 1000) {
      elUsers.textContent = (count / 1000).toFixed(1).replace('.0','') + 'K+';
    } else if (count > 0) {
      elUsers.textContent = count + '+';
    } else {
      elUsers.textContent = '1K+';
    }
  }
}

// Gọi lần đầu + cập nhật mỗi 30 giây
window.updateHomeStats = updateHomeStats;
setInterval(updateHomeStats, 30000);

function studySpaceAIAction(action) {
  if (action === 'quiz') {
    if (!window.requireLoggedInForFeature('Tạo đề thi AI')) return;
    return NavController.navigateToPage('aigen');
  }
  if (action === 'summary') {
    if (!window.requireLoggedInForFeature('Tóm tắt giáo trình')) return;
    return NavController.navigateToPage('curriculum-summary');
  }
  if (action === 'chat') {
    if (!window.requireLoggedInForFeature('trợ lý AI')) return;
    const panel = document.getElementById('cera-panel');
    if (!panel || !panel.classList.contains('is-open')) toggleCeraChat();
    return;
  }
  const messages = { plan:'Lộ trình ôn tập sẽ được cá nhân hóa theo môn bạn chọn.' };
  showToast(messages[action] || 'Tính năng AI đang được chuẩn bị.', 'info');
}

function renderStudySpace() {
  const root = document.getElementById('study-space-root');
  if (!root) return;
  const subjects = getStudySpaceSubjects();
  const allSubjects = getAllSubjects();
  const contentCount = subjects.reduce((total, subject) => total + subject.articles.length, 0);
  const aiTools = [['quiz','fa-file-circle-plus','Tạo đề thi AI','Tạo đề trắc nghiệm theo chương, chủ đề hoặc môn học.','violet'],['summary','fa-wand-magic-sparkles','Tóm tắt giáo trình AI','Chắt lọc nội dung dài thành bản ngắn gọn, dễ hiểu.','green'],['plan','fa-calendar-check','Lên kế hoạch ôn thi','Xây lộ trình phù hợp với mục tiêu của bạn.','blue'],['chat','fa-comments','Hỏi đáp cùng AI','Giải đáp nhanh mọi thắc mắc trong quá trình học.','orange']];
  root.innerHTML = `<div class="study-hub-shell"><main class="study-hub-main"><section class="study-hub-hero"><div class="study-hub-hero-copy"><span class="study-hub-kicker"><i class="fa-solid fa-graduation-cap"></i> KHÔNG GIAN HỌC TẬP</span><h1>Khám phá môn học<br>theo <em>cách của bạn</em></h1><p></p><div class="study-hub-hero-actions"><button onclick="studySpaceAIAction('chat')"><i class="fa-solid fa-sparkles"></i> Hỏi trợ lý AI</button></div></div><div class="study-hub-hero-art" aria-label="Vùng minh họa nhân vật sẽ được bổ sung"><div class="study-hub-art-orb orb-one"></div><div class="study-hub-art-orb orb-two"></div><div class="study-hub-art-dots"></div><img class="study-hub-art-img" src="hero_student_1.webp" alt="Sinh viên CNTP học tập" onerror="this.style.display='none'"></div></section><section class="study-hub-catalog"><div class="study-hub-search"><i class="fa-solid fa-magnifying-glass"></i><input id="study-space-search" type="search" value="${StudySpace.query.replace(/"/g, '&quot;')}" placeholder="Tìm theo tên hoặc mã môn học" oninput="searchStudySpaceSubjects(this.value)"></div><div class="study-hub-filter-row"><div class="study-space-filter-row"><button class="study-space-filter ${StudySpace.blockId === 'ALL' ? 'active' : ''}" onclick="setStudySpaceFilter('ALL')">Tất cả</button>${Object.values(KNOWLEDGE_BLOCKS).map(block => `<button class="study-space-filter ${StudySpace.blockId === block.id ? 'active' : ''}" onclick="setStudySpaceFilter('${block.id}')">${block.icon} ${block.name}</button>`).join('')}</div></div><div class="study-hub-list-meta"><label class="study-space-article-toggle"><input id="study-space-has-articles" type="checkbox" ${StudySpace.hasArticlesOnly ? 'checked' : ''} onchange="setStudySpaceFilter(null, this.checked)"><span>Chỉ hiện môn đã có bài đăng</span></label><span>${subjects.length} môn phù hợp · ${contentCount} tài nguyên</span></div></section><section class="study-hub-subject-grid">${subjects.length ? subjects.map(subject => `<button class="study-hub-subject-card" data-subject-id="${subject.id}" data-has-articles="${subject.articles.length > 0}" onclick="selectStudySpaceSubject('${subject.id}')"><span class="study-hub-subject-icon"><i class="fa-solid ${studySpaceSubjectIcon(subject)}"></i></span><span class="study-hub-subject-top"><b>${subject.code}</b><small>HK ${subject.semester || '—'}</small></span><strong>${subject.name}</strong><span class="study-hub-subject-meta">${KNOWLEDGE_BLOCKS[subject.blockId]?.icon || '📘'} ${KNOWLEDGE_BLOCKS[subject.blockId]?.name || 'Khối kiến thức'} · ${subject.credits || 0} tín chỉ</span><span class="study-hub-subject-foot"><span><i class="fa-solid ${subject.articles.length ? 'fa-file-lines' : 'fa-clock'}"></i> ${subject.articles.length ? `${subject.articles.length} bài đăng` : 'Chưa có bài đăng'}</span><i class="fa-solid fa-arrow-right"></i></span></button>`).join('') : '<div class="study-space-empty">Không tìm thấy môn học phù hợp.</div>'}</section></main><aside class="study-hub-ai-panel"><div class="study-hub-ai-heading"><span>TRUNG TÂM HỌC TẬP AI</span><p>Công cụ đồng hành cùng bạn</p></div>${aiTools.map(([action,icon,title,description,theme]) => `<button class="study-hub-ai-tool ${theme}" onclick="studySpaceAIAction('${action}')"><i class="fa-solid ${icon}"></i><span><b>${title}</b><small>${description}</small></span><em><i class="fa-solid fa-arrow-right"></i></em></button>`).join('')}<div class="study-hub-stats"><span>THỐNG KÊ HỌC TẬP</span><p>Kho tài liệu được cập nhật liên tục theo chương trình đào tạo.</p><button onclick="showToast('Báo cáo học tập đang được chuẩn bị.', 'info')">Xem báo cáo chi tiết <i class="fa-solid fa-arrow-up-right-from-square"></i></button></div></aside></div>`;
}

function setStudySpaceFilter(blockId, hasArticlesOnly) { if (blockId) StudySpace.blockId = blockId; if (typeof hasArticlesOnly === 'boolean') StudySpace.hasArticlesOnly = hasArticlesOnly; renderStudySpace(); }
function searchStudySpaceSubjects(query) {
  const source = document.getElementById('study-space-search');
  const selectionStart = source?.selectionStart ?? String(query || '').length;
  const selectionEnd = source?.selectionEnd ?? selectionStart;
  StudySpace.query = String(query || '');
  renderStudySpace();

  // renderStudySpace thay toàn bộ catalog, vì vậy khôi phục focus và con trỏ
  // để người dùng có thể gõ liên tục mà không cần nhấp lại vào ô tìm kiếm.
  const input = document.getElementById('study-space-search');
  if (input) {
    input.focus({ preventScroll: true });
    const caret = Math.min(selectionStart, input.value.length);
    input.setSelectionRange(caret, Math.min(selectionEnd, input.value.length));
  }
}
function selectStudySpaceSubject(subjectId) {
  StudySpace.selectedId = subjectId;
  NavController.openSubjectDetail(subjectId, 'study-space');
}
Object.assign(window, { renderStudySpace, setStudySpaceFilter, searchStudySpaceSubjects, selectStudySpaceSubject, studySpaceAIAction });

/* ═══════════════════════════════════════════════════════════════════
   CURRICULUM SUMMARY — Production v2.0 (Lean Pipeline)
   Sử dụng docSummarizerEngine.js: chunk + self-check + retry + merge + SHA-256 cache
   ═══════════════════════════════════════════════════════════════════ */

import {
  runSummarizationPipeline,
  SummaryCache,
  FileParser
} from './modules/docSummarizerEngine.js?v=2pass-20260922-gemini35-sync';

const CS_HISTORY_KEY = 'fteca_curriculum_summary_history_v2';
const CS_MAX_HISTORY = 10;
let _csMode = 'study'; // ✅ Mặc định chế độ "Chi tiết" (thay vì 'exam')
let _csCurrentFile = null;
let _csCurrentResult = null;
let _csCurrentSourceText = '';
let _csCurrentSummaryId = '';
let _csInited = false;
let _csRunning = false;

// ─ Khởi tạo trang ──────────────────────────────────────────────────
function initCurriculumSummaryPage() {
  renderCurriculumSummaryHistory();
  if (_csInited) return;
  _csInited = true;

  // Mode cards (Tất cả các chế độ, đặc biệt Học Sâu & Ôn Thi)
  document.querySelectorAll('[data-cs-mode]').forEach(card => {
    card.addEventListener('click', () => {
      const selectedMode = card.dataset.csMode || 'study';
      
      // 🚧 KHÓA CHẾ ĐỘ "HỌC SÂU & ÔN THI"
      if (selectedMode === 'exam') {
        alert('🚧 Chế độ "Học sâu & Ôn thi" đang được nâng cấp. Vui lòng sử dụng "Tóm tắt chi tiết" hoặc "Tóm tắt nhanh".');
        return;
      }
      
      _csMode = selectedMode;
      document.querySelectorAll('[data-cs-mode]').forEach(c => c.classList.toggle('active', c.dataset.csMode === selectedMode));
    });
  });

  // Back button
  document.getElementById('cs-btn-back-input')?.addEventListener('click', () => {
    document.getElementById('cs-result-stage')?.classList.add('hidden');
    document.getElementById('cs-input-stage')?.classList.remove('hidden');
  });

  // Reload button
  document.getElementById('cs-btn-reload-summary')?.addEventListener('click', () => {
    runCurriculumSummary();
  });

  document.getElementById('cs-btn-export-pdf')?.addEventListener('click', () => {
    exportCurriculumSummaryPdf(_csCurrentResult, document.getElementById('cs-active-doc-title')?.textContent || 'Tài liệu học tập');
  });
  document.getElementById('cs-btn-share-summary')?.addEventListener('click', shareCurrentCurriculumSummary);

  document.getElementById('cs-btn-study-summary')?.addEventListener('click', () => {
    if (!_csCurrentResult) {
      showToast('Chưa có bản tóm tắt để ôn tập.', 'info');
      return;
    }
    window._summaryStudyResult = _csCurrentResult;
    window._summaryStudyTitle = document.getElementById('cs-active-doc-title')?.textContent || 'Tài liệu ôn tập';
    NavController.navigateToPage('summary-study');
  });

  // Tab navigation
  document.querySelectorAll('.cs-tab-item').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      const targetTab = tabBtn.dataset.csTab;
      document.querySelectorAll('.cs-tab-item').forEach(b => b.classList.toggle('active', b === tabBtn));
      document.querySelectorAll('.cs-pane').forEach(pane => {
        pane.classList.toggle('hidden', pane.id !== `cs-pane-${targetTab}`);
      });
    });
  });

  // File input
  const fileInput = document.getElementById('curriculum-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) csHandleFileSelect(file);
    });
  }

  // Remove file
  document.getElementById('curriculum-remove-file')?.addEventListener('click', () => {
    _csCurrentFile = null;
    _csCurrentResult = null;
    _csCurrentSourceText = '';
    const fi = document.getElementById('curriculum-file-input');
    if (fi) fi.value = '';
    document.getElementById('curriculum-file-preview')?.classList.add('hidden');
    const inner = document.querySelector('.curriculum-dropzone-inner');
    if (inner) inner.style.display = '';
  });

  // Drag & Drop
  const zone = document.getElementById('curriculum-dropzone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files?.[0];
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (['pdf', 'docx', 'doc', 'txt'].includes(ext)) csHandleFileSelect(file);
        else showToast('Vui lòng chọn file PDF, DOCX hoặc TXT.', 'info');
      }
    });
    zone.addEventListener('click', e => {
      if (e.target.closest('label, button, input')) return;
      document.getElementById('curriculum-file-input')?.click();
    });
  }

  // Textarea char count
  const textarea = document.getElementById('curriculum-text-input');
  const charCount = document.getElementById('curriculum-char-count');
  if (textarea && charCount) {
    const updateCount = () => {
      charCount.textContent = `${textarea.value.length.toLocaleString('vi-VN')} / 100.000 ký tự`;
    };
    updateCount();
    textarea.addEventListener('input', updateCount);
  }

  // Run button
  document.getElementById('curriculum-run-btn')?.addEventListener('click', runCurriculumSummary);

  // Clear history
  document.getElementById('curriculum-clear-history-btn')?.addEventListener('click', async () => {
    if (!confirm('Xóa toàn bộ lịch sử tóm tắt và các liên kết chia sẻ tương ứng?')) return;
    try {
      await deleteCurriculumHistoryEntries(readCurriculumSummaryHistory());
      SummaryCache.clearAll();
      renderCurriculumSummaryHistory();
      showToast('Đã xóa lịch sử và các liên kết chia sẻ.', 'info');
    } catch (error) {
      console.error('[CurriculumSummary] Không thể xóa lịch sử:', error);
      showToast('Không thể xóa lịch sử và liên kết chia sẻ. Vui lòng thử lại.', 'error');
    }
  });
}

// ─ Xử lý file được chọn ───────────────────────────────────────────
function csHandleFileSelect(file) {
  if (file.size > 20 * 1024 * 1024) return showToast('File tối đa 20MB.', 'error');
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['pdf', 'docx', 'doc', 'txt'].includes(ext)) {
    return showToast('Vui lòng chọn file PDF, DOCX hoặc TXT.', 'error');
  }

  _csCurrentFile = file;
  _csCurrentResult = null;
  _csCurrentSourceText = '';

  const inner = document.querySelector('.curriculum-dropzone-inner');
  if (inner) inner.style.display = 'none';

  const preview = document.getElementById('curriculum-file-preview');
  const icon = document.getElementById('curriculum-file-icon');
  if (preview) {
    preview.classList.remove('hidden');
    document.getElementById('curriculum-file-name').textContent = file.name;
    document.getElementById('curriculum-file-size').textContent = `${(file.size / 1024).toFixed(1)} KB`;
    if (icon) {
      if (['docx', 'doc'].includes(ext)) {
        icon.className = 'fa-solid fa-file-word'; icon.style.color = '#2563eb';
      } else if (ext === 'txt') {
        icon.className = 'fa-solid fa-file-lines'; icon.style.color = '#6366f1';
      } else {
        icon.className = 'fa-solid fa-file-pdf'; icon.style.color = '#ef4444';
      }
    }
  }

  const titleInput = document.getElementById('curriculum-doc-title');
  if (titleInput && !titleInput.value.trim()) {
    titleInput.value = file.name.replace(/\.(pdf|docx|doc|txt)$/i, '');
  }
  showToast(`Đã chọn: ${file.name}`, 'info');
}

// ─ Progress Bar Renderer ──────────────────────────────────────────
function _csUpdateProgress(msg, pct) {
  const status = document.getElementById('curriculum-status');
  if (!status) return;

  // Lấy hoặc tạo progress wrapper
  let wrapper = document.getElementById('cs-progress-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'cs-progress-wrapper';
    wrapper.style.cssText = 'margin-top:12px;';
    wrapper.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span id="cs-progress-msg" style="font-size:13px;font-weight:600;color:var(--text-primary);"></span>
        <span id="cs-progress-pct" style="font-size:12px;font-weight:700;color:var(--primary);"></span>
      </div>
      <div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden;">
        <div id="cs-progress-bar" style="height:100%;background:linear-gradient(90deg,#10b981,#2563eb);border-radius:99px;transition:width 0.4s ease;width:0%"></div>
      </div>`;
    status.parentNode?.insertBefore(wrapper, status.nextSibling);
  }

  document.getElementById('cs-progress-msg').textContent = msg;
  if (pct >= 0) {
    document.getElementById('cs-progress-pct').textContent = `${pct}%`;
    document.getElementById('cs-progress-bar').style.width = `${pct}%`;
  }
  status.textContent = msg;
  status.className = 'curriculum-status loading';
}

function _csRemoveProgress() {
  document.getElementById('cs-progress-wrapper')?.remove();
}

// ─ MAIN RUNNER (Production Pipeline v2.0) ───────────────────────
async function runCurriculumSummary() {
  if (_csRunning) return;

  const btn = document.getElementById('curriculum-run-btn');
  const status = document.getElementById('curriculum-status');
  const title = document.getElementById('curriculum-doc-title')?.value.trim() || 'Tài liệu không rõ tên';

  function setStatus(msg, cls = '') {
    if (!status) return;
    status.textContent = msg;
    status.className = `curriculum-status${cls ? ' ' + cls : ''}`;
  }

  const rawText = document.getElementById('curriculum-text-input')?.value.trim() || '';
  if (!_csCurrentFile && rawText.length < 200) {
    setStatus('Vui lòng upload tài liệu hoặc dán ít nhất 200 ký tự vào ô văn bản.', 'error');
    showToast('Cần có nội dung tài liệu để tóm tắt!', 'info');
    return;
  }

  _csRunning = true;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...'; }
  setStatus('Đang khởi động pipeline AI...', 'loading');

  try {
    const result = await runSummarizationPipeline({
      file: _csCurrentFile || null,
      rawText: _csCurrentFile ? '' : rawText,
      docTitle: title,
      mode: _csMode,
      onProgress: (msg, pct) => _csUpdateProgress(msg, pct)
    });

    _csCurrentResult = result;
    _csCurrentSourceText = _csCurrentFile ? '' : rawText; // không lưu file binary vào RAM

    _csRemoveProgress();
    const isDeep = _csMode === 'study'; // ✅ THAY 'exam' → 'study'
    setStatus(result.cached
      ? '⚡ Đã tải từ bộ nhớ đệm — phản hồi tức thì!'
      : isDeep ? '✅ Tóm tắt chi tiết hoàn thành!' : '✅ Tóm tắt nhanh hoàn thành!',
      'success'
    );

    // Lưu lịch sử
    _csCurrentSummaryId = csv2SaveHistory({ title, mode: _csMode, result });

    renderCurriculumSummaryResultV2(result, title);
    showToast(result.cached ? '⚡ Tải từ cache!' : isDeep ? '🧠 Học sâu tài liệu thành công!' : '✨ Tóm tắt tài liệu thành công!', 'success');

  } catch (err) {
    _csRemoveProgress();
    console.error('[CurriculumSummary v2] Lỗi:', err);
    const errMsg = _csParseError(err);
    setStatus(errMsg, 'error');
    showToast(_csMode === 'study' ? 'Không thể tóm tắt chi tiết lúc này. Vui lòng thử lại!' : 'Không thể tóm tắt lúc này. Vui lòng thử lại!', 'error');
  } finally {
    _csRunning = false;
    if (btn) { btn.disabled = false; btn.innerHTML = _csRunBtnHTML(); }
  }
}

// ✅ XÓA hàm isDeepMode() - không còn cần thiết

function _csRunBtnHTML() {
  return _csMode === 'study'
    ? '<i class="fa-solid fa-file-lines"></i> Tóm tắt chi tiết bằng AI'
    : '<i class="fa-solid fa-wand-magic-sparkles"></i> Tóm tắt nhanh bằng AI';
}

let _summaryStudyColor = '#fde68a';
let _summaryStudyDrawing = false;
let _summaryStudyErasing = false;
let _summaryStudyEditing = false;
let _summaryStudyUndoStack = [];
let _summaryStudyContextHighlight = null;
let _summaryStudyInteractionQuote = '';
let _summaryStudyTermResult = null;
let _summaryStudyChatHistory = [];
let _summaryStudyChatDocumentTitle = '';
let _summaryStudyPendingQuote = '';
let _summaryStudyReadOnly = false;
let _summaryStudyLoadedShareId = '';
let _summaryStudyActiveNoteId = null;
let _summaryStudyActiveNoteAnchor = null;
let _summaryStudySelfExplainAnchor = null;
const SUMMARY_STUDY_SAVED_TERMS_KEY = 'fteca_summary_study_saved_terms_v1';

function getSummaryStudySavedTerms() {
  try {
    const saved = JSON.parse(localStorage.getItem(SUMMARY_STUDY_SAVED_TERMS_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(item => item?.term && item?.meaning) : [];
  } catch (error) {
    console.warn('[SummaryStudy] Không đọc được kho thuật ngữ:', error);
    return [];
  }
}
function saveSummaryStudySavedTerms(terms) {
  localStorage.setItem(SUMMARY_STUDY_SAVED_TERMS_KEY, JSON.stringify(terms.slice(0, 50)));
}
function renderSummaryStudySavedTerms() {
  const container = document.getElementById('summary-study-saved-terms');
  if (!container) return;
  const terms = getSummaryStudySavedTerms();
  document.querySelector('.summary-study-storage-head')?.classList.toggle('is-empty', !terms.length);
  container.innerHTML = terms.length
    ? terms.map((item, index) => `<button type="button" class="summary-study-saved-term" data-saved-term-index="${index}"><i class="fa-regular fa-star"></i><span>${escapeHtml(item.term)}</span></button>`).join('')
    : '<small>Chưa có thuật ngữ nào được lưu.</small>';
  container.querySelectorAll('[data-saved-term-index]').forEach(button => button.addEventListener('click', () => {
    const item = terms[Number(button.dataset.savedTermIndex)];
    if (item) showSummaryStudyTermResult(item, true);
  }));
}
function showSummaryStudyTermResult(data, saved = false) {
  const dialog = document.getElementById('summary-study-term-dialog');
  const status = document.getElementById('summary-study-term-status');
  const result = document.getElementById('summary-study-term-result');
  const saveButton = document.getElementById('summary-study-term-save');
  if (!dialog || !status || !result) return;
  _summaryStudyTermResult = data;
  dialog.hidden = false;
  status.textContent = `Thuật ngữ: ${data.term}`;
  result.innerHTML = `<section><b>Ý nghĩa</b><p>${escapeHtml(data.meaning || 'Chưa có giải thích.')}</p></section><section><b>Cách dùng trong Công nghệ thực phẩm</b><p>${escapeHtml(data.usage || 'Chưa có thông tin.')}</p></section><section><b>Ví dụ thực tế</b><p>${escapeHtml(data.example || 'Chưa có ví dụ.')}</p></section>`;
  if (saveButton) {
    saveButton.classList.toggle('is-saved', saved || getSummaryStudySavedTerms().some(item => item.term === data.term));
    saveButton.innerHTML = `<i class="${saveButton.classList.contains('is-saved') ? 'fa-solid' : 'fa-regular'} fa-star"></i>`;
  }
}

function summaryStudyStorageKey(title) {
  return `fteca_summary_study_${String(title || 'summary').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 80)}`;
}
function getSummaryStudyState(title = window._summaryStudyTitle) {
  try {
    const raw = JSON.parse(localStorage.getItem(summaryStudyStorageKey(title)) || '{}');
    return {
      editedHtml: typeof raw.editedHtml === 'string' ? raw.editedHtml : '',
      highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
      annotations: Array.isArray(raw.annotations) ? raw.annotations : [],
      notes: Array.isArray(raw.notes) ? raw.notes.filter(note => note?.id && Number.isFinite(note.start) && Number.isFinite(note.end) && typeof note.text === 'string') : []
    };
  } catch (error) {
    console.warn('[SummaryStudy] Không đọc được dữ liệu chú thích:', error);
    return { editedHtml: '', highlights: [], annotations: [], notes: [] };
  }
}
function saveSummaryStudyState(patch = {}) {
  const title = window._summaryStudyTitle || 'summary';
  const state = { ...getSummaryStudyState(title), ...patch, updatedAt: new Date().toISOString() };
  localStorage.setItem(summaryStudyStorageKey(title), JSON.stringify(state));
  return state;
}
function summaryStudyPushUndo() {
  const body = document.getElementById('summary-study-document-body');
  if (!body) return;
  _summaryStudyUndoStack.push({ html: body.innerHTML, state: getSummaryStudyState() });
  if (_summaryStudyUndoStack.length > 30) _summaryStudyUndoStack.shift();
}
function summaryStudyUndo() {
  const previous = _summaryStudyUndoStack.pop();
  const body = document.getElementById('summary-study-document-body');
  if (!previous || !body) return showToast('Không còn thay đổi để hoàn tác.', 'info');
  body.innerHTML = previous.html;
  const state = saveSummaryStudyState(previous.state);
  if (state.editedHtml) saveSummaryStudyState({ editedHtml: summaryStudyContentWithoutHighlights(body) });
  restoreSummaryStudyHighlights();
  renderSummaryStudyNotes();
  mountSummaryStudyDrawingLayer();
  showToast('Đã hoàn tác thay đổi gần nhất.', 'success');
}
function summaryStudyContentWithoutHighlights(body) {
  const clone = body.cloneNode(true);
  clone.querySelectorAll('mark.summary-study-highlight').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent || '')));
  clone.querySelectorAll('.summary-study-note-marker').forEach(marker => marker.remove());
  clone.querySelector('.summary-study-drawing-layer')?.remove();
  return clone.innerHTML;
}
function summaryStudyTextOffset(root, node, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0, item;
  while ((item = walker.nextNode())) {
    if (item === node) return total + offset;
    total += item.nodeValue.length;
  }
  return -1;
}
function summaryStudyRangeForAnchor(anchor) {
  const root = document.getElementById('summary-study-document-body');
  if (!root) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; let total = 0, startNode, endNode, startOffset, endOffset, item;
  while ((item = walker.nextNode())) nodes.push(item);
  for (const node of nodes) {
    const next = total + node.nodeValue.length;
    if (!startNode && anchor.start >= total && anchor.start <= next) { startNode = node; startOffset = anchor.start - total; }
    if (anchor.end >= total && anchor.end <= next) { endNode = node; endOffset = anchor.end - total; break; }
    total = next;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset); range.setEnd(endNode, endOffset);
  return range;
}
function restoreSummaryStudyHighlights() {
  const root = document.getElementById('summary-study-document-body');
  if (!root) return;
  getSummaryStudyState().highlights.forEach(anchor => {
    const range = summaryStudyRangeForAnchor(anchor);
    if (!range || range.collapsed) return;
    const mark = document.createElement('mark');
    mark.className = 'summary-study-highlight';
    mark.dataset.summaryHighlightId = anchor.id || `${anchor.start}-${anchor.end}`;
    mark.style.backgroundColor = anchor.color || _summaryStudyColor;
    try { mark.appendChild(range.extractContents()); range.insertNode(mark); } catch (error) { console.warn('[SummaryStudy] Không khôi phục được đánh dấu:', error); }
  });
}
function renderSummaryStudyNotes() {
  const root = document.getElementById('summary-study-document-body');
  if (!root) return;
  root.querySelectorAll('.summary-study-note-marker').forEach(marker => marker.remove());
  const notes = getSummaryStudyState().notes.slice().sort((a, b) => a.end - b.end);
  notes.forEach(note => {
    const range = summaryStudyRangeForAnchor({ start: note.end, end: note.end });
    if (!range) return;
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'summary-study-note-marker';
    marker.dataset.summaryNoteId = note.id;
    marker.setAttribute('aria-label', 'Mở ghi chú');
    marker.title = 'Mở ghi chú';
    range.collapse(true);
    range.insertNode(marker);
  });
}
function summaryStudySelection() {
  const root = document.getElementById('summary-study-document-body');
  const selection = window.getSelection?.();
  if (!root || !selection?.rangeCount || selection.isCollapsed || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const range = selection.getRangeAt(0);
  const start = summaryStudyTextOffset(root, range.startContainer, range.startOffset);
  const end = summaryStudyTextOffset(root, range.endContainer, range.endOffset);
  return start >= 0 && end > start ? { selection, range, start, end, quote: selection.toString().slice(0, 500) } : null;
}
function openSummaryStudyNoteDialog(note = null, picked = null) {
  const dialog = document.getElementById('summary-study-note-dialog');
  const quote = document.getElementById('summary-study-note-quote');
  const input = document.getElementById('summary-study-note-input');
  const deleteButton = document.getElementById('summary-study-note-delete');
  if (!dialog || !quote || !input || !deleteButton) return;
  if (!note && !picked) return showToast('Hãy bôi đen đoạn cần ghi chú trước.', 'info');
  _summaryStudyActiveNoteId = note?.id || null;
  _summaryStudyActiveNoteAnchor = note
    ? { start: note.start, end: note.end, quote: note.quote }
    : { start: picked.start, end: picked.end, quote: picked.quote };
  quote.textContent = _summaryStudyActiveNoteAnchor.quote;
  input.value = note?.text || '';
  deleteButton.hidden = !note;
  dialog.hidden = false;
  input.focus();
}
function saveSummaryStudyNote() {
  const input = document.getElementById('summary-study-note-input');
  const text = input?.value.trim();
  if (!text) return showToast('Hãy nhập nội dung ghi chú trước khi lưu.', 'info');
  if (!_summaryStudyActiveNoteAnchor) return showToast('Không tìm thấy vị trí ghi chú.', 'error');
  summaryStudyPushUndo();
  const notes = getSummaryStudyState().notes;
  const existingIndex = notes.findIndex(note => note.id === _summaryStudyActiveNoteId);
  const note = {
    id: _summaryStudyActiveNoteId || `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ..._summaryStudyActiveNoteAnchor,
    text,
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) notes[existingIndex] = note;
  else notes.push(note);
  saveSummaryStudyState({ notes });
  renderSummaryStudyNotes();
  document.getElementById('summary-study-note-dialog').hidden = true;
  showToast(existingIndex >= 0 ? 'Đã cập nhật ghi chú.' : 'Đã lưu ghi chú tại đoạn đã chọn.', 'success');
}
function deleteSummaryStudyNote() {
  if (!_summaryStudyActiveNoteId) return;
  summaryStudyPushUndo();
  const notes = getSummaryStudyState().notes.filter(note => note.id !== _summaryStudyActiveNoteId);
  saveSummaryStudyState({ notes });
  renderSummaryStudyNotes();
  document.getElementById('summary-study-note-dialog').hidden = true;
  showToast('Đã xóa ghi chú.', 'success');
}
function openSummaryStudyNoteById(noteId) {
  const note = getSummaryStudyState().notes.find(item => item.id === noteId);
  if (note) openSummaryStudyNoteDialog(note);
}
function openSummaryStudySelfExplain() {
  const picked = summaryStudySelection();
  if (!picked) return showToast('Hãy bôi đen phần bạn muốn tự giải thích trước.', 'info');
  _summaryStudySelfExplainAnchor = { start: picked.start, end: picked.end, quote: picked.quote };
  const dialog = document.getElementById('summary-study-self-explain-dialog');
  const input = document.getElementById('summary-study-self-explain-input');
  const result = document.getElementById('summary-study-self-explain-result');
  const source = document.getElementById('summary-study-self-explain-source');
  const submit = document.getElementById('summary-study-self-explain-submit');
  if (!dialog || !input || !result || !source || !submit) return;
  input.value = '';
  input.disabled = false;
  result.hidden = true;
  result.textContent = '';
  result.classList.remove('is-error');
  source.hidden = true;
  source.textContent = _summaryStudySelfExplainAnchor.quote;
  submit.disabled = false;
  submit.textContent = 'Đối chiếu với AI';
  dialog.hidden = false;
  input.focus();
}
async function compareSummaryStudySelfExplanation() {
  const input = document.getElementById('summary-study-self-explain-input');
  const result = document.getElementById('summary-study-self-explain-result');
  const source = document.getElementById('summary-study-self-explain-source');
  const submit = document.getElementById('summary-study-self-explain-submit');
  const body = document.getElementById('summary-study-document-body');
  const explanation = input?.value.trim();
  if (!explanation) return showToast('Hãy thử giải thích theo cách hiểu của bạn trước.', 'info');
  if (!_summaryStudySelfExplainAnchor || !result || !source || !submit || !body) return;
  input.disabled = true;
  submit.disabled = true;
  submit.textContent = 'Đang đối chiếu…';
  result.hidden = false;
  result.classList.remove('is-error');
  result.textContent = 'Lumi đang so sánh với nội dung tài liệu…';
  try {
    const feedback = await AIPool.compareSummaryStudyExplanation({
      documentTitle: window._summaryStudyTitle || 'Tài liệu học tập',
      sourceText: _summaryStudySelfExplainAnchor.quote,
      summary: body.innerText.slice(0, 12000),
      studentExplanation: explanation
    });
    result.textContent = feedback;
    source.hidden = false;
    submit.textContent = 'Đối chiếu lại';
  } catch (error) {
    console.error('[Lumi] Không thể đối chiếu lời giải thích:', error);
    result.classList.add('is-error');
    result.textContent = error.message === 'empty-student-explanation'
      ? 'Hãy nhập phần giải thích của bạn trước.'
      : 'Lumi chưa thể đối chiếu lúc này. Vui lòng thử lại.';
    submit.textContent = 'Thử lại';
  } finally {
    input.disabled = false;
    submit.disabled = false;
  }
}
async function shareSummaryStudySelection() {
  const picked = summaryStudySelection();
  if (!picked) return showToast('Hãy bôi đen đoạn tóm tắt muốn chia sẻ trước.', 'info');
  const root = document.getElementById('summary-study-document-body');
  const section = picked.range.startContainer.parentElement?.closest('.summary-study-section');
  const payload = {
    title: String(window._summaryStudyTitle || 'Bản tóm tắt').slice(0, 160),
    section: section?.querySelector('h2')?.textContent?.trim().slice(0, 120) || '',
    excerpt: picked.quote.slice(0, 700)
  };
  if (!root || !payload.excerpt) return showToast('Không lấy được đoạn cần chia sẻ.', 'warning');
  const url = new URL(location.href);
  url.hash = new URLSearchParams({ 'study-share': JSON.stringify(payload) }).toString();
  try {
    if (navigator.share) {
      await navigator.share({
        title: `${payload.section || payload.title} — FTECA`,
        text: `${payload.title}${payload.section ? ` · ${payload.section}` : ''}\n\n${payload.excerpt}`,
        url: url.href
      });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url.href);
      showToast('Đã sao chép liên kết của đoạn tóm tắt.', 'success');
    } else {
      throw new Error('clipboard-unavailable');
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('[SummaryStudy] Không chia sẻ được đoạn tóm tắt:', error);
      showToast('Không thể chia sẻ trên trình duyệt này.', 'error');
    }
  }
}
function showSharedSummaryStudyExcerpt() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const raw = params.get('study-share');
  if (!raw || raw.length > 4096) return;
  try {
    const data = JSON.parse(raw);
    if (typeof data.title !== 'string' || typeof data.excerpt !== 'string' || !data.excerpt.trim()) return;
    const dialog = document.getElementById('summary-study-shared-dialog');
    const title = document.getElementById('summary-study-shared-title');
    const excerpt = document.getElementById('summary-study-shared-excerpt');
    if (!dialog || !title || !excerpt) return;
    title.textContent = data.section ? `${data.title} · ${data.section}` : data.title;
    excerpt.textContent = data.excerpt.slice(0, 700);
    dialog.hidden = false;
  } catch (error) {
    console.warn('[SummaryStudy] Liên kết chia sẻ không hợp lệ:', error);
  }
}
function applySummaryStudyHighlight() {
  const picked = summaryStudySelection();
  if (!picked) return showToast('Hãy bôi đen đoạn văn trước khi đánh dấu.', 'info');
  summaryStudyPushUndo();
  const anchor = { id: `highlight-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, start: picked.start, end: picked.end, quote: picked.quote, color: _summaryStudyColor };
  saveSummaryStudyState({ highlights: [...getSummaryStudyState().highlights, anchor] });
  const mark = document.createElement('mark');
  mark.className = 'summary-study-highlight'; mark.dataset.summaryHighlightId = anchor.id; mark.style.backgroundColor = _summaryStudyColor;
  try { mark.appendChild(picked.range.extractContents()); picked.range.insertNode(mark); picked.selection.removeAllRanges(); } catch (error) { console.warn('[SummaryStudy] Không thể đánh dấu:', error); showToast('Không thể đánh dấu đoạn này.', 'warning'); }
}
function summaryStudyHighlightFromTarget(target) {
  const mark = target?.closest?.('mark.summary-study-highlight');
  return mark && document.getElementById('summary-study-document-body')?.contains(mark) ? mark : null;
}
function removeSummaryStudyHighlight(target = null) {
  const mark = summaryStudyHighlightFromTarget(target) || summaryStudyHighlightFromSelection();
  if (!mark) return showToast('Hãy đặt con trỏ vào vùng đã đánh dấu hoặc chọn đoạn cần bỏ đánh dấu.', 'info');
  summaryStudyPushUndo();
  const text = mark.textContent || '';
  const state = getSummaryStudyState();
  const id = mark.dataset.summaryHighlightId;
  const remaining = state.highlights.filter(anchor => id ? (anchor.id || `${anchor.start}-${anchor.end}`) !== id : !(anchor.quote && text && (anchor.quote === text || text.startsWith(anchor.quote) || anchor.quote.startsWith(text))));
  mark.replaceWith(document.createTextNode(text));
  saveSummaryStudyState({ highlights: remaining, editedHtml: summaryStudyContentWithoutHighlights(document.getElementById('summary-study-document-body')) });
  showToast('Đã bỏ đánh dấu.', 'success');
}
function summaryStudyHighlightFromSelection() {
  const selection = window.getSelection?.();
  return selection?.anchorNode ? summaryStudyHighlightFromTarget(selection.anchorNode.parentElement) : null;
}
function summaryStudyPointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function mountSummaryStudyDrawingLayer() {
  const root = document.getElementById('summary-study-document-body');
  if (!root) return;
  root.querySelector('.summary-study-drawing-layer')?.remove();
  if (!_summaryStudyDrawing) return;
  root.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.className = 'summary-study-drawing-layer';
  canvas.classList.toggle('is-eraser', _summaryStudyErasing);
  canvas.width = root.clientWidth; canvas.height = root.scrollHeight;
  const ctx = canvas.getContext('2d'); const strokes = getSummaryStudyState().annotations.slice();
  const draw = stroke => { if (!stroke.points?.length) return; ctx.beginPath(); stroke.points.forEach((point, index) => index ? ctx.lineTo(point.x * canvas.width, point.y * canvas.height) : ctx.moveTo(point.x * canvas.width, point.y * canvas.height)); ctx.strokeStyle = stroke.color || '#10b981'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke(); };
  strokes.forEach(draw);
  let active = null;
  let erased = false;
  const pointAt = event => { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }; };
  const redraw = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); strokes.forEach(draw); if (active) draw(active); };
  const eraseAt = point => {
    const index = strokes.findIndex(stroke => stroke.points.some(item => summaryStudyPointDistance(item, point) <= 0.025));
    if (index < 0) return false;
    if (!erased) { summaryStudyPushUndo(); erased = true; }
    strokes.splice(index, 1);
    saveSummaryStudyState({ annotations: strokes });
    redraw();
    return true;
  };
  canvas.onpointerdown = event => {
    const point = pointAt(event);
    if (_summaryStudyErasing) { canvas.setPointerCapture(event.pointerId); eraseAt(point); return; }
    const box = canvas.getBoundingClientRect(); canvas.setPointerCapture(event.pointerId); summaryStudyPushUndo(); active = { color: _summaryStudyColor, points: [point] };
  };
  canvas.onpointermove = event => { if (_summaryStudyErasing) { eraseAt(pointAt(event)); return; } if (!active) return; active.points.push(pointAt(event)); redraw(); };
  canvas.onpointerup = () => { if (active?.points.length > 1) { strokes.push(active); saveSummaryStudyState({ annotations: strokes }); } active = null; erased = false; redraw(); };
  root.appendChild(canvas);
}
function setSummaryStudyEditing(enabled) {
  const body = document.getElementById('summary-study-document-body');
  if (!body) return;
  _summaryStudyEditing = enabled;
  body.contentEditable = String(enabled);
  body.classList.toggle('is-editing', enabled);
  body.focus();
  const button = document.querySelector('[data-summary-action="edit"]');
  if (button) button.innerHTML = enabled ? '<i class="fa-solid fa-floppy-disk"></i> Lưu chỉnh sửa' : '<i class="fa-solid fa-pen-to-square"></i> Chỉnh sửa';
  if (enabled) summaryStudyPushUndo();
  else { saveSummaryStudyState({ editedHtml: summaryStudyContentWithoutHighlights(body) }); renderSummaryStudyNotes(); showToast('Đã lưu nội dung chỉnh sửa.', 'success'); }
}
function showSummaryStudyContextMenu(event) {
  if (_summaryStudyReadOnly) return;
  event.preventDefault();
  const menu = document.getElementById('summary-study-context-menu');
  const highlight = summaryStudyHighlightFromTarget(event.target);
  if (!menu || (!summaryStudySelection() && !highlight)) return;
  _summaryStudyContextHighlight = highlight;
  menu.dataset.highlightTarget = highlight ? 'true' : 'false';
  menu.querySelector('[data-summary-context-action="remove-highlight"]').hidden = !highlight;
  menu.querySelector('[data-summary-context-action="highlight"]').hidden = Boolean(highlight);
  menu.hidden = false; menu.style.left = `${Math.min(event.clientX, window.innerWidth - 250)}px`; menu.style.top = `${Math.min(event.clientY, window.innerHeight - 100)}px`;
}
function closeSummaryStudyInteractionMenu() {
  const menu = document.querySelector('.summary-study-interaction-menu');
  const trigger = document.querySelector('.summary-study-interaction-trigger');
  if (menu) menu.hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
}
function closeSummaryStudyInteractionOnOutside(event) {
  const wrap = document.querySelector('.summary-study-interaction-wrap');
  if (wrap && !wrap.contains(event.target)) closeSummaryStudyInteractionMenu();
}
function openSummaryStudyTermDialog() {
  const dialog = document.getElementById('summary-study-term-dialog');
  const status = document.getElementById('summary-study-term-status');
  const result = document.getElementById('summary-study-term-result');
  if (!dialog || !status || !result) return;
  if (!_summaryStudyInteractionQuote) return showToast('Hãy bôi đen một từ hoặc thuật ngữ trước.', 'info');
  dialog.hidden = false;
  status.textContent = `Đang giải thích “${_summaryStudyInteractionQuote}”…`;
  result.innerHTML = '';
  AIPool.explainFoodTechnologyTerm(_summaryStudyInteractionQuote).then(data => {
    showSummaryStudyTermResult(data);
  }).catch(error => {
    console.error('[SummaryStudy Term Explanation] Lỗi:', error);
    status.textContent = 'Không thể giải thích thuật ngữ lúc này.';
    result.innerHTML = `<p class="summary-study-term-error">${escapeHtml(error.message || 'Vui lòng thử lại sau.')}</p>`;
  });
}
function saveCurrentSummaryStudyTerm() {
  if (!_summaryStudyTermResult) return;
  const terms = getSummaryStudySavedTerms();
  const existing = terms.findIndex(item => item.term === _summaryStudyTermResult.term);
  if (existing >= 0) {
    terms.splice(existing, 1);
    saveSummaryStudySavedTerms(terms);
    showSummaryStudyTermResult(_summaryStudyTermResult, false);
    showToast('Đã bỏ thuật ngữ khỏi kho lưu trữ.', 'info');
  } else {
    terms.unshift({ ..._summaryStudyTermResult, savedAt: new Date().toISOString() });
    saveSummaryStudySavedTerms(terms);
    showSummaryStudyTermResult(_summaryStudyTermResult, true);
    showToast('Đã lưu thuật ngữ vào kho.', 'success');
  }
  renderSummaryStudySavedTerms();
}
function openSummaryStudyInteraction() {
  const picked = summaryStudySelection();
  if (!picked) return showToast('Hãy bôi đen một từ hoặc thuật ngữ trước khi chọn Tương tác.', 'info');
  _summaryStudyInteractionQuote = picked.quote.trim();
  const menu = document.querySelector('.summary-study-interaction-menu');
  const trigger = document.querySelector('.summary-study-interaction-trigger');
  if (menu && trigger) {
    menu.hidden = false;
    const triggerBox = trigger.getBoundingClientRect();
    const menuBox = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(triggerBox.left, window.innerWidth - menuBox.width - 8));
    const above = triggerBox.top - menuBox.height - 8;
    menu.style.left = `${left}px`;
    menu.style.top = `${above >= 8 ? above : Math.min(window.innerHeight - menuBox.height - 8, triggerBox.bottom + 8)}px`;
  }
  trigger?.setAttribute('aria-expanded', 'true');
}

function renderSummaryStudyPage(result, title, { readOnly = false } = {}) {
  const body = document.getElementById('summary-study-document-body');
  const outline = document.getElementById('summary-study-outline-list');
  const fileTitle = document.getElementById('summary-study-file-title');
  if (!body || !result) return;
  _summaryStudyReadOnly = readOnly;
  document.querySelector('.summary-study-shell')?.classList.toggle('is-shared', readOnly);
  const sharedBanner = document.getElementById('summary-study-shared-banner');
  if (sharedBanner) sharedBanner.hidden = !readOnly;
  const back = document.getElementById('summary-study-back');
  if (back) back.innerHTML = readOnly
    ? '<i class="fa-solid fa-arrow-left"></i> Quay lại trang chủ'
    : '<i class="fa-solid fa-arrow-left"></i> Quay lại bản tóm tắt';
  if (readOnly) {
    _summaryStudyDrawing = false;
    _summaryStudyErasing = false;
    document.querySelectorAll('#summary-study-term-dialog, #summary-study-note-dialog, #summary-study-self-explain-dialog, #summary-study-shared-dialog')
      .forEach(dialog => { dialog.hidden = true; });
  }
  const nextChatTitle = title || 'Tài liệu tóm tắt';
  if (_summaryStudyChatDocumentTitle !== nextChatTitle) {
    _summaryStudyChatHistory = [];
    _summaryStudyChatDocumentTitle = nextChatTitle;
    document.querySelectorAll('#summary-study-chat .summary-study-chat-turn').forEach(turn => turn.remove());
  }
  renderSummaryStudySavedTerms();
  const chapters = Array.isArray(result.chapters) ? result.chapters : [];
  if (fileTitle) fileTitle.textContent = title || 'Tài liệu tóm tắt';
  window._summaryStudyTitle = nextChatTitle;
  const generatedHtml = `<header class="summary-study-cover"><span>TÓM TẮT KIẾN THỨC</span><h1>${escapeHtml(title || 'Tài liệu tóm tắt')}</h1><p>${_csMarkdown(result.overview || '')}</p></header>${chapters.map((chapter, index) => `<section class="summary-study-section" id="summary-study-section-${index}"><div class="summary-study-section-label">PHẦN ${String(index + 1).padStart(2, '0')}</div><h2>${escapeHtml(chapter.title || `Chương ${index + 1}`)}</h2><div class="summary-study-richtext">${_csMarkdown(chapter.content || '')}</div></section>`).join('') || `<section class="summary-study-section"><div class="summary-study-richtext">${_csMarkdown(result.overview || 'Chưa có nội dung tóm tắt.')}</div></section>`}`;
  body.innerHTML = readOnly ? generatedHtml : (getSummaryStudyState(window._summaryStudyTitle).editedHtml || generatedHtml);
  _summaryStudyEditing = false;
  body.contentEditable = 'false';
  if (!readOnly) {
    restoreSummaryStudyHighlights();
    renderSummaryStudyNotes();
  }
  mountSummaryStudyDrawingLayer();
  if (outline) {
    outline.innerHTML = `<button type="button" class="active" data-summary-anchor="top">Tổng quan</button>${chapters.map((chapter, index) => `<button type="button" data-summary-anchor="${index}">${escapeHtml(chapter.title || `Chương ${index + 1}`)}</button>`).join('')}`;
    outline.querySelectorAll('[data-summary-anchor]').forEach(button => button.addEventListener('click', () => {
      const target = button.dataset.summaryAnchor === 'top' ? body : document.getElementById(`summary-study-section-${button.dataset.summaryAnchor}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      outline.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
    }));
  }
}

async function openSharedSummary(shareId) {
  const id = String(shareId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    _summaryStudyReadOnly = true;
    document.querySelector('.summary-study-shell')?.classList.add('is-shared');
    const back = document.getElementById('summary-study-back');
    if (back) back.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Quay lại trang chủ';
    const banner = document.getElementById('summary-study-shared-banner');
    if (banner) banner.hidden = false;
    const body = document.getElementById('summary-study-document-body');
    if (body) body.textContent = 'Liên kết bản tóm tắt không hợp lệ.';
    return;
  }
  if (_summaryStudyLoadedShareId === id) return;
  _summaryStudyLoadedShareId = id;
  _summaryStudyReadOnly = true;
  window._summaryStudyResult = null;
  document.querySelector('.summary-study-shell')?.classList.add('is-shared');
  const back = document.getElementById('summary-study-back');
  if (back) back.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Quay lại trang chủ';
  const banner = document.getElementById('summary-study-shared-banner');
  if (banner) banner.hidden = false;
  NavController.navigateToPage('summary-study', null, { 'share-summary': id });
  const body = document.getElementById('summary-study-document-body');
  if (body) body.innerHTML = '<div class="summary-study-share-loading"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải bản tóm tắt được chia sẻ…</div>';
  try {
    const response = await fetch(`/api/summary-share?id=${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok || !payload.summary?.result) {
      throw Object.assign(new Error(payload.reason || 'summary-share-not-found'), { status: response.status });
    }
    window._summaryStudyResult = payload.summary.result;
    window._summaryStudyTitle = payload.summary.title || 'Bản tóm tắt được chia sẻ';
    _csCurrentResult = payload.summary.result;
    _csCurrentSummaryId = '';
    renderSummaryStudyPage(payload.summary.result, window._summaryStudyTitle, { readOnly: true });
  } catch (error) {
    console.error('[SummaryShare] Không thể tải bản tóm tắt:', error);
    _summaryStudyLoadedShareId = '';
    document.querySelector('.summary-study-shell')?.classList.add('is-shared');
    const banner = document.getElementById('summary-study-shared-banner');
    if (banner) banner.hidden = false;
    const unavailable = error.status === 404
      ? ['Không tìm thấy bản tóm tắt', 'Liên kết có thể đã bị xóa cùng với bản tóm tắt gốc hoặc không còn khả dụng.']
      : error.status === 503
        ? ['Dịch vụ chia sẻ chưa sẵn sàng', 'Máy chủ chưa được cấu hình để lưu trữ bản tóm tắt được chia sẻ. Vui lòng thử lại sau.']
        : error.status === 429
          ? ['Đang có quá nhiều yêu cầu', 'Vui lòng chờ một chút rồi mở lại liên kết.']
          : ['Không thể tải bản tóm tắt', 'Đã xảy ra lỗi kết nối khi mở liên kết. Vui lòng thử lại sau.'];
    if (body) body.innerHTML = `<div class="summary-study-share-unavailable"><i class="fa-solid fa-link-slash"></i><h2>${escapeHtml(unavailable[0])}</h2><p>${escapeHtml(unavailable[1])}</p></div>`;
  }
}
window.openSharedSummary = openSharedSummary;
window.leaveSharedSummary = () => {
  _summaryStudyLoadedShareId = '';
  _summaryStudyReadOnly = false;
  document.querySelector('.summary-study-shell')?.classList.remove('is-shared');
  const banner = document.getElementById('summary-study-shared-banner');
  if (banner) banner.hidden = true;
};

function initSummaryStudyMascot() {
  const mascots = document.querySelectorAll('.summary-study-mascot');
  const directions = ['up-left', 'up', 'up-right', 'left', 'center', 'right', 'down-left', 'down', 'down-right'];
  const reactions = ['blink', 'heart', 'sparkle', 'surprised', 'wink', 'bashful', 'sleepy', 'dizzy', 'delighted'];
  const clockwise = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
  const sectorSize = (Math.PI * 2) / 8;
  const payoffReactions = ['heart', 'sparkle', 'delighted'];
  const spriteVersion = '20260924';
  const directionsUrl = `mascots/skater-directions.webp?v=${spriteVersion}`;
  const reactionsUrl = `mascots/skater-reactions.webp?v=${spriteVersion}`;
  let pointer = null;

  const cell = index => `${index % 3 * 50}% ${Math.floor(index / 3) * 50}%`;
  const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

  mascots.forEach((mascot, mascotIndex) => {
    if (mascot.dataset.mascotReady === 'true') return;
    mascot.dataset.mascotReady = 'true';
    const bubble = mascot.querySelector('.summary-study-mascot-bubble');
    const squash = mascot.querySelector('.summary-study-mascot-squash');
    const directionLayer = mascot.querySelector('.summary-study-mascot-directions');
    const reactionLayer = mascot.querySelector('.summary-study-mascot-reactions');
    const lines = ['Mình đang nhìn bạn đó!', 'Bạn muốn hỏi Lumi điều gì?', 'Cùng học phần này nhé!', 'Bấm vào mình để tương tác nè!'];
    let lineIndex = mascotIndex;
    let bubbleTimer;
    let currentDirection = 'center';
    let currentReaction = null;
    let reactionTimers = [];
    let lastSector = -1;
    let boopCount = 0;
    let lastBoop = 0;

    if (!directionLayer || !reactionLayer) return;
    directionLayer.style.backgroundImage = `url("${directionsUrl}")`;
    reactionLayer.style.backgroundImage = `url("${reactionsUrl}")`;

    const updateVisuals = () => {
      directionLayer.style.backgroundPosition = cell(Math.max(0, directions.indexOf(currentDirection)));
      directionLayer.style.opacity = currentReaction ? '0' : '1';
      if (currentReaction) {
        reactionLayer.style.backgroundPosition = cell(Math.max(0, reactions.indexOf(currentReaction)));
        reactionLayer.style.opacity = '1';
      } else {
        reactionLayer.style.opacity = '0';
      }
    };

    const aim = () => {
      if (!pointer || currentReaction) return;
      const rect = mascot.getBoundingClientRect();
      const dx = pointer.x - (rect.left + rect.width / 2);
      const dy = pointer.y - (rect.top + rect.height / 2);
      if (Math.hypot(dx, dy) < 70) {
        lastSector = -1;
        currentDirection = 'center';
        updateVisuals();
        return;
      }
      const angle = Math.atan2(dy, dx);
      if (lastSector !== -1 && Math.abs(wrapAngle(angle - lastSector * sectorSize)) < sectorSize / 2 + 0.12) return;
      lastSector = (Math.round(angle / sectorSize) + 8) % 8;
      currentDirection = clockwise[lastSector];
      updateVisuals();
    };

    const showBubble = () => {
      if (!bubble) return;
      bubble.textContent = lines[lineIndex++ % lines.length];
      bubble.classList.add('is-visible');
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove('is-visible'), 2400);
    };

    const boop = () => {
      reactionTimers.forEach(clearTimeout);
      reactionTimers = [];
      const later = (delay, reaction) => reactionTimers.push(setTimeout(() => {
        currentReaction = reaction;
        updateVisuals();
      }, delay));
      const now = Date.now();
      boopCount = now - lastBoop < 1600 ? boopCount + 1 : 1;
      lastBoop = now;
      currentReaction = boopCount >= 4 ? 'dizzy' : 'blink';
      if (boopCount >= 4) {
        boopCount = 0;
        later(1100, null);
      } else {
        later(120, payoffReactions[(boopCount - 1) % payoffReactions.length]);
        later(560, null);
      }
      if (squash?.animate) squash.animate([
        { transform: 'scale(1, 1)', easing: 'ease-in' },
        { transform: 'scale(1.1, .86)', offset: .18, easing: 'ease-out' },
        { transform: 'scale(.95, 1.08)', offset: .45, easing: 'ease-in-out' },
        { transform: 'scale(1.03, .97)', offset: .72, easing: 'ease-in-out' },
        { transform: 'scale(1, 1)' }
      ], { duration: 420, easing: 'linear' });
      updateVisuals();
      showBubble();
    };

    mascot.addEventListener('pointermove', event => {
      pointer = { x: event.clientX, y: event.clientY };
      aim();
    });
    mascot.addEventListener('click', () => {
      boop();
    });
    updateVisuals();
  });
  window.addEventListener('pointermove', event => {
    pointer = { x: event.clientX, y: event.clientY };
    mascots.forEach(mascot => mascot.dataset.mascotReady === 'true' && mascot.dispatchEvent(new PointerEvent('pointermove', { clientX: event.clientX, clientY: event.clientY })));
  }, { passive: true });
  window.addEventListener('scroll', () => {
    if (!pointer) return;
    mascots.forEach(mascot => {
      if (mascot.dataset.mascotReady !== 'true') return;
      mascot.dispatchEvent(new PointerEvent('pointermove', { clientX: pointer.x, clientY: pointer.y }));
    });
  }, { passive: true });
}

function initSummaryStudyPage() {
  const back = document.getElementById('summary-study-back');
  back?.addEventListener('click', () => NavController.navigateToPage(_summaryStudyReadOnly ? 'home' : 'curriculum-summary'));
  initSummaryStudyMascot();
  document.getElementById('summary-study-theme-toggle')?.addEventListener('click', () => {
    if (typeof toggleTheme === 'function') toggleTheme();
    const icon = document.querySelector('#summary-study-theme-toggle i');
    if (icon) icon.className = document.documentElement.getAttribute('data-theme') === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });
  document.querySelectorAll('[data-summary-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.summaryAction;
    if (_summaryStudyReadOnly && !['zoom-out', 'zoom-in', 'fullscreen'].includes(action)) return;
    if (action === 'share-summary') return shareCurrentCurriculumSummary();
    if (action === 'export') return exportCurriculumSummaryPdf(window._summaryStudyResult, window._summaryStudyTitle || 'Tài liệu ôn tập');
    if (action === 'highlight') return applySummaryStudyHighlight();
    if (action === 'remove-highlight') return removeSummaryStudyHighlight();
    if (action === 'draw') { _summaryStudyDrawing = !_summaryStudyDrawing; _summaryStudyErasing = false; mountSummaryStudyDrawingLayer(); button.classList.toggle('active', _summaryStudyDrawing); document.querySelector('[data-summary-action="erase"]')?.classList.remove('active'); return showToast(_summaryStudyDrawing ? 'Chế độ vẽ đã bật.' : 'Chế độ vẽ đã tắt.', 'info'); }
    if (action === 'erase') { _summaryStudyDrawing = true; _summaryStudyErasing = !_summaryStudyErasing; mountSummaryStudyDrawingLayer(); button.classList.toggle('active', _summaryStudyErasing); document.querySelector('[data-summary-action="draw"]')?.classList.toggle('active', !_summaryStudyErasing); return showToast(_summaryStudyErasing ? 'Gôm đã bật. Kéo qua nét vẽ để xóa.' : 'Gôm đã tắt.', 'info'); }
    if (action === 'undo') return summaryStudyUndo();
    if (action === 'interaction') return openSummaryStudyInteraction();
    if (action === 'edit') return setSummaryStudyEditing(!_summaryStudyEditing);
    if (action === 'self-explain') return openSummaryStudySelfExplain();
    if (action === 'share-selection') return shareSummaryStudySelection();
    if (action === 'explain') document.getElementById('summary-study-chat-input')?.focus();
    if (action === 'note') {
      const picked = summaryStudySelection();
      if (!picked) return showToast('Hãy bôi đen đoạn văn trước khi tạo ghi chú.', 'info');
      openSummaryStudyNoteDialog(null, picked);
    }
  }));
  document.querySelectorAll('[data-summary-action="note"], [data-summary-action="self-explain"], [data-summary-action="share-selection"]').forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
  });
  document.querySelector('.summary-study-interaction-trigger')?.addEventListener('mousedown', event => {
    const picked = summaryStudySelection();
    if (picked) _summaryStudyInteractionQuote = picked.quote.trim();
    event.preventDefault();
  });
  document.querySelectorAll('[data-interaction-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.interactionAction;
    closeSummaryStudyInteractionMenu();
    if (action === 'define-term') return openSummaryStudyTermDialog();
    if (action === 'discuss') {
      const input = document.getElementById('summary-study-chat-input');
      if (input) { input.value = `Thảo luận về “${_summaryStudyInteractionQuote}”: `; input.focus(); }
    }
  }));
  document.addEventListener('pointerdown', closeSummaryStudyInteractionOnOutside);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSummaryStudyInteractionMenu();
      document.querySelectorAll('#summary-study-term-dialog, #summary-study-note-dialog, #summary-study-self-explain-dialog, #summary-study-shared-dialog')
        .forEach(dialog => { dialog.hidden = true; });
    }
  });
  window.addEventListener('hashchange', showSharedSummaryStudyExcerpt);
  showSharedSummaryStudyExcerpt();
  document.querySelector('.summary-study-term-close')?.addEventListener('click', () => { document.getElementById('summary-study-term-dialog').hidden = true; });
  document.getElementById('summary-study-term-dialog')?.addEventListener('click', event => { if (event.target.id === 'summary-study-term-dialog') event.currentTarget.hidden = true; });
  document.getElementById('summary-study-term-save')?.addEventListener('click', saveCurrentSummaryStudyTerm);
  document.querySelector('.summary-study-note-close')?.addEventListener('click', () => { document.getElementById('summary-study-note-dialog').hidden = true; });
  document.getElementById('summary-study-note-save')?.addEventListener('click', saveSummaryStudyNote);
  document.getElementById('summary-study-note-delete')?.addEventListener('click', deleteSummaryStudyNote);
  document.querySelector('.summary-study-self-explain-close')?.addEventListener('click', () => { document.getElementById('summary-study-self-explain-dialog').hidden = true; });
  document.getElementById('summary-study-self-explain-submit')?.addEventListener('click', compareSummaryStudySelfExplanation);
  document.querySelector('.summary-study-shared-close')?.addEventListener('click', () => { document.getElementById('summary-study-shared-dialog').hidden = true; });
  document.getElementById('summary-study-shared-copy')?.addEventListener('click', async () => {
    const text = document.getElementById('summary-study-shared-excerpt')?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      showToast('Đã sao chép đoạn tóm tắt.', 'success');
    } catch (error) {
      console.error('[SummaryStudy] Không sao chép được đoạn chia sẻ:', error);
      showToast('Không thể sao chép đoạn trích.', 'error');
    }
  });
  document.querySelectorAll('#summary-study-note-dialog, #summary-study-self-explain-dialog, #summary-study-shared-dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.hidden = true; });
  });
  document.querySelectorAll('[data-summary-color]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    _summaryStudyColor = button.dataset.summaryColor || '#fde68a';
    document.querySelectorAll('[data-summary-color]').forEach(item => item.classList.toggle('active', item === button));
  }));
  const body = document.getElementById('summary-study-document-body');
  body?.addEventListener('contextmenu', showSummaryStudyContextMenu);
  body?.addEventListener('click', event => {
    const marker = event.target.closest('.summary-study-note-marker');
    if (marker) openSummaryStudyNoteById(marker.dataset.summaryNoteId);
  });
  document.querySelectorAll('[data-summary-context-action]').forEach(button => button.addEventListener('click', () => {
    document.getElementById('summary-study-context-menu').hidden = true;
    if (button.dataset.summaryContextAction === 'highlight') applySummaryStudyHighlight();
    else if (button.dataset.summaryContextAction === 'remove-highlight') removeSummaryStudyHighlight(_summaryStudyContextHighlight);
    else document.querySelector('[data-summary-action="note"]')?.click();
  }));
  document.addEventListener('pointerdown', event => {
    const menu = document.getElementById('summary-study-context-menu');
    if (menu && !menu.contains(event.target)) menu.hidden = true;
  });
  document.querySelectorAll('[data-ai-action]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById('summary-study-chat-input');
    if (input) { input.value = `${button.textContent.trim()} về tài liệu này`; input.focus(); }
  }));
  document.querySelectorAll('[data-summary-chat-prompt]').forEach(button => {
    button.addEventListener('mousedown', event => {
      const picked = summaryStudySelection();
      if (picked) _summaryStudyPendingQuote = picked.quote;
      event.preventDefault();
    });
    button.addEventListener('click', () => {
      const input = document.getElementById('summary-study-chat-input');
      if (!input) return;
      const promptType = button.dataset.summaryChatPrompt;
      const quote = _summaryStudyPendingQuote ? ` trong đoạn “${_summaryStudyPendingQuote}”` : ' trong phần đang học';
      input.value = promptType === 'why'
        ? `Vì sao nội dung${quote} lại như vậy?`
        : `Điều gì sẽ xảy ra nếu thay đổi một điều kiện quan trọng${quote}?`;
      input.focus();
    });
  });
  document.getElementById('summary-study-chat-form')?.addEventListener('submit', submitSummaryStudyChat);
}

async function submitSummaryStudyChat(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = document.getElementById('summary-study-chat-input');
  const chat = document.getElementById('summary-study-chat');
  const body = document.getElementById('summary-study-document-body');
  const question = input?.value.trim();
  if (!question || !chat || !body) return;

  const submitButton = form.querySelector('button[type="submit"]');
  const userMessage = document.createElement('div');
  userMessage.className = 'summary-study-user-message summary-study-chat-turn';
  userMessage.textContent = question;
  chat.appendChild(userMessage);
  input.value = '';
  input.disabled = true;
  if (submitButton) submitButton.disabled = true;

  const scene = document.createElement('div');
  scene.className = 'summary-study-comic-scene summary-study-chat-turn';
  const message = document.createElement('div');
  message.className = 'summary-study-ai-message';
  const author = document.createElement('b');
  author.textContent = 'Lumi';
  const answer = document.createElement('span');
  answer.textContent = 'Đang đọc tài liệu và tìm câu trả lời…';
  message.append(author, answer);
  scene.appendChild(message);
  chat.appendChild(scene);
  chat.scrollTop = chat.scrollHeight;

  try {
    const selectedText = _summaryStudyPendingQuote || window.getSelection()?.toString().trim() || '';
    _summaryStudyPendingQuote = '';
    const result = await AIPool.answerSummaryStudyQuestion({
      question,
      documentTitle: window._summaryStudyTitle || 'Tài liệu học tập',
      summary: body.innerText.slice(0, 24000),
      history: _summaryStudyChatHistory,
      selectedText
    });
    answer.textContent = result.answer;
    const sourceLabel = document.createElement('small');
    sourceLabel.className = 'summary-study-ai-source-label';
    sourceLabel.textContent = result.mode === 'web' ? 'Tham khảo từ Internet' : 'Dựa trên bản tóm tắt';
    message.appendChild(sourceLabel);

    if (result.mode === 'web' && result.sources?.length) {
      const sources = document.createElement('div');
      sources.className = 'summary-study-ai-sources';
      const label = document.createElement('small');
      label.textContent = 'Nguồn tham khảo';
      sources.appendChild(label);
      result.sources.forEach((source, index) => {
        const link = document.createElement('a');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `[${index + 1}] ${source.title}`;
        sources.appendChild(link);
      });
      message.appendChild(sources);
    }
    _summaryStudyChatHistory.push(
      { role: 'user', content: question },
      { role: 'assistant', content: result.answer }
    );
    _summaryStudyChatHistory = _summaryStudyChatHistory.slice(-8);
  } catch (error) {
    console.error('[Lumi] Không thể trả lời câu hỏi:', error);
    const errorMessage = String(error?.message || '');
    if (errorMessage === 'web-search-no-results') {
      answer.textContent = 'Mình chưa tìm được nguồn phù hợp trên Internet. Bạn thử đặt câu hỏi cụ thể hơn nhé.';
    } else if (errorMessage.startsWith('Web search failed')) {
      answer.textContent = 'Dịch vụ tìm kiếm Internet đang gặp sự cố. Bạn có thể thử lại sau nhé.';
    } else if (errorMessage.includes('status 401') || errorMessage.includes('status 403')) {
      answer.textContent = 'Groq chưa cấp quyền cho yêu cầu này. Vui lòng kiểm tra cấu hình AI.';
    } else if (errorMessage.includes('status 429')) {
      answer.textContent = 'Groq đang giới hạn lượt dùng. Bạn chờ một chút rồi thử lại nhé.';
    } else if (errorMessage.includes('status 5')) {
      answer.textContent = 'Dịch vụ Groq đang tạm thời gặp sự cố. Bạn thử lại sau nhé.';
    } else if (errorMessage.includes('invalid routing response')) {
      answer.textContent = 'AI chưa trả lời đúng định dạng. Bạn thử gửi lại câu hỏi nhé.';
    } else {
      answer.textContent = 'Mình chưa thể kết nối với AI lúc này. Hãy thử lại sau một chút nhé.';
    }
    message.classList.add('is-error');
  } finally {
    input.disabled = false;
    if (submitButton) submitButton.disabled = false;
    input.focus();
    chat.scrollTop = chat.scrollHeight;
  }
}
window.renderSummaryStudyPage = renderSummaryStudyPage;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSummaryStudyPage);
else initSummaryStudyPage();

function _csSyncRunBtn() {
  const btn = document.getElementById('curriculum-run-btn');
  if (btn && !btn.disabled) btn.innerHTML = _csRunBtnHTML();
}

function _csParseError(err) {
  const msg = String(err?.message || err || '');
  if (msg.includes('text-too-short') || msg.includes('empty')) return 'Tài liệu quá ngắn hoặc trống rỗng.';
  if (msg.includes('pdf-no-text')) return 'PDF này không chứa văn bản (có thể là file scan). Vui lòng thử dán nội dung thủ công.';
  if (msg.includes('pdf-lib-not-loaded')) return 'Không thể tải thư viện đọc PDF. Vui lòng kiểm tra kết nối mạng và thử lại.';
  if (msg.includes('mammoth-lib-not-loaded')) return 'Không thể tải thư viện đọc DOCX. Vui lòng kiểm tra kết nối mạng và thử lại.';
  if (msg.includes('file-too-large')) return `File quá lớn. Giới hạn 20MB.`;
  if (msg.includes('timeout')) return 'Quá thời gian chờ AI (30s). Vui lòng thử tài liệu ngắn hơn hoặc thử lại.';
  if (msg.includes('429') || msg.includes('rate-limited')) return 'API AI đang bận (rate-limit). Vui lòng đợi 30s rồi thử lại.';
  if (msg.includes('all-keys-failed')) return 'Tất cả API keys đang bị giới hạn. Vui lòng thử lại sau vài phút.';
  return `Lỗi: ${msg.slice(0, 120)}`;
}

// ─ Robust Markdown → HTML renderer (tránh lộ kí tự thô **) ─────
function _csMarkdown(md) {
  if (!md) return '';
  let str = escapeHtml(String(md || '').trim());

  // Remove raw horizontal rules (---, ***, ___)
  str = str.replace(/^[\-\*_]{3,}$/gm, '');
  str = str.replace(/([.!?。！？])\s+(#{1,4}\s+)/g, '$1\n$2');

  // Bold & Italic (***text*** -> <strong><em>text</em></strong>)
  str = str.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold (**text** -> <strong>text</strong>)
  str = str.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic (*text* -> <em>text</em>)
  str = str.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headings: #### -> h5, ### -> h4, ## -> h3, # -> h2
  str = str.replace(/^####\s*(.+)$/gm, '<h5 class="cs-markdown-h5">$1</h5>');
  str = str.replace(/^###\s*(.+)$/gm, '<h4 class="cs-markdown-h4">$1</h4>');
  str = str.replace(/^##\s*(.+)$/gm, '<h3 class="cs-markdown-h3">$1</h3>');
  str = str.replace(/^#\s*(.+)$/gm, '<h2 class="cs-markdown-h2">$1</h2>');

  // Bullet list items: - item or * item
  str = str.replace(/^[\-\*]\s+(.+)$/gm, '<li class="cs-markdown-li">$1</li>');
  str = str.replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul class="cs-markdown-ul">${m}</ul>`);

  // Numbered list items: 1. item
  str = str.replace(/^(\d+)\.\s+(.+)$/gm, '<div class="cs-markdown-numbered"><span>$1</span>$2</div>');

  // Strip leftover double or triple asterisks just in case
  str = str.replace(/\*{2,}/g, '');

  // Paragraph breaks
  const paragraphs = str.split(/\n\n+/).filter(Boolean);
  return paragraphs.map(p => {
    const trimmed = p.trim();
    if (/^<(h[1-6]|ul|ol|div|li|section)/i.test(trimmed)) {
      return trimmed;
    }
    const formatted = trimmed.replace(/\n/g, '<br>');
    return `<p style="margin:0 0 10px;line-height:1.75;font-size:14px;color:#334155;">${formatted}</p>`;
  }).join('');
}

// ─ Render Deep Study UI (Học Sâu Engine Interface) ───────────────────
function _renderDeepStudyResultHTML(result, titleLabel) {
  // NOTE: This function uses CSS classes exclusively — no inline styles — for full design consistency.
  let html = '';

  // Warning Banner
  if (result.warning) {
    html += `
      <div class="cs-deep-warning">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span><b>Cảnh báo:</b> ${escapeHtml(result.warning)}</span>
      </div>`;
  }

  const memoryLayer = result.memory_layer || {};
  const memoryRemember = Array.isArray(memoryLayer.remember) ? memoryLayer.remember : [];
  const memoryMistakes = Array.isArray(memoryLayer.common_mistakes) ? memoryLayer.common_mistakes : [];
  const memoryApplications = Array.isArray(memoryLayer.industry_connection) ? memoryLayer.industry_connection : [];
  const memoryQuestions = Array.isArray(memoryLayer.exam_questions) ? memoryLayer.exam_questions : (Array.isArray(result.questions) ? result.questions : []);

  if (memoryRemember.length || memoryMistakes.length || memoryApplications.length || memoryQuestions.length) {
    html += `
      <section class="cs-memory-card cs-section-card">
        <div class="cs-memory-header"><i class="fa-solid fa-lightbulb"></i><span>Hồ sơ ghi nhớ &amp; ôn thi chuyên ngành</span></div>
        <div class="cs-memory-grid">
          ${memoryRemember.length ? `<div class="cs-memory-item cs-memory-item--remember"><h5>Ý cốt lõi cần nhớ</h5><ul>${memoryRemember.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul></div>` : ''}
          ${memoryMistakes.length ? `<div class="cs-memory-item cs-memory-item--mistakes"><h5>Cảnh báo lỗi nhầm kinh điển</h5><ul>${memoryMistakes.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul></div>` : ''}
          ${memoryApplications.length ? `<div class="cs-memory-item cs-memory-item--applications"><h5>Thực tế sản xuất &amp; nhà máy CNTP</h5><ul>${memoryApplications.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul></div>` : ''}
          ${memoryQuestions.length ? `<div class="cs-memory-item cs-memory-item--questions"><h5>Câu hỏi ôn thi trọng tâm</h5><ul>${memoryQuestions.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul></div>` : ''}
        </div>
      </section>`;
  }

  // 1B. CHAPTER HERO BANNER (MATCHING MOCKUP DESIGN)
  const mainChapterTitle = (result.chapters && result.chapters[0]?.title)
    ? result.chapters[0].title
    : (titleLabel || 'Sinh tổng hợp mevalonate từ acetyl-CoA');

  html += `
    <div class="cs-chapter-hero-banner">
      <div class="cs-chapter-hero-icon">
        <i class="fa-solid fa-seedling"></i>
      </div>
      <div class="cs-chapter-hero-text">
        <div class="cs-chapter-hero-label">Chương 1</div>
        <h2 class="cs-chapter-hero-title">${escapeHtml(mainChapterTitle)}</h2>
      </div>
    </div>`;

  // OVERVIEW SECTION
  if (result.overview) {
    html += `
      <div class="cs-overview-card">
        <div class="cs-overview-header">
          <b><i class="fa-solid fa-brain" style="color:#059669;"></i> Tổng Quan Tri Thức</b>
          <span class="cs-badge-count">Học Sâu</span>
        </div>
        <p class="cs-overview-text">${escapeHtml(result.overview)}</p>
      </div>`;
  }

  // 3. STRUCTURED NUMBERED ITEMS LIST (1, 2, 3, 4 FORMAT MATCHING MOCKUP)
  let itemCounter = 1;
  html += `<div class="cs-numbered-list">`;

  // Item 1: Khái niệm
  if (result.concepts && result.concepts.length > 0) {
    const mainConcept = result.concepts[0];
    const otherConcepts = result.concepts.slice(1);
    const mainExplain = mainConcept.definition || mainConcept.explain || '';
    html += `
      <div class="cs-numbered-item">
        <div class="cs-number-badge">${itemCounter++}</div>
        <div class="cs-numbered-body">
          <h3 class="cs-numbered-title">Khái niệm</h3>
          <p class="cs-numbered-text">${escapeHtml(mainExplain || `${mainConcept.name} là một hợp chất sinh học quan trọng trong con đường sinh tổng hợp.`)}</p>
          ${otherConcepts.length > 0 ? `
            <ul class="cs-numbered-bullets">
              ${otherConcepts.map(c => `<li><b>${escapeHtml(c.name)}:</b> ${escapeHtml(c.definition || c.explain || '')}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
      </div>`;
  }

  // Item 2: Bản chất khoa học
  if ((result.principles && result.principles.length > 0) || (result.chapters && result.chapters.length > 0)) {
    const principleText = result.principles?.[0]?.explain || '';
    html += `
      <div class="cs-numbered-item">
        <div class="cs-number-badge">${itemCounter++}</div>
        <div class="cs-numbered-body">
          <h3 class="cs-numbered-title">Bản chất khoa học</h3>
          <div class="cs-numbered-text">${_csMarkdown(principleText || 'Trong con đường sinh tổng hợp, các phân tử kết hợp với nhau dưới tác dụng của enzyme xúc tác để tạo thành sản phẩm trung gian.')}</div>
        </div>
      </div>`;
  }

  // Item 3: Thành phần / Cấu tạo / Cơ chế
  if ((result.formulas && result.formulas.length > 0) || (result.classifications && result.classifications.length > 0)) {
    html += `
      <div class="cs-numbered-item">
        <div class="cs-number-badge">${itemCounter++}</div>
        <div class="cs-numbered-body">
          <h3 class="cs-numbered-title">Thành phần / Cấu tạo / Cơ chế</h3>
          <ul class="cs-numbered-bullets">
            ${(result.formulas || []).map(f => `<li><b>Phản ứng / Công thức:</b> <code>${escapeHtml(f.formula)}</code> ${f.meaning ? `— ${escapeHtml(f.meaning)}` : ''}</li>`).join('')}
            ${(result.classifications || []).map(c => `<li><b>${escapeHtml(c.name)}:</b> ${escapeHtml((c.items || []).join(', '))}</li>`).join('')}
          </ul>
        </div>
      </div>`;
  }

  // Item 4: Ý nghĩa sinh học / Ứng dụng
  if ((result.food_apps && result.food_apps.length > 0) || (result.memory_layer && result.memory_layer.remember?.length)) {
    const rememberItem = result.memory_layer?.remember?.[0] || result.food_apps?.[0]?.text || '';
    html += `
      <div class="cs-numbered-item">
        <div class="cs-number-badge">${itemCounter++}</div>
        <div class="cs-numbered-body">
          <h3 class="cs-numbered-title">Ý nghĩa sinh học</h3>
          <p class="cs-numbered-text">${escapeHtml(rememberItem || 'Là cầu nối quan trọng giữa quá trình chuyển hóa năng lượng và sinh tổng hợp các chất tiền tố.')}</p>
          ${(result.food_apps || []).length > 1 ? `
            <ul class="cs-numbered-bullets">
              ${result.food_apps.slice(1).map(fa => `<li>${escapeHtml(fa.text)}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
      </div>`;
  }

  html += `</div><!-- /.cs-numbered-list -->`;

  // DETAILED CHAPTER STRUCTURE
  if (result.chapters && result.chapters.length > 0 && result.chapters.some(chapter => chapter?.content)) {
    html += `
      <div class="cs-section-card cs-deep-section">
        <h4><i class="fa-solid fa-layer-group"></i> Cấu Trúc Giáo Trình Chi Tiết</h4>
        <div class="cs-deep-chapter-list">
          ${result.chapters.map((ch, idx) => `
            <div class="cs-deep-chapter-item">
              <div class="cs-deep-chapter-title">${escapeHtml(ch.title || `Chương ${idx + 1}`)}</div>
              <div class="cs-chapter-content">${_csMarkdown(ch.content || '')}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // 4. CONCEPTS SECTION
  if (result.concepts && result.concepts.length > 0) {
    html += `
      <div class="cs-section-card" style="margin-bottom:22px;">
        <h4 style="color:#334155;margin-bottom:16px;"><i class="fa-solid fa-book-bookmark" style="color:#4f46e5;"></i> Hệ Thống Khái Niệm & Diễn Giải Bản Chất</h4>
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${result.concepts.map(c => {
            const explain = c.definition || c.explain || '';
            const attrs = Array.isArray(c.attributes) && c.attributes.length > 0 ? '**Đặc điểm:**\n' + c.attributes.map(a => '- ' + a).join('\n') : '';
            const conds = Array.isArray(c.conditions_exceptions) && c.conditions_exceptions.length > 0 ? '**Điều kiện / Ngoại lệ:**\n' + c.conditions_exceptions.map(x => '- ' + x).join('\n') : '';
            const nums = Array.isArray(c.numbers) && c.numbers.length > 0 ? '**Thông số:**\n' + c.numbers.map(n => '- ' + n).join('\n') : '';
            const appStr = c.applications ? `**Ứng dụng CNTP:** ${c.applications}` : '';
            const exStr = c.real_world_example ? `**Ví dụ thực tế:** ${c.real_world_example}` : '';
            const mistStr = c.common_mistakes ? `**Cảnh báo lỗi nhầm:** ${c.common_mistakes}` : '';
            
            const fullText = [explain, attrs, conds, nums, appStr, exStr, mistStr].filter(Boolean).join('\n\n');
            return `
            <div class="cs-concept-detail">
              <div class="cs-concept-detail-title">
                ${escapeHtml(c.name)}
                ${c.tier === 'A' ? '<span class="cs-focus-badge">TRỌNG TÂM</span>' : ''}
              </div>
              <div class="cs-concept-detail-content">${_csMarkdown(fullText || '[Đang bổ sung...]')}</div>
            </div>
          `}).join('')}
        </div>
      </div>`;
  }

  // 5. PRINCIPLES SECTION
  if (result.principles && result.principles.length > 0) {
    html += `
      <div class="cs-section-card" style="margin-bottom:22px;">
        <h4 style="color:#334155;margin-bottom:16px;"><i class="fa-solid fa-gears" style="color:#0891b2;"></i> Nguyên Lý & Cơ Chế Hoạt Động</h4>
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${result.principles.map(p => `
            <div style="padding:16px;border-radius:14px;background:#f0f9ff;border:1px solid #bae6fd;">
              <div style="font-weight:800;font-size:14px;color:#0369a1;margin-bottom:6px;">⚙️ ${escapeHtml(p.name)}</div>
              <div style="font-size:13px;line-height:1.75;color:#0f172a;">${_csMarkdown(p.explain)}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // FORMULAS SECTION
  if (result.formulas && result.formulas.length > 0) {
    html += `
      <div class="cs-section-card cs-deep-section">
        <h4><i class="fa-solid fa-square-root-variable" style="color:#059669;"></i> Công Thức &amp; Thông Số Kỹ Thuật</h4>
        <div class="cs-formula-list">
          ${result.formulas.map(f => `
            <div class="cs-formula-item">
              <code class="cs-formula-code">${escapeHtml(f.formula)}</code>
              ${f.meaning ? `<div class="cs-formula-meaning"><b>Ý nghĩa:</b> ${escapeHtml(f.meaning)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // CLASSIFICATIONS SECTION
  if (result.classifications && result.classifications.length > 0) {
    html += `
      <div class="cs-section-card cs-deep-section">
        <h4><i class="fa-solid fa-sitemap" style="color:#d97706;"></i> Phân Loại &amp; Hệ Thống Đặc Tính</h4>
        <div class="cs-classification-grid">
          ${result.classifications.map(c => `
            <div class="cs-classification-item">
              <div class="cs-classification-name"><i class="fa-solid fa-diagram-project"></i> ${escapeHtml(c.name)}</div>
              <ul class="cs-classification-list">
                ${c.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // FOOD TECHNOLOGY APPLICATIONS
  if (result.food_apps && result.food_apps.length > 0) {
    html += `
      <div class="cs-section-card cs-deep-section cs-section-card--apps">
        <h4><i class="fa-solid fa-utensils" style="color:#16a34a;"></i> Minh Họa Ứng Dụng Công Nghệ Thực Phẩm</h4>
        <div class="cs-app-list">
          ${result.food_apps.map(fa => `
            <div class="cs-app-item">
              <span class="cs-app-badge${fa.ai_generated ? ' cs-app-badge--ai' : ' cs-app-badge--source'}">
                ${fa.ai_generated ? 'AI Minh họa' : 'Trích giáo trình'}
              </span>
              <div class="cs-app-text">${escapeHtml(fa.text)}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // COMPARISONS TABLE
  if (result.comparisons && result.comparisons.length > 0) {
    html += `
      <div class="cs-section-card cs-deep-section">
        <h4><i class="fa-solid fa-code-compare" style="color:#9333ea;"></i> Bảng So Sánh &amp; Phân Biệt Khái Niệm</h4>
        ${result.comparisons.map(comp => `
          <div class="cs-comparison-block">
            <div class="cs-comparison-title">${escapeHtml(comp.title)}</div>
            <div class="cs-table-wrap">
              <table class="cs-comparison-table">
                <thead>
                  <tr>
                    <th>Khái niệm</th>
                    <th>Bản chất</th>
                    <th>Điểm khác biệt</th>
                    <th>Khi nào dùng</th>
                  </tr>
                </thead>
                <tbody>
                  ${(comp.rows || []).map(row => `
                    <tr>
                      <td class="cs-cmp-concept">${escapeHtml(row.concept || '')}</td>
                      <td>${escapeHtml(row.essence || '')}</td>
                      <td class="cs-cmp-diff">${escapeHtml(row.diff || '')}</td>
                      <td class="cs-cmp-when">${escapeHtml(row.when || '')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `).join('')}
      </div>`;
  }

  // RELATIONS SECTION
  if (result.relations && result.relations.length > 0) {
    html += `
      <div class="cs-section-card cs-deep-section">
        <h4><i class="fa-solid fa-link" style="color:#2563eb;"></i> Mối Quan Hệ Giữa Các Kiến Thức</h4>
        <ul class="cs-relations-list">
          ${result.relations.map(rel => `<li>${escapeHtml(rel)}</li>`).join('')}
        </ul>
      </div>`;
  }

  // REMOVED TRANSPARENCY CHECK
  if (result.removed && result.removed.length > 0) {
    html += `
      <div class="cs-removed-block">
        <div class="cs-removed-title"><i class="fa-solid fa-filter"></i> Báo Cáo Loại Bỏ Dư Thừa</div>
        <div class="cs-removed-body">
          ${result.removed.map(rem => `<div class="cs-removed-item">• <b>${escapeHtml(rem.item)}</b>: ${escapeHtml(rem.reason)}</div>`).join('')}
        </div>
      </div>`;
  }

  return html;
}

// ─ Render kết quả v2 (với Quality Badge + Final Summary prose) ─────
function renderCurriculumSummaryResultV2(result, titleLabel) {
  // Chuyển sang stage kết quả
  document.getElementById('cs-input-stage')?.classList.add('hidden');
  document.getElementById('cs-result-stage')?.classList.remove('hidden');
  const isQuick = _csMode === 'quick';
  const tabBar = document.querySelector('.cs-tab-bar');
  const exportButton = document.getElementById('cs-btn-export-pdf');
  const mindmapPane = document.getElementById('cs-pane-mindmap');
  tabBar?.classList.toggle('hidden', isQuick);
  if (exportButton) exportButton.classList.toggle('hidden', isQuick);
  if (mindmapPane) mindmapPane.classList.toggle('hidden', isQuick);

  // Document banner
  const activeTitle = document.getElementById('cs-active-doc-title');
  if (activeTitle) activeTitle.textContent = titleLabel || 'Tài liệu học tập';

  const timestampEl = document.getElementById('cs-doc-timestamp');
  if (timestampEl) {
    const now = new Date();
    timestampEl.textContent = `${isQuick ? 'Tóm tắt nhanh' : 'Học sâu'} lúc ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${now.toLocaleDateString('vi-VN')}`;
  }

  const isDeep = !isQuick && (result.schema === 'deep' || _csMode === 'study'); // ✅ THAY 'exam' → 'study'
  const mainCol = document.getElementById('cs-summary-main-col');

  if (isDeep && mainCol) {
    // 🧠 RENDER DEEP STUDY INTERFACE (cho mode 'study')
    mainCol.classList.add('cs-result-content');
    mainCol.innerHTML = _renderDeepStudyResultHTML(result, titleLabel);
  } else if (mainCol) {
    mainCol.classList.add('cs-result-content');
    // 📝 STANDARD SUMMARY RENDER (cho mode 'quick')
    const quality = result.quality || { avg_confidence: 0.75, avg_clarity: 7, badge: 'good' };
    const isGood = quality.badge === 'good';
    const mainPoints = result.mainPoints || [];
    const finalSummary = result.finalSummary || '';

    let html = '';

    // Quality Badge Banner
    html += `
      <div class="cs-quality-badge cs-quality-badge--${isGood ? 'good' : 'warn'}">
        <span class="cs-quality-icon">${isGood ? '✅' : '⚠️'}</span>
        <div class="cs-quality-text">
          <div class="cs-quality-label">
            ${isGood ? 'Chất lượng TỐT — AI tự đánh giá đáng tin cậy' : 'Cần kiểm tra lại — Độ chính xác chưa cao'}
          </div>
          <div class="cs-quality-meta">
            Độ tự tin: <b>${Math.round((quality.avg_confidence || 0.8) * 100)}%</b>
            &nbsp;&middot;&nbsp; Độ rõ ràng: <b>${quality.avg_clarity || 8}/10</b>
            &nbsp;&middot;&nbsp; Số đoạn: <b>${result.meta?.chunksCount || 1}</b>
          </div>
        </div>
        ${result.cached ? '<span class="cs-cache-tag">⚡ Cache</span>' : ''}
      </div>`;

    if (result.warning) {
      html += `
        <div class="cs-deep-warning">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span><b>Cảnh báo:</b> ${escapeHtml(result.warning)}</span>
        </div>`;
    }

    if (finalSummary) {
      html += `
        <div class="cs-overview-card">
          <div class="cs-overview-header">
            <b><i class="fa-solid fa-file-circle-check"></i> Bản tóm tắt tổng hợp</b>
            <span class="cs-badge-count">${result.meta?.mode === 'study' ? 'Chi tiết' : 'Nhanh'}</span>
          </div>
          <p class="cs-overview-text">${escapeHtml(finalSummary)}</p>
        </div>`;
    }

    if (mainPoints.length > 0) {
      const chunkSize = 3;
      const sectionTitles = [
        'Khái niệm & Nội dung chính',
        'Các yếu tố & Quy trình quan trọng',
        'Tổng hợp & Ứng dụng thực tế',
        'Nội dung bổ sung'
      ];
      for (let i = 0; i < mainPoints.length; i += chunkSize) {
        const chunk = mainPoints.slice(i, i + chunkSize);
        const secNum = Math.floor(i / chunkSize) + 1;
        html += `
          <div class="cs-section-card">
            <h4>${secNum}. ${sectionTitles[secNum - 1] || `Phần ${secNum}`}</h4>
            <ul>${chunk.map(pt => `<li>${escapeHtml(String(pt))}</li>`).join('')}</ul>
          </div>`;
      }
    }

    mainCol.innerHTML = html;
  }

  // ── RIGHT WIDGETS ──
  const keyPoints = result.key_points || result.mainPoints || [];
  const pitfalls = result.pitfalls || [];
  const keywords = result.keywords || (result.concepts ? result.concepts.map(c => c.name) : []);

  const greenList = document.getElementById('cs-widget-green-list');
  if (greenList) {
    greenList.innerHTML = keyPoints.length > 0
      ? keyPoints.slice(0, 5).map(p => `<li>${escapeHtml(String(p))}</li>`).join('')
      : '<li>Đã tổng hợp toàn bộ nội dung cốt lõi của tài liệu.</li>';
  }

  const pinkList = document.getElementById('cs-widget-pink-list');
  if (pinkList) {
    pinkList.innerHTML = pitfalls.length > 0
      ? pitfalls.map(p => `<li>${escapeHtml(String(p))}</li>`).join('')
      : '<li>Chú ý phân biệt các định nghĩa và công thức dễ nhầm lẫn.</li>';
  }

  const purpleTags = document.getElementById('cs-widget-purple-tags');
  if (purpleTags) {
    purpleTags.innerHTML = keywords.length > 0
      ? keywords.slice(0, 8).map(k => `<span class="cs-pill-tag">${escapeHtml(String(k))}</span>`).join('')
      : '<span class="cs-pill-tag">Giáo trình</span>';
  }

  // ── TAB 2: MINDMAP & DOC ASSISTANT ──
  const mindmapContainer = document.getElementById('cs-mindmap-container');
  if (mindmapContainer && !isQuick) {
    const mindmapData = buildCurriculumMindmapData(result, titleLabel, keyPoints, pitfalls);
    const renderMindmapResult = mindmapData.__renderer || renderStructuredMindmap;
    renderMindmapResult(mindmapContainer, mindmapData);
  }

  function buildCurriculumMindmapData(result, titleLabel, keyPoints, pitfalls) {
    const memory = result.memory_layer || {};
    const chapters = Array.isArray(result.chapters) ? result.chapters : [];
    const concepts = Array.isArray(result.concepts)
      ? result.concepts.map(item => item?.name).filter(Boolean)
      : [];
    const formulas = Array.isArray(result.formulas)
      ? result.formulas.map(item => item?.formula || item?.meaning).filter(Boolean)
      : [];
    const industry = Array.isArray(memory.industry_connection) ? memory.industry_connection : [];
    const mistakes = pitfalls.length ? pitfalls : (memory.common_mistakes || []);
    const processItems = chapters
      .map(chapter => chapter?.title)
      .filter(Boolean)
      .slice(0, 4);
    const fallbackProcess = [...concepts, ...keyPoints]
      .filter(Boolean)
      .slice(0, 4);
    const sourceText = JSON.stringify(result).toLowerCase();
    const isMevalonateTopic = /mevalonate|acetyl-?coa|isoprenoid|hmg-?coa/.test(sourceText);

    if (!isMevalonateTopic) {
      const chapterItems = chapters.slice(0, 6).map(chapter => ({
        title: chapter.title || 'Mục kiến thức',
        details: String(chapter.content || '').split('\n').filter(Boolean).slice(0, 2)
      }));
      return {
        title: titleLabel || 'Nội dung tài liệu',
        sections: [
          { title: 'I. Khái niệm & bản chất', color: '#2563eb', items: concepts.slice(0, 4).map(item => ({ title: item, details: [] })) },
          { title: 'II. Cơ chế / quá trình', color: '#7c3aed', items: chapterItems.length ? chapterItems.slice(0, 3) : fallbackProcess.map(item => ({ title: item, details: [] })) },
          { title: 'III. Thành phần & thông số', color: '#0891b2', items: formulas.slice(0, 4).map(item => ({ title: item, details: [] })) },
          { title: 'IV. Ý nghĩa', color: '#059669', items: (memory.remember?.length ? memory.remember : keyPoints).slice(0, 4).map(item => ({ title: item, details: [] })) },
          { title: 'V. Điểm trọng tâm thi', color: '#d97706', items: mistakes.slice(0, 4).map(item => ({ title: item, details: [] })) },
          { title: 'VI. Ứng dụng', color: '#db2777', items: industry.slice(0, 4).map(item => ({ title: item, details: [] })) }
        ].filter(section => section.items.length),
        __renderer: renderStructuredMindmap
      };
    }

    function escapeMindmapSvgText(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderBiochemicalFlowchart(container, data) {
      if (!container || !Array.isArray(data?.flow) || !data.flow.length) {
        renderStructuredMindmap(container, data);
        return;
      }

      const height = 940;
      const nodeWidth = 210;
      const nodeHeight = 132;
      const gap = 150;
      const startX = 50;
      const y = 116;
      const flow = data.flow;
      const wrapSvgText = (value, maxChars) => {
        const words = String(value || '').split(/([\s-]+)/).filter(Boolean);
        const lines = [];
        let line = '';
        words.forEach(word => {
          if (line && (line.length + word.length > maxChars || /^[\s-]+$/.test(word) && line.length + word.length > maxChars - 2)) {
            lines.push(line.trim());
            line = '';
          }
          line += word;
        });
        if (line.trim()) lines.push(line.trim());
        return lines.length ? lines : [''];
      };
      const svgTextLines = (value, maxChars, x, yPosition, lineHeight, attributes) => (
        wrapSvgText(value, maxChars)
          .slice(0, 3)
          .map((line, lineIndex) => `<tspan x="${x}" dy="${lineIndex ? lineHeight : 0}" ${attributes}>${escapeMindmapSvgText(line)}</tspan>`)
          .join('')
      );
      const width = Math.max(
        1640,
        startX * 2 + flow.length * nodeWidth + Math.max(0, flow.length - 1) * gap
      );
      const appItems = [
        { title: 'Lên men bia / bánh mì', text: 'Acetyl-CoA hỗ trợ sterol và sức bền màng men', color: '#059669' },
        { title: 'Mevalonate / IPP', text: 'Tiền chất cho CoQ10 và hương terpenoid', color: '#db2777' },
        { title: 'Điều khiển NADPH', text: 'Pentose phosphate → tăng lực khử cho mevalonate', color: '#d97706' }
      ];

      let svg = `
        <div class="cs-mindmap-wrapper cs-biochemical-flowchart">
          <div class="cs-mindmap-controls">
            <button type="button" class="cs-mm-btn" id="cs-mm-zoom-in" title="Phóng to"><i class="fa-solid fa-plus"></i></button>
            <button type="button" class="cs-mm-btn" id="cs-mm-zoom-out" title="Thu nhỏ"><i class="fa-solid fa-minus"></i></button>
            <button type="button" class="cs-mm-btn" id="cs-mm-reset" title="Về giữa"><i class="fa-solid fa-house"></i></button>
            <button type="button" class="cs-mm-btn" id="cs-mm-fullscreen" title="Mở toàn màn hình" aria-label="Mở sơ đồ toàn màn hình"><i class="fa-solid fa-expand"></i></button>
          </div>
          <div class="cs-mindmap-canvas-viewport">
            <svg viewBox="0 0 ${width} ${height}" class="cs-mindmap-svg" id="cs-mm-svg" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="bio-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.14"/></filter>
                <marker id="bio-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0,0 L0,8 L9,4 z" fill="#475569"/></marker>
                <marker id="bio-arrow-red" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0,0 L0,8 L9,4 z" fill="#dc2626"/></marker>
              </defs>
              <g id="cs-mm-zoom-group">
                <text x="${width / 2}" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#0f172a">${escapeMindmapSvgText(data.title || 'Biochemical pathway')}</text>
                <text x="${width / 2}" y="55" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#64748b">TRỤC CHUYỂN HÓA · ENZYME · COFACTOR · ỨNG DỤNG CNTP</text>
      `;

      flow.forEach((node, index) => {
        const x = startX + index * (nodeWidth + gap);
        const highlight = Boolean(node.highlight);
        const nextX = x + nodeWidth + gap;
        if (index < flow.length - 1) {
          const next = flow[index + 1];
          svg += `
            <line x1="${x + nodeWidth}" y1="${y + 56}" x2="${nextX - 8}" y2="${y + 56}" stroke="${highlight ? '#dc2626' : '#475569'}" stroke-width="${highlight ? 3 : 2.5}" marker-end="url(#${highlight ? 'bio-arrow-red' : 'bio-arrow'})"/>
            <text x="${x + nodeWidth + gap / 2}" y="${y + 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10.5" font-weight="700" fill="${highlight ? '#b91c1c' : '#475569'}">${svgTextLines(next.reaction || 'phản ứng', 25, x + nodeWidth + gap / 2, y + 18, 13, 'text-anchor="middle"')}</text>
            <text x="${x + nodeWidth + gap / 2}" y="${y + 73}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#64748b">${svgTextLines(next.enzyme || '', 28, x + nodeWidth + gap / 2, y + 73, 12, 'text-anchor="middle"')}</text>
          `;
        }
        svg += `
          <g transform="translate(${x}, ${y})" filter="url(#bio-shadow)">
            <rect width="${nodeWidth}" height="${nodeHeight}" rx="14" fill="${highlight ? '#fff7ed' : '#ffffff'}" stroke="${highlight ? '#dc2626' : '#2563eb'}" stroke-width="${highlight ? 3 : 2}"/>
            <circle cx="23" cy="23" r="15" fill="${highlight ? '#dc2626' : '#2563eb'}"/>
            <text x="23" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#ffffff">${escapeMindmapSvgText(node.step)}</text>
            <text x="48" y="28" font-family="Arial, sans-serif" font-size="12.5" font-weight="700" fill="#0f172a">${svgTextLines(node.title, 19, 48, 28, 15, '')}</text>
            <text x="16" y="75" font-family="Arial, sans-serif" font-size="10.5" fill="#475569">${svgTextLines(node.summary, 27, 16, 75, 13, '')}</text>
            ${highlight ? `<text x="16" y="113" font-family="Arial, sans-serif" font-size="9.5" font-weight="700" fill="#b91c1c">⚠ RATE-LIMITING · 2 NADPH</text>` : ''}
          </g>
        `;
      });

      svg += `
        <text x="50" y="315" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#334155">Nhánh ứng dụng và điều hòa</text>
        <line x1="50" y1="330" x2="${width - 50}" y2="330" stroke="#cbd5e1" stroke-width="1"/>
      `;
      appItems.forEach((item, index) => {
        const x = 50 + index * 520;
        svg += `
          <path d="M ${x + 100} ${y + nodeHeight} C ${x + 100} 260, ${x + 100} 275, ${x + 100} 360" fill="none" stroke="${item.color}" stroke-width="2" stroke-dasharray="6 5"/>
          <g transform="translate(${x}, 370)" filter="url(#bio-shadow)">
            <rect width="430" height="104" rx="14" fill="#ffffff" stroke="${item.color}" stroke-width="2"/>
            <text x="18" y="28" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${item.color}">${escapeMindmapSvgText(item.title)}</text>
            <text x="18" y="55" font-family="Arial, sans-serif" font-size="12" fill="#475569">${escapeMindmapSvgText(item.text)}</text>
          </g>
        `;
      });
      svg += `
        <g transform="translate(50, 555)">
          <rect width="${width - 100}" height="230" rx="16" fill="#f8fafc" stroke="#cbd5e1"/>
          <text x="22" y="34" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#1e293b">High-yield facts</text>
          <text x="22" y="70" font-family="Arial, sans-serif" font-size="13" fill="#334155">• HMG-CoA reductase là bước giới hạn tốc độ của đường mevalonate.</text>
          <text x="22" y="102" font-family="Arial, sans-serif" font-size="13" fill="#334155">• Phản ứng khử tiêu thụ 2 NADPH và tạo 2 NADP⁺.</text>
          <text x="22" y="134" font-family="Arial, sans-serif" font-size="13" fill="#334155">• Hai bước phosphoryl hóa tiêu thụ ATP; bước tạo IPP giải phóng CO₂.</text>
          <text x="22" y="166" font-family="Arial, sans-serif" font-size="13" fill="#334155">• IPP ⇄ DMAPP là phản ứng đồng phân hóa, không phải cùng một phân tử.</text>
          <text x="22" y="198" font-family="Arial, sans-serif" font-size="13" fill="#334155">• Có thể liên hệ nguồn NADPH từ pentose phosphate với hiệu suất lên men.</text>
        </g>
              </g>
            </svg>
          </div>
        </div>
      `;
      container.innerHTML = svg;
      initMindmapControls(container);
    }

    return {
      title: titleLabel || 'Nội dung tài liệu',
      sections: [
        {
          title: 'I. Nguyên liệu đầu',
          color: '#2563eb',
          items: [
            { title: 'Acetyl-CoA', details: ['Nguồn carbon đầu vào', 'Tham gia phản ứng thiolase'] }
          ]
        },
        {
          title: 'II. Giai đoạn 1: Tạo mevalonate',
          color: '#7c3aed',
          items: [
            { title: 'Acetoacetyl-CoA', details: ['2 Acetyl-CoA → Acetoacetyl-CoA', 'Enzyme: thiolase'] },
            { title: 'HMG-CoA', details: ['+ Acetyl-CoA → HMG-CoA', 'Enzyme: HMG-CoA synthase'] },
            { title: 'Mevalonate', details: ['HMG-CoA → Mevalonate', 'HMG-CoA reductase · 2 NADPH'], highlight: '⚠ BƯỚC GIỚI HẠN TỐC ĐỘ' }
          ]
        },
        {
          title: 'III. Giai đoạn 2: Tạo isoprenoid',
          color: '#0891b2',
          items: [
            { title: '5-Phosphomevalonate', details: ['Mevalonate + ATP → ADP', 'Enzyme: Mevalonate kinase (MVK)'] },
            { title: 'Mevalonate-5-diphosphate', details: ['+ ATP → ADP', 'Enzyme: Phosphomevalonate kinase (PMK)'] },
            { title: 'IPP', details: ['Khử carboxyl: CO₂ thoát', 'Enzyme: Mevalonate-5-diphosphate decarboxylase'] },
            { title: 'IPP ⇄ DMAPP', details: ['Đồng phân hóa thuận nghịch', 'Enzyme: IPP isomerase (IDI)'] }
          ]
        },
        {
          title: 'IV. Sản phẩm cuối',
          color: '#059669',
          items: [
            { title: 'IPP + DMAPP', details: ['Sterol', 'Carotenoid · terpenoid · hợp chất hương'] }
          ]
        },
        {
          title: 'V. Điểm trọng tâm thi',
          color: '#d97706',
          items: [
            { title: 'HMG-CoA reductase', details: ['Bước giới hạn tốc độ'], highlight: 'THI: RATE-LIMITING' },
            { title: '2 NADPH', details: ['Dễ nhầm thành 1 NADPH'], highlight: '⚠ HIGH-YIELD' },
            { title: 'IPP ≠ DMAPP', details: ['Hai đồng phân có vai trò khác nhau'], highlight: 'DỄ NHẦM' },
            { title: 'CO₂', details: ['Bị loại ở bước tạo IPP'], highlight: 'NHỚ BƯỚC NÀY' }
          ]
        },
        {
          title: 'VI. Ứng dụng CNTP',
          color: '#db2777',
          items: [
            { title: 'Lên men bia', details: ['Sterol bảo vệ màng tế bào'] },
            { title: 'Bánh mì', details: ['Acetyl-CoA hỗ trợ hoạt động men'] },
            { title: 'Sterol thực vật', details: ['Ứng dụng trong thực phẩm chức năng'] },
            { title: 'Isoprenoid', details: ['Hương liệu tự nhiên · CoQ10'] }
          ]
        }
      ],
      source: { processItems, fallbackProcess, concepts, formulas, mistakes, industry },
      flow: [
        { step: '1', title: 'Acetyl-CoA', summary: 'Nguồn carbon đầu vào' },
        { step: '2', title: 'Acetoacetyl-CoA', summary: 'Ngưng tụ 2 Acetyl-CoA', reaction: '2 Acetyl-CoA → Acetoacetyl-CoA', enzyme: 'Thiolase · EC 2.3.1.9' },
        { step: '3', title: 'HMG-CoA', summary: 'Bổ sung 1 Acetyl-CoA', reaction: 'Acetoacetyl-CoA + Acetyl-CoA → HMG-CoA', enzyme: 'HMG-CoA synthase · EC 2.3.3.10' },
        { step: '4', title: 'Mevalonate', summary: 'Khử · tiêu thụ 2 NADPH', reaction: 'HMG-CoA + 2 NADPH → Mevalonate + 2 NADP⁺', enzyme: 'HMG-CoA reductase · EC 1.1.1.34', highlight: 'RATE-LIMITING' },
        { step: '5', title: '5-Phosphomevalonate', summary: 'Phosphoryl hóa lần 1 · ATP', reaction: 'Mevalonate + ATP → 5-Phosphomevalonate + ADP', enzyme: 'Mevalonate kinase (MVK) · EC 2.7.1.36' },
        { step: '6', title: 'Mevalonate-5-diphosphate', summary: 'Phosphoryl hóa lần 2 · ATP', reaction: '5-Phosphomevalonate + ATP → Diphosphomevalonate + ADP', enzyme: 'Phosphomevalonate kinase (PMK) · EC 2.7.4.2' },
        { step: '7', title: 'IPP', summary: 'Khử carboxyl · CO₂ thoát', reaction: 'Diphosphomevalonate → IPP + CO₂', enzyme: 'Mevalonate-5-diphosphate decarboxylase · EC 4.1.1.33' },
        { step: '8', title: 'DMAPP', summary: 'Đồng phân hóa thuận nghịch', reaction: 'IPP ⇄ DMAPP', enzyme: 'IPP isomerase (IDI) · EC 5.3.3.2' }
      ],
      __renderer: renderBiochemicalFlowchart
    };
  }

  // ── TAB 3: QUESTIONS (TỰ KIỂM TRA) ──
  const questionsBody = document.getElementById('cs-questions-body');
  if (questionsBody) {
    const qs = result.questions || result.quickQuestions || [];
    if (qs.length > 0) {
      questionsBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${qs.map((q, qIdx) => {
            const question = typeof q === 'string' ? q : (q.question || q.text || '');
            const hint = typeof q === 'object' ? (q.hint || q.answer || '') : '';
            return `
            <article class="cs-question-card">
          <div class="cs-question-heading">
            <span class="cs-question-number">Câu ${qIdx + 1}</span>
            <span>${escapeHtml(String(question))}</span>
          </div>
          ${hint ? `<details class="cs-question-hint">
            <summary>Gợi ý tư duy</summary>
            <div>${escapeHtml(String(hint))}</div>
          </details>` : ''}
            </article>`;
          }).join('')}
        </div>`;
    } else {
      questionsBody.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Chưa có câu hỏi tự kiểm tra cho tài liệu này.</p>';
    }
  }

  // ── TAB 4: SOURCE TEXT ──
  const sourceBody = document.getElementById('cs-source-body');
  if (sourceBody) {
    sourceBody.textContent = _csCurrentSourceText || result.overview || result.finalSummary || 'Không có nguồn văn bản được lưu trữ.';
  }

  // Về tab đầu
  document.getElementById('cs-tab-btn-summary')?.click();
}

function exportCurriculumSummaryPdf(result, title) {
  if (!result) {
    showToast('Chưa có nội dung tóm tắt để xuất PDF.', 'warning');
    return;
  }

  const safeTitle = escapeHtml(title || 'Tài liệu học tập');
  const overview = result.overview || result.finalSummary || result.summary || '';
  const chapters = Array.isArray(result.chapters) ? result.chapters : [];
  const concepts = Array.isArray(result.concepts) ? result.concepts : [];
  const mechanisms = Array.isArray(result.mechanisms) ? result.mechanisms : [];
  const domainApps = Array.isArray(result.domain_apps) ? result.domain_apps : [];
  const questions = Array.isArray(result.questions) ? result.questions : [];
  const memory = result.memory_layer || {};
  const remember = Array.isArray(memory.remember) ? memory.remember : [];
  const mistakes = Array.isArray(memory.common_mistakes) ? memory.common_mistakes : [];
  const applications = Array.isArray(memory.industry_connection) ? memory.industry_connection : [];
  const formulaItems = Array.isArray(result.formulas) ? result.formulas : [];
  const logoUrl = new URL('fteca.webp', window.location.href).href;
  const topicText = `${title} ${overview}`.toLowerCase();
  const accent = /kinh tế|marketing|quản trị|tài chính/.test(topicText)
    ? { main: '#b86127', soft: '#fff4e8', line: '#e8c9aa' }
    : /kỹ thuật|tin học|công nghệ/.test(topicText)
    ? { main: '#087568', soft: '#eff8f5', line: '#c8e2dc' }
      : /sinh học|vi sinh|sinh hóa/.test(topicText)
        ? { main: '#7652a8', soft: '#f5f0ff', line: '#d8c8ee' }
        : { main: '#16756b', soft: '#eff8f5', line: '#c8e2dc' };
  const exportDate = new Date().toLocaleDateString('vi-VN');
  const formatPdfText = value => {
    const lines = String(value || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    let html = '';
    let listItems = [];
    const flushList = () => {
      if (!listItems.length) return;
      html += `<ul>${listItems.join('')}</ul>`;
      listItems = [];
    };
    lines.forEach(line => {
      const cleanLine = line.replace(/^\s*[-_*]{3,}\s*$/, '').trim();
      if (!cleanLine) return;
      const bullet = cleanLine.match(/^(?:[-•*]|\d+[.)])\s+(.+)$/);
      if (bullet) {
        listItems.push(`<li>${formatPdfInline(bullet[1])}</li>`);
        return;
      }
      flushList();
      const heading = cleanLine.match(/^#{1,3}\s+(.+)$/);
      if (heading) {
        html += `<h3>${formatPdfInline(heading[1])}</h3>`;
      } else {
        html += `<p>${formatPdfInline(cleanLine)}</p>`;
      }
    });
    flushList();
    return html;
  };
  const formatPdfInline = value => escapeHtml(String(value || ''))
    .replace(/\*{2}([^*]+)\*{2}/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*{2,}/g, '');
  const getPdfItemText = item => typeof item === 'string'
    ? item
    : (item?.text || item?.title || item?.name || item?.formula || item?.meaning || item?.content || item?.description || '');
  const list = items => items.filter(Boolean).map(item => {
    const text = getPdfItemText(item);
    return text ? `<li>${formatPdfInline(text)}</li>` : '';
  }).filter(Boolean).join('');
  const page = (number, content, extraClass = '') => `
    <section class="pdf-page ${extraClass}">
      <div class="pdf-page-header"><img class="pdf-brand-logo" src="${logoUrl}" alt="FTECA 24"><span>Digital Study Document</span></div>
      <div class="pdf-page-anchor">${String(number).padStart(2, '0')}</div>
      <main>${content}</main>
      <div class="pdf-page-footer"><span>Knowledge for a better future</span><span>${number}</span></div>
    </section>`;

  const splitPdfContent = value => {
    const source = String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/^\s*[-_*]{3,}\s*$/gm, '')
      .trim();
    const blocks = source
      .split(/\n\s*\n/)
      .map(block => block.trim())
      .filter(Boolean);
    const chunks = [];
    let chunk = [];
    let length = 0;
    const addBlock = block => {
      const nextLength = length + block.length + 2;
      if (chunk.length && nextLength > 1300) {
        chunks.push(chunk.join('\n'));
        chunk = [];
        length = 0;
      }
      chunk.push(block);
      length += block.length + 2;
    };
    blocks.forEach(block => {
      if (block.length <= 1500) {
        addBlock(block);
        return;
      }
      block.split(/(?<=[.!?。！？])\s+/).forEach(sentence => addBlock(sentence));
    });
    if (chunk.length) chunks.push(chunk.join('\n'));
    for (let index = 0; index < chunks.length - 1;) {
      if (chunks[index].length < 260) {
        chunks[index] += `\n\n${chunks[index + 1]}`;
        chunks.splice(index + 1, 1);
      } else {
        index += 1;
      }
    }
    return chunks.length ? chunks : [''];
  };
  const chapterChunks = chapters.flatMap(chapter => splitPdfContent(chapter.summary || chapter.content || ''));
  const chapterPages = chapters.length
    ? chapters.flatMap((chapter, index) => {
      const chapterTitle = chapter.title || `Chủ đề ${index + 1}`;
      const chunks = splitPdfContent(chapter.summary || chapter.content || '');
      const chapterApplications = Array.isArray(chapter.applications) ? chapter.applications : [];
      const chapterApplicationItems = chapterApplications.filter(item => getPdfItemText(item));
      const previousPageCount = chapters
        .slice(0, index)
        .reduce((total, item) => total + splitPdfContent(item.summary || item.content || '').length, 0);
      return chunks.map((chapterContent, chunkIndex) => page(3 + previousPageCount + chunkIndex, `
        <div class="pdf-kicker">PHẦN ${String(index + 1).padStart(2, '0')}</div>
        <h1>${escapeHtml(String(chapterTitle))}${chunks.length > 1 ? ` <small>(${chunkIndex + 1}/${chunks.length})</small>` : ''}</h1>
        <div class="pdf-rule"></div>
        <div class="pdf-body">${formatPdfText(chapterContent)}</div>
        ${chunkIndex === chunks.length - 1 && chapterApplicationItems.length ? `<section class="pdf-card"><h2>Ứng dụng của phần này</h2><ul>${list(chapterApplicationItems)}</ul></section>` : ''}
      `));
    }).join('')
    : page(4, `<div class="pdf-kicker">NỘI DUNG</div><h1>Nội dung tóm tắt</h1><div class="pdf-body">${formatPdfText(overview)}</div>`);

  const chapterPageCount = chapterChunks.length || 1;
  const conceptDetails = concepts.map(concept => {
    const name = concept.name || concept.title || '';
    const definition = concept.definition || '';
    const facts = Array.isArray(concept.key_facts) ? concept.key_facts : [];
    const application = concept.applications || '';
    if (!name && !definition && !facts.length && !application) return '';
    return `<section class="pdf-card"><h2>${formatPdfInline(name || 'Khái niệm')}</h2>${definition ? `<p class="pdf-body">${formatPdfInline(definition)}</p>` : ''}${facts.length ? `<ul>${list(facts)}</ul>` : ''}${application ? `<p class="pdf-caption"><strong>Ứng dụng:</strong> ${formatPdfInline(application)}</p>` : ''}</section>`;
  }).join('');
  const supplementalBlocks = [
    concepts.length ? {
      title: 'Khái niệm cốt lõi',
      kicker: 'CORE CONCEPTS',
      items: conceptDetails
    } : null,
    mechanisms.length ? {
      title: 'Cơ chế và quy trình',
      kicker: 'MECHANISMS',
      items: mechanisms.map(item => {
        const name = item.name || 'Cơ chế';
        const steps = Array.isArray(item.steps) ? item.steps : [];
        return `<h2>${formatPdfInline(name)}</h2>${steps.length ? `<ol>${steps.map(step => `<li>${formatPdfInline(step)}</li>`).join('')}</ol>` : ''}`;
      }).join('')
    } : null,
    domainApps.length ? {
      title: 'Mở rộng và ứng dụng theo lĩnh vực',
      kicker: 'DOMAIN APPLICATIONS',
      items: domainApps.map(item => `<div class="pdf-card"><div class="pdf-memory-label">${formatPdfInline(item.expansion_type || 'APPLICATION')}</div><p class="pdf-body">${formatPdfInline(item.content || item.source_fact_summary)}</p></div>`).join('')
    } : null
  ].filter(Boolean);
  const supplementalPages = supplementalBlocks.flatMap(block => {
    const chunks = splitPdfContent(block.items.replace(/<[^>]+>/g, ' '));
    return chunks.map((chunk, index) => ({ ...block, content: chunk, index, count: chunks.length }));
  });
  const supplementalPageStart = 3 + chapterPageCount;
  const supplementalPageHtml = supplementalPages.map((block, index) => page(
    supplementalPageStart + index,
    `<div class="pdf-kicker">${block.kicker}${block.count > 1 ? ` · ${block.index + 1}/${block.count}` : ''}</div><h1>${escapeHtml(block.title)}</h1><div class="pdf-rule"></div><div class="pdf-body">${formatPdfText(block.content)}</div>`
  )).join('');
  const supplementalPageCount = supplementalPages.length;
  const comparisons = Array.isArray(result.comparisons) ? result.comparisons : [];
  const comparisonRowChunks = rows => {
    const chunks = [];
    let chunk = [];
    let length = 0;
    rows.filter(Boolean).forEach(row => {
      const rowLength = Object.values(row).join(' ').length + 40;
      if (chunk.length && length + rowLength > 900) {
        chunks.push(chunk);
        chunk = [];
        length = 0;
      }
      chunk.push(row);
      length += rowLength;
    });
    if (chunk.length) chunks.push(chunk);
    return chunks.length ? chunks : [[]];
  };
  const comparisonPages = comparisons.flatMap((comparison, comparisonIndex) =>
    comparisonRowChunks(comparison.rows || []).map((rows, chunkIndex) => ({
      title: comparison.title || `Nhóm khái niệm ${comparisonIndex + 1}`,
      rows,
      chunkIndex,
      chunkCount: comparisonRowChunks(comparison.rows || []).length
    }))
  );
  const comparisonPageCount = comparisonPages.length;
  const comparisonPageStart = supplementalPageStart + supplementalPageCount;
  const memoryPage = comparisonPageStart + comparisonPageCount;
  const comparisonTocEntries = comparisonPageCount
    ? comparisonPages.map((comparison, index) => `<li><span>03 · So sánh${comparisonPages.length > 1 ? ` ${index + 1}` : ''}</span><span>${String(comparisonPageStart + index).padStart(2, '0')}</span></li>`).join('')
    : '';
  const supplementalTocEntries = supplementalPages.map((block, index) => `<li><span>${block.kicker === 'MECHANISMS' ? '03' : '04'} · ${escapeHtml(block.title)}${block.count > 1 ? ` ${block.index + 1}` : ''}</span><span>${String(supplementalPageStart + index).padStart(2, '0')}</span></li>`).join('');
  const formulasBlock = formulaItems.length
    ? `<section class="pdf-card"><h2>Công thức và điểm kỹ thuật</h2><ul>${list(formulaItems)}</ul></section>` : '';
  const splitListItems = (items, maxLength = 780) => {
    const chunks = [];
    let chunk = [];
    let length = 0;
    items.filter(Boolean).forEach(item => {
      const text = typeof item === 'string'
        ? item
        : (item.title || item.name || item.formula || item.meaning || item.content || '');
      const nextLength = length + String(text).length + 20;
      if (chunk.length && nextLength > maxLength) {
        chunks.push(chunk);
        chunk = [];
        length = 0;
      }
      chunk.push(item);
      length += String(text).length + 20;
    });
    if (chunk.length) chunks.push(chunk);
    return chunks.length ? chunks : [[]];
  };
  const applicationChunks = splitListItems(applications);
  const memoryPageCount = 1 + (applications.length ? applicationChunks.length : 0);
  const memoryPages = [
    page(memoryPage, `<div class="pdf-kicker">MEMORY LAYER</div><h1>Ghi nhớ nhanh — Hiểu sâu — Dễ áp dụng</h1><div class="pdf-grid"><div class="pdf-note pdf-memory"><div class="pdf-memory-label">${String(remember.length).padStart(2, '0')} KEY POINTS</div><h2>Ý cốt lõi cần nhớ</h2><ul>${list(remember)}</ul></div><div class="pdf-note pdf-warning pdf-memory"><div class="pdf-memory-label">${String(mistakes.length).padStart(2, '0')} THINGS TO AVOID</div><h2>Cảnh báo lỗi nhầm</h2><ul>${list(mistakes)}</ul></div></div>${formulasBlock}`)
  ];
  const comparisonPageHtml = comparisonPages.map((comparison, index) => {
    const pageNumber = comparisonPageStart + index;
    const continuation = comparison.chunkCount > 1 ? ` <small>(${comparison.chunkIndex + 1}/${comparison.chunkCount})</small>` : '';
    const rows = comparison.rows.map(row => `
      <tr>
        <td>${formatPdfInline(row.concept)}</td>
        <td>${formatPdfInline(row.essence)}</td>
        <td>${formatPdfInline(row.diff)}</td>
        <td>${formatPdfInline(row.when)}</td>
      </tr>`).join('');
    return page(pageNumber, `<div class="pdf-kicker">COMPARISON</div><h1>Bảng so sánh &amp; phân biệt${continuation}</h1><div class="pdf-rule"></div><h2 class="pdf-comparison-title">${formatPdfInline(comparison.title)}</h2><div class="pdf-comparison-wrap"><table class="pdf-comparison"><thead><tr><th>Khái niệm</th><th>Bản chất</th><th>Điểm khác biệt</th><th>Khi nào dùng</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }).join('');
  if (applications.length) {
    applicationChunks.forEach((items, index) => {
      const pageNumber = memoryPage + 1 + index;
      memoryPages.push(page(pageNumber, `<div class="pdf-kicker">MEMORY LAYER${applicationChunks.length > 1 ? ` · ${index + 1}/${applicationChunks.length}` : ''}</div><h1>Liên hệ thực tế</h1><section class="pdf-card pdf-memory"><div class="pdf-memory-label">${String(applications.length).padStart(2, '0')} REAL-WORLD LINKS</div><ul>${list(items)}</ul></section>`));
    });
  }
  const reviewPage = memoryPage + memoryPageCount;
  const mindmapPageNumber = reviewPage + 1;
  const backPage = mindmapPageNumber + 1;
  const currentMindmapSvg = document.querySelector('#cs-mindmap-container #cs-mm-svg');
  const mindmapSvg = currentMindmapSvg
    ? currentMindmapSvg.outerHTML
      .replace(/\s(width|height)="[^"]*"/g, '')
      .replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ')
    : '<div class="pdf-mindmap-empty">Sơ đồ tư duy chưa được tạo cho tài liệu này.</div>';
  const popup = window.open('', '_blank', 'width=1100,height=800');
  if (!popup) {
    showToast('Trình duyệt đã chặn cửa sổ xuất PDF. Hãy cho phép popup cho trang này.', 'warning');
    return;
  }
  popup.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${safeTitle}</title>
    <style>
      @page{size:A4;margin:0}@page landscape{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#e9eeed;color:#263d3b;font-family:Arial,"Segoe UI",sans-serif}
      .pdf-page{position:relative;width:210mm;height:297mm;margin:12mm auto;background:#fff;overflow:hidden;padding:22mm 20mm 18mm;page-break-after:always}
      .pdf-page:before{content:"";position:absolute;inset:0;border:1px solid ${accent.line};pointer-events:none}.pdf-page-anchor{position:absolute;right:20mm;top:31mm;color:${accent.line};font-size:30px;font-weight:800;letter-spacing:-2px;line-height:1}
      .pdf-page-header{position:absolute;top:10mm;left:20mm;right:20mm;display:flex;align-items:center;justify-content:space-between;color:${accent.main};font-size:9pt;border-bottom:1px solid ${accent.line};padding-bottom:4mm;letter-spacing:.2px}.pdf-brand-logo{width:25mm;height:auto;max-height:8mm;object-fit:contain;object-position:left center;filter:grayscale(1) opacity(.28)}
      .pdf-page-footer{position:absolute;bottom:9mm;left:20mm;right:20mm;display:flex;justify-content:space-between;color:#82918f;font-size:9pt;border-top:1px solid #e1e8e6;padding-top:3mm}
      .pdf-cover,.pdf-back{background:#fff}.pdf-cover:after,.pdf-back:after{content:"";position:absolute;width:45mm;height:45mm;right:18mm;top:22mm;border:1px solid ${accent.line};border-radius:50%;box-shadow:0 0 0 10mm ${accent.soft},0 0 0 20mm #fafcfb}
      .pdf-cover main,.pdf-back main{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;justify-content:center}
      .pdf-logo{width:48mm;height:auto;max-height:18mm;object-fit:contain;object-position:left center}
      .pdf-cover h1{font-size:32pt;line-height:1.12;max-width:155mm;margin:25mm 0 8mm;color:#203b39}.pdf-cover .pdf-subtitle{font-size:15pt;color:#60716e;max-width:145mm}.pdf-page h1 small{font-size:10pt;font-weight:400;color:#82918f}
      .pdf-pill{display:inline-block;border:1px solid ${accent.main};border-radius:2px;padding:3mm 6mm;color:${accent.main};font-size:9.5pt;font-weight:700;width:max-content;margin-top:12mm;letter-spacing:.8px}
      .pdf-cover .pdf-page-footer,.pdf-back .pdf-page-footer{z-index:2}.pdf-back main{align-items:center;text-align:center}.pdf-back h1{font-size:25px;color:#203b39}.pdf-back p{color:#60716e}
      .pdf-kicker{font-size:10pt;letter-spacing:1.4px;color:${accent.main};font-weight:800;margin-bottom:3mm}.pdf-page h1{font-size:24pt;line-height:1.15;font-weight:700;margin:0 0 4mm;color:#203b39}.pdf-page h2{font-size:18pt;line-height:1.2;font-weight:600;color:${accent.main};margin:0 0 4mm}.pdf-rule{height:2px;width:22mm;background:${accent.main};margin-bottom:5mm}.pdf-body{font-size:12pt;line-height:1.65;font-weight:400;color:#405553;overflow-wrap:anywhere;text-align:justify}.pdf-body p{margin:0 0 4mm;text-align:justify}.pdf-body h3{font-size:14pt;line-height:1.25;font-weight:600;letter-spacing:-.1px;color:#203b39;margin:6mm 0 3mm;padding-left:4mm;border-left:2px solid ${accent.main};text-align:left}.pdf-body h3:first-child{margin-top:3mm}.pdf-body ul{margin:2mm 0 5mm;padding-left:6mm}.pdf-body li{margin:1.5mm 0;text-align:justify}.pdf-body strong{font-weight:700}.pdf-body code{font-family:Consolas,monospace;font-size:13pt;background:#f1f4f3;padding:1px 3px}.pdf-card{border:1px solid ${accent.line};border-radius:2mm;padding:6mm;margin:7mm 0;background:${accent.soft}}.pdf-card ul,.pdf-toc{margin:0;padding-left:6mm}.pdf-card li,.pdf-toc li{font-size:12pt;line-height:1.55;margin:2mm 0}.pdf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm}.pdf-note{border-top:2px solid ${accent.main};background:${accent.soft};padding:5mm;font-size:12pt;line-height:1.55}.pdf-warning{border-top-color:#c66e43;background:#fff8f2}.pdf-memory{border-top:3px solid ${accent.main};padding-top:5mm}.pdf-memory-label{font-size:9.5pt;letter-spacing:1.3px;color:${accent.main};font-weight:800;margin-bottom:2mm}.pdf-metadata{font-size:8.5pt;color:#82918f}.pdf-caption{font-size:10pt;color:#60716e}.pdf-toc li{display:flex;justify-content:space-between;border-bottom:1px dotted #b8c7c3;padding-bottom:2mm}
      .pdf-mindmap-page{page:landscape;width:297mm;height:210mm;padding:16mm 14mm 14mm}.pdf-mindmap-page .pdf-page-header{left:14mm;right:14mm}.pdf-mindmap-page .pdf-page-footer{left:14mm;right:14mm}.pdf-mindmap-page .pdf-page-anchor{right:14mm;top:25mm}.pdf-mindmap-title{font-size:18pt;font-weight:700;color:#203b39;margin:0 0 3mm}.pdf-mindmap-shell{height:166mm;width:269mm;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid ${accent.line};background:#f8fbfa}.pdf-mindmap-shell svg{display:block;width:100%;height:100%;min-width:0!important;min-height:0!important}.pdf-mindmap-empty{font-size:12pt;color:#60716e}
      .pdf-comparison-title{font-size:14pt!important;color:${accent.main}!important;margin:0 0 4mm!important}.pdf-comparison-wrap{border:1px solid ${accent.line};border-radius:2mm;overflow:hidden}.pdf-comparison{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11.5pt;line-height:1.4}.pdf-comparison th{padding:3mm 3mm;text-align:left;background:${accent.soft};color:${accent.main};font-size:9.5pt}.pdf-comparison td{padding:3mm;vertical-align:top;border-top:1px solid ${accent.line};color:#405553;overflow-wrap:anywhere}.pdf-comparison tbody tr:nth-child(odd){background:${accent.soft}}.pdf-comparison td:first-child{width:19%;font-weight:700;color:${accent.main}}.pdf-comparison td:nth-child(2){width:27%}.pdf-comparison td:nth-child(3){width:31%;color:${accent.main}}.pdf-comparison td:nth-child(4){width:23%;color:#176b91}
      @media print{html,body{background:#fff}.pdf-page{margin:0;box-shadow:none}.pdf-page:not(.pdf-cover):not(.pdf-back){page-break-after:always}}
    </style></head><body>
    ${page(1, `<img class="pdf-logo" src="${logoUrl}" alt="FTECA 24"><div class="pdf-pill">TÓM TẮT KIẾN THỨC</div><h1>${safeTitle}</h1><p class="pdf-subtitle">Digital Study Document · Tài liệu học tập được hệ thống hóa.</p><p class="pdf-metadata">${exportDate}</p>`, 'pdf-cover')}
    ${page(2, `<div class="pdf-kicker">CONTENTS</div><h1>Mục lục</h1><div class="pdf-rule"></div><ol class="pdf-toc"><li><span>01 · Tổng quan</span><span>03</span></li><li><span>02 · Kiến thức trọng tâm</span><span>04</span></li>${supplementalTocEntries}${comparisonTocEntries}<li><span>05 · Memory Layer</span><span>${String(memoryPage).padStart(2, '0')}</span></li><li><span>06 · Ôn tập nhanh</span><span>${String(reviewPage).padStart(2, '0')}</span></li><li><span>07 · Sơ đồ tư duy</span><span>${String(mindmapPageNumber).padStart(2, '0')}</span></li><li><span>08 · Bìa sau</span><span>${String(backPage).padStart(2, '0')}</span></li></ol>`, 'pdf-toc-page')}
    ${page(3, `<div class="pdf-kicker">01 · TỔNG QUAN</div><h1>Tổng quan</h1><div class="pdf-rule"></div><div class="pdf-body">${formatPdfText(overview)}</div>`)}
    ${chapterPages}
    ${supplementalPageHtml}
    ${comparisonPageHtml}
    ${memoryPages.join('')}
    ${page(reviewPage, `<div class="pdf-kicker">REVIEW</div><h1>Ôn tập nhanh</h1><div class="pdf-rule"></div><div class="pdf-note"><h2>Checklist trước khi làm bài</h2><ul>${list(remember.length ? remember : concepts)}</ul></div>${questions.length ? `<section class="pdf-card"><h2>Câu hỏi tự kiểm tra</h2><ol>${questions.map(question => `<li>${formatPdfInline(question)}</li>`).join('')}</ol></section>` : ''}<p class="pdf-body">Hãy dùng tài liệu này như một bản ôn tập nhanh, sau đó quay lại nguồn tài liệu gốc để kiểm tra các chi tiết chuyên sâu.</p>`)}
    ${page(mindmapPageNumber, `<div class="pdf-kicker">VISUAL SUMMARY</div><h1 class="pdf-mindmap-title">Sơ đồ tư duy</h1><div class="pdf-mindmap-shell">${mindmapSvg}</div>`, 'pdf-mindmap-page')}
    ${page(backPage, `<img class="pdf-logo" src="${logoUrl}" alt="FTECA 24"><h1>KNOWLEDGE MADE CLEAR.<br>PROGRESS MADE POSSIBLE.</h1><div class="pdf-rule"></div><p class="pdf-body">Generated by<br><strong>FTECA Study Document</strong></p>`, 'pdf-back')}
    </body></html>`);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 450);
}

// ─ Alias cho backward compat ───────────────────────────────────────
function renderCurriculumSummaryResult(result, titleLabel) {
  renderCurriculumSummaryResultV2(result, titleLabel);
}

// ─ History v2 ─────────────────────────────────────────────────────
function createSummaryShareId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readCurriculumSummaryHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CS_HISTORY_KEY) || '[]');
    if (!Array.isArray(parsed)) throw new Error('Summary history is not an array');
    let migrated = false;
    const history = parsed.map(entry => {
      if (entry.summaryId) return entry;
      migrated = true;
      return { ...entry, summaryId: createSummaryShareId() };
    });
    if (migrated) localStorage.setItem(CS_HISTORY_KEY, JSON.stringify(history));
    return history;
  } catch (error) {
    console.error('[CurriculumSummary] Không thể đọc lịch sử tóm tắt:', error);
    return [];
  }
}

function saveCurriculumSummaryHistory(history) {
  localStorage.setItem(CS_HISTORY_KEY, JSON.stringify(history));
}

async function callSummaryShareApi(method, body = {}, shareId = '') {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') {
    const token = await AuthModule.getIdToken();
    if (!token) throw new Error('authentication-required');
    headers.Authorization = `Bearer ${token}`;
    headers['Content-Type'] = 'application/json';
  }
  const url = new URL('/api/summary-share', location.origin);
  if (method === 'GET') url.searchParams.set('id', shareId);
  const response = await fetch(url, {
    method,
    headers,
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store'
  });
  let payload;
  try { payload = await response.json(); } catch { throw new Error(`summary-share-invalid-response-${response.status}`); }
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.reason || `summary-share-${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function shareCurrentCurriculumSummary() {
  const title = document.getElementById('cs-active-doc-title')?.textContent?.trim() || window._summaryStudyTitle || 'Bản tóm tắt';
  const result = _csCurrentResult || window._summaryStudyResult;
  if (!result) return showToast('Chưa có bản tóm tắt để chia sẻ.', 'info');
  if (!_csCurrentSummaryId) {
    const history = readCurriculumSummaryHistory();
    const matching = history.find(entry => entry.result === result || (entry.title === title && entry.mode === _csMode));
    _csCurrentSummaryId = matching?.summaryId || '';
  }
  if (!_csCurrentSummaryId) {
    _csCurrentSummaryId = createSummaryShareId();
    const history = readCurriculumSummaryHistory();
    history.unshift({ summaryId: _csCurrentSummaryId, title, mode: _csMode, result, savedAt: new Date().toISOString() });
    saveCurriculumSummaryHistory(history.slice(0, CS_MAX_HISTORY));
    renderCurriculumSummaryHistory();
  }

  const button = document.getElementById('cs-btn-share-summary');
  if (button) button.disabled = true;
  try {
    await callSummaryShareApi('POST', { shareId: _csCurrentSummaryId, title, result });
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('page', 'summary-study');
    url.searchParams.set('share-summary', _csCurrentSummaryId);
    const history = readCurriculumSummaryHistory();
    const entry = history.find(item => item.summaryId === _csCurrentSummaryId);
    if (entry) {
      entry.shareUrl = url.href;
      entry.sharedAt = new Date().toISOString();
      saveCurriculumSummaryHistory(history);
      renderCurriculumSummaryHistory();
    }
    if (navigator.share) {
      await navigator.share({ title: `${title} — FTECA 24`, text: `Bản tóm tắt: ${title}`, url: url.href });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url.href);
      showToast('Đã tạo và sao chép URL riêng cho bản tóm tắt.', 'success');
    } else {
      throw new Error('clipboard-unavailable');
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.error('[CurriculumSummary] Không thể chia sẻ bản tóm tắt:', error);
    if (error.message === 'authentication-required') {
      showToast('Bạn cần đăng nhập để tạo liên kết chia sẻ.', 'error');
    } else if (error.status === 503) {
      showToast('Vercel chưa cấu hình FIREBASE_SERVICE_ACCOUNT_JSON. Thêm biến này trong Project Settings → Environment Variables rồi deploy lại.', 'error', 6500);
    } else {
      showToast('Không thể tạo URL chia sẻ. Vui lòng thử lại.', 'error');
    }
  } finally {
    if (button) button.disabled = false;
  }
}

async function deleteSharedSummaryEntries(entries) {
  const ids = [...new Set(entries.filter(entry => entry.shareUrl).map(entry => entry.summaryId).filter(Boolean))];
  if (!ids.length) return;
  await callSummaryShareApi('DELETE', { sourceIds: ids });
}

async function deleteCurriculumHistoryEntries(entries) {
  await deleteSharedSummaryEntries(entries);
  localStorage.removeItem(CS_HISTORY_KEY);
  if (_csCurrentSummaryId && entries.some(entry => entry.summaryId === _csCurrentSummaryId)) {
    _csCurrentSummaryId = '';
    _csCurrentResult = null;
  }
}

async function csDeleteHistoryEntry(summaryId) {
  const history = readCurriculumSummaryHistory();
  const entry = history.find(item => item.summaryId === summaryId);
  if (!entry) return;
  if (!confirm(`Xóa bản tóm tắt “${entry.title || 'Tài liệu'}” và vô hiệu hóa URL chia sẻ của nó?`)) return;
  try {
    await deleteSharedSummaryEntries([entry]);
    saveCurriculumSummaryHistory(history.filter(item => item.summaryId !== summaryId));
    if (_csCurrentSummaryId === summaryId) {
      _csCurrentSummaryId = '';
      _csCurrentResult = null;
    }
    renderCurriculumSummaryHistory();
    showToast('Đã xóa bản tóm tắt và URL chia sẻ tương ứng.', 'success');
  } catch (error) {
    console.error('[CurriculumSummary] Không thể xóa bản tóm tắt:', error);
    showToast(error.message === 'authentication-required'
      ? 'Đăng nhập đúng tài khoản đã tạo URL để xóa bản tóm tắt này.'
      : 'Không thể vô hiệu hóa URL chia sẻ. Bản tóm tắt chưa bị xóa.', 'error');
  }
}
window.csDeleteHistoryEntry = csDeleteHistoryEntry;

function csv2SaveHistory(entry) {
  try {
    const history = readCurriculumSummaryHistory();
    const savedEntry = { ...entry, summaryId: createSummaryShareId(), savedAt: new Date().toISOString() };
    history.unshift(savedEntry);
    while (history.length > CS_MAX_HISTORY) {
      const removableIndex = history.findLastIndex(item => !item.shareUrl);
      if (removableIndex < 0) break;
      history.splice(removableIndex, 1);
    }
    localStorage.setItem(CS_HISTORY_KEY, JSON.stringify(history));
    renderCurriculumSummaryHistory();
    return savedEntry.summaryId;
  } catch (e) {
    console.warn('[CurriculumSummary v2] Không lưu được lịch sử:', e);
    return '';
  }
}

function renderCurriculumSummaryHistory() {
  const list = document.getElementById('curriculum-history-list');
  if (!list) return;

  const history = readCurriculumSummaryHistory();

  if (!history.length) {
    // Render seed documents matching the reference design screenshot when history is empty
    const seedDocs = [
      { title: 'Công nghệ thực phẩm - Chương 3', fmt: 'PDF', time: '2 ngày trước', icon: 'fa-file-pdf', color: '#ef4444' },
      { title: 'Tự động hóa trong sản xuất thực phẩm', fmt: 'PDF', time: '4 ngày trước', icon: 'fa-file-pdf', color: '#ef4444' },
      { title: 'Vi sinh vật thực phẩm', fmt: 'DOCX', time: '6 ngày trước', icon: 'fa-file-word', color: '#2563eb' }
    ];

    list.innerHTML = seedDocs.map(doc => `
      <div class="curriculum-history-item" onclick="csLoadSeedDoc('${escapeHtml(doc.title)}')">
        <div class="curriculum-history-item-icon">
          <i class="fa-solid ${doc.icon}" style="color:${doc.color};"></i>
        </div>
        <div class="curriculum-history-item-body">
          <div class="curriculum-history-item-title" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</div>
          <div class="curriculum-history-item-meta">${doc.fmt} · ${doc.time}</div>
        </div>
        <div class="curriculum-history-item-more">
          <i class="fa-solid fa-ellipsis"></i>
        </div>
      </div>
    `).join('');
    return;
  }

  const modeLabels = { quick: 'Nhanh', study: 'Chi tiết' };
  list.innerHTML = history.map((entry, idx) => {
    const date = entry.savedAt ? new Date(entry.savedAt).toLocaleDateString('vi-VN') : '';
    const isDocx = (entry.title || '').toLowerCase().endsWith('.docx');
    const iconClass = isDocx ? 'fa-file-word' : 'fa-file-pdf';
    const iconColor = isDocx ? '#2563eb' : '#ef4444';
    const fmt = isDocx ? 'DOCX' : 'PDF';

    return `<div class="curriculum-history-item" onclick="csLoadHistoryEntry(${idx})">
      <div class="curriculum-history-item-icon">
        <i class="fa-solid ${iconClass}" style="color:${iconColor};"></i>
      </div>
      <div class="curriculum-history-item-body">
        <div class="curriculum-history-item-title" title="${escapeHtml(entry.title)}">${escapeHtml(entry.title)}</div>
        <div class="curriculum-history-item-meta">${fmt} · ${date || 'Gần đây'}${entry.shareUrl ? ' · <i class="fa-solid fa-link" title="Có URL chia sẻ"></i>' : ''}</div>
      </div>
      <button type="button" class="curriculum-history-item-delete" aria-label="Xóa bản tóm tắt ${escapeHtml(entry.title)}" title="Xóa bản tóm tắt và URL chia sẻ" onclick="event.stopPropagation(); csDeleteHistoryEntry('${entry.summaryId}')"><i class="fa-solid fa-trash-can"></i></button>
    </div>`;
  }).join('');
}

function csLoadSeedDoc(title) {
  const titleInput = document.getElementById('curriculum-doc-title');
  if (titleInput) titleInput.value = title;
  const textarea = document.getElementById('curriculum-text-input');
  if (textarea && !textarea.value.trim()) {
    textarea.value = `Nội dung tài liệu học tập: ${title}\nTổng quan về các khái niệm cốt lõi, quy trình công nghệ và kiến thức quan trọng...`;
    textarea.dispatchEvent(new Event('input'));
  }
  showToast(`Đã chọn tài liệu: ${title}`, 'info');
}

window.csLoadSeedDoc = csLoadSeedDoc;

function csLoadHistoryEntry(index) {
  const history = readCurriculumSummaryHistory();
  const entry = history[index];
  if (!entry) return;

  _csCurrentSummaryId = entry.summaryId;
  _csCurrentResult = entry.result;
  _csMode = entry.mode;
  _csCurrentSourceText = '';

  document.querySelectorAll('[data-cs-mode]').forEach(b => b.classList.toggle('active', b.dataset.csMode === _csMode));
  const titleInput = document.getElementById('curriculum-doc-title');
  if (titleInput) titleInput.value = entry.title;

  renderCurriculumSummaryResultV2(entry.result, entry.title);
  showToast(`Đã tải: ${entry.title}`, 'info');
}

window.initCurriculumSummaryPage = initCurriculumSummaryPage;
window.csLoadHistoryEntry = csLoadHistoryEntry;

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
  const badge = document.querySelector('#btn-notifications-top .badge-dot') || document.querySelector('#snav-notifications .badge-dot');
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
function adminIntroCanvasUpdate(id,key,value){var item=_introItem(id);if(!item)return;if(['x','y','width','height'].includes(key)){item[key]=_introClamp(value,key==='width'?12:8,100);adminIntroCanvasRender();return;}item[key]=value;if(key==='content'){var preview=document.querySelector('#admin-intro-canvas .subject-canvas-item[data-id="'+id+'"] .subject-canvas-text');if(preview)preview.textContent=value;return;}if(key==='alt'){var image=document.querySelector('#admin-intro-canvas .subject-canvas-item[data-id="'+id+'"] img');if(image)image.alt=value;}}
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

const _adminSubjectSaveQueues = new Map();

function _saveAdminSubjectDetails(subjectId, details) {
  const previous = _adminSubjectSaveQueues.get(subjectId) || Promise.resolve();
  const save = previous
    .catch(() => {})
    .then(async () => {
      const status = details.status || 'draft';
      const idToken = status === 'published' ? await AuthModule.getIdToken() : '';
      const result = await DB.saveSubjectDetails(subjectId, details, status !== 'published', idToken);
      if (status === 'published' && !result.ok) {
        const reason = result.sync?.reason ? ` (${result.sync.reason})` : '';
        showToast(`Chưa thể đồng bộ nội dung môn học${reason}. Dữ liệu vẫn được lưu trên thiết bị Admin.`, 'error');
      }
      return result;
    })
    .catch((error) => {
      console.error('[Admin subject details] Không thể lưu nội dung:', error);
      showToast('Không thể lưu nội dung môn học. Vui lòng thử lại.', 'error');
      return { ok: false, reason: error?.message || 'subject-details-save-failed' };
    });
  _adminSubjectSaveQueues.set(subjectId, save);
  save.finally(() => {
    if (_adminSubjectSaveQueues.get(subjectId) === save) _adminSubjectSaveQueues.delete(subjectId);
  });
  return save;
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
  _saveAdminSubjectDetails(subjectId, details);
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
  _saveAdminSubjectDetails(subjectId, details);
  _renderSubjectConfigChapters(subjectId, details.chapters);
  showToast('Da them bai hoc!', 'success');
}

function _scDeleteChapter(subjectId, chapId) {
  if (!confirm('Xoa chuong nay va tat ca bai hoc ben trong?')) return;
  var details = DB.getSubjectDetails(subjectId);
  details.chapters = details.chapters.filter(function(c) { return c.id !== chapId; });
  _saveAdminSubjectDetails(subjectId, details);
  _renderSubjectConfigChapters(subjectId, details.chapters);
  showToast('Da xoa chuong!', 'success');
}

function _scDeleteLesson(subjectId, chapId, lesId) {
  if (!confirm('Xoa bai hoc nay?')) return;
  var details = DB.getSubjectDetails(subjectId);
  var chap = details.chapters.find(function(c) { return c.id === chapId; });
  if (chap) chap.lessons = chap.lessons.filter(function(l) { return l.id !== lesId; });
  _saveAdminSubjectDetails(subjectId, details);
  _renderSubjectConfigChapters(subjectId, details.chapters);
  showToast('Da xoa bai hoc!', 'success');
}

function _scUpdateChapterTitle(subjectId, chapId, newTitle) {
  var details = DB.getSubjectDetails(subjectId);
  var chap = details.chapters.find(function(c) { return c.id === chapId; });
  if (chap) chap.title = newTitle.trim();
  _saveAdminSubjectDetails(subjectId, details);
}

function _scUpdateLessonTitle(subjectId, chapId, lesId, newTitle) {
  var details = DB.getSubjectDetails(subjectId);
  var chap = details.chapters.find(function(c) { return c.id === chapId; });
  if (chap) { var les = chap.lessons.find(function(l) { return l.id === lesId; }); if (les) les.title = newTitle.trim(); }
  _saveAdminSubjectDetails(subjectId, details);
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
  const result = await _saveAdminSubjectDetails(subjectId, details);
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

async function adminLessonAiSettings(lesson, chapter, hostId = 'admin-ai-summary-settings') {
  if (!lesson) return;
  const ai = lesson.aiSummary || (lesson.aiSummary = { enabled: false, contentHash: '', status: 'none', cache: {} });
  const currentHash = lessonSummaryHash(chapter || {}, lesson);
  const host = document.getElementById(hostId);
  if (!host) return;

  const subjectId = (_reviewLessonSubjectId && hostId === 'admin-review-ai-summary-settings') ? _reviewLessonSubjectId : _interactiveCurrentSubjectId;
  const existingSummary = await readSummary(subjectId, lesson.id);
  const isComplete = summaryIsComplete(existingSummary);
  const stale = summaryIsStale(existingSummary, currentHash);

  let label = 'AI đang tắt cho bài này.';
  let badgeClass = '';
  if (!ai.enabled) {
    label = 'AI đang tắt cho bài này.';
  } else if (!existingSummary || !isComplete) {
    label = 'Chưa có đủ 3 bản tóm tắt.';
    badgeClass = 'warning';
  } else if (stale) {
    label = 'Bài học đã thay đổi, cần tạo lại.';
    badgeClass = 'stale';
  } else {
    label = '✅ Đã có 3 bản tóm tắt (Firestore).';
    badgeClass = 'ready';
  }

  const btnText = (existingSummary && isComplete && !stale) ? 'Tạo lại 3 bản tóm tắt AI' : 'Tạo 3 bản tóm tắt AI';

  host.innerHTML = `
    <div class="admin-ai-summary-heading">
      <b><i class="fa-solid fa-sparkles"></i> Thiết lập AI Tóm Tắt</b>
      <span class="admin-ai-summary-status ${badgeClass}" id="admin-ai-status-badge">${label}</span>
    </div>
    <label class="admin-ai-summary-switch" style="display:flex;align-items:center;gap:8px;margin:10px 0;font-weight:600;cursor:pointer;">
      <input type="checkbox" ${ai.enabled ? 'checked' : ''} onchange="adminToggleLessonAi(this.checked, '${hostId}')">
      <span>Cho phép AI tóm tắt bài này</span>
    </label>
    <div class="admin-ai-summary-actions">
      <button type="button" id="admin-generate-summary-btn" class="btn btn-primary btn-sm" ${ai.enabled ? '' : 'disabled'} onclick="adminGenerateLessonAiSummaries('${hostId}')">
        <i class="fa-solid fa-wand-magic-sparkles"></i> ${btnText}
      </button>
      <small style="display:block; margin-top:4px; color:var(--text-muted);">Admin chọn bài giảng và bấm nút này để sinh 3 bản tóm tắt đẩy lên Firestore cho sinh viên.</small>
    </div>
  `;
}

function adminToggleLessonAi(enabled, hostId = 'admin-ai-summary-settings') {
  let subjectId = _interactiveCurrentSubjectId;
  let chapterId = _interactiveCurrentChapterId;
  let lessonId = _interactiveCurrentLessonId;

  if (hostId === 'admin-review-ai-summary-settings' || (!lessonId && _reviewLessonId)) {
    subjectId = _reviewLessonSubjectId;
    chapterId = _reviewLessonChapterId;
    lessonId = _reviewLessonId;
  }

  const details = DB.getSubjectDetails(subjectId), chapter = details?.chapters?.find(item => item.id === chapterId), lesson = chapter?.lessons?.find(item => item.id === lessonId);
  if (!lesson) return;
  lesson.aiSummary = { ...(lesson.aiSummary || {}), enabled: Boolean(enabled), status: enabled ? (lesson.aiSummary?.contentHash ? 'ready' : 'none') : 'none' };
  DB.saveSubjectDetails(subjectId, details, true);
  adminLessonAiSettings(lesson, chapter, hostId);
}

async function adminGenerateLessonAiSummaries(hostId = 'admin-ai-summary-settings') {
  let subjectId = _interactiveCurrentSubjectId;
  let chapterId = _interactiveCurrentChapterId;
  let lessonId = _interactiveCurrentLessonId;

  if (hostId === 'admin-review-ai-summary-settings') {
    subjectId = _reviewLessonSubjectId;
    chapterId = _reviewLessonChapterId;
    lessonId = _reviewLessonId;
  }

  const details = DB.getSubjectDetails(subjectId), chapter = details?.chapters?.find(item => item.id === chapterId), lesson = chapter?.lessons?.find(item => item.id === lessonId);
  if (!lesson) return showToast('Vui lòng chọn bài giảng trước!', 'error');
  if (!lesson?.aiSummary?.enabled) return showToast('Vui lòng bật "Cho phép AI tóm tắt" trước!', 'info');

  const source = getLessonSummarySource(lesson);
  if (source.length < 40) return showToast('Bài học chưa có đủ nội dung để tạo tóm tắt.', 'info');
  const hash = lessonSummaryHash(chapter, lesson);

  const statusBadge = document.getElementById('admin-ai-status-badge');
  const btn = document.getElementById('admin-generate-summary-btn');
  if (btn) btn.disabled = true;

  const modes = [
    { key: 'quick', label: '1 phút' },
    { key: 'study', label: 'Học kỹ' },
    { key: 'exam', label: 'Ôn thi' }
  ];

  const summaryResult = {
    subjectId: subjectId,
    lessonId: lesson.id,
    contentHash: hash,
    updatedAt: new Date().toISOString(),
    updatedBy: AuthModule.getCurrentUser()?.email || 'admin'
  };

  let successCount = 0;
  for (let i = 0; i < modes.length; i++) {
    const m = modes[i];
    if (statusBadge) statusBadge.textContent = `⏳ Đang tạo bản ${i + 1}/3 (${m.label})…`;
    try {
      const result = await AIPool.generateLessonSummary({
        mode: m.key,
        chapterTitle: chapter.title || 'Chương học',
        lessonTitle: lesson.title || 'Bài học',
        source
      });
      summaryResult[m.key] = result;
      successCount++;
    } catch (e) {
      console.warn(`[Admin AI Summary] Lỗi mode ${m.key}:`, e);
    }
  }

  if (successCount === 3) {
    if (statusBadge) statusBadge.textContent = '⏳ Đang lưu vào Firestore…';
    const writeRes = await writeSummary(subjectId, lesson.id, summaryResult);
    if (writeRes.ok) {
      lesson.aiSummary = lesson.aiSummary || { enabled: true };
      lesson.aiSummary.contentHash = hash;
      lesson.aiSummary.status = 'ready';
      lesson.aiSummary.updatedAt = new Date().toISOString();
      DB.saveSubjectDetails(subjectId, details, true);
      clearSessionCache(subjectId, lesson.id);
      showToast('🎉 Đã tạo và lưu thành công 3 bản tóm tắt lên Firestore!', 'success');
    } else {
      showToast(`⚠️ Không thể lưu Firestore (${writeRes.reason}). Vui lòng kiểm tra Firebase!`, 'error');
    }
  } else {
    showToast(`❌ Chỉ tạo được ${successCount}/3 bản tóm tắt. Vui lòng thử lại!`, 'error');
  }

  await adminLessonAiSettings(lesson, chapter, hostId);
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
  var form = document.getElementById('admin-interactive-editor-form'); if (form && !document.getElementById('admin-ai-summary-settings')) { var aiHost = document.createElement('div'); aiHost.id = 'admin-ai-summary-settings'; aiHost.className = 'admin-ai-summary-settings'; form.appendChild(aiHost); } adminLessonAiSettings(les, chap);
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
  var ai = les.aiSummary || (les.aiSummary = { enabled:false, cache:{} }); if (ai.contentHash) ai.status = 'stale';
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


/* --- ADMIN REVIEW LESSON SETTINGS --- */
var _reviewLessonSubjectId=null,_reviewLessonChapterId=null,_reviewLessonId=null,_reviewLessonDocumentEditor=null,_reviewLessonMediaItems=[],_reviewLessonSelectedMediaId=null,_reviewLessonDocumentTimer=null,_reviewLessonMediaDrag=null;
function _reviewActive(){var d=DB.getSubjectDetails(_reviewLessonSubjectId),c=d&&(d.chapters||[]).find(function(x){return x.id===_reviewLessonChapterId}),l=c&&(c.lessons||[]).find(function(x){return x.id===_reviewLessonId});return{details:d,chapter:c,lesson:l};}
function _reviewClamp(v,f,min,max){v=Number(v);return Math.min(max,Math.max(min,Number.isFinite(v)?v:f));}
function _reviewMediaId(){return'review_media_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);}
function _reviewDoc(l,create){var b=(l.blocks||[]).find(function(x){return x.type==='lessonDocument'});if(!b&&create){b={type:'lessonDocument',content:''};l.blocks=Array.isArray(l.blocks)?l.blocks:[];l.blocks.unshift(b)}return b;}
function initReviewLessonAdmin(subjectId){var select=document.getElementById('review-lesson-subject-select'),subjects=getAllSubjects();if(!select)return;if(!subjects.length){select.innerHTML='<option value="">Không có môn học</option>';return}var selected=subjectId||_reviewLessonSubjectId||select.value||subjects[0].id;if(!subjects.some(function(x){return x.id===selected}))selected=subjects[0].id;select.innerHTML=subjects.map(function(x){return'<option value="'+escapeHtml(x.id)+'">'+escapeHtml((x.code||x.id)+' - '+(x.name||'Môn học'))+'</option>'}).join('');select.value=selected;if(selected!==_reviewLessonSubjectId){destroyReviewLessonDocumentEditor();_reviewLessonChapterId=_reviewLessonId=null}_reviewLessonSubjectId=selected;_reviewLessonMediaItems=[];_reviewLessonSelectedMediaId=null;renderReviewLessonTree();}
function renderReviewLessonTree(){var tree=document.getElementById('review-lesson-tree'),d=DB.getSubjectDetails(_reviewLessonSubjectId),chapters=d&&d.chapters||[];if(!tree)return;tree.innerHTML=chapters.length?chapters.map(function(c,i){var lessons=c.lessons||[];return'<section class="review-lesson-admin-chapter"><h5>'+escapeHtml(c.title||('Chương '+(i+1)))+'</h5>'+(lessons.length?lessons.map(function(l){return'<button type="button" class="review-lesson-admin-tree-item'+(l.id===_reviewLessonId?' active':'')+'" onclick="selectReviewLesson(\''+escapeHtml(c.id)+'\',\''+escapeHtml(l.id)+'\')"><span>'+escapeHtml(l.title||'Bài giảng chưa đặt tên')+'</span><small>'+(l.status==='published'?'Công khai':'Nháp')+'</small></button>'}).join(''):'<p class="text-xs text-muted">Chưa có bài giảng.</p>')+'</section>'}).join(''):'<p class="text-xs text-muted">Môn học chưa có chương.</p>';}
function _reviewLegacyMediaHtml(blocks){return (blocks||[]).filter(function(b){return b.type==='image'||b.type==='video'}).map(function(b){if(b.type==='image'&&/^https?:\/\//i.test(b.src||''))return '<p><img src="'+escapeHtml(b.src)+'" alt="'+escapeHtml(b.alt||'')+'" style="width:'+Math.min(100,Math.max(12,Number(b.width)||36))+'%"></p>';if(b.type==='video'&&/^https?:\/\//i.test(b.src||''))return '<p><a href="'+escapeHtml(b.src)+'" target="_blank" rel="noopener noreferrer">Mở video bài giảng</a></p>';return ''}).join('');}
function selectReviewLesson(chapterId,lessonId){destroyReviewLessonDocumentEditor();_reviewLessonChapterId=chapterId;_reviewLessonId=lessonId;var a=_reviewActive();if(!a.lesson)return;document.getElementById('review-lesson-title').value=a.lesson.title||'';document.getElementById('review-lesson-status').value=a.lesson.status||'draft';var doc=_reviewDoc(a.lesson,true),legacy=_reviewLegacyMediaHtml(a.lesson.blocks);if(legacy&&doc.content.indexOf('data-review-inline-migrated')<0){doc.content+=(doc.content?'<p><br></p>':'')+'<div data-review-inline-migrated="true">'+legacy+'</div>';a.lesson.blocks=[doc];}_reviewLessonMediaItems=[];_reviewLessonSelectedMediaId=null;renderReviewLessonTree();initReviewLessonDocumentEditor(doc.content||'');var mediaPanel=document.querySelector('.review-lesson-admin-media');if(mediaPanel){var aiHost=document.getElementById('admin-review-ai-summary-settings');if(!aiHost){aiHost=document.createElement('div');aiHost.id='admin-review-ai-summary-settings';aiHost.className='admin-ai-summary-settings';aiHost.style.marginTop='16px';mediaPanel.appendChild(aiHost);}adminLessonAiSettings(a.lesson,a.chapter,'admin-review-ai-summary-settings');}}
function createReviewLesson(){var a=_reviewActive(),cs=a.details&&a.details.chapters||[],c=cs.find(function(x){return x.id===_reviewLessonChapterId})||cs[0];if(!c)return showToast('Hãy tạo ít nhất một chương trước.','error');var title=prompt('Tên bài giảng mới:','Bài giảng ôn tập mới');if(!title)return;c.lessons=c.lessons||[];var l={id:'les_review_'+Date.now(),title:title.trim(),duration:'10:00',status:'draft',type:'editor',blocks:[{type:'lessonDocument',content:''}],content:''};c.lessons.push(l);_reviewLessonChapterId=c.id;_reviewLessonId=l.id;DB.saveSubjectDetails(_reviewLessonSubjectId,a.details).then(function(){selectReviewLesson(c.id,l.id)});}
function updateReviewLessonMetadata(key,value){var l=_reviewActive().lesson;if(!l||!['title','status'].includes(key))return;l[key]=key==='status'?(value==='published'?'published':'draft'):String(value||'');renderReviewLessonTree();}
function initReviewLessonDocumentEditor(content){var textarea=document.getElementById('admin-review-lesson-document-editor');if(!textarea||!_reviewLessonId)return;if(!window.tinymce){textarea.value=content||'';return showToast('Không thể tải trình soạn thảo TinyMCE.','error')}tinymce.init({selector:'#admin-review-lesson-document-editor',height:520,menubar:false,plugins:'lists link image media table wordcount',toolbar:'undo redo | blocks | bold italic underline forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image media reviewFloatingMedia table | removeformat | wordcount',branding:false,images_upload_handler:function(blobInfo){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result)};reader.onerror=function(){reject('Không đọc được ảnh')};reader.readAsDataURL(blobInfo.blob())})},content_style:'body { position: relative; min-height: 500px; margin: 0; padding: 18px 24px; font-family: Inter, sans-serif; font-size: 15px; line-height: 1.8; } p { margin: 0 0 14px; } h2,h3,h4 { margin: 26px 0 10px; line-height: 1.3; } ul,ol { margin: 0 0 16px; padding-left: 1.5em; } img:not(.review-floating-media) { display: block; max-width: 100%; height: auto; margin: 18px auto; } img.review-floating-media { max-width: min(70%, 560px); height: auto; box-sizing: border-box; } table { border-collapse: collapse; width: 100%; margin: 16px 0; } th,td { border:1px solid #9ca3af; padding:8px; }',setup:function(editor){editor.ui.registry.addButton('reviewFloatingMedia',{icon:'image',tooltip:'Bật/tắt ảnh nổi kéo tự do',onAction:function(){reviewLessonToggleFloatingMedia(editor)}});editor.on('init',function(){_reviewLessonDocumentEditor=editor;editor.setContent(content||'')});bindReviewLessonFloatingMedia(editor);editor.on('input change undo redo',syncReviewLessonDocumentContent)}}).catch(function(){showToast('Không thể khởi tạo TinyMCE.','error')});}
function reviewLessonToggleFloatingMedia(editor) { var image = editor.selection.getNode(); if (!image || image.nodeName !== 'IMG') return showToast('Chọn một ảnh trước khi bật ảnh nổi.', 'info'); image.classList.toggle('review-floating-media'); if (image.classList.contains('review-floating-media')) { var body = editor.getBody(), parent = image.parentNode; if (parent && parent !== body && parent.childNodes.length === 1) { parent.removeChild(image); body.appendChild(image); parent.remove(); } image.setAttribute('data-review-float-x', image.getAttribute('data-review-float-x') || '12'); image.setAttribute('data-review-float-y', image.getAttribute('data-review-float-y') || '12'); image.setAttribute('contenteditable', 'false'); image.style.position = 'absolute'; image.style.left = image.getAttribute('data-review-float-x') + 'px'; image.style.top = image.getAttribute('data-review-float-y') + 'px'; image.style.cursor = 'move'; var textTarget = body.querySelector('p:not(:empty)') || body.appendChild(editor.getDoc().createElement('p')); editor.selection.select(textTarget, true); editor.selection.collapse(false); editor.focus(); } else { image.removeAttribute('data-review-float-x'); image.removeAttribute('data-review-float-y'); image.removeAttribute('contenteditable'); image.style.removeProperty('position'); image.style.removeProperty('left'); image.style.removeProperty('top'); image.style.removeProperty('cursor'); } syncReviewLessonDocumentContent(); }
function bindReviewLessonFloatingMedia(editor) { var drag = null; editor.on('init', function() { editor.getBody().addEventListener('pointerdown', function(event) { var image = event.target; if (!image.matches || !image.matches('img.review-floating-media')) return; event.preventDefault(); var startX = event.clientX, startY = event.clientY, left = Number(image.getAttribute('data-review-float-x') || 0), top = Number(image.getAttribute('data-review-float-y') || 0); drag = { image: image, startX: startX, startY: startY, left: left, top: top }; image.setPointerCapture(event.pointerId); }); editor.getBody().addEventListener('pointermove', function(event) { if (!drag) return; var x = Math.max(-240, Math.min(900, drag.left + event.clientX - drag.startX)), y = Math.max(-240, Math.min(1600, drag.top + event.clientY - drag.startY)); drag.image.setAttribute('data-review-float-x', String(x)); drag.image.setAttribute('data-review-float-y', String(y)); drag.image.style.left = x + 'px'; drag.image.style.top = y + 'px'; }); editor.getBody().addEventListener('pointerup', function() { if (!drag) return; drag = null; syncReviewLessonDocumentContent(); }); }); }
function getReviewLessonDocumentContent(){var live=window.tinymce&&window.tinymce.get('admin-review-lesson-document-editor');if(live)return live.getContent();if(_reviewLessonDocumentEditor)return _reviewLessonDocumentEditor.getContent();return(document.getElementById('admin-review-lesson-document-editor')||{}).value||'';}
function syncReviewLessonDocumentContent(flush){clearTimeout(_reviewLessonDocumentTimer);var sync=function(){var l=_reviewActive().lesson;if(l)_reviewDoc(l,true).content=getReviewLessonDocumentContent();};if(flush)sync();else _reviewLessonDocumentTimer=setTimeout(sync,300);}
function destroyReviewLessonDocumentEditor(){clearTimeout(_reviewLessonDocumentTimer);syncReviewLessonDocumentContent(true);if(_reviewLessonDocumentEditor){_reviewLessonDocumentEditor.remove();_reviewLessonDocumentEditor=null;}}
function addReviewLessonMedia(type){if(!_reviewLessonId)return showToast('Hãy chọn bài giảng trước.','info');var item={id:_reviewMediaId(),type:type,src:'',alt:'',x:8+(_reviewLessonMediaItems.length%4)*8,y:8+(_reviewLessonMediaItems.length%4)*8,width:36,height:28,zIndex:_reviewLessonMediaItems.length+1};_reviewLessonMediaItems.push(item);_reviewLessonSelectedMediaId=item.id;renderReviewLessonMediaCanvas();}
function renderReviewLessonMediaCanvas(){var canvas=document.getElementById('review-lesson-media-canvas'),props=document.getElementById('review-lesson-media-properties');if(!canvas||!props)return;canvas.innerHTML=_reviewLessonMediaItems.length?_reviewLessonMediaItems.map(function(item){var p=item.type==='image'&&item.src?'<img src="'+escapeHtml(item.src)+'" alt="'+escapeHtml(item.alt)+'">':'<span><i class="fa-solid fa-'+(item.type==='image'?'image':'video')+'"></i> '+(item.src?'Đã liên kết':'Nhập URL')+'</span>';return'<div class="review-lesson-media-item '+item.type+(item.id===_reviewLessonSelectedMediaId?' selected':'')+'" data-id="'+item.id+'" style="left:'+item.x+'%;top:'+item.y+'%;width:'+item.width+'%;height:'+item.height+'%;z-index:'+item.zIndex+'" onpointerdown="startReviewLessonMediaDrag(event,\''+item.id+'\',false)">'+p+'<button type="button" class="review-lesson-media-resize" aria-label="Đổi kích thước" onpointerdown="startReviewLessonMediaDrag(event,\''+item.id+'\',true)"></button></div>'}).join(''):'<p class="review-lesson-admin-empty">Thêm ảnh hoặc video để bố cục.</p>';var item=_reviewLessonMediaItems.find(function(x){return x.id===_reviewLessonSelectedMediaId});props.innerHTML=item?'<h5>Thuộc tính</h5><label>URL<input value="'+escapeHtml(item.src)+'" oninput="updateReviewLessonMedia(\''+item.id+'\',\'src\',this.value)"></label><label>Alt / mô tả<input value="'+escapeHtml(item.alt)+'" oninput="updateReviewLessonMedia(\''+item.id+'\',\'alt\',this.value)"></label><div class="review-lesson-admin-media-grid"><label>X %<input type="number" value="'+item.x+'" oninput="updateReviewLessonMedia(\''+item.id+'\',\'x\',this.value)"></label><label>Y %<input type="number" value="'+item.y+'" oninput="updateReviewLessonMedia(\''+item.id+'\',\'y\',this.value)"></label><label>Rộng %<input type="number" value="'+item.width+'" oninput="updateReviewLessonMedia(\''+item.id+'\',\'width\',this.value)"></label><label>Cao %<input type="number" value="'+item.height+'" oninput="updateReviewLessonMedia(\''+item.id+'\',\'height\',this.value)"></label></div><button type="button" class="btn btn-danger btn-sm" onclick="deleteReviewLessonMedia(\''+item.id+'\')">Xóa media</button>':'<p>Chọn ảnh hoặc video để chỉnh thuộc tính.</p>';}
function selectReviewLessonMedia(id){_reviewLessonSelectedMediaId=id;renderReviewLessonMediaCanvas();}
function updateReviewLessonMedia(id,key,value){var item=_reviewLessonMediaItems.find(function(x){return x.id===id});if(!item)return;if(['x','y','width','height','zIndex'].includes(key)){var min=key==='width'?12:key==='height'?8:key==='zIndex'?1:0;item[key]=_reviewClamp(value,item[key],min,key==='zIndex'?99:100);if(key==='x')item.x=Math.min(item.x,100-item.width);if(key==='y')item.y=Math.min(item.y,100-item.height)}else item[key]=String(value||'');renderReviewLessonMediaCanvas();}
function startReviewLessonMediaDrag(event,id,resize){var canvas=document.getElementById('review-lesson-media-canvas'),item=_reviewLessonMediaItems.find(function(x){return x.id===id});if(!canvas||!item)return;event.preventDefault();event.stopPropagation();_reviewLessonSelectedMediaId=id;_reviewLessonMediaDrag={id:id,resize:resize,startX:event.clientX,startY:event.clientY,x:item.x,y:item.y,width:item.width,height:item.height,rect:canvas.getBoundingClientRect()};canvas.setPointerCapture&&canvas.setPointerCapture(event.pointerId);canvas.onpointermove=moveReviewLessonMediaDrag;canvas.onpointerup=endReviewLessonMediaDrag;canvas.onpointercancel=endReviewLessonMediaDrag;renderReviewLessonMediaCanvas();}
function moveReviewLessonMediaDrag(event){var d=_reviewLessonMediaDrag,item=d&&_reviewLessonMediaItems.find(function(x){return x.id===d.id});if(!item)return;var dx=(event.clientX-d.startX)/d.rect.width*100,dy=(event.clientY-d.startY)/d.rect.height*100;if(d.resize){item.width=_reviewClamp(d.width+dx,12,12,100-item.x);item.height=_reviewClamp(d.height+dy,8,8,100-item.y)}else{item.x=_reviewClamp(d.x+dx,0,0,100-item.width);item.y=_reviewClamp(d.y+dy,0,0,100-item.height)}renderReviewLessonMediaCanvas();}
function endReviewLessonMediaDrag(){var canvas=document.getElementById('review-lesson-media-canvas');if(canvas)canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=null;_reviewLessonMediaDrag=null;}
function deleteReviewLessonMedia(id){_reviewLessonMediaItems=_reviewLessonMediaItems.filter(function(x){return x.id!==id});_reviewLessonSelectedMediaId=_reviewLessonMediaItems[0]&&_reviewLessonMediaItems[0].id;renderReviewLessonMediaCanvas();}
async function saveReviewLesson(status){var a=_reviewActive();if(!a.lesson)return false;syncReviewLessonDocumentContent(true);var publishing=status==='published';a.lesson.title=(document.getElementById('review-lesson-title').value||a.lesson.title||'Bài giảng ôn tập').trim();a.lesson.status=publishing?'published':'draft';var doc=_reviewDoc(a.lesson,true),html=getReviewLessonDocumentContent();doc.content=html;a.lesson.blocks=[doc];a.lesson.content=html;a.lesson.type='editor';if(publishing)a.details.status='published';var idToken=publishing?await AuthModule.getIdToken():'';var result=await DB.saveSubjectDetails(_reviewLessonSubjectId,a.details,!publishing,idToken);renderReviewLessonTree();if(publishing&&!result.ok){showToast('Chưa đăng công khai: '+(result.sync&&result.sync.reason||'không thể đồng bộ máy chủ')+'.','error');}else if(publishing){showToast('Đã đăng công khai bài giảng.','success');}else{showToast('Đã lưu nháp trên thiết bị này. Dùng “Đăng công khai” để sinh viên xem.','success');}return result;}
function previewReviewLesson(){if(!_reviewLessonId)return showToast('Hãy chọn bài giảng để xem trước.','info');saveReviewLesson('draft').then(function(){if(window.renderStudyReader)window.renderStudyReader({subjectId:_reviewLessonSubjectId,chapterId:_reviewLessonChapterId,lessonId:_reviewLessonId,returnPage:'admin'})});}
Object.assign(window, {
  adminToggleLessonAi,
  adminGenerateLessonAiSummaries,
  adminLessonAiSettings,
  initCurriculumSummaryPage,
  runCurriculumSummary,
  initReviewLessonAdmin,
  renderReviewLessonTree,
  selectReviewLesson,
  createReviewLesson,
  updateReviewLessonMetadata,
  initReviewLessonDocumentEditor,
  syncReviewLessonDocumentContent,
  destroyReviewLessonDocumentEditor,
  addReviewLessonMedia,
  renderReviewLessonMediaCanvas,
  selectReviewLessonMedia,
  updateReviewLessonMedia,
  startReviewLessonMediaDrag,
  moveReviewLessonMediaDrag,
  endReviewLessonMediaDrag,
  deleteReviewLessonMedia,
  saveReviewLesson,
  previewReviewLesson
});
