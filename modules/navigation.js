/**
 * navigation.js — Application Navigation & UI Layout Controller
 * Manages Sidebar, Top Header Search, Page Navigation, Subject Detail, and Auth Popover
 */

import { SUBJECTS_REGISTRY, getAllSubjects, getSubjectById, KNOWLEDGE_BLOCKS } from './subjects.js';
import { DB } from './db.js';
import { AuthModule, SUPER_ADMIN_EMAILS, getUserRole } from './auth.js';
import { ArticlesModule } from './articles.js';

export const NavController = {
  activePage: 'home',
  currentUser: null,

  init() {
    AuthModule.init();
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

    if (pageId === 'about') {
      setTimeout(() => {
        if (window.ArticlesModule) {
          window.ArticlesModule.renderArticlesView();
        } else {
          ArticlesModule.renderArticlesView();
        }
      }, 20);
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

    const activeNav = document.getElementById(snavId) || document.getElementById(`snav-${pageId}`);
    if (activeNav) activeNav.classList.add('active');

    // 2. Hide all page containers and show selected
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

  // ─── SUBJECT DETAIL PAGE ──────────────────────────────────────────────────
  openSubjectDetail(subjectId) {
    const s = getSubjectById(subjectId);
    if (!s) return;

    this.closeSearchDropdown();

    const block = KNOWLEDGE_BLOCKS[s.blockId] || { icon: '📚', name: 'Đại cương' };
    const detailContainer = document.getElementById('page-subject-detail');

    if (!detailContainer) return;

    const allResources = DB.getResources(s.id);
    const infoResources = allResources.filter(r => r.type === 'info');
    const lectureResources = allResources.filter(r => r.type === 'lecture');
    const examResources = allResources.filter(r => r.type === 'exam');
    const quizCount = DB.getBankBySubject(s.id).length;

    detailContainer.innerHTML = `
      <div class="subject-detail-hero">
        <button class="btn btn-secondary btn-sm" onclick="NavController.navigateToPage('ontap')" style="margin-bottom:16px;">
          <i class="fa-solid fa-arrow-left"></i> Quay lại
        </button>
        <div class="flex items-center gap-3 margin-bottom-8">
          <span class="subject-detail-badge">${s.code}</span>
          <span class="badge badge-primary">${block.icon} ${block.name}</span>
          <span class="badge badge-subtle">${s.credits} Tín chỉ</span>
          <span class="badge badge-subtle">Học kỳ ${s.semester}</span>
        </div>
        <h1 class="subject-detail-title">${s.name}</h1>
        <p class="text-secondary text-sm" style="max-width:720px;margin-top:8px;">
          Chương trình ôn tập chuẩn hóa thuộc khung đào tạo Ngành Công nghệ Thực phẩm. Chọn các danh mục bên dưới để bắt đầu ôn luyện.
        </p>
      </div>

      <div class="subject-detail-grid">
        <!-- Card 1: Thông tin môn học -->
        <div class="subject-card card ${infoResources.length ? 'active-card' : ''}" onclick="openUserResourceViewer('${s.id}', 'info')">
          <div class="subject-card-icon" style="background:rgba(79, 70, 229, 0.1);color:var(--primary);">ℹ️</div>
          <div class="subject-card-content">
            <h3>Thông tin môn học</h3>
            <p class="text-secondary text-sm">Đề cương chi tiết, giảng viên đảm nhận, mục tiêu học phần và tài liệu tham khảo.</p>
            <div class="subject-card-status">
              ${infoResources.length ? `<span class="badge badge-success font-bold"><i class="fa-solid fa-check"></i> ${infoResources.length} Đề cương & Thông tin</span>` : '<span>⏳ Admin đang cập nhật</span>'}
            </div>
          </div>
        </div>

        <!-- Card 2: Bài giảng ôn tập -->
        <div class="subject-card card ${lectureResources.length ? 'active-card' : ''}" onclick="openUserResourceViewer('${s.id}', 'lecture')">
          <div class="subject-card-icon" style="background:rgba(16, 185, 129, 0.1);color:var(--success);">📖</div>
          <div class="subject-card-content">
            <h3>Bài giảng ôn tập</h3>
            <p class="text-secondary text-sm">Slide bài giảng tổng hợp, tóm tắt lý thuyết trọng tâm từng chương và sơ đồ tư duy.</p>
            <div class="subject-card-status">
              ${lectureResources.length ? `<span class="badge badge-success font-bold"><i class="fa-solid fa-check"></i> ${lectureResources.length} Slide & Bài giảng</span>` : '<span>⏳ Admin đang cập nhật</span>'}
            </div>
          </div>
        </div>

        <!-- Card 3: Đề thi các năm -->
        <div class="subject-card card ${examResources.length ? 'active-card' : ''}" onclick="openUserResourceViewer('${s.id}', 'exam')">
          <div class="subject-card-icon" style="background:rgba(245, 158, 11, 0.1);color:var(--warning);">📝</div>
          <div class="subject-card-content">
            <h3>Đề thi các năm</h3>
            <p class="text-secondary text-sm">Tuyển tập đề thi giữa kỳ, cuối kỳ chính thức các khóa trước có đáp án chi tiết.</p>
            <div class="subject-card-status">
              ${examResources.length ? `<span class="badge badge-warning font-bold"><i class="fa-solid fa-check"></i> ${examResources.length} Bộ đề thi cũ</span>` : '<span>⏳ Admin đang cập nhật đề thi</span>'}
            </div>
          </div>
        </div>

        <!-- Card 4: Kiểm tra ôn tập (ACTIVE FUNCTIONALITY) -->
        <div class="subject-card card active-card" onclick="NavController.startSubjectExam('${s.id}')">
          <div class="subject-card-icon" style="background:rgba(0, 220, 130, 0.15);color:#00dc82;">🎯</div>
          <div class="subject-card-content">
            <h3>Kiểm tra ôn tập</h3>
            <p class="text-secondary text-sm">Thi thử, luyện tập trắc nghiệm và ngân hàng câu hỏi AI chuẩn hóa theo độ khó.</p>
            <div class="subject-card-action">
              <button class="btn btn-success btn-sm">
                <i class="fa-solid fa-play"></i> Bắt đầu Ôn Tập (${quizCount} câu)
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.navigateToPage('subject-detail');
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
      const defaultAvatar = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%2300b96b"/><stop offset="100%" stop-color="%23008f4f"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(%23g)"/><text x="50%" y="54%" font-family="system-ui,-apple-system,sans-serif" font-size="56" font-weight="800" fill="%23ffffff" dominant-baseline="middle" text-anchor="middle">${(safeName.charAt(0) || 'U').toUpperCase()}</text></svg>`;

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
            <button class="popover-menu-item" onclick="NavController.openEditAvatarModal()">
              <i class="fa-solid fa-pen-to-square"></i> <span>Đổi tên & Avatar</span>
            </button>
            <button class="popover-menu-item" onclick="NavController.navigateToPage('upgrade')">
              <i class="fa-solid fa-wallet"></i> <span>Ví & Gói dịch vụ</span>
            </button>
            <button class="popover-menu-item" onclick="toggleTheme()">
              <i class="fa-solid fa-circle-half-stroke"></i> <span>Đổi Giao diện</span>
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
