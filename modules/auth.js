/**
 * auth.js — FTECA Authentication Module
 * Hai hình thức: Google (popup/redirect) và Email/Mật khẩu (FTECA account).
 * Tài khoản email phải xác minh bằng mã OTP gửi về email trước khi dùng app.
 * Không có form giả; báo lỗi tường minh khi thất bại.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  linkWithCredential,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// Firebase Web Config
const firebaseConfig = {
  apiKey: "AIzaSyCcwxsxREppsp3KbCDnQ4ixvz3VC5lxqM4",
  authDomain: "fifth-chalice-507108-c5.firebaseapp.com",
  projectId: "fifth-chalice-507108-c5",
  storageBucket: "fifth-chalice-507108-c5.appspot.com",
  messagingSenderId: "643168500906",
  appId: "1:643168500906:web:a1b2c3d4e5f6"
};

let app = null;
let auth = null;
let googleProvider = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.addScope('profile');
  googleProvider.addScope('email');
  // Luôn mở bảng chọn tài khoản. Nếu thiếu, Google tự dùng tài khoản đang
  // đăng nhập sẵn trên máy và người dùng không thể thêm tài khoản mới.
  googleProvider.setCustomParameters({ prompt: 'select_account' });
} catch (e) {
  console.error('Lỗi khởi tạo Firebase Auth:', e);
}

import { DB } from './db.js';
import { pullUserRolesFromServer } from './sync.js';
import { upsertUserToFirestore, fetchMyRoleFromFirestore } from './firestoreUsers.js?v=20261109-role2';

export const SUPER_ADMIN_EMAILS = [
  'nguyenphuongtinh557@gmail.com',
  'macnghich@gmail.com'
];

export function getAdminOverrideEmails() {
  const values = [];
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    try {
      const fromStorage = JSON.parse(localStorage.getItem('fteca_admin_override_emails') || '[]');
      if (Array.isArray(fromStorage)) values.push(...fromStorage);
    } catch (_error) {
      // Ignore invalid persisted data.
    }

    const fromQuery = new URLSearchParams(window.location?.search || '').get('adminEmail');
    if (fromQuery) values.push(fromQuery);
  }
  return values
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

export function getActiveAdminEmails() {
  return [...new Set([
    ...SUPER_ADMIN_EMAILS.map(email => String(email || '').trim().toLowerCase()),
    ...getAdminOverrideEmails()
  ])].filter(Boolean);
}

export function isAdminEmail(email) {
  if (!email) return false;
  return getActiveAdminEmails().includes(String(email).trim().toLowerCase());
}

if (typeof window !== 'undefined') {
  window.setFtecaAdminOverride = function(email) {
    if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) return false;
    const values = getAdminOverrideEmails();
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return false;
    const merged = [...new Set([...values, normalized])];
    localStorage.setItem('fteca_admin_override_emails', JSON.stringify(merged));
    return true;
  };
}

export function getUserRole(email) {
  if (!email) return 'NEWBIE';
  const cleanEmail = email.trim().toLowerCase();
  if (isAdminEmail(cleanEmail)) {
    return 'ADMIN';
  }
  const premiumList = DB.getPremiumEmails().map(e => (e || '').toLowerCase());
  if (premiumList.includes(cleanEmail)) {
    return 'PREMIUM';
  }
  return 'NEWBIE';
}

/**
 * Đồng bộ role của chính người đang đăng nhập từ Firestore vào máy này.
 * Firestore là nguồn quyền thật; file GitHub user_roles.json đã ngừng ghi và
 * có thể còn giữ PREMIUM cũ, nên kết quả Firestore phải được áp sau cùng.
 * @returns {Promise<boolean>} true nếu danh sách premium cục bộ vừa thay đổi.
 */
export async function syncCurrentUserRoleFromFirestore(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return false;
  const result = await fetchMyRoleFromFirestore();
  if (!result.ok) return false;
  const premiumList = DB.getPremiumEmails().map(item => String(item || '').trim().toLowerCase());
  const hasPremium = premiumList.includes(cleanEmail);
  if (result.role === 'PREMIUM' && !hasPremium) {
    await DB.setPremiumEmails([...premiumList, cleanEmail], true);
    return true;
  }
  if (result.role === 'NEWBIE' && hasPremium) {
    await DB.setPremiumEmails(premiumList.filter(item => item !== cleanEmail), true);
    return true;
  }
  return false;
}

let authListeners = [];

function shouldUseRedirectFlow() {
  const userAgent = navigator.userAgent || '';
  // Chrome Android mở được popup; popup giữ trang gốc nên không mất kết quả
  // khi trình duyệt chặn lưu trạng thái giữa site và firebaseapp.com.
  const embeddedOrIos = /iPhone|iPad|iPod|FBAN|FBAV|Instagram|Line\/|Zalo|Messenger|; wv\)/i.test(userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  return embeddedOrIos || standalone;
}

function isMissingAuthStateError(error) {
  const errorText = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return errorText.includes('missing initial state')
    || errorText.includes('sessionstorage')
    || errorText.includes('storage-partitioned')
    || error?.code === 'auth/web-storage-unsupported';
}

function isRedirectFallbackError(error) {
  if (error?.code === 'auth/popup-closed-by-user') return false;
  return error?.code === 'auth/popup-blocked'
    || error?.code === 'auth/operation-not-supported-in-this-environment'
    || isMissingAuthStateError(error);
}

const REDIRECT_PENDING_KEY = 'fteca_auth_redirect_pending';

function markRedirectPending() {
  try { sessionStorage.setItem(REDIRECT_PENDING_KEY, '1'); } catch (_error) { /* ignore */ }
}

export function clearRedirectPending() {
  try { sessionStorage.removeItem(REDIRECT_PENDING_KEY); } catch (_error) { /* ignore */ }
}

export function hasPendingRedirect() {
  try { return sessionStorage.getItem(REDIRECT_PENDING_KEY) === '1'; } catch (_error) { return false; }
}

// Dựng object phiên từ Firebase user, dùng chung cho Google lẫn Email/Mật khẩu.
// Provider suy từ providerData thay vì hardcode 'google.com' để tài khoản FTECA
// (password) được nhận diện đúng và chịu cổng xác minh email.
function buildSessionUser(firebaseUser, { fallbackAvatar = null } = {}) {
  const uid = firebaseUser.uid;
  const customAvatar = localStorage.getItem(`lien_custom_avatar_${uid}`);
  const customName = localStorage.getItem(`lien_custom_name_${uid}`);
  const customCover = localStorage.getItem(`lien_profile_cover_${uid}`);
  const customCoverX = localStorage.getItem(`lien_profile_cover_x_${uid}`);
  const customCoverY = localStorage.getItem(`lien_profile_cover_y_${uid}`);
  const providers = (firebaseUser.providerData || []).map(p => p.providerId).filter(Boolean);
  const primaryProvider = providers.includes('google.com') ? 'google.com' : (providers[0] || 'password');
  const email = firebaseUser.email || '';
  return {
    uid,
    name: customName || firebaseUser.displayName || email.split('@')[0],
    email,
    avatar: customAvatar || firebaseUser.photoURL || fallbackAvatar
      || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
    emailVerified: Boolean(firebaseUser.emailVerified),
    provider: primaryProvider,
    providers,
    signedInAt: new Date().toISOString(),
    profileCover: customCover || '',
    profileCoverPositionX: customCoverX === null ? 50 : Number(customCoverX),
    profileCoverPositionY: customCoverY === null ? 50 : Number(customCoverY)
  };
}

// Gọi endpoint OTP với Bearer token của chính người đang đăng nhập. Email nhận
// mã lấy từ token phía server, không truyền từ client nên không thể gửi mã hộ.
async function otpRequest(body) {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken().catch(() => '') : '';
  try {
    const response = await fetch('/api/auth-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok && payload?.ok === true, status: response.status, payload };
  } catch (error) {
    return { ok: false, status: 0, payload: { ok: false, reason: String(error?.message || error) } };
  }
}

export const AuthModule = {
  user: null,

  async init() {
    // Kết quả redirect Google phải được xử lý trước mọi bước đồng bộ dữ liệu.
    // Nếu để fetch roles chậm chặn trước, người dùng quay về vẫn thấy màn hình
    // chưa đăng nhập dù phiên Google đã hợp lệ.
    const returningFromRedirect = hasPendingRedirect();
    if (auth) {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (persistenceError) {
        console.warn('[Auth] Không thể dùng bộ nhớ đăng nhập lâu dài:', persistenceError);
        try {
          await setPersistence(auth, browserSessionPersistence);
        } catch (sessionPersistenceError) {
          console.warn('[Auth] Không thể dùng sessionStorage, chuyển sang bộ nhớ tạm:', sessionPersistenceError);
          await setPersistence(auth, inMemoryPersistence);
        }
      }

      onAuthStateChanged(auth, (firebaseUser) => {
        if (!firebaseUser) return;
        const realUser = buildSessionUser(firebaseUser);
        this.setUserSession(realUser, false).catch((error) => {
          console.warn('[Auth] Không thể lưu phiên đăng nhập:', error);
        });
      });

      try {
        await getRedirectResult(auth);
      } catch (error) {
        console.warn('[Auth] Không thể khôi phục kết quả đăng nhập chuyển hướng:', error);
        if (isMissingAuthStateError(error) && window.showToast) {
          window.showToast('Trình duyệt không giữ được phiên đăng nhập Google. Vui lòng thử lại bằng Chrome hoặc Safari chính thức.', 'error');
        }
      } finally {
        clearRedirectPending();
      }
    }

    // 1. Đồng bộ danh sách User Roles mới nhất từ Server Cloud / Firestore
    try {
      const serverRoles = await pullUserRolesFromServer();
      if (serverRoles && typeof serverRoles === 'object') {
        DB.mergeUserRolesFromServer(serverRoles);
      }
    } catch (e) {
      console.warn('[Auth] Không thể pull User Roles từ Server:', e);
    }

    this.restoreSession();
    if (!this.user && returningFromRedirect && !auth?.currentUser && window.showToast) {
      window.showToast('Chưa nhận được phiên đăng nhập Google. Nếu đã chọn tài khoản, hãy bấm đăng nhập lại.', 'warning');
    }
    if (this.user?.email) {
      await syncCurrentUserRoleFromFirestore(this.user.email).catch(() => false);
      this.user.role = getUserRole(this.user.email);
      upsertUserToFirestore(this.user).catch((err) => console.warn('[Auth] Upsert restored session error:', err));
    }
  },

  async syncCurrentUserRoleFromFirestore(email) {
    return syncCurrentUserRoleFromFirestore(email);
  },

  restoreSession() {
    try {
      const saved = localStorage.getItem('lien_google_user');
      if (saved) {
        this.user = JSON.parse(saved);
        if (this.user && this.user.email) {          this.user.role = getUserRole(this.user.email);
        }
      }
    } catch (e) {
      console.error('Lỗi khôi phục phiên đăng nhập:', e);
      this.user = null;
    }
  },

  // ─── STRICT REAL GOOGLE SIGN-IN ──────────────────────────────────────────
  async signInWithGoogle() {
    if (this.user) {
      if (window.showToast) window.showToast(`Bạn đã đăng nhập bằng Google (${this.user.email})`, 'info');
      return;
    }

    if (!auth || !googleProvider) {
      const errMsg = 'Firebase Authentication chưa được khởi tạo thành công.';
      if (window.showToast) window.showToast(errMsg, 'error');
      console.error(errMsg);
      return;
    }

    try {
      if (window.showToast) window.showToast('Đang kết nối đến Google Account...', 'info');

      if (shouldUseRedirectFlow()) {
        if (window.showToast) window.showToast('Đang chuyển sang đăng nhập Google an toàn cho thiết bị này...', 'info');
        markRedirectPending();
        await signInWithRedirect(auth, googleProvider);
        return;
      }

      // Trigger standard Google OAuth 2.0 Popup
      const result = await signInWithPopup(auth, googleProvider);
      const realUser = buildSessionUser(result.user);
      await this.setUserSession(realUser, true);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      if (isRedirectFallbackError(error)) {
        try {
          if (window.showToast) window.showToast('Popup Google bị giới hạn trên trình duyệt này, đang chuyển sang đăng nhập an toàn...', 'info');
          markRedirectPending();
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          console.error('Google Sign-In Redirect Error:', redirectError);
          clearRedirectPending();
          this.handleAuthError(redirectError);
          return;
        }
      }
      clearRedirectPending();
      this.handleAuthError(error);
    }
  },

  handleAuthError(error) {
    let message = 'Đăng nhập Google thất bại.';
    const errStr = (error.message || '') + (error.code || '');

    if (error.code === 'auth/popup-closed-by-user') {
      message = 'Bạn đã đóng cửa sổ đăng nhập Google.';
      if (window.showToast) window.showToast(message, 'info');
      return;
    } else if (error.code === 'auth/popup-blocked') {
      message = 'Trình duyệt đã chặn cửa sổ Popup. Vui lòng cho phép popup để đăng nhập Google.';
    } else if (error.code === 'auth/unauthorized-domain') {
      const host = window.location.hostname;
      const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
      message = isIpAddress
        ? `Google chặn đăng nhập từ địa chỉ IP nội bộ (${host}). Hãy mở bằng localhost trên máy tính, hoặc dùng tên miền HTTPS và khai báo tại Firebase → Authentication → Settings → Authorized domains.`
        : `Tên miền (${host}) chưa được khai báo tại Firebase → Authentication → Settings → Authorized domains.`;
    } else if (errStr.includes('identitytoolkit')) {
      message = `Dự án Google Cloud chưa bật Identity Toolkit API (Firebase Authentication). Vui lòng vào Google Cloud Console bấm ENABLE API.`;
    } else if (error.code === 'auth/cancelled-popup-request') {
      message = 'Yêu cầu đăng nhập đã bị hủy.';
      return;
    } else if (error.code === 'auth/account-exists-with-different-credential') {
      message = 'Email này đã có tài khoản FTECA (email + mật khẩu). Hãy chuyển sang tab Đăng nhập và dùng email + mật khẩu, hoặc bấm Quên mật khẩu nếu cần.';
    } else if (error.message) {
      message = `Lỗi Google Auth (${error.code || 'UNKNOWN'}): ${error.message}`;
    }

    if (window.showToast) {
      window.showToast(message, 'error');
    } else {
      alert(message);
    }
  },

  // ─── EMAIL / PASSWORD (FTECA ACCOUNT) ────────────────────────────────────
  emailAuthErrorMessage(error) {
    const code = error?.code || '';
    switch (code) {
      case 'auth/email-already-in-use':
        return 'Email này đã được đăng ký. Hãy chuyển sang Đăng nhập, hoặc dùng Google nếu trước đây bạn vào bằng Google.';
      case 'auth/invalid-email':
        return 'Email không hợp lệ.';
      case 'auth/weak-password':
        return 'Mật khẩu quá yếu (tối thiểu 6 ký tự).';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Email hoặc mật khẩu không đúng.';
      case 'auth/too-many-requests':
        return 'Quá nhiều lần thử. Vui lòng đợi một lát rồi thử lại.';
      case 'auth/network-request-failed':
        return 'Lỗi mạng. Kiểm tra kết nối rồi thử lại.';
      case 'auth/operation-not-allowed':
        return 'Phương thức đăng nhập email/mật khẩu chưa được bật trên hệ thống.';
      case 'auth/provider-already-linked':
        return 'Tài khoản này đã liên kết mật khẩu.';
      case 'auth/credential-already-in-use':
        return 'Thông tin này đã gắn với một tài khoản khác.';
      case 'auth/requires-recent-login':
        return 'Phiên đăng nhập đã cũ. Hãy đăng xuất rồi đăng nhập lại trước khi đổi mật khẩu.';
      default:
        return error?.message || 'Thao tác thất bại. Vui lòng thử lại.';
    }
  },

  async registerWithEmail(name, email, password, confirmPassword) {
    if (!auth) return { ok: false, reason: 'auth-not-ready', message: 'Firebase Authentication chưa khởi tạo.' };
    const cleanEmail = String(email || '').trim().toLowerCase();
    const displayName = String(name || '').trim();
    if (!displayName) return { ok: false, reason: 'missing-name', message: 'Vui lòng nhập tên hiển thị.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { ok: false, reason: 'invalid-email', message: 'Email không hợp lệ.' };
    if (String(password || '').length < 6) return { ok: false, reason: 'weak-password', message: 'Mật khẩu tối thiểu 6 ký tự.' };
    if (password !== confirmPassword) return { ok: false, reason: 'password-mismatch', message: 'Mật khẩu xác nhận không khớp.' };

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      try { await updateProfile(cred.user, { displayName }); } catch (_error) { /* tên sẽ fallback email */ }
      const realUser = buildSessionUser(cred.user);
      realUser.name = displayName;
      await this.setUserSession(realUser, false);
      return { ok: true, needsVerification: !cred.user.emailVerified };
    } catch (error) {
      console.error('[Auth] Register error:', error);
      return { ok: false, reason: error.code || 'register-failed', message: this.emailAuthErrorMessage(error) };
    }
  },

  async signInWithEmail(email, password) {
    if (!auth) return { ok: false, reason: 'auth-not-ready', message: 'Firebase Authentication chưa khởi tạo.' };
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password) return { ok: false, reason: 'missing-credentials', message: 'Nhập email và mật khẩu.' };
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const realUser = buildSessionUser(cred.user);
      await this.setUserSession(realUser, true);
      return { ok: true, needsVerification: !cred.user.emailVerified };
    } catch (error) {
      console.error('[Auth] Email sign-in error:', error);
      return { ok: false, reason: error.code || 'signin-failed', message: this.emailAuthErrorMessage(error) };
    }
  },

  async resetPassword(email) {
    if (!auth) return { ok: false, message: 'Firebase Authentication chưa khởi tạo.' };
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { ok: false, message: 'Email không hợp lệ.' };
    try {
      await sendPasswordResetEmail(auth, cleanEmail, { url: window.location.origin, handleCodeInApp: false });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: this.emailAuthErrorMessage(error) };
    }
  },

  // Gửi mã OTP về email của chính tài khoản đang đăng nhập (server lấy email từ token).
  async sendEmailOtp() {
    return otpRequest({ action: 'send' });
  },

  async verifyEmailOtp(code) {
    const result = await otpRequest({ action: 'verify', code });
    if (result.ok && result.payload?.verified) {
      await this.completeEmailVerification();
    }
    return result;
  },

  // Sau khi server bật emailVerified, reload user + refresh token để claim
  // email_verified=true lan toả (cổng 403 phía API tự mở), rồi dựng lại phiên.
  async completeEmailVerification() {
    if (!auth?.currentUser) return;
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const realUser = buildSessionUser(auth.currentUser);
      await this.setUserSession(realUser, false);
    } catch (error) {
      console.warn('[Auth] Không thể hoàn tất xác minh email:', error);
    }
  },

  // Cho tài khoản đã đăng nhập bằng Google thêm mật khẩu: buộc chọn đúng
  // tài khoản Google trùng email rồi liên kết credential email/mật khẩu.
  async linkPasswordWithGoogle(email, password) {
    if (!auth) return { ok: false, message: 'Firebase Authentication chưa khởi tạo.' };
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { ok: false, message: 'Email không hợp lệ.' };
    if (String(password || '').length < 6) return { ok: false, message: 'Mật khẩu tối thiểu 6 ký tự.' };
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const googleEmail = String(result.user.email || '').trim().toLowerCase();
      if (googleEmail !== cleanEmail) {
        await firebaseSignOut(auth).catch(() => {});
        return { ok: false, message: `Tài khoản Google vừa chọn (${googleEmail}) không khớp email ${cleanEmail}. Hãy thử lại và chọn đúng tài khoản.` };
      }
      const credential = EmailAuthProvider.credential(cleanEmail, password);
      await linkWithCredential(result.user, credential);
      const realUser = buildSessionUser(auth.currentUser);
      await this.setUserSession(realUser, false);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: this.emailAuthErrorMessage(error) };
    }
  },

  async setUserSession(user, showNotification = true) {
    let registryResult = { synced: true };
    if (user && user.email) {
      user.email = user.email.trim().toLowerCase();
      user.role = getUserRole(user.email);
      const uidKey = user.uid || user.email;
      const joinedKey = `lien_joined_at_${uidKey}`;
      try {
        user.joinedAt = user.joinedAt || localStorage.getItem(joinedKey) || new Date().toISOString();
        localStorage.setItem(joinedKey, user.joinedAt);
      } catch (error) {
        user.joinedAt = user.joinedAt || new Date().toISOString();
        console.warn('[Auth] Không thể lưu mốc tham gia:', error);
      }
      try {
        user.bio = user.bio || localStorage.getItem(`lien_profile_bio_${uidKey}`) || 'Học không chỉ để biết, mà để làm được.';
      } catch (_error) {
        user.bio = user.bio || 'Học không chỉ để biết, mà để làm được.';
      }
    }

    // Ghi phiên đăng nhập trước khi đồng bộ danh sách học viên. Trên điện thoại
    // localStorage có thể đầy (QuotaExceededError) hoặc mạng lỗi; những lỗi đó
    // không được phép làm hỏng một lần đăng nhập Google đã thành công.
    this.user = user;
    try {
      localStorage.setItem('lien_google_user', JSON.stringify(user));
      localStorage.setItem('lien_user_session', JSON.stringify({
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        profileCover: user.profileCover || '',
        profileCoverPositionX: user.profileCoverPositionX ?? 50,
        profileCoverPositionY: user.profileCoverPositionY ?? 50,
        joinedAt: user.joinedAt,
        bio: user.bio,
        role: user ? user.role : 'NEWBIE'
      }));
    } catch (error) {
      console.warn('[Auth] Không thể lưu phiên đăng nhập vào trình duyệt:', error);
      if (window.showToast) {
        window.showToast('Đã đăng nhập nhưng bộ nhớ trình duyệt đã đầy; phiên sẽ mất khi tải lại trang. Hãy xoá bớt dữ liệu trang.', 'warning');
      }
    }

    if (window.NavController) {
      window.NavController.currentUser = user;
      window.NavController.renderUserAuthZone();
    }

    if (showNotification && window.showToast) {
      const roleBadge = user.role === 'ADMIN' ? '🛡️ ADMIN' : (user.role === 'PREMIUM' ? '💎 PREMIUM' : '🌱 NEWBIE');
      window.showToast(`Xin chào ${user.name}! [${roleBadge}] Đã đăng nhập FTECA (${user.email}).`, 'success');
    }

    this.notifyListeners(user);

    if (user && user.email) {
      try {
        const roleChanged = await syncCurrentUserRoleFromFirestore(user.email);
        if (roleChanged) {
          user.role = getUserRole(user.email);
          this.user = user;
          try {
            localStorage.setItem('lien_google_user', JSON.stringify(user));
          } catch (_error) {}
          if (window.NavController) {
            window.NavController.currentUser = user;
            window.NavController.renderUserAuthZone();
          }
          if (showNotification && user.role === 'PREMIUM' && window.showToast) {
            window.showToast('💎 Quyền PREMIUM của bạn đã được kích hoạt.', 'success');
          }
        }
      } catch (error) {
        console.warn('[Auth] Không thể đồng bộ role từ Firestore:', error);
      }
    }

    if (user && user.email) {
      try {
        registryResult = await DB.saveUserToRegistry(user);
        // Đồng bộ thông tin học viên lên Firestore Cloud real-time
        upsertUserToFirestore(user).catch((err) => console.warn('[Auth] Upsert user error:', err));
      } catch (error) {
        registryResult = { synced: false };
        console.warn('[Auth] Không thể đồng bộ danh sách học viên:', error);
      }
      if (registryResult && registryResult.synced === false && window.showToast) {
        window.showToast('Đã đăng nhập trên trình duyệt này, nhưng chưa đồng bộ được danh sách học viên lên cloud.', 'warning');
      }
    }
  },

  async getIdToken() {
    if (!auth?.currentUser) return '';
    try { return await auth.currentUser.getIdToken(); } catch { return ''; }
  },

  async updateCustomProfile(name, avatar) {
    if (!this.user) return { synced: false, reason: 'not-signed-in' };

    const uidKey = this.user.uid || this.user.email;
    if (name) {
      this.user.name = name;
      try {
        localStorage.setItem(`lien_custom_name_${uidKey}`, name);
      } catch (error) {
        console.warn('[Auth] Không thể lưu tên hiển thị vào trình duyệt:', error);
      }
    }
    if (avatar) {
      this.user.avatar = avatar;
      try {
        localStorage.setItem(`lien_custom_avatar_${uidKey}`, avatar);
      } catch (error) {
        console.warn('[Auth] Không thể lưu ảnh đại diện vào trình duyệt:', error);
      }
    }

    await this.setUserSession(this.user, false);

    if (!this.user?.email) return { synced: false, reason: 'no-email' };

    DB.saveUserToRegistry(this.user).catch((error) => {
      console.warn('[Auth] Không thể cập nhật danh sách học viên:', error);
    });

    try {
      const result = await upsertUserToFirestore(this.user);
      return { synced: Boolean(result?.ok), reason: result?.reason || '' };
    } catch (error) {
      console.warn('[Auth] Không thể đồng bộ hồ sơ lên Firestore:', error);
      return { synced: false, reason: error.message || 'cloud-sync-failed' };
    }
  },

  async signOut() {
    this.user = null;
    localStorage.removeItem('lien_google_user');
    localStorage.removeItem('lien_user_session');

    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch (e) {
        console.warn('Lỗi Firebase SignOut:', e);
      }
    }

    if (window.NavController) {
      window.NavController.currentUser = null;
      window.NavController.renderUserAuthZone();
    }

    if (window.showToast) {
      window.showToast('Đã đăng xuất khỏi tài khoản FTECA.', 'info');
    }

    this.notifyListeners(null);
  },

  onAuthStateChanged(callback) {
    authListeners.push(callback);
    if (this.user) callback(this.user);
  },

  notifyListeners(user) {
    authListeners.forEach(cb => cb(user));
  }
};
