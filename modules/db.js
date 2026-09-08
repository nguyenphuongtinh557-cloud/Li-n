/**
 * db.js — Persistent Storage Engine
 * Quản lý toàn bộ dữ liệu qua localStorage + Gọi module Sync để đẩy lên GitHub
 */

import { pushToGitHub, pushUserRolesToServer, pushCustomSubjectsToServer, pushAnnouncementsToServer, pushArticlesToServer, pushResourcesToServer, pushFeedbacksToServer, pushSubjectDetailsToServer } from './sync.js?v=20260908subjectdetails';

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
  NOTIFICATION_READ_STATE: 'qlcl_notification_read_state',
  ARTICLES: 'qlcl_cms_articles',
  RESOURCES: 'qlcl_learning_resources',
  FEEDBACKS: 'qlcl_user_feedbacks',
  SUBJECT_DETAILS: 'qlcl_subject_details',
};

export function normalizeInteractiveBlock(block = {}, index = 0) {
  const type = ['heading', 'text', 'image', 'imageCaption', 'twoColumn', 'callout', 'list', 'table', 'quiz', 'video', 'resource', 'legacyHtml'].includes(block.type) ? block.type : 'text';
  return { id: block.id || `block_${Date.now()}_${index}`, type, content: block.content ?? '', settings: (block.settings && typeof block.settings === 'object') ? block.settings : {}, order: Number.isFinite(block.order) ? block.order : index };
}

export function normalizeInteractiveLesson(lesson = {}, index = 0) {
  const blocks = Array.isArray(lesson.blocks) ? lesson.blocks.map(normalizeInteractiveBlock) : [];
  return { ...lesson, id: lesson.id || `les_${Date.now()}_${index}`, title: String(lesson.title || 'Bài học mới'), description: String(lesson.description || ''), duration: String(lesson.duration || '10:00'), status: lesson.status === 'published' ? 'published' : 'draft', blocks, order: Number.isFinite(lesson.order) ? lesson.order : index, updatedAt: lesson.updatedAt || new Date().toISOString(), content: String(lesson.content || '') };
}

export function normalizeIntroCanvasItem(item = {}, index = 0) {
  const type = ['text', 'image', 'video'].includes(item.type) ? item.type : 'text';
  const clamp = (value, fallback, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
  return { id: item.id || `intro_${Date.now()}_${index}`, type, content: String(item.content || ''), src: String(item.src || ''), alt: String(item.alt || ''), x: clamp(item.x, 8, 0, 92), y: clamp(item.y, 8 + index * 12, 0, 92), width: clamp(item.width, type === 'text' ? 42 : 36, 12, 100), height: clamp(item.height, type === 'text' ? 18 : 28, 8, 100), zIndex: clamp(item.zIndex, index + 1, 1, 99), settings: (item.settings && typeof item.settings === 'object') ? item.settings : {} };
}

export function normalizeInteractiveSubjectDetails(details = {}) {
  const chapters = Array.isArray(details.chapters) ? details.chapters.map((chapter, chapterIndex) => ({ ...chapter, id: chapter.id || `chap_${Date.now()}_${chapterIndex}`, title: String(chapter.title || `Chương ${chapterIndex + 1}`), order: Number.isFinite(chapter.order) ? chapter.order : chapterIndex, lessons: (Array.isArray(chapter.lessons) ? chapter.lessons : []).map(normalizeInteractiveLesson) })) : [];
  const introCanvas = Array.isArray(details.introCanvas) ? details.introCanvas.map(normalizeIntroCanvasItem) : [];
  const introCanvasHeight = Math.min(2400, Math.max(360, Number(details.introCanvasHeight) || 620));
  return { ...details, chapters, introCanvas, introCanvasHeight, updatedAt: details.updatedAt || new Date().toISOString() };
}

export const DB = {
  /** Danh sách Email Premium */
  getPremiumEmails() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.PREMIUM_EMAILS) || '[]');
    } catch { return []; }
  },

  async setPremiumEmails(emails = [], skipSync = false) {
    const premiumEmails = [...new Set((Array.isArray(emails) ? emails : []).map(email => String(email || '').trim().toLowerCase()).filter(Boolean))];
    const users = this.getAllRegisteredUsers();
    localStorage.setItem(KEYS.PREMIUM_EMAILS, JSON.stringify(premiumEmails));
    const synced = skipSync ? true : await pushUserRolesToServer({ premiumEmails, users, updatedAt: new Date().toISOString() });
    return { users, premiumEmails, synced: Boolean(synced) };
  },

  async grantPremium(email) {
    if (!email) return { users: this.getAllRegisteredUsers(), premiumEmails: this.getPremiumEmails(), synced: false };
    const cleanEmail = email.trim().toLowerCase();
    const premiumEmails = this.getPremiumEmails();
    if (!premiumEmails.includes(cleanEmail)) premiumEmails.push(cleanEmail);
    return await this.setPremiumEmails(premiumEmails);
  },

  async revokePremium(email) {
    if (!email) return { users: this.getAllRegisteredUsers(), premiumEmails: this.getPremiumEmails(), synced: false };
    const cleanEmail = email.trim().toLowerCase();
    return await this.setPremiumEmails(this.getPremiumEmails().filter(item => String(item || '').toLowerCase() !== cleanEmail));
  },

  /** Danh sách Học Viên Registered */
  getAllRegisteredUsers() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.USER_REGISTRY) || '[]');
    } catch { return []; }
  },

  mergeUserRolesFromServer(serverRoles = {}) {
    const byEmail = new Map();
    const addUser = (rawUser = {}) => {
      const email = String(rawUser.email || '').trim().toLowerCase();
      if (!email) return;
      const current = byEmail.get(email);
      const candidate = { ...rawUser, email };
      const currentTime = Date.parse(current?.lastLogin || '') || 0;
      const candidateTime = Date.parse(candidate.lastLogin || '') || 0;
      if (!current || candidateTime >= currentTime) {
        byEmail.set(email, { ...current, ...candidate, firstSeen: current?.firstSeen || candidate.firstSeen || candidate.lastLogin || new Date().toISOString() });
      } else {
        byEmail.set(email, { ...candidate, ...current, firstSeen: current.firstSeen || candidate.firstSeen });
      }
    };
    this.getAllRegisteredUsers().forEach(addUser);
    (Array.isArray(serverRoles.users) ? serverRoles.users : []).forEach(addUser);
    const users = [...byEmail.values()].sort((a, b) => (Date.parse(b.lastLogin || '') || 0) - (Date.parse(a.lastLogin || '') || 0));
    const premiumEmails = [...new Set([...this.getPremiumEmails(), ...(Array.isArray(serverRoles.premiumEmails) ? serverRoles.premiumEmails : [])].map(email => String(email || '').trim().toLowerCase()).filter(Boolean))];
    localStorage.setItem(KEYS.USER_REGISTRY, JSON.stringify(users));
    localStorage.setItem(KEYS.PREMIUM_EMAILS, JSON.stringify(premiumEmails));
    return { users, premiumEmails };
  },

  async saveUserToRegistry(user, skipSync = false) {
    if (!user || !user.email) return { users: this.getAllRegisteredUsers(), premiumEmails: this.getPremiumEmails(), synced: false };
    const list = this.getAllRegisteredUsers();
    const cleanEmail = user.email.trim().toLowerCase();
    const idx = list.findIndex(item => String(item.email || '').trim().toLowerCase() === cleanEmail);
    const now = new Date().toISOString();
    const userData = { name: user.name || user.displayName || cleanEmail.split('@')[0], email: cleanEmail, avatar: user.avatar || user.photoURL, lastLogin: now, provider: user.provider || 'google.com' };
    if (idx >= 0) list[idx] = { ...list[idx], ...userData, firstSeen: list[idx].firstSeen || now };
    else list.push({ ...userData, firstSeen: now });
    localStorage.setItem(KEYS.USER_REGISTRY, JSON.stringify(list));
    const premiumEmails = this.getPremiumEmails();
    const synced = skipSync ? true : await pushUserRolesToServer({ premiumEmails, users: list, updatedAt: now });
    return { users: list, premiumEmails, synced: Boolean(synced) };
  },

  /** Thông báo Hệ Thống */
  getAnnouncements() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.ANNOUNCEMENTS) || '[]');
    } catch { return []; }
  },

  getNotificationReadState(userId) {
    try {
      const state = JSON.parse(localStorage.getItem(KEYS.NOTIFICATION_READ_STATE) || '{}');
      return state[userId || 'guest'] || {};
    } catch { return {}; }
  },

  setAnnouncementRead(userId, announcementId, isRead = true) {
    try {
      const state = JSON.parse(localStorage.getItem(KEYS.NOTIFICATION_READ_STATE) || '{}');
      const key = userId || 'guest';
      const userState = state[key] || {};
      if (isRead) userState[announcementId] = new Date().toISOString();
      else delete userState[announcementId];
      state[key] = userState;
      localStorage.setItem(KEYS.NOTIFICATION_READ_STATE, JSON.stringify(state));
      return userState;
    } catch { return {}; }
  },

  getVisibleAnnouncements(user) {
    const role = (user?.role || 'NEWBIE').toUpperCase();
    return this.getAnnouncements().filter(a => {
      const scope = a.scope || 'all';
      const email = (user?.email || '').trim().toLowerCase();
      return scope === 'all' || (scope === 'user' && email && email === String(a.recipientEmail || '').trim().toLowerCase()) || (scope === 'premium' && (role === 'PREMIUM' || role === 'ADMIN')) || (scope === 'newbie' && role === 'NEWBIE');
    });
  },

  mergeAnnouncementsFromServer(remoteAnnouncements = []) {
    const merged = new Map();
    const add = (announcement = {}) => {
      if (!announcement.id) return;
      const current = merged.get(announcement.id);
      const currentTime = Date.parse(current?.createdAt || '') || 0;
      const incomingTime = Date.parse(announcement.createdAt || '') || 0;
      if (!current || incomingTime >= currentTime) merged.set(announcement.id, announcement);
    };
    this.getAnnouncements().forEach(add);
    (Array.isArray(remoteAnnouncements) ? remoteAnnouncements : []).forEach(add);
    const list = [...merged.values()].sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
    localStorage.setItem(KEYS.ANNOUNCEMENTS, JSON.stringify(list));
    return list;
  },

  async createPremiumRoleAnnouncement(email, eventType) {
    const recipientEmail = String(email || '').trim().toLowerCase();
    if (!recipientEmail || !['premium_granted', 'premium_revoked'].includes(eventType)) {
      return { item: null, list: this.getAnnouncements(), synced: false };
    }

    const isGranted = eventType === 'premium_granted';
    return await this.addAnnouncement({
      scope: 'user',
      recipientEmail,
      type: isGranted ? 'success' : 'alert',
      category: 'Quyền tài khoản',
      title: isGranted ? 'Quyền Premium của bạn đã được kích hoạt' : 'Quyền Premium của bạn đã kết thúc',
      content: isGranted
        ? '<p><strong>Chúc mừng!</strong> Tài khoản của bạn đã được cấp quyền <strong>Premium</strong>.</p><p>Bạn có thể sử dụng các tính năng và AI Models dành cho thành viên Premium ngay bây giờ.</p>'
        : '<p>Quyền <strong>Premium</strong> của tài khoản bạn đã kết thúc.</p><p>Tài khoản hiện đã trở về cấp <strong>Newbie</strong>. Nếu cần hỗ trợ, vui lòng liên hệ quản trị viên.</p>',
      excerpt: isGranted
        ? 'Quyền Premium đã được kích hoạt cho tài khoản của bạn.'
        : 'Quyền Premium của tài khoản bạn đã kết thúc.',
      author: 'Ban Quản trị FTECA 24'
    });
  },

  async addAnnouncement(announcement, skipSync = false) {
    const list = this.getAnnouncements();
    const recipientEmail = String(announcement.recipientEmail || '').trim().toLowerCase();
    const item = {
      id: 'ANN_' + Date.now(), title: announcement.title || 'Thông báo hệ thống', content: announcement.content || '',
      type: announcement.type || 'info', category: announcement.category || announcement.type || 'info', scope: announcement.scope || 'all',
      excerpt: announcement.excerpt || String(announcement.content || '').replace(/<[^>]*>/g, '').slice(0, 180),
      links: Array.isArray(announcement.links) ? announcement.links : [], attachment: announcement.attachment || null, recipientEmail,
      createdAt: new Date().toISOString(), author: announcement.author || 'Admin'
    };
    list.unshift(item);
    localStorage.setItem(KEYS.ANNOUNCEMENTS, JSON.stringify(list));
    const synced = skipSync ? true : await pushAnnouncementsToServer(list);
    return { item, list, synced: Boolean(synced) };
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

  mergeFeedbacksFromServer(remoteFeedbacks = []) {
    const merged = new Map();
    const add = (ticket = {}) => {
      if (!ticket.id) return;
      const current = merged.get(ticket.id);
      const currentTime = Date.parse(current?.updatedAt || current?.createdAt || '') || 0;
      const ticketTime = Date.parse(ticket.updatedAt || ticket.createdAt || '') || 0;
      if (!current || ticketTime >= currentTime) merged.set(ticket.id, ticket);
    };
    this.getFeedbacks().forEach(add);
    (Array.isArray(remoteFeedbacks) ? remoteFeedbacks : []).forEach(add);
    const list = [...merged.values()].sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || '') || 0) - (Date.parse(a.updatedAt || a.createdAt || '') || 0));
    localStorage.setItem(KEYS.FEEDBACKS, JSON.stringify(list));
    return list;
  },

  async submitFeedback(feedback, skipSync = false) {
    const list = this.getFeedbacks();
    const now = new Date().toISOString();
    const item = { id: 'FB_' + Date.now(), ticketCode: 'TK-' + Date.now().toString().slice(-6), type: feedback.type || 'bug', priority: feedback.priority || 'normal', title: feedback.title || 'Báo cáo lỗi', content: feedback.content || '', page: feedback.page || '', device: feedback.device || '', userName: feedback.userName || 'Ẩn danh', userEmail: feedback.userEmail || '', status: 'submitted', adminResponse: '', createdAt: now, updatedAt: now, history: [{ status: 'submitted', message: 'Đã gửi báo cáo đến quản trị viên.', at: now, actor: feedback.userName || 'Người dùng' }] };
    list.unshift(item); localStorage.setItem(KEYS.FEEDBACKS, JSON.stringify(list));
    const synced = skipSync ? true : await pushFeedbacksToServer(list);
    return { item, list, synced: Boolean(synced) };
  },

  async updateFeedback(id, patch = {}) {
    const now = new Date().toISOString(); let updated = null;
    const list = this.getFeedbacks().map(f => {
      if (f.id !== id) return f;
      const history = [...(f.history || []), ...(patch.historyEntry ? [{ ...patch.historyEntry, at: now }] : [])];
      updated = { ...f, ...patch, history, updatedAt: now }; delete updated.historyEntry; return updated;
    });
    localStorage.setItem(KEYS.FEEDBACKS, JSON.stringify(list));
    const synced = await pushFeedbacksToServer(list);
    return { item: updated, list, synced: Boolean(synced) };
  },

  markFeedbackStatus(id, status) {
    return this.updateFeedback(id, { status, historyEntry: { status, message: 'Cập nhật trạng thái ticket.', actor: 'Admin' } });
  },

  async deleteFeedback(id) {
    const list = this.getFeedbacks().filter(f => f.id !== id);
    localStorage.setItem(KEYS.FEEDBACKS, JSON.stringify(list));
    const synced = await pushFeedbacksToServer(list);
    return { list, synced: Boolean(synced) };
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

  /** Lấy toàn bộ bản đồ thông tin chi tiết môn học */
  getAllSubjectDetailsMap() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.SUBJECT_DETAILS) || '{}');
    } catch { return {}; }
  },

  /** Lấy thông tin chi tiết cấu trúc trang môn học theo subjectId */
  getSubjectDetails(subjectId) {
    if (!subjectId) return null;
    const map = this.getAllSubjectDetailsMap();
    if (map[subjectId]) {
      return map[subjectId];
    }

    // Preset cho GE4150 & GE4166 (Quân sự chung / Quốc phòng)
    if (subjectId === 'GE4150' || subjectId === 'GE4166') {
      const subName = subjectId === 'GE4166' ? 'Quân sự chung' : 'Công tác Quốc phòng, An ninh';
      return {
        subjectId: subjectId,
        code: subjectId,
        name: subName,
        status: 'published',
        banner: '',
        shortDesc: 'Khám phá kiến thức quốc phòng, an ninh và kỹ năng cần thiết; lựa chọn các danh mục bên dưới để bắt đầu ôn luyện hiệu quả.',
        credits: subjectId === 'GE4166' ? 2 : 3,
        semester: subjectId === 'GE4166' ? 3 : 1,
        program: 'Đại học Công nghệ - ĐH Đà Nẵng',
        intro: 'Môn học Công tác Quốc phòng, An ninh cung cấp cho sinh viên những kiến thức cơ bản về đường lối, quan điểm của Đảng, chính sách, pháp luật của Nhà nước về quốc phòng, an ninh; các vấn đề bảo vệ Tổ quốc trong tình hình mới; đồng thời rèn luyện ý thức trách nhiệm, kỹ năng nhận biết và xử lý các tình huống liên quan đến quốc phòng, an ninh.',
        cards: {
          objectives: {
            title: 'Mục tiêu môn học',
            content: 'Trang bị kiến thức, nâng cao nhận thức về quốc phòng, an ninh cho sinh viên.'
          },
          mainContent: {
            title: 'Nội dung chính',
            content: 'Đường lối, chính sách QP-AN, pháp luật, biên giới, an ninh mạng, phòng chống tội phạm...'
          },
          targetAudience: {
            title: 'Đối tượng học',
            content: 'Sinh viên các ngành đào tạo tại Đại học Công nghệ - ĐH Đà Nẵng.'
          },
          learningFormat: {
            title: 'Hình thức học',
            content: 'Kết hợp lý thuyết, thảo luận, thực hành, đi thực tế (nếu có).'
          }
        },
        instructor: {
          name: 'Đang cập nhật tên giảng viên',
          role: 'Giảng viên phụ trách',
          avatar: '',
          email: ''
        },
        chapters: [
          {
            id: 'chap_' + subjectId.toLowerCase() + '_1',
            title: 'Chương 1. Đường lối, quan điểm của Đảng...',
            lessons: [
              { id: 'les_1_1', title: '1.1. Khái quát chung', content: 'Tổng quan về đường lối quốc phòng, an ninh của Đảng và Nhà nước Việt Nam qua các thời kỳ.' },
              { id: 'les_1_2', title: '1.2. Quan điểm của Đảng về quốc phòng...', content: 'Phân tích quan điểm chỉ đạo của Đảng về xây dựng lực lượng vũ trang và thế trận quốc phòng.' },
              { id: 'les_1_3', title: '1.3. Nhiệm vụ bảo vệ Tổ quốc trong tình hình mới', content: 'Các mục tiêu, giải pháp nâng cao tiềm lực quốc phòng trong thời kỳ hội nhập.' }
            ]
          },
          {
            id: 'chap_' + subjectId.toLowerCase() + '_2',
            title: 'Chương 2. Pháp luật về quốc phòng, an ninh',
            lessons: [
              { id: 'les_2_1', title: '2.1. Hệ thống văn bản pháp luật', content: 'Giới thiệu Luật Quốc phòng, Luật An ninh mạng và các nghị định liên quan.' },
              { id: 'les_2_2', title: '2.2. Quyền và nghĩa vụ công dân', content: 'Quy định pháp luật về trách nhiệm bảo vệ Tổ quốc của thế hệ trẻ và sinh viên.' }
            ]
          },
          {
            id: 'chap_' + subjectId.toLowerCase() + '_3',
            title: 'Chương 3. Xây dựng nền quốc phòng toàn dân',
            lessons: [
              { id: 'les_3_1', title: '3.1. Lực lượng quốc phòng', content: 'Cơ cấu tổ chức lực lượng vũ trang nhân dân và dân quân tự vệ.' },
              { id: 'les_3_2', title: '3.2. Thế trận quốc phòng toàn dân', content: 'Kết hợp phát triển kinh tế - xã hội với tăng cường quốc phòng - an ninh.' }
            ]
          },
          {
            id: 'chap_' + subjectId.toLowerCase() + '_4',
            title: 'Chương 4. Bảo đảm an ninh quốc gia',
            lessons: [
              { id: 'les_4_1', title: '4.1. An ninh chính trị, trật tự an toàn xã hội', content: 'Nhận diện và phòng chống chiến lược diễn biến hòa bình.' },
              { id: 'les_4_2', title: '4.2. Phòng chống tội phạm và tệ nạn xã hội', content: 'Các biện pháp nâng cao ý thức chấp hành pháp luật của sinh viên.' }
            ]
          }
        ]
      };
    }

    // Default template cho môn khác
    return {
      subjectId,
      code: subjectId,
      name: '',
      status: 'published',
      banner: '',
      shortDesc: '',
      credits: 3,
      semester: 1,
      program: 'Chương trình Đào tạo Đại học',
      intro: '',
      cards: {
        objectives: { title: 'Mục tiêu môn học', content: '' },
        mainContent: { title: 'Nội dung chính', content: '' },
        targetAudience: { title: 'Đối tượng học', content: '' },
        learningFormat: { title: 'Hình thức học', content: '' }
      },
      instructor: {
        name: '',
        role: 'Giảng viên phụ trách',
        avatar: '',
        email: ''
      },
      chapters: []
    };
  },

  /** Lưu thiết lập trang môn học */
  async saveSubjectDetails(subjectId, detailsData, skipSync = false, idToken = '') {
    if (!subjectId || !detailsData) return { ok: false, reason: 'invalid-subject-details' };
    const map = this.getAllSubjectDetailsMap();
    const normalized = normalizeInteractiveSubjectDetails(detailsData);
    normalized.updatedAt = new Date().toISOString();
    map[subjectId] = normalized;
    localStorage.setItem(KEYS.SUBJECT_DETAILS, JSON.stringify(map));
    const syncResult = skipSync ? { ok: true, skipped: true } : await pushSubjectDetailsToServer(subjectId, normalized, idToken);
    return { ok: Boolean(syncResult?.ok), localOnly: !syncResult?.ok, sync: syncResult, details: normalized };
  },

  /** Trộn dữ liệu chi tiết môn học từ Server Cloud */
  mergeSubjectDetailsFromServer(remoteMap = {}) {
    if (!remoteMap || typeof remoteMap !== 'object') return;
    const localMap = this.getAllSubjectDetailsMap();
    const merged = { ...localMap, ...remoteMap };
    Object.keys(merged).forEach(subjectId => { merged[subjectId] = normalizeInteractiveSubjectDetails(merged[subjectId]); });
    localStorage.setItem(KEYS.SUBJECT_DETAILS, JSON.stringify(merged));
    return merged;
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

  // ─── USER NOTES & PROGRESS MANAGEMENT ─────────────────────────────────────
  getUserNotesMap() {
    try {
      return JSON.parse(localStorage.getItem('qlcl_user_notes') || '{}');
    } catch { return {}; }
  },

  normalizeUserNoteContext(context) {
    if (typeof context === 'string') return { legacyId: context, subjectId: 'legacy', lessonId: context };
    const value = context || {};
    return {
      subjectId: String(value.subjectId || 'general'),
      lessonId: value.lessonId ? String(value.lessonId) : '',
      resourceId: value.resourceId ? String(value.resourceId) : '',
      legacyId: value.legacyId ? String(value.legacyId) : ''
    };
  },

  getUserNoteKey(userId, context) {
    const normalized = this.normalizeUserNoteContext(context);
    const target = normalized.resourceId ? `resource:${normalized.resourceId}` : (normalized.lessonId ? `lesson:${normalized.lessonId}` : 'overview');
    return `${userId || 'guest'}::${normalized.subjectId}::${target}`;
  },

  normalizeUserNoteRecord(note = {}) {
    return {
      text: typeof note.text === 'string' ? note.text : '',
      highlights: Array.isArray(note.highlights) ? note.highlights : [],
      annotations: Array.isArray(note.annotations) ? note.annotations : [],
      updatedAt: note.updatedAt || null,
      version: Number.isFinite(Number(note.version)) ? Number(note.version) : 1
    };
  },

  getUserNote(userId, context) {
    const map = this.getUserNotesMap();
    const normalized = this.normalizeUserNoteContext(context);
    const key = this.getUserNoteKey(userId, normalized);
    const legacyKey = `${userId || 'guest'}_${normalized.legacyId || normalized.lessonId || normalized.resourceId}`;
    let raw = map[key];
    if (!raw && map[legacyKey]) {
      raw = map[legacyKey];
      map[key] = this.normalizeUserNoteRecord(raw);
      delete map[legacyKey];
      localStorage.setItem('qlcl_user_notes', JSON.stringify(map));
    }
    const note = this.normalizeUserNoteRecord(raw);
    if (raw && JSON.stringify(raw) !== JSON.stringify(note)) {
      map[key] = note;
      localStorage.setItem('qlcl_user_notes', JSON.stringify(map));
    }
    return note;
  },

  saveUserNote(userId, context, value) {
    const map = this.getUserNotesMap();
    const key = this.getUserNoteKey(userId, context);
    const previous = this.normalizeUserNoteRecord(map[key]);
    const patch = typeof value === 'string' ? { text: value } : (value || {});
    const note = this.normalizeUserNoteRecord({ ...previous, ...patch, updatedAt: new Date().toISOString(), version: previous.version + 1 });
    map[key] = note;
    localStorage.setItem('qlcl_user_notes', JSON.stringify(map));
    return note;
  },

  getLessonProgressMap() {
    try {
      return JSON.parse(localStorage.getItem('qlcl_lesson_progress') || '{}');
    } catch { return {}; }
  },

  getLessonProgress(userId, subjectId) {
    const map = this.getLessonProgressMap();
    const key = `${userId || 'guest'}_${subjectId}`;
    return map[key] || { completedLessons: [], lastLessonId: null };
  },

  saveLessonProgress(userId, subjectId, lessonId, isCompleted = true) {
    const map = this.getLessonProgressMap();
    const key = `${userId || 'guest'}_${subjectId}`;
    const current = map[key] || { completedLessons: [], lastLessonId: null };
    current.lastLessonId = lessonId;
    if (isCompleted && !current.completedLessons.includes(lessonId)) {
      current.completedLessons.push(lessonId);
    }
    map[key] = current;
    localStorage.setItem('qlcl_lesson_progress', JSON.stringify(map));
  },

  getSharedNotesMap() {
    try {
      return JSON.parse(localStorage.getItem('qlcl_shared_notes_keys') || '{}');
    } catch { return {}; }
  },

  createSharedNoteKey(noteContent, lessonTitle, authorName, options = {}) {
    const map = this.getSharedNotesMap();
    const randPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const randPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const key = `FTECA-${randPart1}-${randPart2}`;

    map[key] = {
      key,
      noteContent,
      lessonTitle: lessonTitle || 'Bài giảng',
      authorName: authorName || 'Sinh viên',
      permission: options.permission || 'view', // 'view' | 'edit'
      expiresAt: options.expiresAt || null,
      createdAt: new Date().toISOString()
    };

    localStorage.setItem('qlcl_shared_notes_keys', JSON.stringify(map));
    return key;
  },

  getSharedNoteByKey(key) {
    if (!key) return null;
    const cleanKey = key.trim().toUpperCase();
    const map = this.getSharedNotesMap();
    const item = map[cleanKey];
    if (!item) return null;
    if (item.expiresAt && new Date(item.expiresAt) < new Date()) {
      return { error: 'Key đã hết hạn truy cập!' };
    }
    return item;
  },
};

/** Tạo hash đơn giản từ text câu hỏi (loại trùng) */
function _hashQ(text) {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
