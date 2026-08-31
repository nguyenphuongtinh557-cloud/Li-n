/**
 * auth.js — Real Google Authentication Module
 * Strict, authentic Google Sign-In via Firebase Web Auth & Google Identity Services (GIS).
 * No fake fallback forms. Explicit error reporting on failure.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

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
} catch (e) {
  console.error('Lỗi khởi tạo Firebase Auth:', e);
}

import { DB } from './db.js';
import { pullUserRolesFromServer } from './sync.js?v=20260831';

export const SUPER_ADMIN_EMAILS = [
  'nguyenphuongtinh557@gmail.com',
  'macnghich@gmail.com'
];

export function getUserRole(email) {
  if (!email) return 'NEWBIE';
  const cleanEmail = email.trim().toLowerCase();
  if (SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(cleanEmail)) {
    return 'ADMIN';
  }
  const premiumList = DB.getPremiumEmails().map(e => (e || '').toLowerCase());
  if (premiumList.includes(cleanEmail)) {
    return 'PREMIUM';
  }
  return 'NEWBIE';
}

let authListeners = [];

export const AuthModule = {
  user: null,

  async init() {
    // 1. Đồng bộ danh sách User Roles mới nhất từ Server Cloud
    try {
      const serverRoles = await pullUserRolesFromServer();
      if (serverRoles && Array.isArray(serverRoles.premiumEmails)) {
        DB.setPremiumEmails(serverRoles.premiumEmails, true);
      }
    } catch (e) {
      console.warn('[Auth] Không thể pull User Roles từ Server:', e);
    }

    this.restoreSession();

    // Listen for Firebase Auth state changes
    if (auth) {
      onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          const customAvatar = localStorage.getItem(`lien_custom_avatar_${firebaseUser.uid}`);
          const customName = localStorage.getItem(`lien_custom_name_${firebaseUser.uid}`);

          const realUser = {
            uid: firebaseUser.uid,
            name: customName || firebaseUser.displayName || firebaseUser.email.split('@')[0],
            email: firebaseUser.email,
            avatar: customAvatar || firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(firebaseUser.email)}`,
            emailVerified: firebaseUser.emailVerified,
            provider: 'google.com',
            signedInAt: new Date().toISOString()
          };
          this.setUserSession(realUser, false);
        }
      });
    }
  },

  restoreSession() {
    try {
      const saved = localStorage.getItem('lien_google_user');
      if (saved) {
        this.user = JSON.parse(saved);
        if (this.user && this.user.email) {
          this.user.role = getUserRole(this.user.email);
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

      // Trigger standard Google OAuth 2.0 Popup
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const realUser = {
        uid: user.uid,
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        avatar: user.photoURL,
        emailVerified: user.emailVerified,
        provider: 'google.com',
        signedInAt: new Date().toISOString()
      };

      this.setUserSession(realUser, true);
    } catch (error) {
      console.error('Google Sign-In Error:', error);
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
      message = `Tên miền (${window.location.hostname}) chưa được thêm vào Authorized Domains trong Google/Firebase Console.`;
    } else if (errStr.includes('identitytoolkit')) {
      message = `Dự án Google Cloud chưa bật Identity Toolkit API (Firebase Authentication). Vui lòng vào Google Cloud Console bấm ENABLE API.`;
    } else if (error.code === 'auth/cancelled-popup-request') {
      message = 'Yêu cầu đăng nhập đã bị hủy.';
      return;
    } else if (error.message) {
      message = `Lỗi Google Auth (${error.code || 'UNKNOWN'}): ${error.message}`;
    }

    if (window.showToast) {
      window.showToast(message, 'error');
    } else {
      alert(message);
    }
  },

  setUserSession(user, showNotification = true) {
    if (user && user.email) {
      user.role = getUserRole(user.email);
      DB.saveUserToRegistry(user);
    }
    this.user = user;
    localStorage.setItem('lien_google_user', JSON.stringify(user));
    localStorage.setItem('lien_user_session', JSON.stringify({
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user ? user.role : 'NEWBIE'
    }));

    if (window.NavController) {
      window.NavController.currentUser = user;
      window.NavController.renderUserAuthZone();
    }

    if (showNotification && window.showToast) {
      const roleBadge = user.role === 'ADMIN' ? '🛡️ ADMIN' : (user.role === 'PREMIUM' ? '💎 PREMIUM' : '🌱 NEWBIE');
      window.showToast(`Xin chào ${user.name}! [${roleBadge}] Đã đăng nhập tài khoản Google (${user.email}).`, 'success');
    }

    this.notifyListeners(user);
  },

  updateCustomProfile(name, avatar) {
    if (!this.user) return;

    const uidKey = this.user.uid || this.user.email;
    if (name) {
      this.user.name = name;
      localStorage.setItem(`lien_custom_name_${uidKey}`, name);
    }
    if (avatar) {
      this.user.avatar = avatar;
      localStorage.setItem(`lien_custom_avatar_${uidKey}`, avatar);
    }

    this.setUserSession(this.user, false);
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
      window.showToast('Đã đăng xuất khỏi tài khoản Google.', 'info');
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
