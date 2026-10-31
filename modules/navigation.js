/**
 * navigation.js — Application Navigation & UI Layout Controller
 * Manages Sidebar, Top Header Search, Page Navigation, Subject Detail, and Auth Popover
 */

import { SUBJECTS_REGISTRY, getAllSubjects, getSubjectById, KNOWLEDGE_BLOCKS } from './subjects.js';
import { DB } from './db.js';
import { AuthModule, getActiveAdminEmails, getUserRole } from './auth.js';
import { ArticlesModule } from './articles.js?v=20261031-news1';

const lazyStyles = new Map();

function ensureStylesheet(href) {
  if (document.querySelector(`link[data-lazy-style="${href}"]`)) return Promise.resolve();
  if (lazyStyles.has(href)) return lazyStyles.get(href);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.lazyStyle = href;
    link.onload = resolve;
    link.onerror = () => reject(new Error(`Không thể tải stylesheet: ${href}`));
    document.head.appendChild(link);
  });
  lazyStyles.set(href, promise);
  return promise;
}

const SUBJECT_VISUAL_THEMES = {
  defense: { art: ['fa-shield-halved', 'fa-flag', 'fa-star'], description: 'Khám phá kiến thức quốc phòng, an ninh và kỹ năng cần thiết; lựa chọn các danh mục bên dưới để bắt đầu ôn luyện hiệu quả.' },
  physics: { art: ['fa-atom', 'fa-wave-square', 'fa-bolt'], description: 'Khám phá các quy luật vật lý, năng lượng và hiện tượng nền tảng ứng dụng trong Công nghệ thực phẩm.' },
  chemistry: { art: ['fa-flask', 'fa-atom', 'fa-vial'], description: 'Hệ thống hóa kiến thức về thành phần, phản ứng và các quá trình hóa học trong thực phẩm.' },
  biology: { art: ['fa-dna', 'fa-microscope', 'fa-seedling'], description: 'Ôn tập nền tảng sinh học, vi sinh và các cơ chế sống liên quan đến thực phẩm.' },
  engineering: { art: ['fa-gears', 'fa-ruler-combined', 'fa-industry'], description: 'Nắm vững nguyên lý kỹ thuật, thiết bị và quy trình vận hành trong sản xuất thực phẩm.' },
  food: { art: ['fa-wheat-awn', 'fa-utensils', 'fa-leaf'], description: 'Khám phá công nghệ chế biến, bảo quản và phát triển các sản phẩm thực phẩm.' },
  quality: { art: ['fa-clipboard-check', 'fa-chart-line', 'fa-award'], description: 'Củng cố kiến thức về quản lý chất lượng, an toàn thực phẩm và các tiêu chuẩn trong ngành.' },
  business: { art: ['fa-chart-pie', 'fa-bullhorn', 'fa-briefcase'], description: 'Ôn tập kiến thức về kinh tế, tổ chức, truyền thông và các kỹ năng phát triển nghề nghiệp.' },
  society: { art: ['fa-landmark', 'fa-book-open', 'fa-scale-balanced'], description: 'Hệ thống hóa kiến thức nền tảng về xã hội, pháp luật và tư duy học thuật.' }
};

// Ảnh riêng cho từng môn (PNG/WebP đã tách nền). Để trống để dùng emblem
// vector theo chủ đề, hoặc thêm đường dẫn ảnh khi có tài nguyên đạt yêu cầu.
const SUBJECT_HERO_ART = {};

function escapeSubjectDetailText(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getSubjectVisualTheme(subject) {
  const name = (subject.name || '').toLocaleLowerCase('vi-VN');
  if (subject.blockId === 'GDQP') return 'defense';
  if (/vật lý|xác suất|thống kê|điện/.test(name)) return 'physics';
  if (/hóa|phụ gia|độc tố/.test(name)) return 'chemistry';
  if (/sinh|vi sinh|enzyme|dinh dưỡng|sức khỏe/.test(name)) return 'biology';
  if (/quản lý chất lượng|an toàn|ô nhiễm|haccp|luật/.test(name)) return 'quality';
  if (/thiết bị|kỹ thuật|tự động|lạnh|vẽ kỹ thuật|nước trong|quá trình/.test(name)) return 'engineering';
  if (/công nghệ|chế biến|bảo quản|thực phẩm|bao bì|cảm quan|nông nghiệp|sản phẩm/.test(name)) return 'food';
  if (/kinh tế|marketing|tổ chức|kỹ năng|tin học|seminar|anh văn|nghiên cứu/.test(name)) return 'business';
  return 'society';
}

// Mỗi chức năng có một path riêng; môn học nằm trong path thay vì query.
const PAGE_PATHS = {
  home: '/',
  'study-space': '/khong-gian-hoc-tap',
  'subject-detail': '/mon',
  'curriculum-summary': '/tom-tat-giao-trinh',
  'summary-study': '/tom-tat',
  'shared-quiz': '/de-thi',
  about: '/doc-bao',
  notifications: '/thong-bao',
  report: '/ho-tro',
  upgrade: '/nang-cap-tai-khoan',
  admin: '/quan-tri'
};

const ONTAP_TAB_ROUTES = {
  'exam-tab': { path: '/on-tap', subject: true },
  'bank-tab': { path: '/ngan-hang-cau-hoi', subject: true },
  'source-tab': { path: '/tao-cau-hoi', subject: true },
  'history-tab': { path: '/lich-su-on-tap', subject: false },
  'share-tab': { path: '/de-da-chia-se', subject: false }
};

function encodeRouteSegment(value) {
  return encodeURIComponent(String(value));
}

function isKnownSubject(subjectId) {
  const id = String(subjectId || '').trim();
  return Boolean(id) && getAllSubjects().some(subject => subject.id === id);
}

function buildRoutePath(pageId, extra = {}) {
  if (pageId === 'ontap') {
    const route = ONTAP_TAB_ROUTES[extra.tab] || ONTAP_TAB_ROUTES['exam-tab'];
    const subject = route.subject ? String(extra.subject || DB.getActiveSubject() || '').trim() : '';
    return `${route.path}${subject ? `/${encodeRouteSegment(subject)}` : ''}`;
  }
  if (pageId === 'subject-detail') {
    const subject = String(extra.subject || '').trim();
    return subject ? `/mon/${encodeRouteSegment(subject)}` : PAGE_PATHS['study-space'];
  }
  if (pageId === 'about') {
    const article = String(extra.article || '').trim();
    return article ? `/doc-bao/${encodeRouteSegment(article)}` : PAGE_PATHS.about;
  }
  if (pageId === 'summary-study') {
    const shared = String(extra['share-summary'] || '').trim();
    return shared ? `/tom-tat/${encodeRouteSegment(shared)}` : PAGE_PATHS['summary-study'];
  }
  if (pageId === 'shared-quiz') {
    const shared = String(extra['share-quiz'] || '').trim();
    return shared ? `/de-thi/${encodeRouteSegment(shared)}` : PAGE_PATHS.home;
  }
  return PAGE_PATHS[pageId] || PAGE_PATHS.home;
}

function parseRouteLocation() {
  const params = new URLSearchParams(window.location.search);
  const legacyPage = params.get('page');

  // Link cũ dạng ?page=... vẫn mở đúng trang; sau đó được thay bằng path mới.
  if (legacyPage) {
    return {
      page: legacyPage === 'aigen' || legacyPage === 'history' ? 'ontap' : legacyPage,
      subject: params.get('subject'),
      article: params.get('article'),
      tab: legacyPage === 'aigen' ? 'source-tab' : legacyPage === 'history' ? 'history-tab' : (params.get('tab') || null),
      sharedSummary: params.get('share-summary')
    };
  }

  const segments = window.location.pathname.split('/').filter(Boolean).map(segment => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  });
  const [root, second] = segments;

  if (!root || root === 'index.html') return { page: 'home' };
  switch (root) {
    case 'mon': return { page: 'subject-detail', subject: second || null };
    case 'on-tap': return { page: 'ontap', tab: 'exam-tab', subject: second || null };
    case 'ngan-hang-cau-hoi': return { page: 'ontap', tab: 'bank-tab', subject: second || null };
    case 'tao-cau-hoi': return { page: 'ontap', tab: 'source-tab', subject: second || null };
    case 'lich-su-on-tap': return { page: 'ontap', tab: 'history-tab' };
    case 'de-da-chia-se': return { page: 'ontap', tab: 'share-tab' };
    case 'de-thi': return { page: 'shared-quiz', sharedQuiz: second || null };
    case 'tom-tat-giao-trinh': return { page: 'curriculum-summary' };
    case 'tom-tat': return { page: 'summary-study', sharedSummary: second || null };
    case 'doc-bao': return { page: 'about', article: second || null };
    case 'khong-gian-hoc-tap': return { page: 'study-space' };
    case 'thong-bao': return { page: 'notifications' };
    case 'ho-tro': return { page: 'report' };
    case 'nang-cap-tai-khoan': return { page: 'upgrade' };
    case 'quan-tri': return { page: 'admin' };
    default: return { page: 'home' };
  }
}

export const NavController = {
  activePage: 'home',
  currentUser: null,
  restoringRoute: false,

  buildUrl(pageId, extra = {}) {
    return new URL(buildRoutePath(pageId, extra), window.location.origin);
  },

  syncUrl(pageId = this.activePage, extra = {}, { replace = false } = {}) {
    if (this.restoringRoute) return;
    const routeKeys = new Set(['subject', 'tab', 'article', 'share-summary', 'share-quiz']);
    const params = new URLSearchParams();
    Object.entries(extra).forEach(([key, value]) => {
      if (routeKeys.has(key)) return;
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    const query = params.toString();
    const nextUrl = `${buildRoutePath(pageId, extra)}${query ? `?${query}` : ''}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (!replace && nextUrl === currentUrl) return;
    window.history[replace ? 'replaceState' : 'pushState']({ page: pageId, ...extra }, '', nextUrl);
  },

  syncTabUrl(tabId, { replace = false } = {}) {
    if (this.activePage !== 'ontap') return;
    this.syncUrl('ontap', { tab: tabId || 'exam-tab' }, { replace });
  },

  applyActiveSubject(subjectId) {
    const id = String(subjectId || '').trim();
    if (!isKnownSubject(id)) return false;
    DB.setActiveSubject(id);
    const select = document.getElementById('global-subject-select');
    if (select) select.value = id;
    window.updateSubjectBanner?.(id);
    window.updateBankCount?.();
    return true;
  },

  getSharedRoute() {
    return parseRouteLocation();
  },

  async shareCurrentSubject(subjectId) {
    await window.shareUrl(this.buildUrl('subject-detail', { subject: subjectId }).href, 'Chia sẻ môn học');
  },

  async restoreSharedRoute() {
    const route = this.getSharedRoute();
    const subject = isKnownSubject(route.subject) ? route.subject : null;
    if (route.page === 'subject-detail' && !subject) {
      route.page = 'study-space';
      route.subject = null;
    }
    const user = this.currentUser || AuthModule?.user;
    const hasUser = Boolean(user && user.email);
    const isAdmin = hasUser && getActiveAdminEmails().includes(user.email.toLowerCase());
    // Deep link vào trang bị khoá phải hạ cánh đúng trang thực sự hiển thị.
    if (route.page === 'curriculum-summary' && !hasUser) {
      window.requireLoggedInForFeature?.('Tóm tắt giáo trình');
      route.page = 'home';
      route.tab = null;
    } else if (route.page === 'admin' && !isAdmin) {
      window.showToast?.('⛔ Trang Quản Trị Admin chỉ dành riêng cho Quản trị viên hệ thống!', 'error');
      route.page = 'ontap';
      route.tab = 'exam-tab';
    }
    this.restoringRoute = true;
    try {
      if (route.sharedQuiz) {
        this.navigateToPage('shared-quiz', null, { 'share-quiz': route.sharedQuiz });
      } else if (route.sharedSummary) {
        this.navigateToPage('summary-study', null, { 'share-summary': route.sharedSummary });
      } else if (route.article) {
        this.navigateToPage('about');
        window.ArticlesModule?.openDetail(route.article);
      } else if (subject && route.page === 'subject-detail') {
        this.applyActiveSubject(subject);
        this.openSubjectDetail(subject, 'study-space');
      } else if (subject) {
        this.applyActiveSubject(subject);
        this.navigateToPage(route.page, route.tab || null, { subject });
      } else {
        this.navigateToPage(route.page, route.tab || null);
      }
    } finally {
      this.restoringRoute = false;
      if (route.sharedQuiz) {
        this.syncUrl('shared-quiz', { 'share-quiz': route.sharedQuiz }, { replace: true });
        void window.QuizSharePage?.open(route.sharedQuiz);
      } else if (route.sharedSummary) {
        this.syncUrl('summary-study', { 'share-summary': route.sharedSummary }, { replace: true });
        void window.openSharedSummary?.(route.sharedSummary);
      } else if (route.article) {
        this.syncUrl('about', { article: route.article }, { replace: true });
      } else if (subject && route.page === 'subject-detail') {
        this.syncUrl('subject-detail', { subject }, { replace: true });
      } else if (subject) {
        this.syncUrl(route.page, { tab: route.tab || 'exam-tab', subject }, { replace: true });
      } else {
        this.syncUrl(route.page, route.tab ? { tab: route.tab } : {}, { replace: true });
      }
    }
  },

  async init() {
    // Khôi phục phiên cục bộ trước để route có thể hiển thị ngay. Các lượt
    // đồng bộ Firebase/role không được phép chặn màn hình đầu tiên.
    AuthModule.restoreSession();
    this.restoreUserSession();
    this.renderUserAuthZone();
    this.setupSearchShortcut();
    window.setTimeout(() => {
      void AuthModule.init().then(() => {
        this.restoreUserSession();
        this.renderUserAuthZone();
      }).catch(error => {
        console.warn('[Auth] Khởi tạo nền thất bại:', error);
      });
    }, 900);
    window.addEventListener('popstate', () => {
      void this.restoreSharedRoute();
    });
  },

  toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
  },

  // ─── PAGE NAVIGATION ────────────────────────────────────────────────────────
  navigateToPage(pageId, subTabId = null, routeParams = {}) {
    // Tự động đồng bộ các trang con về Ôn tập & Kiểm tra (ontap)
    if (pageId === 'aigen') {
      pageId = 'ontap';
      subTabId = 'source-tab';
    }
    if (pageId === 'history') {
      pageId = 'ontap';
      subTabId = 'history-tab';
    }
    if (pageId === 'ontap' && !subTabId) {
      subTabId = 'exam-tab';
    }
    if (pageId === 'ontap') {
      void window.ensureStudySeed?.().catch(error => {
        console.error('[Study] Không thể tải dữ liệu học tập:', error);
        window.showToast?.('Không thể tải dữ liệu học tập. Vui lòng thử lại.', 'error');
      });
    }
    if (pageId !== 'summary-study') window.leaveSharedSummary?.();
    if (pageId !== 'shared-quiz' && window.QuizSharePage?.isActive?.()) {
      const leaveExam = window.confirm('Bạn đang làm đề chia sẻ dở dang. Rời trang bây giờ sẽ mất các câu đã chọn. Rời trang?');
      if (!leaveExam) return;
    }
    if (pageId !== 'shared-quiz') window.QuizSharePage?.leave();
    document.body.classList.toggle('summary-page-active', pageId === 'curriculum-summary');
    document.body.classList.toggle('summary-study-body-active', pageId === 'summary-study');
    document.body.classList.toggle('shared-quiz-body-active', pageId === 'shared-quiz');
    document.getElementById('study-utility-toolbar')?.classList.toggle('hidden', pageId === 'shared-quiz');
    const hasUser = this.currentUser || AuthModule?.user;
    if ((pageId === 'aigen' || pageId === 'curriculum-summary') && (!hasUser || !hasUser.email)) {
      const featureName = pageId === 'aigen' ? 'Tạo câu hỏi bằng AI' : 'Tóm tắt giáo trình';
      if (window.requireLoggedInForFeature) {
        window.requireLoggedInForFeature(featureName);
      } else if (window.showToast) {
        window.showToast(`🔒 Vui lòng đăng nhập bằng Google để sử dụng ${featureName}.`, 'error');
        const loginBtn = document.querySelector('.btn-google-signin');
        if (loginBtn) {
          loginBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          loginBtn.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.25)';
          setTimeout(() => {
            if (loginBtn) loginBtn.style.boxShadow = '';
          }, 1600);
        }
      }
      return;
    }

    if (pageId === 'about') {
      setTimeout(() => {
        if (window.ArticlesModule) window.ArticlesModule.renderArticlesView();
        else ArticlesModule.renderArticlesView();
      }, 20);
    }
    if (pageId === 'study-space') {
      setTimeout(() => window.renderStudySpace?.(), 20);
    }
    if (pageId === 'curriculum-summary') {
      setTimeout(() => window.initCurriculumSummaryPage?.(), 20);
    }
    if (pageId === 'home') {
      setTimeout(() => window.updateHomeStats?.(), 20);
    }
    if (pageId === 'notifications') {
      void window.refreshAnnouncementsFromServer?.();
      setTimeout(() => window.renderNotificationCenter?.(), 20);
    }
    if (pageId === 'report') {
      window.refreshFeedbacksFromServer?.();
      setTimeout(() => window.initSupportTicketPage?.(), 20);
    }
    if (pageId === 'ontap' && subTabId === 'source-tab') {
      setTimeout(() => window.renderAIQuestionHistory?.(), 20);
    }

    // Bảo mật trang Admin: Chỉ 2 Gmail Admin mới truy cập được
    if (pageId === 'admin') {
      const user = this.currentUser;
      const isSuperAdmin = user && user.email && getActiveAdminEmails().includes(user.email.toLowerCase());
      if (!isSuperAdmin) {
        if (window.showToast) window.showToast('⛔ Trang Quản Trị Admin chỉ dành riêng cho Quản trị viên hệ thống!', 'error');
        pageId = 'ontap';
        subTabId = 'exam-tab';
      } else {
        void ensureStylesheet('admin-dashboard.css?v=20260912-admin-redesign').catch(error => {
          console.error('[Admin] Không thể tải stylesheet dashboard:', error);
        });
        const adminDashboardReady = Promise.resolve(window.ensureAdminDashboard?.()).catch(error => {
          console.error('[Admin] Không thể tải dashboard:', error);
          window.showToast?.('Không thể tải mô-đun quản trị. Vui lòng thử lại.', 'error');
          return null;
        });
        window.refreshUserRolesFromServer?.();
        void window.openAdminFeedbackInbox?.();
        void adminDashboardReady.then(() => {
          setTimeout(() => {
            if (window.renderAdminDashboard) window.renderAdminDashboard();
          }, 50);
        });
      }
    }

    this.activePage = pageId;
    document.body.classList.toggle('study-review-active', pageId === 'ontap');
    this.syncUrl(pageId, { ...(subTabId ? { tab: subTabId } : {}), ...routeParams });

    // 1. Highlight active sidebar item
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.remove('active');
    });

    let snavId = `snav-${pageId}`;
    if (subTabId === 'source-tab') snavId = 'snav-aigen';
    if (subTabId === 'history-tab') snavId = 'snav-history';
    if (pageId === 'curriculum-summary') snavId = 'snav-summary';

    const activeNav = document.getElementById(snavId) || document.getElementById(`snav-${pageId}`);
    if (activeNav) activeNav.classList.add('active');

    // 2. Any normal page navigation must tear down the immersive reader first.
    if (pageId !== 'study-reader') {
      document.getElementById('page-study-reader')?.classList.add('hidden');
      document.querySelector('.app-layout')?.classList.remove('study-reader-active');
    }
    document.querySelector('.app-layout')?.classList.toggle('summary-study-active', pageId === 'summary-study');
    const ceraFab = document.getElementById('cera-fab');
    const ceraPanel = document.getElementById('cera-panel');
    const hideCera = pageId === 'summary-study' || pageId === 'shared-quiz';
    [ceraFab, ceraPanel].forEach(element => element?.classList.toggle('hidden', hideCera));
    // Hide all normal page containers and show selected.
    document.querySelectorAll('.page-container').forEach(page => {
      page.classList.add('hidden');
    });

    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
      targetPage.classList.remove('hidden');
    }
    if (pageId === 'summary-study') window.renderSummaryStudyPage?.(window._summaryStudyResult, window._summaryStudyTitle);

    // 3. Chuyển tab con nếu có
    if (subTabId && window.switchTab) {
      window.switchTab(subTabId);
    }
    if (pageId === 'ontap') {
      const activeTab = document.getElementById(subTabId || 'exam-tab');
      if (activeTab) {
        activeTab.classList.add('active');
        activeTab.classList.remove('hidden');
      }
      if (subTabId === 'exam-tab') {
        document.getElementById('exam-start-card')?.classList.remove('hidden');
        document.getElementById('exam-active-card')?.classList.add('hidden');
        document.getElementById('exam-result-card')?.classList.add('hidden');
      }
    }

    // Close mobile sidebar if open
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ─── LIVE SUBJECT SEARCH ──────────────────────────────────────────────────
  searchSubjects(query) {
    const q = (query || '').trim().toLowerCase();
    const dropdown = document.getElementById('search-results-dropdown');
    const list = document.getElementById('search-results-list');
    const countBadge = document.getElementById('search-count-badge');

    if (!dropdown || !list) return;

    if (!q) {
      // Show all subjects grouped or top list
      this.renderSearchResults(getAllSubjects());
      dropdown.classList.remove('hidden');
      return;
    }

    const filtered = getAllSubjects().filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      (KNOWLEDGE_BLOCKS[s.blockId]?.name || '').toLowerCase().includes(q)
    );

    if (countBadge) countBadge.textContent = `${filtered.length} môn`;
    this.renderSearchResults(filtered);
    dropdown.classList.remove('hidden');
  },

  renderSearchResults(subjects) {
    const list = document.getElementById('search-results-list');
    if (!list) return;

    if (subjects.length === 0) {
      list.innerHTML = `
        <div class="search-empty-state">
          <div style="font-size:24px;margin-bottom:4px;">🔍</div>
          <div>Không tìm thấy môn học nào phù hợp</div>
          <div style="font-size:11px;color:var(--text-muted);">Thử tìm theo mã môn (vd: FT4468, GE4091)</div>
        </div>
      `;
      return;
    }

    list.innerHTML = subjects.map(s => {
      const block = KNOWLEDGE_BLOCKS[s.blockId] || { icon: '📚', name: '' };
      return `
        <div class="search-result-item" onclick="NavController.openSubjectDetail('${s.id}')">
          <div class="search-item-left">
            <span class="search-item-code">${s.code}</span>
            <div class="search-item-info">
              <div class="search-item-name">${s.name}</div>
              <div class="search-item-meta">${block.icon} ${block.name} · Học kỳ ${s.semester}</div>
            </div>
          </div>
          <div class="search-item-right">
            <span class="badge badge-subtle">${s.credits} Tín chỉ</span>
            <i class="fa-solid fa-chevron-right text-xs" style="color:var(--text-muted);"></i>
          </div>
        </div>
      `;
    }).join('');
  },

  closeSearchDropdown() {
    const dropdown = document.getElementById('search-results-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
  },

  setupSearchShortcut() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('subject-search-input');
        if (searchInput) {
          searchInput.focus();
          this.searchSubjects(searchInput.value);
        }
      }
      if (e.key === 'Escape') {
        this.closeSearchDropdown();
        this.closeUserPopover();
      }
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
      const searchContainer = document.querySelector('.search-bar-container');
      if (searchContainer && !searchContainer.contains(e.target)) {
        this.closeSearchDropdown();
      }
      const userZone = document.getElementById('user-auth-zone');
      if (userZone && !userZone.contains(e.target)) {
        this.closeUserPopover();
      }
    });
  },

  // ─── STUDY READER ─────────────────────────────────────────────────────────
  openStudyReader(context = {}) {
    this.studyReaderReturn = { page: context.returnPage || this.activePage || 'subject-detail', scrollY: window.scrollY || 0, context };
    this.activePage = 'study-reader';
    document.querySelectorAll('.page-container, .study-reader-page').forEach(page => page.classList.add('hidden'));
    document.getElementById('page-study-reader')?.classList.remove('hidden');
    document.querySelector('.app-layout')?.classList.add('study-reader-active');
    window.renderStudyReader?.(context);
    window.scrollTo({ top: 0, behavior: 'auto' });
  },

  closeStudyReader() {
    const state = this.studyReaderReturn || { page: 'subject-detail', scrollY: 0 };
    document.getElementById('page-study-reader')?.classList.add('hidden');
    document.querySelector('.app-layout')?.classList.remove('study-reader-active');
    this.navigateToPage(state.page === 'study-reader' ? 'subject-detail' : state.page);
    requestAnimationFrame(() => window.scrollTo({ top: state.scrollY || 0, behavior: 'auto' }));
    this.studyReaderReturn = null;
  },

  // ─── SUBJECT DETAIL PAGE ──────────────────────────────────────────────────
  openSubjectDetail(subjectId, returnPage = 'study-space') {
    // subject-page.css được nạp sẵn trong index.html để trang luôn đúng layout
    // ngay khung hình đầu tiên khi mở từ trang khác.
    const s = getSubjectById(subjectId);
    if (!s) return;

    this.closeSearchDropdown();

    const block = KNOWLEDGE_BLOCKS[s.blockId] || { icon: '📚', name: 'Đại cương' };
    const visualThemeKey = getSubjectVisualTheme(s);
    const visualTheme = SUBJECT_VISUAL_THEMES[visualThemeKey];
    const detailContainer = document.getElementById('page-subject-detail');

    if (!detailContainer) return;

    // User chỉ đọc nội dung đã xuất bản. Bản nháp chỉ được truyền tường minh
    // từ nút "Xem trước như sinh viên" trong khu vực Admin.
    const preview = window._adminSubjectPreview?.subjectId === s.id ? window._adminSubjectPreview.details : null;
    const details = preview || DB.getSubjectDetails(s.id) || {};
    const canDisplayPublishedCanvas = Boolean(preview) || details.status === 'published';

    const code = details.code || s.code;
    const name = details.name || s.name;
    const shortDesc = details.shortDesc || visualTheme.description;
    const credits = details.credits || s.credits;
    const semester = details.semester || s.semester;
    const banner = details.banner || '';
    const intro = details.intro || '';
    const introCanvas = Array.isArray(details.introCanvas) ? details.introCanvas : [];
    const introCanvasHeight = Math.min(2400, Math.max(360, Number(details.introCanvasHeight) || 620));
    const introCanvasTypes = new Set(introCanvas.map(item => item?.type).filter(type => ['text', 'image', 'video'].includes(type)));
    const introCanvasVariant = introCanvasTypes.size === 1 && introCanvasTypes.has('text')
      ? 'student-intro-canvas--text-only'
      : introCanvasTypes.size === 1
        ? 'student-intro-canvas--media-only'
        : 'student-intro-canvas--mixed';
    const safeIntroUrl = value => { try { const url = new URL(String(value || ''), window.location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
    const renderIntroCanvas = () => introCanvas.map(item => { const x=Math.max(0,Math.min(92,Number(item.x)||0)), y=Math.max(0,Math.min(92,Number(item.y)||0)), w=Math.max(12,Math.min(100,Number(item.width)||35)), h=Math.max(8,Math.min(100,Number(item.height)||20)), style=`left:${x}%;top:${y}%;width:${w}%;height:${h}%;z-index:${Number(item.zIndex)||1}`; if(item.type==='text') return `<div class="student-intro-canvas-item text" style="${style}">${safe(item.content).replace(/\n/g,'<br>')}</div>`; const src=safeIntroUrl(item.src); if(!src) return ''; if(item.type==='image') return `<figure class="student-intro-canvas-item image" style="${style}"><img src="${safe(src)}" alt="${safe(item.alt || '')}" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><figcaption class="student-intro-canvas-image-error" hidden>Không tải được ảnh này.</figcaption></figure>`; const youtube=/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(src); return youtube ? `<div class="student-intro-canvas-item video" style="${style}"><iframe src="${safe(src)}" title="Video môn học" loading="lazy" allowfullscreen></iframe></div>` : ''; }).join('');
    const chapters = details.chapters || [];
    const safe = escapeSubjectDetailText;

    // Store active details on window for TOC interaction
    window._activeSubjectDetails = { ...details, subjectId: s.id };

    const blockLabel = s.blockId === 'GDQP' ? 'Môn học chung' : block.name;
    const heroArt = SUBJECT_HERO_ART[code] || banner;
    const lessonCount = chapters.reduce((sum, chap) => sum + ((chap && chap.lessons || []).length), 0);
    const safeName = safe(name);
    const titleBreak = safeName.lastIndexOf(',');
    const titleHtml = titleBreak > 0
      ? `${safeName.slice(0, titleBreak + 1)}<span class="sd5-title-accent">${safeName.slice(titleBreak + 1)}</span>`
      : safeName;

    // Render presentation shell; lesson, resource, and exam handlers remain unchanged.
    detailContainer.innerHTML = `
      <div class="sd5-shell">
        <div class="sd5-topbar">
          <nav class="sd5-crumbs" aria-label="Điều hướng">
            <button type="button" class="sd5-crumb-icon" onclick="NavController.navigateToPage('home')" aria-label="Trang chủ"><i class="fa-solid fa-house"></i></button>
            <i class="fa-solid fa-chevron-right sd5-crumb-sep" aria-hidden="true"></i>
            <button type="button" class="sd5-crumb-link" onclick="NavController.navigateToPage('${returnPage === 'ontap' ? 'ontap' : 'study-space'}')">${returnPage === 'ontap' ? 'Ôn tập' : 'Không gian học tập'}</button>
            <i class="fa-solid fa-chevron-right sd5-crumb-sep" aria-hidden="true"></i>
            <span class="sd5-crumb-current" aria-current="page">${safe(code)}</span>
          </nav>
          <button type="button" class="sd5-share" onclick="NavController.shareCurrentSubject('${s.id}')"><i class="fa-solid fa-share-nodes"></i><span>Chia sẻ</span></button>
        </div>

        <div class="sd5-grid">
          <main class="sd5-main">
            <article class="sd5-hero subject-theme-${visualThemeKey}">
              <div class="sd5-hero-main">
                <div class="sd5-hero-wash" aria-hidden="true"></div>
                <div class="sd5-hero-copy">
                  <span class="sd5-badge"><span class="sd5-badge-dot"></span><strong>${safe(code)}</strong><span class="sd5-badge-sep"></span><span>${safe(blockLabel).toUpperCase()}</span></span>
                  <h1 class="sd5-title">${titleHtml}</h1>
                  <p class="sd5-desc">${safe(shortDesc)}</p>
                  <div class="sd5-meta">
                    <span><i class="fa-solid fa-star"></i>${credits} tín chỉ</span>
                    <span><i class="fa-solid fa-book-open"></i>${lessonCount} bài học</span>
                    <span><i class="fa-solid fa-calendar-days"></i>Học kỳ ${safe(semester)}</span>
                  </div>
                </div>
                <div class="sd5-hero-art${heroArt ? '' : ' is-fallback'}" aria-hidden="true">
                  <span class="sd5-orbit sd5-orbit-one"></span>
                  <span class="sd5-orbit sd5-orbit-two"></span>
                  <span class="sd5-art-platform"></span>
                  <span class="sd5-pin sd5-pin-one"><i class="fa-solid ${visualTheme.art[1]}"></i></span>
                  <span class="sd5-pin sd5-pin-two"><i class="fa-solid ${visualTheme.art[2]}"></i></span>
                  <span class="sd5-art-fallback"><i class="fa-solid ${visualTheme.art[0]}"></i></span>
                  ${heroArt ? `<img class="sd5-art-img" src="${safe(heroArt)}" alt="" onerror="this.parentElement.classList.add('is-fallback');this.remove();">` : ''}
                </div>
              </div>
            </article>
            <nav class="sd5-quick" aria-label="Danh mục nội dung môn học">
              <button type="button" class="sd5-quick-row is-active" data-sd5-quick="lecture" aria-current="true" onclick="window.openSubjectQuickTab('lecture')">
                <span class="sd5-quick-icon"><i class="fa-solid fa-book-open"></i></span>
                <span class="sd5-quick-text">Tài liệu học tập</span>
                <i class="fa-solid fa-chevron-right sd5-quick-arrow" aria-hidden="true"></i>
              </button>
              <button type="button" class="sd5-quick-row" data-sd5-quick="bank" onclick="window.openSubjectQuickTab('bank')">
                <span class="sd5-quick-icon"><i class="fa-solid fa-circle-question"></i></span>
                <span class="sd5-quick-text">Ngân hàng câu hỏi</span>
                <i class="fa-solid fa-chevron-right sd5-quick-arrow" aria-hidden="true"></i>
              </button>
              <button type="button" class="sd5-quick-row" data-sd5-quick="exam" onclick="window.openSubjectQuickTab('exam')">
                <span class="sd5-quick-icon"><i class="fa-solid fa-file-lines"></i></span>
                <span class="sd5-quick-text">Đề thi</span>
                <i class="fa-solid fa-chevron-right sd5-quick-arrow" aria-hidden="true"></i>
              </button>
              <button type="button" class="sd5-quick-row" data-sd5-quick="review" onclick="window.openSubjectQuickTab('review')">
                <span class="sd5-quick-icon"><i class="fa-solid fa-bullseye"></i></span>
                <span class="sd5-quick-text">Ôn tập</span>
                <i class="fa-solid fa-chevron-right sd5-quick-arrow" aria-hidden="true"></i>
              </button>
            </nav>
            <div class="sd5-content">
              <div class="sd5-tabs" role="tablist" aria-label="Nội dung môn học">
              <button type="button" class="sd5-tab is-active" role="tab" aria-selected="true" data-sd5-tab="lecture" onclick="window.setSubjectDetailTab('lecture')"><i class="fa-solid fa-book-open"></i><span>Tài liệu học tập</span></button>
              <button type="button" class="sd5-tab" role="tab" aria-selected="false" data-sd5-tab="bank" onclick="window.setSubjectDetailTab('bank')"><i class="fa-solid fa-circle-question"></i><span>Ngân hàng câu hỏi</span></button>
              <button type="button" class="sd5-tab" role="tab" aria-selected="false" data-sd5-tab="exam" onclick="window.setSubjectDetailTab('exam')"><i class="fa-solid fa-file-lines"></i><span>Đề thi</span></button>
              <button type="button" class="sd5-tab" role="tab" aria-selected="false" data-sd5-tab="review" onclick="window.setSubjectDetailTab('review')"><i class="fa-solid fa-bullseye"></i><span>Ôn tập</span></button>
            </div>

            <section class="sd5-panel is-active" data-sd5-panel="lecture" role="tabpanel">
              <header class="sd5-panel-head">
                <h2>Giới thiệu môn học</h2>
                <button type="button" class="sd5-panel-link" onclick="openUserResourceViewer('${s.id}', 'lecture')">Tài liệu học tập<i class="fa-solid fa-arrow-right"></i></button>
              </header>
              ${canDisplayPublishedCanvas && introCanvas.length ? `<div class="student-intro-canvas ${introCanvasVariant}" style="min-height:${introCanvasHeight}px"><div class="student-intro-canvas-backdrop" aria-hidden="true"></div><div class="student-intro-canvas-course-label" aria-hidden="true"><span>${safe(code)}</span><strong>${safe(name)}</strong></div>${renderIntroCanvas()}</div>` : intro ? `
                <p class="sd5-intro-text">${safe(intro).replace(/\n/g, '<br>')}</p>
              ` : `
                <div class="sd5-empty"><i class="fa-solid fa-feather-pointed"></i><span>Admin chưa cập nhật nội dung giới thiệu chi tiết cho môn học này.</span></div>
              `}
            </section>

            <section class="sd5-panel sd5-action" data-sd5-panel="bank" role="tabpanel" hidden>
              <div class="sd5-action-inner">
                <span class="sd5-action-icon"><i class="fa-solid fa-circle-question"></i></span>
                <h2>Ngân hàng câu hỏi</h2>
                <p>Luyện tập với ngân hàng câu hỏi của môn học.</p>
                <button type="button" class="sd5-btn" onclick="NavController.navigateToPage('ontap', 'bank-tab', { subject: '${s.id}' })">Mở ngân hàng câu hỏi<i class="fa-solid fa-arrow-right"></i></button>
              </div>
            </section>

            <section class="sd5-panel sd5-action" data-sd5-panel="exam" role="tabpanel" hidden>
              <div class="sd5-action-inner">
                <span class="sd5-action-icon"><i class="fa-solid fa-file-lines"></i></span>
                <h2>Đề thi</h2>
                <p>Kho đề thi các năm và đề minh họa của môn học.</p>
                <button type="button" class="sd5-btn" onclick="openUserResourceViewer('${s.id}', 'exam')">Mở kho đề thi<i class="fa-solid fa-arrow-right"></i></button>
              </div>
            </section>

            <section class="sd5-panel sd5-action" data-sd5-panel="review" role="tabpanel" hidden>
              <div class="sd5-action-inner">
                <span class="sd5-action-icon"><i class="fa-solid fa-bullseye"></i></span>
                <h2>Ôn tập</h2>
                <p>Luyện trắc nghiệm nhanh theo từng chương.</p>
                <button type="button" class="sd5-btn" onclick="NavController.startSubjectExam('${s.id}')">Bắt đầu ôn tập<i class="fa-solid fa-arrow-right"></i></button>
              </div>
            </section>
            </div>
          </main>

          <aside class="sd5-side">
            <div class="sd5-toc">
              <header class="sd5-toc-head">
                <h2><i class="fa-solid fa-list-ul"></i>Mục lục môn học</h2>
                <button type="button" class="sd5-toc-toggle" onclick="window.toggleSubjectSidebarAllChapters()"><span id="toc-toggle-text">Thu gọn</span><i class="fa-solid fa-chevron-up" id="toc-all-arrow"></i></button>
              </header>
              <div class="sd5-toc-track">
                ${chapters.length > 0 ? chapters.map((chap, cIdx) => {
                  const chapId = chap.id || 'c_' + cIdx;
                  return `
                  <div class="sd5-chapter${cIdx === 0 ? ' is-open' : ''}">
                    <button type="button" class="sd5-chap" onclick="window.toggleSubjectSidebarChapter('${chapId}')">
                      <span class="sd5-chap-node">${String(cIdx + 1).padStart(2, '0')}</span>
                      <span class="sd5-chap-title">${safe(chap.title)}</span>
                      <i class="fa-solid ${cIdx === 0 ? 'fa-chevron-up' : 'fa-chevron-down'} sd5-chap-chev toc-chap-arrow" id="arrow-${chapId}"></i>
                    </button>
                    <div class="toc-lesson-list sd5-lessons" id="lessons-${chapId}"${cIdx === 0 ? '' : ' style="display:none"'}>
                      ${(chap.lessons || []).map((les, lIdx) => {
                        const lesId = les.id || 'l_' + cIdx + '_' + lIdx;
                        return `
                        <button type="button" class="toc-lesson-item sd5-lesson${cIdx === 0 && lIdx === 0 ? ' active' : ''}" id="les-item-${lesId}" onclick="window.selectSubjectSidebarLesson('${chapId}', '${lesId}')">
                          <span class="sd5-lesson-dot"></span><span class="sd5-lesson-title">${safe(les.title)}</span>
                        </button>
                      `; }).join('')}
                    </div>
                  </div>`;
                }).join('') : `
                  <div class="sd5-empty sd5-empty-sm">Chưa có danh mục chương bài.</div>
                `}
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;

    this.navigateToPage('subject-detail', null, { subject: subjectId });
    window.scrollTo({ top: 0, behavior: 'auto' });
  },

  startSubjectExam(subjectId) {
    // 1. Set active subject in DB
    DB.setActiveSubject(subjectId);
    
    // 2. Trigger global selector updates
    const select = document.getElementById('global-subject-select');
    if (select) select.value = subjectId;

    if (window.updateSubjectBanner) {
      window.updateSubjectBanner(subjectId);
    }
    if (window.updateBankCount) {
      window.updateBankCount();
    }

    // 3. Navigate to Ontap page with the subject in the URL
    this.navigateToPage('ontap', 'exam-tab', { subject: subjectId });
  },

  // ─── USER AUTH & PROFILE POPOVER ──────────────────────────────────────────
  restoreUserSession() {
    try {
      const saved = localStorage.getItem('lien_google_user') || localStorage.getItem('lien_user_session');
      if (saved) {
        this.currentUser = JSON.parse(saved);
      }
    } catch (e) {
      this.currentUser = null;
    }
  },

  renderUserAuthZone() {
    const container = document.getElementById('user-auth-zone');
    const adminNavBtn = document.getElementById('snav-admin');
    const mobileUserMenu = document.querySelector('.mobile-user-menu');
    const mobileUserName = document.querySelector('.mobile-user-name');
    const mobileUserAvatar = document.getElementById('mobile-user-avatar');
    const mobileDisplayName = this.currentUser?.name || this.currentUser?.email?.split('@')[0] || '';

    if (mobileUserName) {
      mobileUserName.textContent = mobileDisplayName || 'Đăng nhập';
    }
    if (mobileUserMenu) {
      mobileUserMenu.setAttribute('aria-label', this.currentUser ? `Mở hồ sơ ${mobileDisplayName}` : 'Đăng nhập với Google');
    }
    if (mobileUserAvatar) {
      mobileUserAvatar.replaceChildren();
      if (this.currentUser?.avatar) {
        const avatarImage = document.createElement('img');
        avatarImage.src = this.currentUser.avatar;
        avatarImage.alt = '';
        avatarImage.referrerPolicy = 'no-referrer';
        mobileUserAvatar.appendChild(avatarImage);
      } else if (this.currentUser) {
        mobileUserAvatar.textContent = String(mobileDisplayName).trim().charAt(0).toUpperCase() || 'U';
      } else {
        const avatarIcon = document.createElement('i');
        avatarIcon.className = 'fa-solid fa-user';
        avatarIcon.setAttribute('aria-hidden', 'true');
        mobileUserAvatar.appendChild(avatarIcon);
      }
    }

    // 1. Kiểm tra 2 Gmail Super Admin để ẩn/hiện nút Admin Sidebar
    const isSuperAdmin = this.currentUser && this.currentUser.email && getActiveAdminEmails().includes(this.currentUser.email.toLowerCase());

    if (adminNavBtn) {
      if (isSuperAdmin) {
        adminNavBtn.classList.remove('hidden');
      } else {
        adminNavBtn.classList.add('hidden');
      }
    }

    if (!container) return;

    if (this.currentUser) {
      const role = getUserRole(this.currentUser.email);
      let roleBadgeHtml = '<span class="badge badge-newbie">🌱 NEWBIE MEMBER</span>';
      if (role === 'ADMIN') {
        roleBadgeHtml = '<span class="badge badge-admin"><i class="fa-solid fa-shield-halved"></i> ADMIN SYSTEM</span>';
      } else if (role === 'PREMIUM') {
        roleBadgeHtml = '<span class="badge badge-premium"><i class="fa-solid fa-crown"></i> PREMIUM MEMBER</span>';
      }

      const safeName = (this.currentUser.name || 'User').replace(/'/g, "\\'");
      const defaultAvatar = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%2300b96b'/><stop offset='100%' stop-color='%23008f4f'/></linearGradient></defs><rect width='128' height='128' rx='64' fill='url(%23g)'/><text x='50%' y='54%' font-family='system-ui,-apple-system,sans-serif' font-size='56' font-weight='800' fill='%23ffffff' dominant-baseline='middle' text-anchor='middle'>${(safeName.charAt(0) || 'U').toUpperCase()}</text></svg>`;

      container.innerHTML = `
        <button class="user-avatar-btn" onclick="NavController.openProfileCenter()" title="${this.currentUser.name}">
          <img src="${this.currentUser.avatar || defaultAvatar}" alt="Avatar" class="user-avatar-img" referrerpolicy="no-referrer" onerror="window.handleAvatarError(this, '${safeName}')">
          <span class="user-avatar-name">${this.currentUser.name}</span>
          <i class="fa-solid fa-chevron-down text-xs" style="color:var(--text-muted);margin-left:4px;"></i>
        </button>
      `;
    } else {
      container.innerHTML = `
        <button class="btn-google-signin" onclick="NavController.handleGoogleSignIn()">
          <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Đăng nhập với Google</span>
        </button>
      `;
    }
  },

  toggleUserPopover() {
    const popover = document.getElementById('user-profile-popover');
    if (popover) {
      popover.classList.toggle('hidden');
    }
  },

  closeUserPopover() {
    const popover = document.getElementById('user-profile-popover');
    if (popover) {
      popover.classList.add('hidden');
    }
  },

  handleGoogleSignIn() {
    AuthModule.signInWithGoogle();
  },

  handleSignOut() {
    AuthModule.signOut();
  },

  openProfileCenter() {
    this.closeUserPopover();
    const existing = document.getElementById('profile-center-modal');
    if (existing) {
      existing.classList.add('open');
      this.setProfileMobileView('menu');
      return;
    }

    const role = getUserRole(this.currentUser?.email || '');
    const safeName = (this.currentUser?.name || 'User').replace(/'/g, "\\'");
    const defaultAvatar = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%2300b96b'/><stop offset='100%' stop-color='%23008f4f'/></linearGradient></defs><rect width='128' height='128' rx='64' fill='url(%23g)'/><text x='50%' y='54%' font-family='system-ui,-apple-system,sans-serif' font-size='56' font-weight='800' fill='%23ffffff' dominant-baseline='middle' text-anchor='middle'>${(safeName.charAt(0) || 'U').toUpperCase()}</text></svg>`;
    const avatarUrl = this.currentUser?.avatar || defaultAvatar;
    const displayName = this.currentUser?.name || 'User';
    const displayEmail = this.currentUser?.email || '';
    const profileModal = document.createElement('div');
    profileModal.id = 'profile-center-modal';
    profileModal.className = 'profile-center-overlay open';
    profileModal.innerHTML = `
      <div class="profile-center-modal" role="dialog" aria-modal="true" aria-label="Profile Center">
        <button class="profile-center-close" onclick="NavController.closeProfileCenter()" aria-label="Đóng profile center">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <button class="profile-mobile-back" type="button" onclick="NavController.showProfileMobileMenu()" aria-label="Quay lại menu tài khoản">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="profile-center-shell">
          <aside class="profile-sidebar">
            <div class="profile-sidebar-identity">
              <div class="profile-sidebar-avatar-wrap">
                <img src="${avatarUrl}" alt="Avatar" class="profile-sidebar-avatar" referrerpolicy="no-referrer" onerror="window.handleAvatarError(this, '${safeName}')">
                <span class="profile-avatar-verified" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
              </div>
              <div class="profile-sidebar-user">
                <h3>${displayName}</h3>
                <p>${displayEmail}</p>
                <span class="profile-badge premium">${role === 'PREMIUM' || role === 'ADMIN' ? 'PREMIUM MEMBER' : 'NEWBIE MEMBER'}</span>
              </div>
            </div>
            <nav class="profile-sidebar-nav">
              <button class="profile-nav-item active" data-profile-section="profile"><i class="fa-solid fa-user"></i><span>Hồ sơ cá nhân</span></button>
              <button class="profile-nav-item" data-profile-section="security"><i class="fa-solid fa-shield-halved"></i><span>Bảo mật</span></button>
              <button class="profile-nav-item" data-profile-section="notifications"><i class="fa-solid fa-bell"></i><span>Thông báo</span></button>
              <button class="profile-nav-item" data-profile-section="appearance"><i class="fa-solid fa-palette"></i><span>Giao diện</span></button>
              <button class="profile-nav-item" data-profile-section="language"><i class="fa-solid fa-globe"></i><span>Ngôn ngữ</span></button>
              <button class="profile-nav-item" data-profile-section="privacy"><i class="fa-solid fa-lock"></i><span>Quyền riêng tư</span></button>
            </nav>
            <div class="profile-sidebar-divider"></div>
            <button class="profile-sidebar-logout" onclick="NavController.handleSignOut()">
              <i class="fa-solid fa-right-from-bracket"></i><span>Đăng xuất</span>
            </button>
          </aside>

          <main class="profile-content" id="profile-center-content"></main>
        </div>
      </div>
    `;

    document.body.appendChild(profileModal);
    document.body.classList.add('profile-center-open');
    this.setProfileMobileView('menu');

    profileModal.addEventListener('click', (event) => {
      if (event.target === profileModal) {
        this.closeProfileCenter();
      }
    });

    if (this.__profileCenterEscListener) {
      document.removeEventListener('keydown', this.__profileCenterEscListener);
    }
    this.__profileCenterEscListener = (event) => {
      if (event.key === 'Escape') {
        this.closeProfileCenter();
      }
    };
    document.addEventListener('keydown', this.__profileCenterEscListener);

    this.renderProfileCenterContent('profile');
    profileModal.querySelectorAll('.profile-nav-item').forEach((button) => {
      button.addEventListener('click', () => {
        const section = button.dataset.profileSection;
        profileModal.querySelectorAll('.profile-nav-item').forEach(item => item.classList.toggle('active', item === button));
        this.renderProfileCenterContent(section);
        this.setProfileMobileView('section');
      });
    });
  },

  setProfileMobileView(view) {
    const modal = document.getElementById('profile-center-modal');
    if (!modal) return;
    const isMenu = view === 'menu';
    modal.classList.toggle('is-mobile-menu', isMenu);
    modal.classList.toggle('is-mobile-section', !isMenu);
    if (isMenu) {
      const sidebar = modal.querySelector('.profile-sidebar');
      if (sidebar) sidebar.scrollTop = 0;
    } else {
      const content = modal.querySelector('.profile-content');
      if (content) content.scrollTop = 0;
    }
  },

  showProfileMobileMenu() {
    this.setProfileMobileView('menu');
  },

  closeProfileCenter() {
    const modal = document.getElementById('profile-center-modal');
    if (modal) {
      modal.classList.remove('open');
      setTimeout(() => modal.remove(), 180);
    }
    if (this.__profileCenterEscListener) {
      document.removeEventListener('keydown', this.__profileCenterEscListener);
      this.__profileCenterEscListener = null;
    }
    document.body.classList.remove('profile-center-open');
  },

  getProfileCover() {
    const userKey = this.currentUser?.uid || this.currentUser?.email || 'guest';
    return {
      image: this.currentUser?.profileCover || localStorage.getItem(`lien_profile_cover_${userKey}`) || '',
      positionX: Number(this.currentUser?.profileCoverPositionX ?? localStorage.getItem(`lien_profile_cover_x_${userKey}`) ?? 50),
      positionY: Number(this.currentUser?.profileCoverPositionY ?? localStorage.getItem(`lien_profile_cover_y_${userKey}`) ?? 50)
    };
  },

  openProfileCoverEditor() {
    const existing = document.getElementById('profile-cover-editor');
    if (existing) {
      existing.classList.add('open');
      return;
    }

    const cover = this.getProfileCover();
    const editor = document.createElement('div');
    editor.id = 'profile-cover-editor';
    editor.className = 'profile-cover-editor-overlay open';
    editor.innerHTML = `
      <div class="profile-cover-editor" role="dialog" aria-modal="true" aria-label="Chỉnh sửa ảnh bìa">
        <div class="profile-cover-editor-head">
          <div>
            <h3>Chỉnh sửa ảnh bìa</h3>
            <p>Chọn ảnh và kéo thanh trượt để căn vị trí hiển thị.</p>
          </div>
          <button type="button" class="profile-cover-editor-close" onclick="NavController.closeProfileCoverEditor()" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="profile-cover-editor-preview" id="profile-cover-editor-preview"></div>
        <input id="profile-cover-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
        <button type="button" class="profile-cover-select" onclick="document.getElementById('profile-cover-file').click()">
          <i class="fa-solid fa-upload"></i> Chọn ảnh từ thiết bị
        </button>
        <div class="profile-cover-position-controls">
          <label>Vị trí ngang <input id="profile-cover-position-x" type="range" min="0" max="100" value="${cover.positionX}"></label>
          <label>Vị trí dọc <input id="profile-cover-position-y" type="range" min="0" max="100" value="${cover.positionY}"></label>
        </div>
        <div class="profile-cover-editor-actions">
          <button type="button" class="ghost-button" onclick="NavController.closeProfileCoverEditor()">Hủy</button>
          <button type="button" class="btn btn-primary" onclick="NavController.saveProfileCover()">Lưu ảnh bìa</button>
        </div>
      </div>
    `;
    document.body.appendChild(editor);

    const preview = editor.querySelector('#profile-cover-editor-preview');
    const fileInput = editor.querySelector('#profile-cover-file');
    const positionX = editor.querySelector('#profile-cover-position-x');
    const positionY = editor.querySelector('#profile-cover-position-y');
    const updatePreview = () => {
      preview.style.backgroundImage = cover.image ? `url("${cover.image}")` : '';
      preview.style.backgroundPosition = `${positionX.value}% ${positionY.value}%`;
      preview.classList.toggle('has-image', Boolean(cover.image));
    };
    updatePreview();
    positionX.addEventListener('input', updatePreview);
    positionY.addEventListener('input', updatePreview);
    fileInput.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const image = new Image();
        image.onload = () => {
          const maxSize = 1400;
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          cover.image = canvas.toDataURL('image/jpeg', 0.84);
          updatePreview();
        };
        image.src = loadEvent.target.result;
      };
      reader.readAsDataURL(file);
    });
    editor.addEventListener('click', (event) => {
      if (event.target === editor) this.closeProfileCoverEditor();
    });
  },

  closeProfileCoverEditor() {
    document.getElementById('profile-cover-editor')?.remove();
  },

  saveProfileCover() {
    const editor = document.getElementById('profile-cover-editor');
    const preview = editor?.querySelector('#profile-cover-editor-preview');
    const positionX = editor?.querySelector('#profile-cover-position-x');
    const positionY = editor?.querySelector('#profile-cover-position-y');
    if (!editor || !preview || !positionX || !positionY) return;

    const cover = this.getProfileCover();
    const image = preview.classList.contains('has-image')
      ? preview.style.backgroundImage.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
      : cover.image;
    const userKey = this.currentUser?.uid || this.currentUser?.email || 'guest';
    const x = Number(positionX.value);
    const y = Number(positionY.value);
    if (image) {
      this.currentUser.profileCover = image;
      localStorage.setItem(`lien_profile_cover_${userKey}`, image);
    }
    this.currentUser.profileCoverPositionX = x;
    this.currentUser.profileCoverPositionY = y;
    localStorage.setItem(`lien_profile_cover_x_${userKey}`, String(x));
    localStorage.setItem(`lien_profile_cover_y_${userKey}`, String(y));
    AuthModule.setUserSession(this.currentUser, false);
    this.closeProfileCoverEditor();
    this.renderProfileCenterContent('profile');
    if (window.showToast) window.showToast('Đã cập nhật ảnh bìa.', 'success');
  },

  getProfileActivityStats() {
    const user = this.currentUser || {};
    const userKey = user.uid || user.email || 'guest';
    let lessons = 0;
    try {
      const progress = DB.getLessonProgressMap() || {};
      Object.entries(progress).forEach(([key, record]) => {
        if (!key.startsWith(`${userKey}_`)) return;
        lessons += Array.isArray(record?.completedLessons) ? record.completedLessons.length : 0;
      });
    } catch { /* ignore corrupt progress */ }

    let examCount = 0;
    let studySeconds = 0;
    try {
      const history = DB.getHistory() || [];
      examCount = history.length;
      studySeconds = history.reduce((sum, item) => sum + (Number(item?.timeSpent) || 0), 0);
    } catch { /* ignore corrupt history */ }

    return { lessons, examCount, studyHours: studySeconds / 3600 };
  },

  openProfileActivityDetail() {
    this.closeProfileCenter();
    window.setTimeout(() => this.navigateToPage('ontap', 'history-tab'), 220);
  },

  renderProfileCenterContent(section) {
    const content = document.getElementById('profile-center-content');
    if (!content) return;

    const user = this.currentUser || {};
    const displayName = String(user.name || 'Người dùng').trim() || 'Người dùng';
    const safeDisplayName = displayName.replace(/'/g, "\\'");
    const email = String(user.email || 'Email chưa cập nhật').trim() || 'Email chưa cập nhật';
    const avatar = user.avatar || `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%2300b96b'/><stop offset='100%' stop-color='%23008f4f'/></linearGradient></defs><rect width='128' height='128' rx='64' fill='url(%23g)'/><text x='50%' y='54%' font-family='system-ui,-apple-system,sans-serif' font-size='56' font-weight='800' fill='%23ffffff' dominant-baseline='middle' text-anchor='middle'>${(displayName.charAt(0) || 'U').toUpperCase()}</text></svg>`;
    const role = getUserRole(user.email || '');
    const roleText = role === 'PREMIUM' || role === 'ADMIN' ? 'Không giới hạn (VIP AI)' : 'Cơ bản';
    const modelText = role === 'PREMIUM' || role === 'ADMIN' ? 'DeepSeek R1 / Claude 3.5' : 'Standard Tier';
    const userKey = user.uid || user.email || 'guest';
    const bio = user.bio || localStorage.getItem(`lien_profile_bio_${userKey}`) || 'Học không chỉ để biết, mà để làm được.';
    const joinedAt = user.joinedAt || localStorage.getItem(`lien_joined_at_${userKey}`) || new Date().toISOString();
    const joinedDate = new Date(joinedAt).toLocaleDateString('vi-VN');
    const cover = this.getProfileCover();
    const coverStyle = cover.image
      ? ` style="background-image:linear-gradient(120deg,rgba(7,32,42,.22),rgba(18,49,60,.45)),url('${cover.image}');background-position:${cover.positionX}% ${cover.positionY}%"`
      : '';
    const activity = this.getProfileActivityStats();
    const studyHours = activity.studyHours >= 10
      ? String(Math.round(activity.studyHours))
      : String(Math.round(activity.studyHours * 10) / 10);
    const memberLabel = role === 'PREMIUM' || role === 'ADMIN' ? 'PREMIUM MEMBER' : 'NEWBIE MEMBER';

    document.querySelectorAll('.profile-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.profileSection === section);
    });

    const sections = {
      profile: `
        <div class="profile-section hero">
          <div class="profile-hero-header">
            <div class="profile-cover"${coverStyle}>
              <button class="profile-cover-button" type="button" onclick="NavController.openProfileCoverEditor()"><i class="fa-solid fa-camera"></i> Đổi ảnh bìa</button>
            </div>
            <div class="profile-identity-head">
              <div class="profile-avatar-wrap">
                <img src="${avatar}" alt="avatar" class="profile-main-avatar" referrerpolicy="no-referrer" onerror="window.handleAvatarError(this, '${safeDisplayName}')">
                <label class="profile-avatar-upload" for="profile-avatar-upload" title="Thay ảnh đại diện"><i class="fa-solid fa-camera"></i></label>
                <input id="profile-avatar-upload" type="file" accept="image/*" style="display:none;" onchange="NavController.handleAvatarFileUpload(event)">
                <span class="profile-avatar-verified" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
              </div>
              <div class="profile-header-text">
                <div class="profile-name-row">
                  <h2>${displayName}</h2>
                  <span class="profile-name-verified" title="Đã xác minh"><i class="fa-solid fa-circle-check"></i></span>
                  ${role === 'PREMIUM' || role === 'ADMIN' ? '<span class="name-crown-icon" title="Tài khoản Premium VIP"><i class="fa-solid fa-crown"></i></span>' : ''}
                </div>
                <p class="profile-bio"><span class="profile-bio-text">"${bio}"</span> <button type="button" class="bio-edit-icon" onclick="NavController.editProfileBio()" title="Sửa tiểu sử" aria-label="Sửa tiểu sử"><i class="fa-solid fa-pen"></i></button></p>
                <span class="profile-badge premium profile-header-badge"><i class="fa-solid fa-crown"></i>${memberLabel}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="status-bar-container">
          <div class="status-col">
            <span class="status-label"><i class="fa-solid fa-robot"></i> AI Access</span>
            <strong class="status-val">${roleText}</strong>
          </div>
          <div class="status-col">
            <span class="status-label"><i class="fa-solid fa-microchip"></i> Mô hình AI</span>
            <strong class="status-val">${modelText}</strong>
          </div>
          <div class="status-col">
            <span class="status-label"><i class="fa-solid fa-infinity"></i> Quota còn lại</span>
            <strong class="status-val">Không giới hạn</strong>
          </div>
        </div>

        <div class="profile-panel">
          <div class="panel-head">
            <h3><i class="fa-solid fa-user-gear"></i> Thông tin cá nhân</h3>
          </div>
          <div class="profile-info-list">
            <div class="profile-info-row">
              <div class="profile-info-label"><i class="fa-solid fa-user"></i> Tên hiển thị</div>
              <div class="profile-info-value" data-field="name">${displayName}</div>
              <button class="profile-inline-edit" data-inline-field="name" type="button" onclick="NavController.editProfileField(this)" title="Chỉnh sửa"><i class="fa-solid fa-pen"></i></button>
            </div>
            <div class="profile-info-row">
              <div class="profile-info-label"><i class="fa-solid fa-envelope"></i> Email</div>
              <div class="profile-info-value" data-field="email">${email}</div>
              <button class="profile-inline-edit" data-inline-field="email" type="button" onclick="NavController.editProfileField(this)" title="Chỉnh sửa"><i class="fa-solid fa-pen"></i></button>
            </div>
            <div class="profile-info-row">
              <div class="profile-info-label"><i class="fa-solid fa-calendar-days"></i> Ngày tham gia</div>
              <div class="profile-info-value" data-field="joined">${joinedDate}</div>
              <span class="profile-inline-edit profile-inline-edit-disabled" aria-hidden="true"></span>
            </div>
            <div class="profile-info-row">
              <div class="profile-info-label"><i class="fa-solid fa-circle-dot"></i> Trạng thái</div>
              <div class="profile-info-value" data-field="status"><span class="profile-live-dot"></span> Đang hoạt động</div>
              <button class="profile-inline-edit" data-inline-field="status" type="button" onclick="NavController.editProfileField(this)" title="Chỉnh sửa"><i class="fa-solid fa-pen"></i></button>
            </div>
          </div>
        </div>

        <div class="profile-activity-panel">
          <div class="profile-activity-head">
            <h3><i class="fa-solid fa-chart-simple"></i> Thống kê hoạt động</h3>
            <button type="button" class="profile-activity-link" onclick="NavController.openProfileActivityDetail()">Xem chi tiết <i class="fa-solid fa-chevron-right"></i></button>
          </div>
          <div class="profile-activity-grid">
            <div class="profile-activity-tile is-mint">
              <span class="profile-activity-icon"><i class="fa-solid fa-book-open"></i></span>
              <strong>${activity.lessons}</strong>
              <small>Bài học hoàn thành</small>
            </div>
            <div class="profile-activity-tile is-blue">
              <span class="profile-activity-icon"><i class="fa-regular fa-clock"></i></span>
              <strong>${studyHours} giờ</strong>
              <small>Thời gian học</small>
            </div>
            <div class="profile-activity-tile is-cream">
              <span class="profile-activity-icon"><i class="fa-regular fa-file-lines"></i></span>
              <strong>${activity.examCount}</strong>
              <small>Đề đã luyện</small>
            </div>
          </div>
        </div>

        <div class="profile-panel quick-settings-panel">
          <div class="panel-head">
            <h3><i class="fa-solid fa-sliders"></i> Cài đặt nhanh</h3>
          </div>
          <div class="quick-setting-grid">
            <button type="button" class="quick-setting-card" data-profile-section="security"><i class="fa-solid fa-lock"></i><span>Đổi mật khẩu</span><i class="fa-solid fa-chevron-right"></i></button>
            <button type="button" class="quick-setting-card" data-profile-section="security"><i class="fa-solid fa-link"></i><span>Tài khoản liên kết</span><i class="fa-solid fa-chevron-right"></i></button>
            <button type="button" class="quick-setting-card" data-profile-section="notifications"><i class="fa-solid fa-bell"></i><span>Thông báo</span><i class="fa-solid fa-chevron-right"></i></button>
            <button type="button" class="quick-setting-card" data-profile-section="language"><i class="fa-solid fa-globe"></i><span>Ngôn ngữ</span><i class="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>
      `,
      security: `
        <div class="profile-panel single">
          <div class="panel-head"><h3>Tài khoản &amp; Bảo mật</h3></div>
          <div class="security-stack">
            <div class="security-row">
              <div>
                <strong>Đăng nhập Google</strong>
                <small>${email}</small>
              </div>
              <button class="ghost-button" type="button">Liên kết lại</button>
            </div>
            <div class="security-row">
              <div>
                <strong>Đổi mật khẩu</strong>
                <small>Cập nhật lần cuối 7 ngày trước</small>
              </div>
              <button class="ghost-button" type="button">Đổi</button>
            </div>
            <div class="toggle-list">
              <label class="toggle-row"><div><strong>Xác minh 2 bước</strong><small>Khuyến nghị bật để tăng cường bảo vệ</small></div><input type="checkbox" checked></label>
              <label class="toggle-row"><div><strong>Yêu cầu xác nhận khi đăng nhập mới</strong><small>Nhắc nhở trên thiết bị mới</small></div><input type="checkbox" checked></label>
            </div>
          </div>
        </div>
      `,
      notifications: `
        <div class="profile-panel single">
          <div class="panel-head"><h3>Thông báo</h3></div>
          <div class="toggle-list">
            <label class="toggle-row"><div><strong>Thông báo học tập</strong><small>Nhật ký, lời nhắc và đề xuất học tập</small></div><input type="checkbox" checked></label>
            <label class="toggle-row"><div><strong>Thông báo ưu đãi và cập nhật</strong><small>Thông tin về tính năng mới, khuyến mãi</small></div><input type="checkbox" checked></label>
            <label class="toggle-row"><div><strong>Email nhắc nhở</strong><small>Gửi email khi chiến lược ôn tập trễ</small></div><input type="checkbox"></label>
          </div>
        </div>
      `,
      appearance: `
        <div class="profile-panel single">
          <div class="panel-head"><h3>Giao diện</h3></div>
          <div class="appearance-grid">
            <button type="button" class="appearance-option" data-theme-choice="dark"><span>Chủ đề tối</span><small>Phù hợp học khuya và dễ nhìn hơn</small></button>
            <button type="button" class="appearance-option" data-theme-choice="light"><span>Chủ đề sáng</span><small>Trải nghiệm tối giản và rõ nét</small></button>
            <button type="button" class="appearance-option" data-theme-choice="auto"><span>Tự động</span><small>Theo cài đặt hệ thống</small></button>
          </div>
        </div>
      `,
      language: `
        <div class="profile-panel single">
          <div class="panel-head"><h3>Ngôn ngữ</h3></div>
          <div class="language-list" aria-label="Chọn ngôn ngữ">
            <button type="button" class="language-option" data-translate-language="vi"><span>Tiếng Việt</span><img class="language-flag" src="https://flagcdn.com/w40/vn.png" alt="Cờ Việt Nam"></button>
            <button type="button" class="language-option" data-translate-language="en"><span>English</span><img class="language-flag" src="https://flagcdn.com/w40/gb.png" alt="Cờ Vương quốc Anh"></button>
            <button type="button" class="language-option" data-translate-language="zh-CN"><span>中文</span><img class="language-flag" src="https://flagcdn.com/w40/cn.png" alt="Cờ Trung Quốc"></button>
            <button type="button" class="language-option" data-translate-language="ja"><span>日本語</span><img class="language-flag" src="https://flagcdn.com/w40/jp.png" alt="Cờ Nhật Bản"></button>
            <button type="button" class="language-option" data-translate-language="ko"><span>한국어</span><img class="language-flag" src="https://flagcdn.com/w40/kr.png" alt="Cờ Hàn Quốc"></button>
            <button type="button" class="language-option" data-translate-language="fr"><span>Français</span><img class="language-flag" src="https://flagcdn.com/w40/fr.png" alt="Cờ Pháp"></button>
            <button type="button" class="language-option" data-translate-language="de"><span>Deutsch</span><img class="language-flag" src="https://flagcdn.com/w40/de.png" alt="Cờ Đức"></button>
          </div>
        </div>
      `,
      privacy: `
        <div class="profile-panel single">
          <div class="panel-head"><h3>Quyền riêng tư</h3></div>
          <div class="toggle-list">
            <label class="toggle-row"><div><strong>Hiển thị hồ sơ công khai</strong><small>Cho phép người khác nhìn thấy trạng thái học tập</small></div><input type="checkbox"></label>
            <label class="toggle-row"><div><strong>Cho phép lưu lịch sử ôn tập</strong><small>Đồng bộ tiến độ trên thiết bị của bạn</small></div><input type="checkbox" checked></label>
            <label class="toggle-row"><div><strong>Chia sẻ dữ liệu cải thiện sản phẩm</strong><small>Giúp đội ngũ hiểu trải nghiệm học tập</small></div><input type="checkbox"></label>
          </div>
        </div>
      `,
      settings: `
        <div class="profile-panel single">
          <div class="panel-head"><h3>Cài đặt</h3></div>
          <div class="toggle-list">
            <label class="toggle-row"><div><strong>Hiển thị hồ sơ công khai</strong><small>Cho phép người khác nhìn thấy trạng thái học tập</small></div><input type="checkbox"></label>
            <label class="toggle-row"><div><strong>Cho phép lưu lịch sử ôn tập</strong><small>Đồng bộ tiến độ trên thiết bị của bạn</small></div><input type="checkbox" checked></label>
            <label class="toggle-row"><div><strong>Chia sẻ dữ liệu cải thiện sản phẩm</strong><small>Giúp đội ngũ hiểu trải nghiệm học tập</small></div><input type="checkbox"></label>
          </div>
        </div>
      `,
      help: `
        <div class="profile-panel single">
          <div class="panel-head"><h3>Trợ giúp</h3></div>
          <div class="help-list">
            <div class="help-item"><strong>Hướng dẫn sử dụng</strong><small>Xem các mẹo học tập và quy trình thao tác trong ứng dụng.</small></div>
            <div class="help-item"><strong>Liên hệ hỗ trợ</strong><small>Gửi yêu cầu hoặc báo lỗi qua kênh hỗ trợ trong hệ thống.</small></div>
            <div class="help-item"><strong>Cập nhật và thông tin phiên bản</strong><small>Phiên bản hiện tại: FTECA 24 • 2026</small></div>
          </div>
        </div>
      `
    };

    const html = sections[section] || sections.profile;
    content.innerHTML = html;
    content.classList.toggle('has-hero', section === 'profile');

    content.querySelectorAll('[data-profile-section]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextSection = button.dataset.profileSection;
        const navButtons = document.querySelectorAll('.profile-nav-item');
        navButtons.forEach(item => item.classList.toggle('active', item.dataset.profileSection === nextSection));
        this.renderProfileCenterContent(nextSection);
      });
    });

    content.querySelectorAll('.appearance-option').forEach((button) => {
      button.classList.toggle('active', button.dataset.themeChoice === (DB.getSettings().theme || 'light'));
      button.addEventListener('click', () => {
        const choice = button.dataset.themeChoice;
        const appliedTheme = choice === 'auto'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : choice;
        document.documentElement.setAttribute('data-theme', appliedTheme);
        DB.saveSettings({ theme: choice });
        if (typeof updateThemeButton === 'function') updateThemeButton(appliedTheme);
        content.querySelectorAll('.appearance-option').forEach((item) => {
          item.classList.toggle('active', item === button);
        });
      });
    });

    content.querySelectorAll('.language-option').forEach((button) => {
      button.classList.toggle('active', button.dataset.translateLanguage === (localStorage.getItem('fteca_translate_language') || 'vi'));
    });
    content.addEventListener('click', (event) => {
      const button = event.target.closest('.language-option');
      if (!button || !content.contains(button)) return;

      const language = button.dataset.translateLanguage;
      if (typeof window.selectFtecaLanguage !== 'function') {
        window.showToast?.('Không thể tải Google Translate. Vui lòng kiểm tra kết nối mạng.', 'error');
        return;
      }
      content.querySelectorAll('.language-option').forEach((item) => { item.disabled = true; });
      window.selectFtecaLanguage(language, () => {
        localStorage.setItem('fteca_translate_language', language);
        content.querySelectorAll('.language-option').forEach((item) => {
          item.disabled = false;
          item.classList.toggle('active', item.dataset.translateLanguage === language);
        });
      });
    });
  },

  editProfileBio() {
    const bio = document.querySelector('.profile-bio');
    const text = bio?.querySelector('.profile-bio-text');
    if (!bio || !text || bio.querySelector('.profile-bio-input')) return;

    const currentValue = text.textContent.trim().replace(/^"|"$/g, '');
    text.outerHTML = `<input class="profile-bio-input" type="text" value="${currentValue.replace(/"/g, '&quot;')}" maxlength="160">`;
    const input = bio.querySelector('.profile-bio-input');
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'bio-edit-icon';
    save.title = 'Lưu tiểu sử';
    save.innerHTML = '<i class="fa-solid fa-check"></i>';
    save.addEventListener('click', () => this.saveProfileBio(input.value));
    bio.appendChild(save);
    input.focus();
    input.select();
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.saveProfileBio(input.value);
      if (event.key === 'Escape') this.renderProfileCenterContent('profile');
    });
  },

  saveProfileBio(value) {
    const nextValue = String(value || '').trim().slice(0, 160) || 'Học không chỉ để biết, mà để làm được.';
    const user = this.currentUser;
    if (!user) return;
    const userKey = user.uid || user.email || 'guest';
    user.bio = nextValue;
    localStorage.setItem(`lien_profile_bio_${userKey}`, nextValue);
    AuthModule.setUserSession(user, false);
    this.renderProfileCenterContent('profile');
  },

  editProfileField(button) {
    const row = button.closest('.profile-info-row');
    if (!row) return;

    const valueBlock = row.querySelector('.profile-info-value');
    const field = button.dataset.inlineField;
    const currentValue = valueBlock.dataset.value || valueBlock.textContent.trim();
    valueBlock.dataset.value = currentValue;
    valueBlock.innerHTML = `<input type="text" class="profile-inline-input" value="${String(currentValue).replace(/"/g, '&quot;')}" data-inline-field="${field}">`;
    button.classList.add('hidden');
    button.insertAdjacentHTML('afterend', '<button class="profile-inline-save" onclick="NavController.saveProfileField(this)"><i class="fa-solid fa-check"></i> Lưu</button>');
  },

  saveProfileField(button) {
    const row = button.closest('.profile-info-row');
    if (!row) return;

    const input = row.querySelector('.profile-inline-input');
    const valueBlock = row.querySelector('.profile-info-value');
    const field = input?.dataset.inlineField;
    const nextValue = input ? (input.value.trim() || '—') : '—';
    valueBlock.dataset.value = nextValue;
    valueBlock.textContent = nextValue;

    const editButton = row.querySelector('.profile-inline-edit');
    if (editButton) editButton.classList.remove('hidden');
    const saveButton = row.querySelector('.profile-inline-save');
    if (saveButton) saveButton.remove();

    if (field === 'name' && this.currentUser) {
      this.currentUser.name = nextValue;
      this.renderUserAuthZone();
    }
    if (field === 'email' && this.currentUser) {
      this.currentUser.email = nextValue;
    }
  },

  toggleProfileInlineEditor() {
    document.querySelectorAll('.profile-inline-edit').forEach(btn => {
      btn.classList.toggle('hidden');
    });
  },

  openProfileSettingsModal() {
    this.closeUserPopover();
    this.openProfileCenter();
  },

  tempAvatarData: null,

  openEditAvatarModal() {
    this.closeUserPopover();
    this.tempAvatarData = null;

    let modal = document.getElementById('modal-edit-profile');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-edit-profile';
      modal.className = 'modal-overlay open';
      modal.style.zIndex = '10000';
      modal.innerHTML = `
        <div class="modal-box text-center" style="max-width: 440px; padding: 24px;">
          <h3 style="font-size: 18px; font-weight: 800; margin-bottom: 16px;">🖼️ Cập Nhật Hồ Sơ & Ảnh Đại Diện</h3>
          
          <div style="text-align: left;" class="space-y-4">

            <!-- Avatar Preview & Upload Button -->
            <div class="text-center" style="margin-bottom: 16px;">
              <div style="position:relative;width:96px;height:96px;margin:0 auto 12px;">
                <img id="edit-avatar-preview" src="${this.currentUser?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'}" referrerpolicy="no-referrer" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid var(--primary);box-shadow:var(--shadow-md);">
                <label for="avatar-file-input" style="position:absolute;bottom:0;right:0;width:32px;height:32px;background:var(--primary);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);" title="Tải ảnh mới từ thiết bị">
                  <i class="fa-solid fa-camera"></i>
                </label>
              </div>
              <input type="file" id="avatar-file-input" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" style="display:none;" onchange="NavController.handleAvatarFileUpload(event)">
              <button class="btn btn-secondary btn-sm" onclick="document.getElementById('avatar-file-input').click()">
                <i class="fa-solid fa-upload"></i> Tải Ảnh Từ Máy Tính / Điện Thoại
              </button>
            </div>

            <div class="form-group">
              <label class="form-label">Tên hiển thị:</label>
              <input type="text" id="edit-profile-name" class="form-input" value="${this.currentUser?.name || ''}">
            </div>
          </div>

          <div class="flex gap-2 margin-top-20">
            <button class="btn btn-secondary btn-full" onclick="document.getElementById('modal-edit-profile').classList.remove('open')">Hủy</button>
            <button class="btn btn-primary btn-full" onclick="NavController.saveProfileEdit()">
              <i class="fa-solid fa-floppy-disk"></i> Lưu Hồ Sơ
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } else {
      const nameInput = document.getElementById('edit-profile-name');
      const previewImg = document.getElementById('edit-avatar-preview');
      if (nameInput) nameInput.value = this.currentUser?.name || '';
      if (previewImg && this.currentUser?.avatar) previewImg.src = this.currentUser.avatar;
      modal.classList.add('open');
    }
  },

  handleAvatarFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      if (window.showToast) window.showToast('Vui lòng chọn file hình ảnh (PNG, JPG, GIF, WebP, AVIF)!', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target.result;
      
      // Compress image via Canvas to 250x250 max
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 250;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        this.tempAvatarData = compressedDataUrl;

        const previewImg = document.getElementById('edit-avatar-preview');
        if (previewImg) previewImg.src = compressedDataUrl;

        if (window.showToast) window.showToast('Đã chọn ảnh thành công! Bấm Lưu Hồ Sơ để xác nhận.', 'info');
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  },

  saveProfileEdit() {
    const nameInput = document.getElementById('edit-profile-name');
    const newName = nameInput ? nameInput.value.trim() : '';

    if (!newName) {
      if (window.showToast) window.showToast('Tên hiển thị không được để trống!', 'error');
      return;
    }

    if (this.currentUser) {
      AuthModule.updateCustomProfile(newName, this.tempAvatarData);
    }

    const modal = document.getElementById('modal-edit-profile');
    if (modal) modal.classList.remove('open');
    if (window.showToast) window.showToast('Đã cập nhật tên và ảnh đại diện!', 'success');
  }
};

window.handleAvatarError = function(imgElement, name) {
  if (!imgElement) return;
  imgElement.onerror = null;
  const initial = ((name || 'U').trim().charAt(0) || 'U').toUpperCase();
  imgElement.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2300b96b"/><stop offset="100%" stop-color="%23008f4f"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(%23g)"/><text x="50%" y="54%" font-family="system-ui,-apple-system,sans-serif" font-size="56" font-weight="800" fill="%23ffffff" dominant-baseline="middle" text-anchor="middle">${initial}</text></svg>`;
};

/* TOC Sidebar Interactive Handlers */
function escapeLessonText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeLegacyLessonHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value || '');
  template.content.querySelectorAll('script, style, iframe, object, embed, form').forEach(node => node.remove());
  template.content.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return template.innerHTML;
}

function sanitizeReviewLessonHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const tags = new Set(['p','h2','h3','h4','strong','em','u','ul','ol','li','a','table','thead','tbody','tr','th','td','blockquote','br','img','video','source','iframe']);
  template.content.querySelectorAll('*').forEach(node => {
    const tag = node.tagName.toLowerCase();
    if (!tags.has(tag)) { node.replaceWith(...node.childNodes); return; }
    [...node.attributes].forEach(attribute => {
      const name = attribute.name.toLowerCase(), value = attribute.value.trim();
      if ((tag === 'a' && name === 'href') || (['img','video','source','iframe'].includes(tag) && name === 'src')) { try { const url = new URL(value, window.location.href); const embed = tag === 'iframe'; if (!['http:', 'https:'].includes(url.protocol) || (embed && !/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)vimeo\.com$/i.test(url.hostname))) node.removeAttribute(attribute.name); } catch { node.removeAttribute(attribute.name); } return; }
      if (tag === 'img' && name === 'class' && value === 'review-floating-media') return; if (tag === 'img' && ['data-review-float-x','data-review-float-y'].includes(name) && /^-?\d{1,4}$/.test(value)) return; if (['img','video'].includes(tag) && ['alt','width','height','controls'].includes(name)) return; if (tag === 'iframe' && ['title','allowfullscreen'].includes(name)) return; if (tag === 'a' && name === 'target') { if (value !== '_blank') node.removeAttribute(attribute.name); return; }
      if (tag === 'a' && name === 'rel') { node.setAttribute('rel', 'noopener noreferrer'); return; }
      if (name === 'style') { const allowed = []; const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(value); const color = /color\s*:\s*(#[0-9a-f]{3,8})/i.exec(value); const width = /width\s*:\s*(?:[1-9][0-9]?(?:\.[0-9]+)?%|[1-9][0-9]{0,3}px)/i.exec(value); if (align) allowed.push('text-align:' + align[1].toLowerCase()); if (color) allowed.push('color:' + color[1]); if (tag === 'img' && width) allowed.push('width:' + width[0].split(':')[1].trim()); if (allowed.length) node.setAttribute('style', allowed.join(';')); else node.removeAttribute('style'); return; }
      node.removeAttribute(attribute.name);
    });
    if (tag === 'a' && node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
  });
  return template.innerHTML;
}

function renderLessonContent(lesson) {
  const blocks = Array.isArray(lesson?.blocks) ? lesson.blocks : [];
  if (!blocks.length) {
    return `<p>${escapeLessonText(lesson?.content || 'Bài học chưa có nội dung mô tả chi tiết.').replace(/\n/g, '<br>')}</p>`;
  }

  return blocks.map(block => {
    const settings = block.settings || {};
    const align = ['left', 'center', 'right'].includes(settings.align) ? settings.align : 'left';
    const color = /^#[0-9a-f]{3,8}$/i.test(settings.color || '') ? settings.color : '';
    const style = `text-align:${align};${color ? `color:${color};` : ''}`;
    if (block.type === 'lessonDocument') {
      return `<article class="review-lesson-document">${sanitizeReviewLessonHtml(block.content)}</article>`;
    }
    if (block.type === 'heading') {
      const tag = settings.level === 'H3' ? 'h3' : 'h2';
      return `<${tag} class="student-lesson-heading" style="${style}">${escapeLessonText(block.content)}</${tag}>`;
    }
    if (block.type === 'text') {
      return `<p style="${style}">${escapeLessonText(block.content).replace(/\n/g, '<br>')}</p>`;
    }
    if (block.type === 'legacyHtml') return sanitizeLegacyLessonHtml(block.content);
    return '';
  }).join('') || '<p>Bài học chưa có nội dung mô tả chi tiết.</p>';
}

window.toggleSubjectSidebarChapter = function(chapId) {
  const lessonsEl = document.getElementById('lessons-' + chapId);
  const arrowEl = document.getElementById('arrow-' + chapId);
  if (!lessonsEl) return;
  const isHidden = lessonsEl.style.display === 'none';
  lessonsEl.style.display = isHidden ? '' : 'none';
  lessonsEl.closest('.sd5-chapter')?.classList.toggle('is-open', isHidden);
  if (arrowEl) {
    arrowEl.className = `fa-solid ${isHidden ? 'fa-chevron-up' : 'fa-chevron-down'} sd5-chap-chev toc-chap-arrow`;
  }
};

window.selectSubjectSidebarLesson = function(chapId, lesId) {
  document.querySelectorAll('.toc-lesson-item').forEach(el => el.classList.remove('active'));
  const targetItem = document.getElementById('les-item-' + lesId);
  if (targetItem) targetItem.classList.add('active');

  const details = window._activeSubjectDetails;
  const subjectId = details?.subjectId;

  if (subjectId && window.NavController?.openStudyReader) {
    window.NavController.openStudyReader({ subjectId, chapterId: chapId, lessonId: lesId, returnPage: 'subject-detail' });
  }
};

window.setSubjectDetailTab = function(tab) {
  document.querySelectorAll('#page-subject-detail .sd5-tab').forEach(btn => {
    const active = btn.dataset.sd5Tab === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('#page-subject-detail .sd5-quick-row').forEach(btn => {
    const active = btn.dataset.sd5Quick === tab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-current', active ? 'true' : 'false');
  });
  document.querySelectorAll('#page-subject-detail .sd5-panel').forEach(panel => {
    const active = panel.dataset.sd5Panel === tab;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
};

window.openSubjectQuickTab = function(tab) {
  window.setSubjectDetailTab(tab);
  const sheet = document.querySelector('#page-subject-detail .sd5-content');
  if (sheet && window.matchMedia('(max-width: 760px)').matches) {
    sheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

let _tocAllExpanded = true;
window.toggleSubjectSidebarAllChapters = function() {
  _tocAllExpanded = !_tocAllExpanded;
  const btnText = document.getElementById('toc-toggle-text');
  const arrow = document.getElementById('toc-all-arrow');
  if (btnText) btnText.textContent = _tocAllExpanded ? 'Thu gọn' : 'Mở rộng';
  if (arrow) arrow.className = _tocAllExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';

  document.querySelectorAll('.toc-lesson-list').forEach(el => {
    el.style.display = _tocAllExpanded ? '' : 'none';
    el.closest('.sd5-chapter')?.classList.toggle('is-open', _tocAllExpanded);
  });
  document.querySelectorAll('.toc-chap-arrow').forEach(el => {
    el.className = `fa-solid ${_tocAllExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} sd5-chap-chev toc-chap-arrow`;
  });
};
