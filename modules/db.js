/**
 * db.js — Persistent Storage Engine
 * Quản lý toàn bộ dữ liệu qua localStorage + Gọi module Sync để đẩy lên GitHub
 */

import { pushToGitHub, pushUserRolesToServer, pushCustomSubjectsToServer, pushAnnouncementsToServer, pushArticlesToServer, pushResourcesToServer, pushFeedbacksToServer } from './sync.js?v=20260831';

const KEYS = {
  BANK: 'qlcl_question_bank',
  SOURCES: 'qlcl_sources',
  HISTORY: 'qlcl_exam_history',
  SETTINGS: 'qlcl_settings',
  SEED_LOADED: 'qlcl_seed_loaded_v7',
  ACTIVE_SUBJECT: 'qlcl_active_subject',
  CUSTOM_SUBJECTS: 'qlcl_custom_subjects',
  PREMIUM_EMAILS: 'qlcl_premium_emails',
  USER_REGISTRY: 'qlcl_user_registry',
  ANNOUNCEMENTS: 'qlcl_system_announcements',
  ARTICLES: 'qlcl_cms_articles',
  RESOURCES: 'qlcl_learning_resources',
  FEEDBACKS: 'qlcl_user_feedbacks',
};

export const DB = {
  /** Danh sách Email Premium */
  getPremiumEmails() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.PREMIUM_EMAILS) || '[]');
    } catch { return []; }
  },

  setPremiumEmails(emails = [], skipSync = false) {
    localStorage.setItem(KEYS.PREMIUM_EMAILS, JSON.stringify(emails));
    if (!skipSync) {
      pushUserRolesToServer({ premiumEmails: emails, users: this.getAllRegisteredUsers(), updatedAt: new Date().toISOString() });
    }
  },

  grantPremium(email) {
    if (!email) return;
    const cleanEmail = email.trim().toLowerCase();
    const list = this.getPremiumEmails();
    if (!list.includes(cleanEmail)) {
      list.push(cleanEmail);
      this.setPremiumEmails(list);
    }
  },

  revokePremium(email) {
    if (!email) return;
    const cleanEmail = email.trim().toLowerCase();
    const list = this.getPremiumEmails().filter(e => e !== cleanEmail);
    this.setPremiumEmails(list);
  },

  /** Danh sách Học Viên Registered */
  getAllRegisteredUsers() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.USER_REGISTRY) || '[]');
    } catch { return []; }
  },

  saveUserToRegistry(user, skipSync = false) {
    if (!user || !user.email) return;
    const list = this.getAllRegisteredUsers();
    const idx = list.findIndex(u => u.email.toLowerCase() === user.email.toLowerCase());
    const userData = {
      name: user.name || user.displayName || user.email.split('@')[0],
      email: user.email.toLowerCase(),
      avatar: user.avatar || user.photoURL,
      lastLogin: new Date().toISOString(),
      provider: user.provider || 'google.com'
    };

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...userData };
    } else {
      userData.firstSeen = new Date().toISOString();
      list.push(userData);
    }

    localStorage.setItem(KEYS.USER_REGISTRY, JSON.stringify(list));
    if (!skipSync) {
      pushUserRolesToServer({ premiumEmails: this.getPremiumEmails(), users: list, updatedAt: new Date().toISOString() });
    }
  },

  /** Thông báo Hệ Thống */
  getAnnouncements() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.ANNOUNCEMENTS) || '[]');
    } catch { return []; }
  },

  addAnnouncement(announcement, skipSync = false) {
    const list = this.getAnnouncements();
    const item = {
      id: 'ANN_' + Date.now(),
      title: announcement.title || 'Thông báo hệ thống',
      content: announcement.content || '',
      type: announcement.type || 'info',
      createdAt: new Date().toISOString(),
      author: announcement.author || 'Admin'
    };
    list.unshift(item);
    localStorage.setItem(KEYS.ANNOUNCEMENTS, JSON.stringify(list));
    if (!skipSync) {
      pushAnnouncementsToServer(list);
    }
    return item;
  },

  deleteAnnouncement(id) {
    const list = this.getAnnouncements().filter(a => a.id !== id);
    localStorage.setItem(KEYS.ANNOUNCEMENTS, JSON.stringify(list));
    pushAnnouncementsToServer(list);
  },

  // ─── CMS Articles (Bài Viết Giới Thiệu Ngành) ──────────────────────────────
  getArticles() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEYS.ARTICLES) || '[]');
      console.log('[DB] getArticles() returning:', stored.length, 'articles from localStorage');
      return stored;
    } catch (e) { 
      console.warn('[DB] getArticles() error:', e);
      return []; 
    }
  },

  saveArticle(article, skipSync = false) {
    const list = this.getArticles();
    if (!article.id) {
      article.id = 'ART_' + Date.now();
      article.createdAt = new Date().toISOString();
    }
    article.updatedAt = new Date().toISOString();
    const idx = list.findIndex(a => a.id === article.id);
    if (idx >= 0) list[idx] = article;
    else list.unshift(article);
    localStorage.setItem(KEYS.ARTICLES, JSON.stringify(list));
    if (!skipSync) pushArticlesToServer(list);
    return article;
  },

  deleteArticle(id, skipSync = false) {
    const list = this.getArticles().filter(a => a.id !== id);
    localStorage.setItem(KEYS.ARTICLES, JSON.stringify(list));
    if (!skipSync) pushArticlesToServer(list);
  },

  // ─── Learning Resources (Tài Nguyên Học Tập theo Môn) ──────────────────────
  getResources(subjectId = null) {
    try {
      const all = JSON.parse(localStorage.getItem(KEYS.RESOURCES) || '[]');
      return subjectId ? all.filter(r => r.subjectId === subjectId) : all;
    } catch { return []; }
  },

  saveResource(resource, skipSync = false) {
    const list = this.getResources();
    if (!resource.id) {
      resource.id = 'RES_' + Date.now();
      resource.createdAt = new Date().toISOString();
    }
    const idx = list.findIndex(r => r.id === resource.id);
    if (idx >= 0) list[idx] = resource;
    else list.unshift(resource);
    localStorage.setItem(KEYS.RESOURCES, JSON.stringify(list));
    if (!skipSync) pushResourcesToServer(list);
    return resource;
  },

  deleteResource(id, skipSync = false) {
    const list = this.getResources().filter(r => r.id !== id);
    localStorage.setItem(KEYS.RESOURCES, JSON.stringify(list));
    if (!skipSync) pushResourcesToServer(list);
  },

  // ─── User Feedbacks (Phản Hồi Học Viên) ────────────────────────────────────
  getFeedbacks() {
    try { return JSON.parse(localStorage.getItem(KEYS.FEEDBACKS) || '[]'); } catch { return []; }
  },

  submitFeedback(feedback, skipSync = false) {
    const list = this.getFeedbacks();
    const item = {
      id: 'FB_' + Date.now(),
      type: feedback.type || 'feedback',   // 'bug' | 'feedback' | 'other'
      content: feedback.content || '',
      userName: feedback.userName || 'Ẩn danh',
      userEmail: feedback.userEmail || '',
      status: 'unread',                    // 'unread' | 'read' | 'resolved'
      createdAt: new Date().toISOString(),
    };
    list.unshift(item);
    localStorage.setItem(KEYS.FEEDBACKS, JSON.stringify(list));
    if (!skipSync) pushFeedbacksToServer(list);
    return item;
  },

  markFeedbackStatus(id, status) {
    const list = this.getFeedbacks().map(f => f.id === id ? { ...f, status } : f);
    localStorage.setItem(KEYS.FEEDBACKS, JSON.stringify(list));
    pushFeedbacksToServer(list);
  },

  deleteFeedback(id) {
    const list = this.getFeedbacks().filter(f => f.id !== id);
    localStorage.setItem(KEYS.FEEDBACKS, JSON.stringify(list));
    pushFeedbacksToServer(list);
  },

  /** Lấy danh sách Môn học tùy chỉnh do người dùng tạo */
  getCustomSubjects() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.CUSTOM_SUBJECTS) || '[]');
    } catch { return []; }
  },

  /** Thêm Môn học tùy chỉnh mới */
  addCustomSubject(subject) {
    const list = this.getCustomSubjects();
    if (!subject.id) subject.id = 'SUB_' + Date.now();
    if (!subject.code) subject.code = subject.id;
    if (!subject.blockId) subject.blockId = 'CS_NGANH';
    if (!subject.credits) subject.credits = 3;
    if (!subject.semester) subject.semester = 1;
    subject.isCustom = true;

    const existingIdx = list.findIndex(s => s.id === subject.id || s.code === subject.code);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...subject };
    } else {
      list.push(subject);
    }
    localStorage.setItem(KEYS.CUSTOM_SUBJECTS, JSON.stringify(list));
    return subject;
  },

  /** Xóa Môn học tùy chỉnh */
  deleteCustomSubject(id) {
    const list = this.getCustomSubjects().filter(s => s.id !== id && s.code !== id);
    localStorage.setItem(KEYS.CUSTOM_SUBJECTS, JSON.stringify(list));
  },

  /** Lấy môn học đang chọn (Mặc định 'FT4468') */
  getActiveSubject() {
    return localStorage.getItem(KEYS.ACTIVE_SUBJECT) || 'FT4468';
  },

  /** Đặt môn học đang chọn */
  setActiveSubject(subjectId) {
    if (subjectId) {
      localStorage.setItem(KEYS.ACTIVE_SUBJECT, subjectId);
    }
  },

  /** Lấy ngân hàng câu hỏi (Tự động gán subjectId mặc định FT4468 nếu chưa có) */
  getBank() {
    try {
      const bank = JSON.parse(localStorage.getItem(KEYS.BANK) || '[]');
      return bank.map(q => ({
        ...q,
        subjectId: q.subjectId || 'FT4468'
      }));
    } catch { return []; }
  },

  /** Lấy ngân hàng câu hỏi theo môn học */
  getBankBySubject(subjectId) {
    const targetSub = subjectId || this.getActiveSubject();
    return this.getBank().filter(q => (q.subjectId || 'FT4468') === targetSub);
  },

  /** Lưu toàn bộ ngân hàng */
  setBank(questions) {
    localStorage.setItem(KEYS.BANK, JSON.stringify(questions));
  },

  /**
   * Thêm câu hỏi mới, tự động loại trùng lặp
   * @param {Array} newQuestions - mảng câu hỏi mới
   * @param {object} options - tuỳ chọn (VD: skipSync)
   * @returns {number} số câu thực sự được thêm
   */
  addQuestions(newQuestions, options = {}) {
    const existing = this.getBank();
    const seenKeys = new Set(existing.map(q => _hashQ(q.q)));
    const activeSub = this.getActiveSubject();
    const toAdd = newQuestions.filter(q => !seenKeys.has(_hashQ(q.q)));

    if (toAdd.length === 0) return 0;

    // Gán ID và Subject cho câu mới
    let maxId = existing.reduce((m, q) => Math.max(m, q.id || 0), 0);
    toAdd.forEach(q => {
      q.id = ++maxId;
      q.subjectId = q.subjectId || activeSub;
      if (!q.difficulty) q.difficulty = 1; // default easy
    });

    const merged = [...existing, ...toAdd];
    this.setBank(merged);

    // Tự động đồng bộ lên GitHub (nếu không phải là do pull về)
    if (!options.skipSync) {
      // Chỉ push những câu do user tự thêm (không có _seed=true)
      const userQuestions = merged.filter(q => !q._seed);
      if (userQuestions.length > 0) {
        pushToGitHub(userQuestions, this.getSources());
      }
    }

    return toAdd.length;
  },

  /** Xoá một câu hỏi theo ID */
  deleteQuestion(id) {
    const bank = this.getBank().filter(q => q.id !== id);
    this.setBank(bank);
  },

  /** Cập nhật một câu hỏi */
  updateQuestion(id, updates) {
    const bank = this.getBank().map(q => q.id === id ? { ...q, ...updates } : q);
    this.setBank(bank);
  },

  /** Lấy tất cả nguồn tài liệu */
  getSources() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.SOURCES) || '[]');
    } catch { return []; }
  },

  /**
   * Thêm nguồn tài liệu
   * @param {object} source - { title, content, addedAt }
   * @param {object} options - tuỳ chọn (VD: skipSync)
   */
  addSource(source, options = {}) {
    const sources = this.getSources();
    source.id = Date.now();
    source.addedAt = new Date().toISOString();
    sources.unshift(source); // mới nhất lên đầu
    localStorage.setItem(KEYS.SOURCES, JSON.stringify(sources));

    // Đồng bộ file lên GitHub
    if (!options.skipSync) {
      const existingBank = this.getBank();
      const userQuestions = existingBank.filter(q => !q._seed);
      pushToGitHub(userQuestions, sources);
    }

    return source;
  },

  /** Xoá nguồn */
  deleteSource(id) {
    const sources = this.getSources().filter(s => s.id !== id);
    localStorage.setItem(KEYS.SOURCES, JSON.stringify(sources));
  },

  /** Lấy lịch sử thi */
  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.HISTORY) || '[]');
    } catch { return []; }
  },

  /**
   * Lưu kết quả thi
   * @param {object} result
   */
  saveResult(result) {
    const history = this.getHistory();
    result.id = Date.now();
    result.date = new Date().toISOString();
    history.unshift(result);
    // Giữ tối đa 50 kết quả
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(history.slice(0, 50)));
  },

  /** Lấy settings */
  getSettings() {
    const defaults = {
      apiKey: '',
      theme: 'light',
      diffRatio: { easy: 0.5, medium: 0.3, hard: 0.2 },
      defaultExamCount: 50,
    };
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(KEYS.SETTINGS) || '{}') };
    } catch { return defaults; }
  },

  /** Lưu settings */
  saveSettings(settings) {
    const current = this.getSettings();
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify({ ...current, ...settings }));
  },

  /** Kiểm tra seed đã load chưa */
  isSeedLoaded() {
    return localStorage.getItem(KEYS.SEED_LOADED) === 'true';
  },

  /** Đánh dấu seed đã load */
  markSeedLoaded() {
    localStorage.setItem(KEYS.SEED_LOADED, 'true');
  },

  /** Thống kê nhanh ngân hàng (theo môn học) */
  getBankStats(subjectId) {
    const bank = subjectId === 'ALL' ? this.getBank() : this.getBankBySubject(subjectId);
    const byChapter = {};
    const byDiff = { 1: 0, 2: 0, 3: 0 };
    bank.forEach(q => {
      byChapter[q.chapter] = (byChapter[q.chapter] || 0) + 1;
      byDiff[q.difficulty || 1]++;
    });
    return { total: bank.length, byChapter, byDiff };
  },

  /** Xóa toàn bộ dữ liệu (factory reset) */
  clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  },
};

/** Tạo hash đơn giản từ text câu hỏi (loại trùng) */
function _hashQ(text) {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
