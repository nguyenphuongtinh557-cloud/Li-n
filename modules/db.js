/**
 * db.js — Persistent Storage Engine
 * Quản lý toàn bộ dữ liệu qua localStorage
 */

const KEYS = {
  BANK: 'qlcl_question_bank',
  SOURCES: 'qlcl_sources',
  HISTORY: 'qlcl_exam_history',
  SETTINGS: 'qlcl_settings',
  SEED_LOADED: 'qlcl_seed_loaded_v6',
};

export const DB = {
  /** Lấy ngân hàng câu hỏi */
  getBank() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.BANK) || '[]');
    } catch { return []; }
  },

  /** Lưu toàn bộ ngân hàng */
  setBank(questions) {
    localStorage.setItem(KEYS.BANK, JSON.stringify(questions));
  },

  /**
   * Thêm câu hỏi mới, tự động loại trùng lặp
   * @param {Array} newQuestions - mảng câu hỏi mới
   * @returns {number} số câu thực sự được thêm
   */
  addQuestions(newQuestions) {
    const existing = this.getBank();
    const seenKeys = new Set(existing.map(q => _hashQ(q.q)));
    const toAdd = newQuestions.filter(q => !seenKeys.has(_hashQ(q.q)));

    // Gán ID cho câu mới
    let maxId = existing.reduce((m, q) => Math.max(m, q.id || 0), 0);
    toAdd.forEach(q => {
      q.id = ++maxId;
      if (!q.difficulty) q.difficulty = 1; // default easy
    });

    const merged = [...existing, ...toAdd];
    this.setBank(merged);
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
   */
  addSource(source) {
    const sources = this.getSources();
    source.id = Date.now();
    source.addedAt = new Date().toISOString();
    sources.unshift(source); // mới nhất lên đầu
    localStorage.setItem(KEYS.SOURCES, JSON.stringify(sources));
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

  /** Thống kê nhanh ngân hàng */
  getBankStats() {
    const bank = this.getBank();
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
