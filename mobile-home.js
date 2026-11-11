/* Trang chủ mobile FTECA 24 — hiệu ứng UI + overlay tìm kiếm (không logic tính năng mới) */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobileQuery = window.matchMedia('(max-width: 860px)');
  const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

  const homeSection = document.getElementById('page-home');
  const mobileRoot = document.querySelector('.home-mobile');
  if (!homeSection || !mobileRoot) return;

  const isHomeVisible = () => !homeSection.classList.contains('hidden') && mobileQuery.matches;

  /* ── Overlay tìm kiếm: mở thanh tìm kiếm thật của app trên đầu màn hình ── */
  const layout = document.querySelector('.app-layout');
  const searchContainer = document.querySelector('.search-bar-container');
  const searchInput = document.getElementById('subject-search-input');
  const searchDropdown = document.getElementById('search-results-dropdown');
  let searchCloseBtn = null;

  function isSearchOpen() {
    return !!layout && layout.classList.contains('mh-search-open');
  }
  function openSearch() {
    if (!layout) return;
    if (!searchCloseBtn && searchContainer) {
      searchCloseBtn = document.createElement('button');
      searchCloseBtn.type = 'button';
      searchCloseBtn.className = 'mh-search-close';
      searchCloseBtn.setAttribute('aria-label', 'Đóng tìm kiếm');
      searchCloseBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      searchCloseBtn.addEventListener('click', closeSearch);
      searchContainer.appendChild(searchCloseBtn);
    }
    layout.classList.add('mh-search-open');
    window.setTimeout(() => searchInput?.focus(), 80);
  }
  function closeSearch() {
    layout?.classList.remove('mh-search-open');
    searchInput?.blur();
    searchDropdown?.classList.add('hidden');
  }
  window.mhToggleSearch = () => (isSearchOpen() ? closeSearch() : openSearch());

  searchDropdown?.addEventListener('click', () => window.setTimeout(closeSearch, 40));
  window.addEventListener('hashchange', closeSearch);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isSearchOpen()) closeSearch();
  });

  /* ── Nút tài khoản dùng chung (header trang chủ + không gian học tập):
        chưa đăng nhập hiện icon user, đã đăng nhập hiện avatar ── */

  function getAccountUser() {
    return window.NavController?.currentUser || window.AuthModule?.user || null;
  }

  function renderAccountButton(btn) {
    const user = getAccountUser();
    const loggedIn = !!(user && user.email);
    btn.classList.toggle('mh-avatar-guest', !loggedIn);
    btn.classList.toggle('mh-avatar-user', loggedIn);

    if (!loggedIn) {
      btn.setAttribute('aria-label', 'Đăng nhập FTECA');
      btn.title = 'Đăng nhập FTECA';
      if (!btn.querySelector('.mh-account-icon')) {
        btn.innerHTML = '<i class="fa-solid fa-user mh-account-icon" aria-hidden="true"></i>';
      }
      return;
    }

    const displayName = user.name || user.email.split('@')[0];
    const initial = (String(displayName).trim().charAt(0) || 'U').toUpperCase();
    btn.setAttribute('aria-label', `Mở hồ sơ ${displayName}`);
    btn.title = displayName;
    btn.textContent = '';
    if (user.avatar) {
      const img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { btn.textContent = initial; }, { once: true });
      img.src = user.avatar;
      btn.appendChild(img);
    } else {
      btn.textContent = initial;
    }
  }

  window.mhSyncAccountButtons = function () {
    document.querySelectorAll('[data-mh-account]').forEach(renderAccountButton);
  };

  window.mhOpenAccount = function () {
    const user = getAccountUser();
    if (user && user.email) {
      window.NavController.openProfileCenter();
    } else if (window.AuthModal?.openLogin) {
      window.AuthModal.openLogin();
    } else {
      window.NavController.handleGoogleSignIn();
    }
  };

  window.mhFocusStudySearch = function () {
    const input = document.getElementById('study-space-search');
    if (!input) return;
    /* Focus ngay để bàn phím hiện tức thì, cuộn sau — chờ cuộn xong mới focus
       khiến nút tìm kiếm có cảm giác trễ gần 1/4 giây trên điện thoại. */
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.mhSyncAccountButtons();
  window.addEventListener('load', () => {
    window.mhSyncAccountButtons();
    window.AuthModule?.onAuthStateChanged?.(window.mhSyncAccountButtons);
  });

  /* ── Hiệu ứng (chỉ chạy khi người dùng không bật reduced-motion) ── */
  if (!reduceMotion) {
    function playEntrance() {
      if (!isHomeVisible()) return;

      const heroEls = mobileRoot.querySelectorAll('.mh-hero .mh-in');
      heroEls.forEach((el, i) => {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(16px)' },
            { opacity: 1, transform: 'none' }
          ],
          { duration: 560, delay: 90 + i * 75, easing: SPRING, fill: 'backwards' }
        );
      });

      const belowFold = mobileRoot.querySelectorAll('.mh-section.mh-in');
      if (!('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          entry.target.animate(
            [
              { opacity: 0, transform: 'translateY(16px)' },
              { opacity: 1, transform: 'none' }
            ],
            { duration: 520, easing: SPRING, fill: 'backwards' }
          );
        });
      }, { threshold: 0.12 });
      belowFold.forEach((el) => io.observe(el));
    }

    new MutationObserver(() => {
      if (isHomeVisible()) playEntrance();
    }).observe(homeSection, { attributes: true, attributeFilter: ['class'] });

    playEntrance();

    /* Nhấn xuống: thu nhỏ nhẹ, nhả ra: bật lại kiểu lò xo */
    mobileRoot.querySelectorAll(
      '.mh-btn, .mh-tile, .mh-icon-btn, .mh-avatar-btn, .mh-menu-btn'
    ).forEach((el) => {
      let pressed = false;
      el.addEventListener('pointerdown', () => {
        pressed = true;
        el.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(0.965)' }],
          { duration: 90, easing: 'ease-out', fill: 'forwards' }
        );
      });
      const release = () => {
        if (!pressed) return;
        pressed = false;
        el.animate(
          [{ transform: 'scale(0.965)' }, { transform: 'scale(1)' }],
          { duration: 280, easing: SPRING, fill: 'forwards' }
        );
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    });
  }
})();
