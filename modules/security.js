/**
 * security.js — Cài đặt bảo mật cục bộ của FTECA 24.
 * Mã đăng nhập chỉ lưu dạng hash + salt; quyền camera/mic được áp ở tầng API
 * để mọi tính năng trong app đều đi qua cùng một cổng kiểm soát.
 */

const SETTINGS_KEY = 'lien_security_settings_v1';
const LOCK_ID = 'fteca-lock-screen';
const PASSCODE_MODAL_ID = 'fteca-passcode-modal';
const DEFAULTS = {
  passcodeEnabled: false,
  salt: '',
  hash: '',
  shareChatHistory: false,
  mediaAllowed: true
};
const PASSCODE_PATTERN = /^[\p{L}\p{N}]{4,32}$/u;
const activeStreams = new Set();
let lockMounted = false;
let mediaGuardInstalled = false;

function readJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writableStore() {
  try {
    const parsed = readJson(localStorage.getItem(SETTINGS_KEY));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

export function getSecurityIdentity() {
  for (const key of ['lien_google_user', 'lien_user_session']) {
    const user = readJson(localStorage.getItem(key));
    if (user && (user.email || user.uid)) {
      return String(user.email || user.uid).trim().toLowerCase();
    }
  }
  return 'guest';
}

export function getSecuritySettings() {
  const mine = writableStore()[getSecurityIdentity()];
  return { ...DEFAULTS, ...(mine || {}) };
}

export function updateSecuritySetting(patch) {
  const store = writableStore();
  const identity = getSecurityIdentity();
  const next = { ...DEFAULTS, ...(store[identity] || {}), ...patch };
  store[identity] = next;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn('[Security] Không lưu được cài đặt bảo mật:', error);
    if (window.showToast) window.showToast('Không lưu được cài đặt bảo mật trên thiết bị này.', 'error');
  }
  return next;
}

/* ─── Mã đăng nhập ─── */

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(bytes);
}

function fallbackHash(payload) {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < payload.length; i += 1) {
    const code = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x85ebca6b) >>> 0;
  }
  return `fnv:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

async function hashPasscode(mode, code, salt) {
  const payload = `${salt}:${code}`;
  if (mode !== 'fnv' && window.crypto?.subtle && window.TextEncoder) {
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return `sha256:${bytesToHex(new Uint8Array(digest))}`;
  }
  return fallbackHash(payload);
}

export function validatePasscodeInput(code) {
  const value = String(code || '');
  if (value.length < 4) return 'Mã cần ít nhất 4 ký tự.';
  if (!PASSCODE_PATTERN.test(value)) return 'Mã chỉ gồm chữ và số, tối đa 32 ký tự.';
  return '';
}

export function hasPasscode() {
  const settings = getSecuritySettings();
  return !!(settings.passcodeEnabled && settings.hash);
}

export async function enablePasscode(code) {
  const salt = randomSalt();
  const hash = await hashPasscode('sha256', String(code), salt);
  updateSecuritySetting({ passcodeEnabled: true, salt, hash });
}

export function disablePasscode() {
  updateSecuritySetting({ passcodeEnabled: false, salt: '', hash: '' });
}

export async function verifyPasscodeInput(code) {
  const settings = getSecuritySettings();
  if (!settings.passcodeEnabled || !settings.hash) return false;
  const mode = settings.hash.split(':')[0];
  const hash = await hashPasscode(mode, String(code || ''), settings.salt);
  return hash === settings.hash;
}

/* ─── Camera & micro ─── */

export function isMediaAllowed() {
  return getSecuritySettings().mediaAllowed !== false;
}

export function stopActiveMedia() {
  activeStreams.forEach((stream) => {
    stream.getTracks().forEach((track) => {
      try { track.stop(); } catch (error) { /* stream đã đóng */ }
    });
  });
  activeStreams.clear();
}

function mediaBlockedError(feature) {
  const message = 'Camera và micro đang bị tắt trong Quyền riêng tư.';
  if (window.showToast) window.showToast(message, 'warning');
  console.info('[Security] Đã chặn truy cập media:', feature);
  return new DOMException(message, 'NotAllowedError');
}

export function installMediaGuard() {
  if (mediaGuardInstalled) return;
  mediaGuardInstalled = true;

  const devices = navigator.mediaDevices;
  if (devices && typeof devices.getUserMedia === 'function') {
    const original = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async function guardedGetUserMedia(...args) {
      if (!isMediaAllowed()) throw mediaBlockedError('getUserMedia');
      const stream = await original(...args);
      activeStreams.add(stream);
      stream.getTracks().forEach((track) => {
        track.addEventListener?.('ended', () => {
          if (stream.getTracks().every((item) => item.readyState === 'ended')) activeStreams.delete(stream);
        });
      });
      return stream;
    };
  }

  ['SpeechRecognition', 'webkitSpeechRecognition'].forEach((name) => {
    const Original = window[name];
    if (typeof Original !== 'function') return;
    const Guarded = function (...args) {
      const instance = new Original(...args);
      const start = instance.start.bind(instance);
      instance.start = (...startArgs) => {
        if (!isMediaAllowed()) throw mediaBlockedError('speech');
        return start(...startArgs);
      };
      return instance;
    };
    Guarded.prototype = Original.prototype;
    window[name] = Guarded;
  });
}

/* ─── Màn khóa khi mở ứng dụng ─── */

function buildLockScreen() {
  const overlay = document.createElement('div');
  overlay.id = LOCK_ID;
  overlay.className = 'fteca-lock';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Mở khóa FTECA');
  overlay.innerHTML = `
    <div class="fteca-lock-card">
      <div class="fteca-lock-icon" aria-hidden="true"><i class="fa-solid fa-lock"></i></div>
      <h2>FTECA đã khóa</h2>
      <p>Nhập mã đăng nhập để tiếp tục sử dụng ứng dụng.</p>
      <form class="fteca-lock-form" novalidate>
        <input type="password" class="fteca-lock-input" maxlength="32" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Nhập mã đăng nhập" aria-label="Mã đăng nhập">
        <p class="fteca-lock-error" role="alert"></p>
        <button type="submit" class="fteca-lock-submit">Mở khóa</button>
      </form>
      <button type="button" class="fteca-lock-forgot">Quên mã? Đăng xuất</button>
    </div>`;
  return overlay;
}

function revealApp(overlay) {
  overlay.classList.add('is-leaving');
  document.documentElement.classList.remove('fteca-lock-pending');
  setTimeout(() => overlay.remove(), 240);
}

function bindLockScreen(overlay) {
  const form = overlay.querySelector('.fteca-lock-form');
  const input = overlay.querySelector('.fteca-lock-input');
  const submit = overlay.querySelector('.fteca-lock-submit');
  const error = overlay.querySelector('.fteca-lock-error');
  const forgot = overlay.querySelector('.fteca-lock-forgot');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = input.value.trim();
    if (!code) {
      error.textContent = 'Vui lòng nhập mã đăng nhập.';
      return;
    }
    submit.disabled = true;
    error.textContent = '';
    const ok = await verifyPasscodeInput(code);
    submit.disabled = false;
    if (!ok) {
      error.textContent = 'Mã không đúng. Vui lòng thử lại.';
      overlay.querySelector('.fteca-lock-card').classList.add('is-shaking');
      setTimeout(() => overlay.querySelector('.fteca-lock-card')?.classList.remove('is-shaking'), 400);
      input.select();
      return;
    }
    revealApp(overlay);
  });

  forgot.addEventListener('click', async () => {
    forgot.disabled = true;
    try {
      await window.NavController?.handleSignOut?.();
    } catch (error) {
      console.warn('[Security] Không đăng xuất được:', error);
    }
    revealApp(overlay);
  });

  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  setTimeout(() => input.focus(), 60);
}

export function mountLockScreen() {
  if (lockMounted) return true;
  lockMounted = true;
  const overlay = document.getElementById(LOCK_ID) || buildLockScreen();
  if (!overlay.isConnected) document.body.appendChild(overlay);
  document.documentElement.classList.add('fteca-lock-pending');
  bindLockScreen(overlay);
  return true;
}

/* ─── Modal tạo / đổi / tắt mã ─── */

const DIALOG_COPY = {
  create: {
    title: 'Tạo mã đăng nhập',
    note: 'Mã gồm chữ hoặc số, ít nhất 4 ký tự. Bạn sẽ nhập mã này mỗi lần mở ứng dụng.',
    submit: 'Lưu mã'
  },
  change: {
    title: 'Đổi mã đăng nhập',
    note: 'Nhập mã hiện tại rồi đặt mã mới (ít nhất 4 ký tự).',
    submit: 'Lưu mã mới'
  },
  disable: {
    title: 'Tắt mật khẩu đăng nhập',
    note: 'Nhập mã hiện tại để xác nhận tắt khóa mở ứng dụng.',
    submit: 'Tắt mật khẩu'
  }
};

function fieldHtml(name, label, placeholder) {
  return `<label class="fteca-field"><span>${label}</span>
    <input type="password" data-field="${name}" maxlength="32" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${placeholder}">
  </label>`;
}

export function openPasscodeDialog(mode = 'create') {
  const copy = DIALOG_COPY[mode] || DIALOG_COPY.create;
  return new Promise((resolve) => {
    let modal = document.getElementById(PASSCODE_MODAL_ID);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = PASSCODE_MODAL_ID;
      modal.className = 'fteca-passcode-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="fteca-passcode-card" role="dialog" aria-modal="true" aria-label="${copy.title}">
        <div class="fteca-passcode-head">
          <span class="fteca-passcode-icon" aria-hidden="true"><i class="fa-solid fa-lock"></i></span>
          <div>
            <h3>${copy.title}</h3>
            <p>${copy.note}</p>
          </div>
        </div>
        <form class="fteca-passcode-form" novalidate>
          ${mode === 'create' ? '' : fieldHtml('current', 'Mã hiện tại', 'Nhập mã đang dùng')}
          ${mode === 'disable' ? '' : fieldHtml('next', 'Mã mới', 'Ít nhất 4 ký tự')}
          ${mode === 'disable' ? '' : fieldHtml('confirm', 'Nhập lại mã mới', 'Nhập lại mã mới')}
          <p class="fteca-passcode-error" role="alert"></p>
          <div class="fteca-passcode-actions">
            <button type="button" class="fteca-passcode-cancel">Hủy</button>
            <button type="submit" class="fteca-passcode-save">${copy.submit}</button>
          </div>
        </form>
      </div>`;

    const form = modal.querySelector('.fteca-passcode-form');
    const error = modal.querySelector('.fteca-passcode-error');
    const save = modal.querySelector('.fteca-passcode-save');
    const cancel = modal.querySelector('.fteca-passcode-cancel');
    const card = modal.querySelector('.fteca-passcode-card');

    let settled = false;
    const close = (changed) => {
      if (settled) return;
      settled = true;
      modal.classList.remove('open');
      document.removeEventListener('keydown', onKeyDown);
      setTimeout(() => { modal.innerHTML = ''; }, 200);
      resolve(changed);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close(false);
    };

    modal.onclick = (event) => {
      if (event.target === modal) close(false);
    };
    document.addEventListener('keydown', onKeyDown);
    cancel.addEventListener('click', () => close(false));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.textContent = '';
      const value = (name) => form.querySelector(`[data-field="${name}"]`)?.value.trim() || '';

      if (mode !== 'create' && !(await verifyPasscodeInput(value('current')))) {
        error.textContent = 'Mã hiện tại không đúng.';
        card.classList.add('is-shaking');
        setTimeout(() => card.classList.remove('is-shaking'), 400);
        return;
      }
      if (mode !== 'disable') {
        const invalid = validatePasscodeInput(value('next'));
        if (invalid) {
          error.textContent = invalid;
          return;
        }
        if (value('next') !== value('confirm')) {
          error.textContent = 'Mã nhập lại không khớp.';
          return;
        }
      }

      save.disabled = true;
      save.textContent = 'Đang lưu...';
      try {
        if (mode === 'disable') {
          disablePasscode();
          window.showToast?.('Đã tắt mật khẩu đăng nhập.', 'info');
        } else {
          await enablePasscode(value('next'));
          window.showToast?.(
            mode === 'create'
              ? 'Đã bật mật khẩu đăng nhập. Mã sẽ được hỏi ở lần mở ứng dụng tiếp theo.'
              : 'Đã đổi mã đăng nhập.',
            'success'
          );
        }
        close(true);
      } catch (err) {
        console.error('[Security] Không lưu được mã đăng nhập:', err);
        error.textContent = 'Không lưu được mã. Vui lòng thử lại.';
        save.disabled = false;
        save.textContent = copy.submit;
      }
    });

    modal.classList.add('open');
    setTimeout(() => modal.querySelector('input')?.focus(), 60);
  });
}

export function initSecurity() {
  installMediaGuard();
  if (hasPasscode() && document.body) {
    mountLockScreen();
  } else {
    document.documentElement.classList.remove('fteca-lock-pending');
  }
  window.FtecaSecurity = {
    getSettings: getSecuritySettings,
    updateSetting: updateSecuritySetting,
    isMediaAllowed,
    stopActiveMedia,
    verifyPasscode: verifyPasscodeInput,
    hasPasscode
  };
}
