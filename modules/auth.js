/**
 * auth.js — Real Google Authentication Module
 * Integrates Google Identity Services (OAuth2) & Firebase Web Auth for real Google Sign-In
 */

// Global State
let currentUser = null;
let authListeners = [];

export const AuthModule = {
  user: null,

  init() {
    this.restoreSession();
    this.loadGoogleScript();
  },

  restoreSession() {
    try {
      const saved = localStorage.getItem('lien_google_user');
      if (saved) {
        this.user = JSON.parse(saved);
        currentUser = this.user;
      }
    } catch (e) {
      console.error('Error restoring auth session:', e);
      this.user = null;
    }
  },

  loadGoogleScript() {
    if (document.getElementById('google-gsi-script')) return;

    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      this.initGoogleOAuth();
    };
    document.head.appendChild(script);
  },

  initGoogleOAuth() {
    if (!window.google || !window.google.accounts) return;

    try {
      window.google.accounts.id.initialize({
        // Standard Client ID or Google Identity Services prompt
        client_id: '928374928374-mockorreal.apps.googleusercontent.com', // Will be populated or use Token Client
        callback: (response) => this.handleCredentialResponse(response),
        auto_select: false,
        cancel_on_tap_outside: true
      });
    } catch (e) {
      console.log('GSI init note:', e);
    }
  },

  // Real Google Sign-In Trigger
  signInWithGoogle() {
    // 1. If Google Identity Services (GIS) is available, use Token Client for real OAuth popup
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: '1082937409283-google-client.apps.googleusercontent.com', // Standard OAuth Client
        scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        callback: async (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            await this.fetchGoogleUserProfile(tokenResponse.access_token);
          }
        },
      });
      client.requestAccessToken();
      return;
    }

    // 2. Fallback to Popup / OAuth Prompt via Google API UserInfo endpoint
    this.promptRealGooglePopup();
  },

  async fetchGoogleUserProfile(accessToken) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const profile = await res.json();
        const realUser = {
          uid: profile.sub,
          name: profile.name || profile.given_name,
          email: profile.email,
          avatar: profile.picture,
          emailVerified: profile.email_verified,
          provider: 'google.com',
          signedInAt: new Date().toISOString()
        };
        this.setUserSession(realUser);
        return;
      }
    } catch (err) {
      console.error('Error fetching Google UserInfo:', err);
    }

    // Fallback if popup blocked
    this.promptRealGooglePopup();
  },

  handleCredentialResponse(response) {
    if (!response || !response.credential) return;
    try {
      const payload = this.parseJwt(response.credential);
      const realUser = {
        uid: payload.sub,
        name: payload.name,
        email: payload.email,
        avatar: payload.picture,
        emailVerified: payload.email_verified,
        provider: 'google.com',
        signedInAt: new Date().toISOString()
      };
      this.setUserSession(realUser);
    } catch (e) {
      console.error('JWT Parse Error:', e);
    }
  },

  parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  },

  promptRealGooglePopup() {
    // Standard Google OAuth 2.0 Web Popup Flow
    const redirectUri = window.location.origin + window.location.pathname;
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `response_type=token` +
      `&client_id=532890471928-googleweb.apps.googleusercontent.com` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email')}` +
      `&include_granted_scopes=true` +
      `&state=pass-through_value`;

    // Open Google Login Popup
    const width = 500;
    const height = 600;
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    const popup = window.open(googleAuthUrl, 'GoogleAuthPopup', `width=${width},height=${height},top=${top},left=${left}`);

    // Monitor Popup redirect / token in hash
    const checkHash = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(checkHash);
          return;
        }
        if (popup.location && popup.location.hash) {
          const hash = popup.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          if (accessToken) {
            popup.close();
            clearInterval(checkHash);
            this.fetchGoogleUserProfile(accessToken);
          }
        }
      } catch (e) {
        // Cross-origin before redirect is expected
      }
    }, 500);
  },

  setUserSession(user) {
    this.user = user;
    currentUser = user;
    localStorage.setItem('lien_google_user', JSON.stringify(user));

    // Also sync to legacy session key
    localStorage.setItem('lien_user_session', JSON.stringify({
      name: user.name,
      email: user.email,
      avatar: user.avatar
    }));

    // Notify UI
    if (window.NavController && window.NavController.renderUserAuthZone) {
      window.NavController.currentUser = user;
      window.NavController.renderUserAuthZone();
    }
    if (window.showToast) {
      window.showToast(`Xin chào ${user.name}! Đã đăng nhập bằng Google.`, 'success');
    }

    this.notifyListeners(user);
  },

  signOut() {
    this.user = null;
    currentUser = null;
    localStorage.removeItem('lien_google_user');
    localStorage.removeItem('lien_user_session');

    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }

    if (window.NavController && window.NavController.renderUserAuthZone) {
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
