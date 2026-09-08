/**
 * sync.js — Community Sync via GitHub Raw + GitHub API
 *
 * Đọc: GitHub Raw (public, không cần auth, tức thì)
 * Ghi: GitHub Contents API (cần PAT token)
 *
 * Flow:
 *   Khi user thêm câu hỏi/tài liệu → pushToGitHub()
 *   Khi load trang → pullFromGitHub()
 */

// ─── Config ───────────────────────────────────────────────────────────────────
const SYNC_CONFIG = {
  owner: 'nguyenphuongtinh557-cloud',
  repo: 'Li-n',
  branch: 'main',
  questionsFile: 'data/community.json',
  sourcesFile: 'data/community_sources.json',
  adminEditsFile: 'data/admin_edits.json',
  userRolesFile: 'data/user_roles.json',
  customSubjectsFile: 'data/custom_subjects.json',
  announcementsFile: 'data/system_announcements.json',
  articlesFile: 'data/cms_articles.json',
  resourcesFile: 'data/learning_resources.json',
  feedbacksFile: 'data/user_feedbacks.json',
  subjectDetailsFile: 'data/subject_details.json',
};

const RAW_BASE = `https://raw.githubusercontent.com/${SYNC_CONFIG.owner}/${SYNC_CONFIG.repo}/${SYNC_CONFIG.branch}`;

// ─── Trạng thái đồng bộ ──────────────────────────────────────────────────────
let _syncing = false;
let _lastPullAt = 0;
const PULL_COOLDOWN_MS = 30_000; // chỉ pull tối đa mỗi 30 giây

// ─── Đọc file từ GitHub Raw (public URL, không cần auth) ─────────────────────
async function fetchRaw(filename) {
  try {
    const url = `${RAW_BASE}/${filename}?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data && typeof data === 'object' ? data : [];
  } catch {
    return [];
  }
}

// ─── Ghi dữ liệu ─────────────────────────────────────────────────────────────
// Frontend không giữ token hay gọi GitHub Contents API. Khi có server relay,
// adapter này sẽ được thay bằng request đã xác thực tới server-side endpoint.
async function pushFile(filename, data) {
  console.warn('[Sync] Ghi dữ liệu cần server relay:', filename);
  return { ok: false, reason: 'server-relay-unavailable' };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Kéo dữ liệu cộng đồng từ GitHub về và merge vào DB local
 * @param {object} DB - module DB để merge
 * @returns {{ questions: number, sources: number }} - số item mới
 */
export async function pullFromGitHub(DB) {
  const now = Date.now();
  if (now - _lastPullAt < PULL_COOLDOWN_MS) return { questions: 0, sources: 0 };
  _lastPullAt = now;

  try {
    const [remoteQ, remoteS] = await Promise.all([
      fetchRaw(SYNC_CONFIG.questionsFile),
      fetchRaw(SYNC_CONFIG.sourcesFile),
    ]);

    let addedQ = 0;
    let addedS = 0;

    if (remoteQ.length > 0) {
      addedQ = DB.addQuestions(remoteQ, { skipSync: true });
    }

    if (remoteS.length > 0) {
      const localSources = DB.getSources();
      const localIds = new Set(localSources.map(s => s.syncId || s.id));
      const newSources = remoteS.filter(s => !localIds.has(s.syncId || s.id));
      newSources.forEach(s => DB.addSource(s, { skipSync: true }));
      addedS = newSources.length;
    }

    if (addedQ > 0 || addedS > 0) {
      console.log(`[Sync] ✅ Kéo về: +${addedQ} câu hỏi, +${addedS} tài liệu`);
    }

    return { questions: addedQ, sources: addedS };
  } catch (e) {
    console.warn('[Sync] pullFromGitHub thất bại:', e);
    return { questions: 0, sources: 0 };
  }
}

/**
 * Đẩy toàn bộ câu hỏi cộng đồng lên GitHub
 * Chỉ push các câu do người dùng tự thêm (không push seed mặc định)
 * @param {Array} questions - danh sách câu hỏi cộng đồng
 * @param {Array} sources - danh sách tài liệu cộng đồng
 */
export async function pushToGitHub(questions = [], sources = []) {
  if (_syncing) return; // tránh push đồng thời
  _syncing = true;

  try {
    // Thêm syncId để nhận diện khi merge
    const toSyncQ = questions.map(q => ({ ...q, _synced: true }));
    const toSyncS = sources.map(s => ({
      ...s,
      syncId: s.syncId || `${s.id}_${Date.now()}`,
    }));

    const [okQ, okS] = await Promise.all([
      pushFile(SYNC_CONFIG.questionsFile, toSyncQ),
      pushFile(SYNC_CONFIG.sourcesFile, toSyncS),
    ]);

    if (okQ || okS) {
      console.log('[Sync] ✅ Đã đẩy lên GitHub thành công!');
      _lastPullAt = 0; // Reset để cho phép pull ngay lần tới
    }
  } catch (e) {
    console.warn('[Sync] pushToGitHub thất bại:', e);
  } finally {
    _syncing = false;
  }
}

/**
 * Kiểm tra xem đang có kết nối mạng không
 */
export function isOnline() {
  return navigator.onLine;
}

// ─── Admin Edits: Patch câu hỏi gốc mà không cần sửa seed_questions.js ──────

/**
 * Đẩy danh sách chỉnh sửa admin lên GitHub (file admin_edits.json)
 * Mỗi item là { id, ...fields } — các field cần cập nhật trên câu hỏi có id đó
 * @param {Array} edits - mảng các chỉnh sửa
 */
export async function pushAdminEdits(edits = []) {
  return await pushFile(SYNC_CONFIG.adminEditsFile, edits);
}

/**
 * Kéo danh sách chỉnh sửa admin từ GitHub về
 * @returns {Array} mảng các bản vá (patch objects)
 */
export async function pullAdminEdits() {
  return await fetchRaw(SYNC_CONFIG.adminEditsFile);
}

// ─── Đồng bộ Phân quyền User Roles (Premium Users & User Registry) ─────────
export async function pushUserRolesToServer(rolesData) {
  return await pushFile(SYNC_CONFIG.userRolesFile, rolesData);
}

export async function pullUserRolesFromServer() {
  return await fetchRaw(SYNC_CONFIG.userRolesFile);
}

// ─── Đồng bộ Môn học Tùy chỉnh (Custom Subjects) ───────────────────────────
export async function pushCustomSubjectsToServer(subjects) {
  return await pushFile(SYNC_CONFIG.customSubjectsFile, subjects);
}

export async function pullCustomSubjectsFromServer() {
  return await fetchRaw(SYNC_CONFIG.customSubjectsFile);
}

// ─── Đồng bộ Thông báo Hệ thống (System Announcements) ─────────────────────
export async function pushAnnouncementsToServer(announcements) {
  return await pushFile(SYNC_CONFIG.announcementsFile, announcements);
}

export async function pullAnnouncementsFromServer() {
  return await fetchRaw(SYNC_CONFIG.announcementsFile);
}

// ─── CMS Articles (Bài Viết Giới Thiệu Ngành) ─────────────────────────────
export async function pushArticlesToServer(articles) {
  return await pushFile(SYNC_CONFIG.articlesFile, articles);
}

export async function pullArticlesFromServer() {
  return await fetchRaw(SYNC_CONFIG.articlesFile);
}

// ─── Learning Resources (Tài Nguyên Học Tập) ──────────────────────────────
export async function pushResourcesToServer(resources) {
  return await pushFile(SYNC_CONFIG.resourcesFile, resources);
}

export async function pullResourcesFromServer() {
  return await fetchRaw(SYNC_CONFIG.resourcesFile);
}

// ─── User Feedbacks (Phản Hồi Học Viên) ───────────────────────────────────
export async function pushFeedbacksToServer(feedbacks) {
  return await pushFile(SYNC_CONFIG.feedbacksFile, feedbacks);
}

export async function pullFeedbacksFromServer() {
  return await fetchRaw(SYNC_CONFIG.feedbacksFile);
}

// ─── Subject Details Config (Thiết Lập Trang Môn Học) ──────────────────────
export async function pushSubjectDetailsToServer(subjectId, details, idToken) {
  try {
    const response = await fetch('/api/subject-details', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken || ''}` },
      body: JSON.stringify({ subjectId, details })
    });
    const payload = await response.json().catch(() => ({}));
    return response.ok && payload.ok ? { ok: true, details: payload.subjectDetails } : { ok: false, reason: payload.reason || `subject-details-api-${response.status}` };
  } catch (error) {
    return { ok: false, reason: 'subject-details-api-unavailable', error: String(error?.message || error) };
  }
}

export async function pullSubjectDetailsFromServer() {
  try {
    const response = await fetch(`/api/subject-details?t=${Date.now()}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok && payload.subjectDetails && typeof payload.subjectDetails === 'object') return payload.subjectDetails;
  } catch { /* Static/local preview has no API route; use the public GitHub file below. */ }
  return await fetchRaw(SYNC_CONFIG.subjectDetailsFile);
}

// ─── Shared Notes Keys Sync ──────────────────────────────────────────────────
export async function pushSharedNotesToServer(notesMap) {
  return await pushFile('data/shared_notes.json', notesMap);
}

export async function pullSharedNotesFromServer() {
  return await fetchRaw('data/shared_notes.json');
}

// ─── Jina AI Web Reader (Cào nội dung từ URL như SciSpace) ────────────────
/**
 * Dùng Jina AI Reader API (r.jina.ai) để đọc nội dung bất kỳ URL nào
 * Bypass CORS hoàn toàn, trả về markdown text sạch
 * @param {string} url - URL trang web cần đọc
 * @returns {string} markdown text content
 */
export async function fetchWebContent(url) {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const res = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain, text/markdown' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Jina AI trả về lỗi ${res.status}`);
    const text = await res.text();
    // Giới hạn 80000 ký tự để tránh quá dài
    return text.slice(0, 80000);
  } catch (e) {
    console.warn('[Sync] fetchWebContent thất bại:', e);
    throw e;
  }
}
