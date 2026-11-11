/**
 * authModal.js — Giao diện đăng nhập/đăng ký FTECA + màn khoá xác minh OTP.
 * Modal 2 tab (Đăng nhập / Đăng ký) kèm nút Google; màn khoá toàn app nhập mã
 * 6 số gửi về email. Tự khoá khi tài khoản password chưa xác minh email.
 */
import { AuthModule } from './auth.js?v=20261111-authotp1';

let authModalEl = null;
let currentTab = 'login';
let linkPromptEl = null;
let gateEl = null;
let gateTimer = null;
let gateCooldown = 0;
let gateEmail = '';
let gateSending = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const GOOGLE_ICON = `
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>`;

// ─── MODAL ĐĂNG NHẬP / ĐĂNG KÝ ──────────────────────────────────────────────
export function openAuthModal(mode = 'login') {
  closeAuthModal();
  currentTab = mode === 'register' ? 'register' : 'login';

  authModalEl = document.createElement('div');
  authModalEl.className = 'auth-overlay open';
  authModalEl.setAttribute('role', 'dialog');
  authModalEl.setAttribute('aria-modal', 'true');
  authModalEl.innerHTML = `
    <div class="auth-card">
      <button class="auth-close" type="button" aria-label="Đóng">&times;</button>
      <div class="auth-brand">FTECA 24</div>
      <div class="auth-tabs" role="tablist">
        <button class="auth-tab" type="button" data-tab="login" role="tab">Đăng nhập</button>
        <button class="auth-tab" type="button" data-tab="register" role="tab">Đăng ký</button>
      </div>
      <div class="auth-error" id="auth-error" role="alert" hidden></div>
      <form class="auth-form" id="auth-form" novalidate>
        <div class="auth-field" data-register-only hidden>
          <label for="auth-name">Tên hiển thị</label>
          <input class="auth-input" id="auth-name" type="text" autocomplete="name" placeholder="VD: Nguyễn Văn A" maxlength="60">
        </div>
        <div class="auth-field">
          <label for="auth-email">Email</label>
          <input class="auth-input" id="auth-email" type="email" autocomplete="email" placeholder="ban@gmail.com" required>
        </div>
        <div class="auth-field">
          <label for="auth-password">Mật khẩu</label>
          <input class="auth-input" id="auth-password" type="password" autocomplete="current-password" placeholder="Tối thiểu 6 ký tự" required>
        </div>
        <div class="auth-field" data-register-only hidden>
          <label for="auth-confirm">Xác nhận mật khẩu</label>
          <input class="auth-input" id="auth-confirm" type="password" autocomplete="new-password" placeholder="Nhập lại mật khẩu">
        </div>
        <button class="auth-submit" id="auth-submit" type="submit">Đăng nhập</button>
        <button class="auth-link" id="auth-forgot" type="button" data-login-only>Quên mật khẩu?</button>
        <p class="auth-note" data-register-only hidden>Bạn sẽ nhận mã xác minh 6 số qua email để kích hoạt tài khoản.</p>
      </form>
      <div class="auth-divider"><span>hoặc</span></div>
      <button class="auth-google-btn" id="auth-google" type="button">${GOOGLE_ICON}<span>Tiếp tục với Google</span></button>
    </div>
  `;
  document.body.appendChild(authModalEl);

  authModalEl.addEventListener('click', (e) => { if (e.target === authModalEl) closeAuthModal(); });
  authModalEl.querySelector('.auth-close').addEventListener('click', closeAuthModal);
  authModalEl.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  authModalEl.querySelector('#auth-form').addEventListener('submit', handleFormSubmit);
  authModalEl.querySelector('#auth-forgot').addEventListener('click', handleForgotPassword);
  authModalEl.querySelector('#auth-google').addEventListener('click', () => {
    closeAuthModal();
    AuthModule.signInWithGoogle();
  });

  switchTab(currentTab);
  setTimeout(() => authModalEl?.querySelector('#auth-email')?.focus(), 60);
}

export function closeAuthModal() {
  if (authModalEl) {
    authModalEl.remove();
    authModalEl = null;
  }
  linkPromptEl = null;
}

function switchTab(mode) {
  currentTab = mode === 'register' ? 'register' : 'login';
  if (!authModalEl) return;
  const isRegister = currentTab === 'register';
  authModalEl.querySelectorAll('.auth-tab').forEach(btn => {
    const active = btn.dataset.tab === currentTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  authModalEl.querySelectorAll('[data-register-only]').forEach(el => { el.hidden = !isRegister; });
  authModalEl.querySelectorAll('[data-login-only]').forEach(el => { el.hidden = isRegister; });
  const submit = authModalEl.querySelector('#auth-submit');
  if (submit) submit.textContent = isRegister ? 'Tạo tài khoản' : 'Đăng nhập';
  const pw = authModalEl.querySelector('#auth-password');
  if (pw) pw.setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
  clearLinkPrompt();
  showAuthError('');
}

// Email đã có tài khoản Google: mời liên kết mật khẩu ngay trong form đăng ký
// để sau này đăng nhập bằng email + mật khẩu trên mọi thiết bị.
function showLinkPrompt(email, password) {
  clearLinkPrompt();
  const form = authModalEl?.querySelector('#auth-form');
  if (!form) return;
  linkPromptEl = document.createElement('div');
  linkPromptEl.className = 'auth-link-prompt';
  linkPromptEl.innerHTML = `
    <p>Email này đã có tài khoản Google. Liên kết mật khẩu để lần sau đăng nhập bằng email + mật khẩu trên mọi thiết bị.</p>
    <button type="button" id="auth-link-btn">Đăng nhập Google &amp; liên kết mật khẩu</button>
  `;
  form.appendChild(linkPromptEl);
  linkPromptEl.querySelector('#auth-link-btn').addEventListener('click', async () => {
    const btn = linkPromptEl?.querySelector('#auth-link-btn');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Đang liên kết…';
    const result = await AuthModule.linkPasswordWithGoogle(email, password);
    if (!linkPromptEl) return;
    btn.disabled = false;
    btn.textContent = 'Đăng nhập Google & liên kết mật khẩu';
    if (result.ok) {
      closeAuthModal();
      if (window.showToast) window.showToast('Đã liên kết mật khẩu! Lần sau bạn có thể đăng nhập bằng email + mật khẩu.', 'success');
    } else {
      showAuthError(result.message || 'Liên kết thất bại.');
    }
  });
}

function clearLinkPrompt() {
  if (linkPromptEl) {
    linkPromptEl.remove();
    linkPromptEl = null;
  }
}

function showAuthError(message) {
  const el = authModalEl?.querySelector('#auth-error');
  if (!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

function setFormBusy(busy) {
  const submit = authModalEl?.querySelector('#auth-submit');
  const google = authModalEl?.querySelector('#auth-google');
  if (submit) {
    submit.disabled = busy;
    submit.dataset.label = submit.dataset.label || submit.textContent;
    submit.textContent = busy ? 'Đang xử lý…' : submit.dataset.label;
  }
  if (google) google.disabled = busy;
}

async function handleFormSubmit(e) {
  e.preventDefault();
  if (!authModalEl) return;
  const name = authModalEl.querySelector('#auth-name').value;
  const email = authModalEl.querySelector('#auth-email').value;
  const password = authModalEl.querySelector('#auth-password').value;
  const confirm = authModalEl.querySelector('#auth-confirm').value;
  showAuthError('');
  setFormBusy(true);
  try {
    const result = currentTab === 'register'
      ? await AuthModule.registerWithEmail(name, email, password, confirm)
      : await AuthModule.signInWithEmail(email, password);
    if (!result.ok) {
      showAuthError(result.message || 'Thao tác thất bại.');
      if (currentTab === 'register' && result.reason === 'auth/email-already-in-use') {
        showLinkPrompt(email.trim().toLowerCase(), password);
      }
      return;
    }
    closeAuthModal();
    if (result.needsVerification && window.showToast) {
      window.showToast('Đã tạo tài khoản. Nhập mã xác minh gửi về email để tiếp tục.', 'info');
    }
  } finally {
    setFormBusy(false);
  }
}

async function handleForgotPassword() {
  if (!authModalEl) return;
  const email = authModalEl.querySelector('#auth-email').value.trim();
  if (!email) {
    showAuthError('Nhập email của bạn vào ô Email rồi bấm Quên mật khẩu.');
    authModalEl.querySelector('#auth-email').focus();
    return;
  }
  setFormBusy(true);
  try {
    const result = await AuthModule.resetPassword(email);
    if (result.ok) {
      showAuthError('');
      if (window.showToast) window.showToast('Nếu email tồn tại, link đặt lại mật khẩu đã được gửi. Kiểm tra hộp thư (cả mục Spam).', 'success');
    } else {
      showAuthError(result.message || 'Không gửi được email đặt lại mật khẩu.');
    }
  } finally {
    setFormBusy(false);
  }
}

// ─── MÀN KHOÁ XÁC MINH OTP ──────────────────────────────────────────────────
function needsVerification(user) {
  return Boolean(user && user.email && user.provider === 'password' && user.emailVerified === false);
}

export function showOtpGate(user) {
  gateEmail = user.email;
  if (gateEl) {
    const emailEl = gateEl.querySelector('#otp-email');
    if (emailEl) emailEl.textContent = gateEmail;
    return;
  }
  gateEl = document.createElement('div');
  gateEl.className = 'otp-gate-overlay';
  gateEl.setAttribute('role', 'dialog');
  gateEl.setAttribute('aria-modal', 'true');
  gateEl.innerHTML = `
    <div class="otp-card">
      <div class="otp-icon"><i class="fa-solid fa-envelope-circle-check"></i></div>
      <h2 class="otp-title">Xác minh email của bạn</h2>
      <p class="otp-desc">Chúng tôi gửi mã 6 số tới<br><strong id="otp-email"></strong></p>
      <input class="otp-input" id="otp-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" aria-label="Mã xác minh 6 số">
      <div class="otp-message" id="otp-message" role="alert"></div>
      <button class="otp-verify" id="otp-verify" type="button">Xác nhận</button>
      <button class="otp-resend" id="otp-resend" type="button">Gửi lại mã</button>
      <div class="otp-footer">
        <span>Sai email?</span>
        <button class="otp-signout" id="otp-signout" type="button">Đăng xuất để đăng ký lại</button>
      </div>
    </div>
  `;
  document.body.appendChild(gateEl);
  gateEl.querySelector('#otp-email').textContent = gateEmail;

  const codeInput = gateEl.querySelector('#otp-code');
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    if (codeInput.value.length === 6) gateVerify();
  });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') gateVerify(); });
  gateEl.querySelector('#otp-verify').addEventListener('click', gateVerify);
  gateEl.querySelector('#otp-resend').addEventListener('click', () => gateSendCode(false));
  gateEl.querySelector('#otp-signout').addEventListener('click', async () => {
    hideOtpGate();
    await AuthModule.signOut();
    openAuthModal('register');
  });

  setTimeout(() => codeInput.focus(), 80);
  gateSendCode(true);
}

export function hideOtpGate() {
  if (gateTimer) { clearInterval(gateTimer); gateTimer = null; }
  gateCooldown = 0;
  if (gateEl) {
    gateEl.remove();
    gateEl = null;
  }
}

function setGateMessage(text, kind = '') {
  const el = gateEl?.querySelector('#otp-message');
  if (!el) return;
  el.textContent = text || '';
  el.className = `otp-message ${kind}`.trim();
}

function startCooldown(seconds) {
  gateCooldown = Math.max(0, Math.ceil(seconds));
  const btn = gateEl?.querySelector('#otp-resend');
  if (!btn) return;
  const tick = () => {
    if (!gateEl) { clearInterval(gateTimer); gateTimer = null; return; }
    if (gateCooldown > 0) {
      btn.disabled = true;
      btn.textContent = `Gửi lại mã (${gateCooldown}s)`;
      gateCooldown -= 1;
    } else {
      btn.disabled = false;
      btn.textContent = 'Gửi lại mã';
      clearInterval(gateTimer);
      gateTimer = null;
    }
  };
  if (gateTimer) clearInterval(gateTimer);
  tick();
  gateTimer = setInterval(tick, 1000);
}

async function gateSendCode(auto) {
  if (!gateEl || gateSending) return;
  gateSending = true;
  const resendBtn = gateEl.querySelector('#otp-resend');
  if (resendBtn) { resendBtn.disabled = true; resendBtn.textContent = 'Đang gửi…'; }
  if (!auto) setGateMessage('');
  try {
    const result = await AuthModule.sendEmailOtp();
    if (!gateEl) return;
    if (result.ok) {
      if (result.payload?.alreadyVerified) {
        await AuthModule.completeEmailVerification();
        hideOtpGate();
        return;
      }
      setGateMessage(auto ? 'Đã gửi mã về email của bạn. Kiểm tra cả mục Spam.' : 'Đã gửi lại mã mới.', 'ok');
      startCooldown(result.payload?.cooldownSeconds || 60);
    } else {
      const reason = result.payload?.reason || '';
      if (reason === 'cooldown') {
        startCooldown(result.payload?.retryAfter || 60);
        setGateMessage('Bạn vừa gửi mã. Vui lòng đợi rồi thử lại.', '');
      } else if (reason === 'rate-limited') {
        setGateMessage('Đã vượt số lần gửi mã trong giờ. Vui lòng thử lại sau.', 'err');
        if (resendBtn) { resendBtn.disabled = true; resendBtn.textContent = 'Gửi lại mã (sau 1 giờ)'; }
      } else if (reason === 'mail-not-configured' || reason === 'missing-firebase-service-account') {
        setGateMessage('Hệ thống chưa cấu hình kênh gửi mail. Liên hệ quản trị viên để được hỗ trợ.', 'err');
        if (resendBtn) { resendBtn.disabled = false; resendBtn.textContent = 'Thử gửi lại'; }
      } else {
        setGateMessage('Không gửi được mã. Kiểm tra mạng rồi thử lại.', 'err');
        if (resendBtn) { resendBtn.disabled = false; resendBtn.textContent = 'Thử gửi lại'; }
      }
    }
  } finally {
    gateSending = false;
  }
}

async function gateVerify() {
  if (!gateEl) return;
  const code = gateEl.querySelector('#otp-code').value.trim();
  if (!/^\d{6}$/.test(code)) {
    setGateMessage('Mã gồm đúng 6 chữ số.', 'err');
    return;
  }
  const verifyBtn = gateEl.querySelector('#otp-verify');
  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Đang xác minh…';
  setGateMessage('');
  try {
    const result = await AuthModule.verifyEmailOtp(code);
    if (result.ok && result.payload?.verified) {
      hideOtpGate();
      if (window.showToast) window.showToast('Xác minh email thành công! Chào mừng bạn đến FTECA 24.', 'success');
      return;
    }
    if (!gateEl) return;
    const reason = result.payload?.reason || '';
    const messages = {
      'code-mismatch': `Mã không đúng. Còn ${result.payload?.attemptsLeft ?? 0} lần thử.`,
      'code-expired': 'Mã đã hết hạn. Hãy gửi lại mã mới.',
      'too-many-attempts': 'Bạn nhập sai quá 5 lần. Hãy gửi mã mới.',
      'no-code': 'Chưa có mã nào. Hãy bấm Gửi lại mã.',
      'invalid-code-format': 'Mã gồm đúng 6 chữ số.'
    };
    setGateMessage(messages[reason] || 'Xác minh thất bại. Thử lại.', 'err');
    if (reason === 'code-expired' || reason === 'too-many-attempts' || reason === 'no-code') {
      const resendBtn = gateEl.querySelector('#otp-resend');
      if (resendBtn && gateCooldown <= 0) { resendBtn.disabled = false; resendBtn.textContent = 'Gửi lại mã'; }
    }
  } finally {
    if (gateEl) {
      const btn = gateEl.querySelector('#otp-verify');
      btn.disabled = false;
      btn.textContent = 'Xác nhận';
    }
  }
}

// Tự khoá/mở theo trạng thái phiên. Đăng ký listener ngay khi module nạp.
AuthModule.onAuthStateChanged((user) => {
  if (needsVerification(user)) {
    closeAuthModal();
    showOtpGate(user);
  } else {
    hideOtpGate();
  }
});

// Chặn sớm từ phiên đã lưu: Firebase init có thể trễ ~900ms, không để app
// dùng được trong khoảng trống đó khi tài khoản password chưa xác minh.
try {
  const savedSession = JSON.parse(localStorage.getItem('lien_google_user') || 'null');
  if (needsVerification(savedSession)) showOtpGate(savedSession);
} catch (_error) { /* phiên hỏng thì để Firebase xử lý */ }

window.AuthModal = {
  open: openAuthModal,
  close: closeAuthModal,
  openLogin: () => openAuthModal('login'),
  openRegister: () => openAuthModal('register')
};