/**
 * navigation.js — Application Navigation & UI Layout Controller
 * Manages Sidebar, Top Header Search, Page Navigation, Subject Detail, and Auth Popover
 */

import { SUBJECTS_REGISTRY, getAllSubjects, getSubjectById, KNOWLEDGE_BLOCKS } from './subjects.js?v=20260901c';
import { DB } from './db.js';
import { AuthModule, SUPER_ADMIN_EMAILS, getUserRole } from './auth.js';
import { ArticlesModule } from './articles.js';

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

export const NavController = {
  activePage: 'home',
  currentUser: null,

  async init() {
    // Quyền phải được tải xong trước khi Firebase có thể ghi phiên đăng nhập
    // lên cloud, nếu không danh sách Premium rỗng có thể ghi đè quyền vừa cấp.
    await AuthModule.init();
    this.restoreUserSession();
    this.renderUserAuthZone();
    this.setupSearchShortcut();
  },

  toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
  },

  // ─── PAGE NAVIGATION ────────────────────────────────────────────────────────
  navigateToPage(pageId, subTabId = null) {
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

    // Bảo mật trang Admin: Chỉ 2 Gmail Admin mới truy cập được
    if (pageId === 'admin') {
      const user = this.currentUser;
      const isSuperAdmin = user && user.email && SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase());
      if (!isSuperAdmin) {
        if (window.showToast) window.showToast('⛔ Trang Quản Trị Admin chỉ dành riêng cho Quản trị viên hệ thống!', 'error');
        pageId = 'ontap';
        subTabId = 'exam-tab';
      } else {
        window.refreshUserRolesFromServer?.();
        void window.openAdminFeedbackInbox?.();
        setTimeout(() => {
          if (window.renderAdminDashboard) window.renderAdminDashboard();
        }, 50);
      }
    }

    this.activePage = pageId;

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
    // Hide all normal page containers and show selected.
    document.querySelectorAll('.page-container').forEach(page => {
      page.classList.add('hidden');
    });

    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
      targetPage.classList.remove('hidden');
    }

    // 3. Chuyển tab con nếu có
    if (subTabId && window.switchTab) {
      window.switchTab(subTabId);
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
    const program = details.program || 'Đại học Công nghệ - ĐH Đà Nẵng';
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
    const cards = details.cards || {};
    const instructor = details.instructor || {};
    const chapters = details.chapters || [];
    const safe = escapeSubjectDetailText;

    // Store active details on window for TOC interaction
    window._activeSubjectDetails = details;

    // 4 Cards fallbacks
    const objectivesContent = cards.objectives?.content || '';
    const mainContentContent = cards.mainContent?.content || '';
    const targetAudienceContent = cards.targetAudience?.content || '';
    const learningFormatContent = cards.learningFormat?.content || '';

    // Render presentation shell; lesson, resource, and exam handlers remain unchanged.
    const lessonCount = chapters.reduce((sum, chap) => sum + ((chap && chap.lessons || []).length), 0);
    detailContainer.innerHTML = `
      <div class="sd2-shell">
        <button class="sd2-back" onclick="NavController.navigateToPage('${returnPage === 'ontap' ? 'ontap' : 'study-space'}')" aria-label="Quay lại danh sách môn học">
          <i class="fa-solid fa-arrow-left"></i><span>Quay lại</span>
        </button>

        <!-- SECTION 1 · HERO -->
        <article class="sd2-hero subject-theme-${visualThemeKey}" style="${banner ? `background-image: url('${banner}'); background-size: cover; background-position: center;` : ''}">
          <div class="sd2-hero-decor" aria-hidden="true">
            <div class="sd2-orb sd2-orb-one"></div>
            <div class="sd2-orb sd2-orb-two"></div>
            <div class="sd2-dots"></div>
          </div>
          <div class="sd2-hero-copy">
            <span class="sd2-badge"><i class="sd2-badge-dot"></i>${safe(code)} — ${safe(name).toUpperCase()}</span>
            <h1 class="sd2-title">${safe(name)}</h1>
            <p class="sd2-desc">${safe(shortDesc)}</p>
            <div class="sd2-meta">
              <span class="sd2-meta-chip"><i class="fa-solid fa-book-bookmark"></i>${credits} tín chỉ</span>
              <span class="sd2-meta-chip"><i class="fa-solid fa-graduation-cap"></i>${safe(program)}</span>
              <span class="sd2-meta-chip"><i class="fa-solid fa-calendar-days"></i>Học kỳ: ${semester}</span>
            </div>
            <div class="sd2-cta">
              <button class="sd2-btn-primary" onclick="NavController.startSubjectExam('${s.id}')"><i class="fa-solid fa-bolt"></i>Ôn tập ngay</button>
              <button class="sd2-btn-ghost" onclick="openUserResourceViewer('${s.id}', 'lecture')"><i class="fa-solid fa-folder-open"></i>Tài liệu học tập</button>
            </div>
          </div>
          ${!banner ? `
          <div class="sd2-hero-art" aria-hidden="true">
            <div class="sd2-art-ring sd2-art-ring-one"></div>
            <div class="sd2-art-ring sd2-art-ring-two"></div>
            <div class="sd2-art-platform"></div>
            <i class="fa-solid ${visualTheme.art[1]} sd2-art-float sd2-art-float-one"></i>
            <i class="fa-solid ${visualTheme.art[2]} sd2-art-float sd2-art-float-two"></i>
            <div class="sd2-art-emblem"><i class="fa-solid ${visualTheme.art[0]}"></i></div>
          </div>` : ''}
        </article>

        <!-- SECTION 2 · CHỈ SỐ QUAN TRỌNG -->
        <section class="sd2-stats" aria-label="Thông tin quan trọng của môn học">
          <div class="sd2-stat">
            <span class="sd2-stat-icon sd2-tint-green"><i class="fa-solid fa-layer-group"></i></span>
            <div><strong>${chapters.length}</strong><span>Chương học</span></div>
          </div>
          <div class="sd2-stat">
            <span class="sd2-stat-icon sd2-tint-blue"><i class="fa-solid fa-book-open"></i></span>
            <div><strong>${lessonCount}</strong><span>Bài học</span></div>
          </div>
          <div class="sd2-stat">
            <span class="sd2-stat-icon sd2-tint-orange"><i class="fa-solid fa-star"></i></span>
            <div><strong>${credits}</strong><span>Tín chỉ</span></div>
          </div>
          <div class="sd2-stat">
            <span class="sd2-stat-icon sd2-tint-purple"><i class="fa-solid fa-calendar-days"></i></span>
            <div><strong>${safe(semester)}</strong><span>Học kỳ</span></div>
          </div>
        </section>

        <!-- SECTION 3 + 4 · NỘI DUNG CHÍNH & MỤC LỤC -->
        <div class="sd2-grid">
          <div class="sd2-main" id="subject-main-col-root">

            <section class="sd2-card" id="section-subject-intro">
              <header class="sd2-card-head">
                <span class="sd2-head-icon sd2-tint-green"><i class="fa-solid fa-book-open"></i></span>
                <div>
                  <h2 class="sd2-card-title">Giới thiệu môn học</h2>
                  <p class="sd2-card-sub">Tổng quan nội dung giảng dạy</p>
                </div>
              </header>
              ${canDisplayPublishedCanvas && introCanvas.length ? `<div class="student-intro-canvas ${introCanvasVariant}" style="min-height:${introCanvasHeight}px"><div class="student-intro-canvas-backdrop" aria-hidden="true"></div><div class="student-intro-canvas-course-label" aria-hidden="true"><span>${safe(code)}</span><strong>${safe(name)}</strong></div>${renderIntroCanvas()}</div>` : intro ? `
                <p class="sd2-intro-text">${safe(intro).replace(/\n/g, '<br>')}</p>
              ` : `
                <div class="sd2-empty"><i class="fa-solid fa-feather-pointed"></i>Admin chưa cập nhật nội dung giới thiệu chi tiết cho môn học này.</div>
              `}
            </section>

            <section class="sd2-infogrid" id="section-subject-cards" aria-label="Thông tin môn học">
              <div class="sd2-info sd2-tint-card-green">
                <span class="sd2-info-icon sd2-tint-green"><i class="fa-solid fa-bullseye"></i></span>
                <h3>${safe(cards.objectives?.title || 'Mục tiêu môn học')}</h3>
                <p>${safe(objectivesContent || 'Đang cập nhật mục tiêu môn học.')}</p>
              </div>
              <div class="sd2-info sd2-tint-card-blue">
                <span class="sd2-info-icon sd2-tint-blue"><i class="fa-solid fa-book-open"></i></span>
                <h3>${safe(cards.mainContent?.title || 'Nội dung chính')}</h3>
                <p>${safe(mainContentContent || 'Đang cập nhật nội dung chính.')}</p>
              </div>
              <div class="sd2-info sd2-tint-card-orange">
                <span class="sd2-info-icon sd2-tint-orange"><i class="fa-solid fa-users"></i></span>
                <h3>${safe(cards.targetAudience?.title || 'Đối tượng học')}</h3>
                <p>${safe(targetAudienceContent || 'Đang cập nhật đối tượng học.')}</p>
              </div>
              <div class="sd2-info sd2-tint-card-purple">
                <span class="sd2-info-icon sd2-tint-purple"><i class="fa-solid fa-shield-halved"></i></span>
                <h3>${safe(cards.learningFormat?.title || 'Hình thức học')}</h3>
                <p>${safe(learningFormatContent || 'Đang cập nhật hình thức học.')}</p>
              </div>
            </section>

            <!-- DYNAMIC LESSON / SELECTED CONTENT DISPLAY ZONE -->
            <div id="subject-selected-lesson-container" style="display:none;"></div>

            <section class="sd2-card sd2-instructor" id="section-subject-instructor">
              <div class="sd2-instructor-left">
                ${instructor.avatar ? `
                  <img src="${instructor.avatar}" alt="Avatar" class="sd2-instructor-avatar" referrerpolicy="no-referrer">
                ` : `
                  <div class="sd2-instructor-fallback"><i class="fa-solid fa-user"></i></div>
                `}
                <div>
                  <h3 class="sd2-instructor-name">${safe(instructor.name || 'Đang cập nhật tên giảng viên')}</h3>
                  <p class="sd2-instructor-role">${safe(instructor.role || 'Giảng viên phụ trách')}</p>
                </div>
              </div>
              ${instructor.email ? `
                <a href="mailto:${instructor.email}" class="sd2-instructor-contact">
                  <i class="fa-solid fa-envelope"></i>Liên hệ giảng viên<i class="fa-solid fa-chevron-right"></i>
                </a>
              ` : `
                <button class="sd2-instructor-contact" onclick="showToast('Giảng viên chưa để lại email liên hệ.', 'info')">
                  <i class="fa-solid fa-envelope"></i>Liên hệ giảng viên<i class="fa-solid fa-chevron-right"></i>
                </button>
              `}
            </section>

          </div>

          <!-- RIGHT TOC SIDEBAR -->
          <aside class="sd2-side">
            <div class="sd2-card sd2-toc">
              <header class="sd2-toc-head">
                <h2><i class="fa-solid fa-list-ul"></i>Mục lục môn học</h2>
                <button class="sd2-toc-toggle" onclick="window.toggleSubjectSidebarAllChapters()"><span id="toc-toggle-text">Thu gọn</span><i class="fa-solid fa-chevron-up" id="toc-all-arrow"></i></button>
              </header>

              <button class="sd2-toc-overview" id="toc-item-overview" onclick="window.selectSubjectOverview()">
                <i class="fa-solid fa-house"></i><span>Tổng quan</span><i class="fa-solid fa-chevron-right sd2-chev"></i>
              </button>

              <div class="sd2-toc-chapters" id="toc-chapters-wrapper">
                ${chapters.length > 0 ? chapters.map((chap, cIdx) => `
                  <div class="sd2-chap">
                    <button class="sd2-chap-head" onclick="window.toggleSubjectSidebarChapter('${chap.id || 'c_' + cIdx}')">
                      <span class="sd2-chap-idx">${String(cIdx + 1).padStart(2, '0')}</span>
                      <span class="sd2-chap-title">${safe(chap.title)}</span>
                      <i class="fa-solid fa-chevron-down text-xs toc-chap-arrow" id="arrow-${chap.id || 'c_' + cIdx}"></i>
                    </button>
                    <div class="toc-lesson-list sd2-lessons" id="lessons-${chap.id || 'c_' + cIdx}">
                      ${(chap.lessons || []).map((les, lIdx) => `
                        <button class="toc-lesson-item sd2-lesson" id="les-item-${les.id || 'l_' + cIdx + '_' + lIdx}" onclick="window.selectSubjectSidebarLesson('${chap.id || 'c_' + cIdx}', '${les.id || 'l_' + cIdx + '_' + lIdx}')">
                          <span class="sd2-lesson-dot"></span><span>${safe(les.title)}</span>
                        </button>
                      `).join('')}
                    </div>
                  </div>
                `).join('') : `
                  <div class="sd2-empty sd2-empty-sm">Chưa có danh mục chương bài.</div>
                `}
              </div>
            </div>
          </aside>
        </div>

        <!-- SECTION 5 · KHÁM PHÁ THÊM -->
        <section class="sd2-explore" aria-label="Chức năng mở rộng">
          <header class="sd2-section-head">
            <h2>Khám phá thêm</h2>
            <p>Công cụ học tập gắn liền với môn học này</p>
          </header>
          <div class="sd2-explore-grid">
            <button class="sd2-explore-card" onclick="openUserResourceViewer('${s.id}', 'lecture')">
              <span class="sd2-explore-icon sd2-tint-green"><i class="fa-solid fa-file-lines"></i></span>
              <span class="sd2-explore-name">Tài liệu học tập</span>
              <span class="sd2-explore-desc">Giáo trình, bài giảng & tài liệu tham khảo</span>
              <span class="sd2-explore-open">Mở <i class="fa-solid fa-arrow-right"></i></span>
            </button>
            <button class="sd2-explore-card" onclick="NavController.startSubjectExam('${s.id}')">
              <span class="sd2-explore-icon sd2-tint-purple"><i class="fa-solid fa-circle-question"></i></span>
              <span class="sd2-explore-name">Ngân hàng câu hỏi</span>
              <span class="sd2-explore-desc">Luyện tập với ngân hàng câu hỏi của môn học</span>
              <span class="sd2-explore-open">Mở <i class="fa-solid fa-arrow-right"></i></span>
            </button>
            <button class="sd2-explore-card" onclick="openUserResourceViewer('${s.id}', 'exam')">
              <span class="sd2-explore-icon sd2-tint-orange"><i class="fa-solid fa-file-circle-check"></i></span>
              <span class="sd2-explore-name">Đề thi</span>
              <span class="sd2-explore-desc">Kho đề thi các năm & đề minh họa</span>
              <span class="sd2-explore-open">Mở <i class="fa-solid fa-arrow-right"></i></span>
            </button>
            <button class="sd2-explore-card" onclick="NavController.startSubjectExam('${s.id}')">
              <span class="sd2-explore-icon sd2-tint-cyan"><i class="fa-solid fa-sliders"></i></span>
              <span class="sd2-explore-name">Ôn tập</span>
              <span class="sd2-explore-desc">Chế độ ôn tập trắc nghiệm nhanh theo chương</span>
              <span class="sd2-explore-open">Mở <i class="fa-solid fa-arrow-right"></i></span>
            </button>
          </div>
        </section>
      </div>
    `;

    this.navigateToPage('subject-detail');
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

    // 3. Navigate to Ontap page
    this.navigateToPage('ontap');
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

    // 1. Kiểm tra 2 Gmail Super Admin để ẩn/hiện nút Admin Sidebar
    const isSuperAdmin = this.currentUser && this.currentUser.email && SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(this.currentUser.email.toLowerCase());

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
        <button class="user-avatar-btn" onclick="NavController.toggleUserPopover()" title="${this.currentUser.name}">
          <img src="${this.currentUser.avatar || defaultAvatar}" alt="Avatar" class="user-avatar-img" referrerpolicy="no-referrer" onerror="window.handleAvatarError(this, '${safeName}')">
          <span class="user-avatar-name">${this.currentUser.name}</span>
          <i class="fa-solid fa-chevron-down text-xs" style="color:var(--text-muted);margin-left:4px;"></i>
        </button>

        <!-- User Dropdown Popover -->
        <div id="user-profile-popover" class="user-popover hidden">
          <div class="popover-header">
            <img src="${this.currentUser.avatar || defaultAvatar}" class="popover-avatar" referrerpolicy="no-referrer" onerror="window.handleAvatarError(this, '${safeName}')">
            <div class="popover-user-info">
              <div class="popover-user-name">${this.currentUser.name}</div>
              <div class="popover-user-email">${this.currentUser.email || ''}</div>
              <div class="mt-1">${roleBadgeHtml}</div>
            </div>
          </div>

          <div class="popover-divider"></div>

          <!-- Wallet & Quota -->
          <div class="popover-wallet-box">
            <div class="wallet-row">
              <span>💳 Quyền Hạn AI:</span>
              <span class="font-bold" style="color:var(--success);">${role === 'NEWBIE' ? 'Cơ bản (Cera Standard)' : 'Không giới hạn (VIP AI)'}</span>
            </div>
            <div class="wallet-row">
              <span>⚡ Mô Hình AI:</span>
              <span class="font-bold" style="color:var(--primary);">${role === 'NEWBIE' ? 'Standard Tier' : 'DeepSeek R1 / Claude 3.5'}</span>
            </div>
          </div>

          <div class="popover-divider"></div>

          <div class="popover-menu">
            ${isSuperAdmin ? `
              <button class="popover-menu-item" onclick="NavController.navigateToPage('admin')" style="color:#ef4444;font-weight:700;">
                <i class="fa-solid fa-shield-halved"></i> <span>🛡️ Quản trị Admin System</span>
              </button>
            ` : ''}
            <button class="popover-menu-item" onclick="NavController.openProfileSettingsModal()">
              <i class="fa-solid fa-id-card"></i> <span>Cài đặt & Hồ sơ</span>
            </button>
            <button class="popover-menu-item" onclick="NavController.navigateToPage('report')">
              <i class="fa-solid fa-bug"></i> <span>Báo cáo lỗi & Góp ý</span>
            </button>
          </div>

          <div class="popover-divider"></div>

          <div class="popover-footer">
            <button class="popover-signout-btn" onclick="NavController.handleSignOut()">
              <i class="fa-solid fa-right-from-bracket"></i> Đăng xuất
            </button>
          </div>
        </div>
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

  openProfileSettingsModal() {
    this.closeUserPopover();
    this.openEditAvatarModal();
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
  if (arrowEl) {
    arrowEl.className = isHidden ? 'fa-solid fa-chevron-down text-xs toc-chap-arrow' : 'fa-solid fa-chevron-right text-xs toc-chap-arrow';
  }
};

window.selectSubjectSidebarLesson = function(chapId, lesId) {
  document.querySelectorAll('.toc-lesson-item').forEach(el => el.classList.remove('active'));
  const targetItem = document.getElementById('les-item-' + lesId);
  if (targetItem) targetItem.classList.add('active');

  const details = window._activeSubjectDetails;
  const subjectId = details ? details.subjectId : 'GE4150';

  if (window.openStudyReaderPage) {
    window.openStudyReaderPage(subjectId, 'lecture', lesId);
  }
};

window.selectSubjectOverview = function() {
  document.querySelectorAll('.toc-lesson-item').forEach(el => el.classList.remove('active'));
  const container = document.getElementById('subject-selected-lesson-container');
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  });
  document.querySelectorAll('.toc-chap-arrow').forEach(el => {
    el.className = _tocAllExpanded ? 'fa-solid fa-chevron-down text-xs toc-chap-arrow' : 'fa-solid fa-chevron-right text-xs toc-chap-arrow';
  });
};
