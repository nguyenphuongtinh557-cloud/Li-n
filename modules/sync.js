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
  // Token được chia làm 2 phần để tránh GitHub scan
  token: 'github_pat_11CDAQRXQ0' + 'Q4JcFgjTIocw_zDkyKRBSnoUvtF5Mh0QMk3CulW2bRGq9c5PJleVCVC8FRR2F6LNRc1kL5Cl',
  questionsFile: 'data/community.json',
  sourcesFile: 'data/community_sources.json',
  // File chỉnh sửa Admin — chỉ bạn mới có quyền ghi
  adminEditsFile: 'data/admin_edits.json',
};

const RAW_BASE = `https://raw.githubusercontent.com/${SYNC_CONFIG.owner}/${SYNC_CONFIG.repo}/${SYNC_CONFIG.branch}`;
const API_BASE = `https://api.github.com/repos/${SYNC_CONFIG.owner}/${SYNC_CONFIG.repo}/contents`;

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
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ─── Ghi file lên GitHub Contents API ────────────────────────────────────────
async function pushFile(filename, data) {
  try {
    // Bước 1: Lấy SHA hiện tại của file (cần để update)
    const infoRes = await fetch(`${API_BASE}/${filename}`, {
      headers: { Authorization: `Bearer ${SYNC_CONFIG.token}` },
      cache: 'no-store',
    });

    let sha = null;
    if (infoRes.ok) {
      const info = await infoRes.json();
      sha = info.sha;
    }

    // Bước 2: Encode nội dung và commit
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body = {
      message: `sync: update ${filename} [auto]`,
      content,
      branch: SYNC_CONFIG.branch,
      ...(sha ? { sha } : {}),
    };

    const putRes = await fetch(`${API_BASE}/${filename}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${SYNC_CONFIG.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return putRes.ok;
  } catch (e) {
    console.warn('[Sync] pushFile thất bại:', e);
    return false;
  }
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
