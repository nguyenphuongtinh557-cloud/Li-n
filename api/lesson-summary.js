import { verifyFirebaseUser } from '../lib/firebaseAuth.js';
import { isAdminEmail } from '../lib/adminAccess.js';

const SUBJECT_DETAILS_FILE = 'data/subject_details.json';
const inFlight = new Map();
const rateBuckets = new Map();

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const gatewayUrl = process.env.AI_GATEWAY_URL;
  const gatewayKey = process.env.AI_GATEWAY_KEY;
  const model = process.env.GATEWAY_SUMMARY_ALIAS || 'gemini-3.5-flash-lite';
  if (!token || !owner || !repo || !gatewayUrl || !gatewayKey) return null;
  return {
    token,
    owner,
    repo,
    gatewayUrl: String(gatewayUrl).trim().replace(/\/+$/, ''),
    gatewayKey: String(gatewayKey).trim(),
    model,
    branch: process.env.GITHUB_BRANCH || 'main'
  };
}

async function githubRequest(config, path, options = {}) {
  return fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`, {
    ...options,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(options.headers || {}) }
  });
}

async function readSubjectMap(config) {
  const response = await githubRequest(config, SUBJECT_DETAILS_FILE, { cache: 'no-store' });
  if (!response.ok) throw new Error(`github-read-${response.status}`);
  const payload = await response.json();
  return { map: JSON.parse(Buffer.from(payload.content, 'base64').toString('utf8')), sha: payload.sha };
}

async function writeSubjectMap(config, map, sha) {
  const content = Buffer.from(JSON.stringify(map, null, 2), 'utf8').toString('base64');
  const response = await githubRequest(config, SUBJECT_DETAILS_FILE, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'cache: lesson AI summaries', content, branch: config.branch, ...(sha ? { sha } : {}) })
  });
  if (!response.ok) throw new Error(`github-write-${response.status}`);
}

function extractLessonSource(lesson) {
  const supported = new Set(['heading', 'text', 'lessonDocument', 'legacyHtml']);
  const blocks = Array.isArray(lesson.blocks) ? lesson.blocks : [];
  const source = blocks.filter(block => supported.has(block?.type)).map(block => String(block.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
  return source || String(lesson.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hashLesson(chapter, lesson, source) {
  const value = `${chapter.title || ''}
${lesson.title || ''}
${source}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `v1-${(hash >>> 0).toString(16)}-${value.length}`;
}

// Đếm theo học viên đã xác thực: cả lớp 199 người dùng chung NAT sẽ nghẽn
// nếu bucket chốt theo IP.
function allowedRequest(userId) {
  const key = String(userId || 'anonymous');
  const now = Date.now();
  const active = (rateBuckets.get(key) || []).filter(time => now - time < 60_000);
  if (active.length >= 8) return false;
  active.push(now); rateBuckets.set(key, active); return true;
}

function summaryPrompt({ mode, chapterTitle, lessonTitle, source, instruction }) {
  const modeRules = {
    quick: 'Tạo 3–5 ý quan trọng nhất, ngắn gọn.',
    study: 'Nêu ý chính, khái niệm và ví dụ/ngữ cảnh nếu nguồn có.',
    exam: 'Nêu từ khóa, điểm dễ nhầm và đúng 3 câu tự kiểm tra.'
  };
  return `Bạn là trợ lý học tập. CHỈ dùng NGUỒN BÀI HỌC bên dưới, không thêm kiến thức ngoài nguồn. Nếu nguồn không đủ, phải nói rõ: "Nội dung bài học chưa đủ để kết luận".\n\nCHƯƠNG: ${chapterTitle}\nBÀI: ${lessonTitle}\nCHẾ ĐỘ: ${mode}\nYÊU CẦU: ${modeRules[mode]}\nGỢI Ý THÊM: ${instruction || 'Không có'}\n\nNGUỒN BÀI HỌC:\n${source}\n\nTrả về JSON hợp lệ duy nhất: {"mainPoints":["..."],"keywords":["..."],"pitfalls":["..."],"quickQuestions":["..."],"source":"${chapterTitle} — ${lessonTitle}"}.`;
}

async function generateSummary(config, request) {
  const response = await fetch(`${config.gatewayUrl}/v1/internal/ai/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.gatewayKey}`
    },
    body: JSON.stringify({
      feature: 'qlcl-ai',
      modelAlias: config.model,
      // uid đã xác minh bằng Firebase ID token — gateway giới hạn theo từng học viên
      userId: request.userId,
      input: { messages: [{ role: 'user', content: summaryPrompt(request) }] },
      options: { temperature: 0.2, maxTokens: 4096, timeoutMs: 120_000 }
    })
  });
  if (!response.ok) {
    const error = new Error(`gateway-${response.status}`);
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }
  const payload = await response.json();
  const text = String(payload.content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
  return {
    mainPoints: Array.isArray(parsed.mainPoints) ? parsed.mainPoints.slice(0, 8) : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 12) : [],
    pitfalls: Array.isArray(parsed.pitfalls) ? parsed.pitfalls.slice(0, 6) : [],
    quickQuestions: Array.isArray(parsed.quickQuestions) ? parsed.quickQuestions.slice(0, 3) : [],
    source: String(parsed.source || `${request.chapterTitle} — ${request.lessonTitle}`)
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return json(res, 405, { ok: false, reason: 'method-not-allowed' });

  let user;
  try {
    user = await verifyFirebaseUser(req);
  } catch (error) {
    return json(res, error.status || 401, { ok: false, reason: error.message || 'unauthorized' });
  }

  if (!allowedRequest(user.uid)) return json(res, 429, { ok: false, reason: 'rate-limited', message: 'Tối đa 8 lượt tóm tắt mỗi 5 phút cho mỗi học viên' });

  // Endpoint này ghi cache vào data/subject_details.json qua GitHub token.
  // Chỉ quản trị viên được phép chạy, nếu không học viên có thể tạo commit
  // vào kho học liệu và đốt quota AI.
  if (!isAdminEmail(user.email)) {
    return json(res, 403, { ok: false, reason: 'admin-required', message: 'Chỉ quản trị viên được tạo tóm tắt bài học' });
  }

  const config = getConfig();
  if (!config) return json(res, 503, { ok: false, reason: 'summary-service-not-configured' });

  const { subjectId, chapterId, lessonId, mode = 'quick', instruction = '', force = false } = req.body || {};
  if (!subjectId || !lessonId || !['quick', 'study', 'exam'].includes(mode)) return json(res, 400, { ok: false, reason: 'invalid-summary-request' });
  if (String(instruction).length > 300) return json(res, 400, { ok: false, reason: 'instruction-too-long' });

  try {
    const { map, sha } = await readSubjectMap(config);
    const details = map[subjectId];
    if (!details || details.status !== 'published') return json(res, 404, { ok: false, reason: 'lesson-not-published' });
    let chapter; let lesson;
    for (const item of details.chapters || []) {
      const found = (item.lessons || []).find(value => value.id === lessonId);
      if (found) { chapter = item; lesson = found; break; }
    }
    if (!lesson || (chapterId && chapter.id !== chapterId)) return json(res, 404, { ok: false, reason: 'lesson-not-found' });
    if (!lesson.aiSummary?.enabled) return json(res, 403, { ok: false, reason: 'summary-disabled-for-lesson' });

    const source = extractLessonSource(lesson);
    if (source.length < 40) return json(res, 422, { ok: false, reason: 'lesson-has-no-summary-content' });
    const contentHash = hashLesson(chapter, lesson, source);
    const cached = lesson.aiSummary?.cache?.[mode];
    if (!force && cached?.contentHash === contentHash && cached?.result) return json(res, 200, { ok: true, cached: true, contentHash, summary: cached.result });

    const lockKey = `${subjectId}:${lessonId}:${mode}:${contentHash}`;
    if (inFlight.has(lockKey)) return json(res, 202, { ok: false, reason: 'summary-in-progress' });
    inFlight.set(lockKey, true);
    try {
      const result = await generateSummary(config, { mode, userId: user.uid, chapterTitle: chapter.title || 'Chương học', lessonTitle: lesson.title || 'Bài học', source: source.slice(0, 28000), instruction: String(instruction).trim() });
      lesson.aiSummary = lesson.aiSummary || { enabled: true, cache: {} };
      lesson.aiSummary.contentHash = contentHash;
      lesson.aiSummary.status = 'ready';
      lesson.aiSummary.updatedAt = new Date().toISOString();
      lesson.aiSummary.cache = lesson.aiSummary.cache || {};
      lesson.aiSummary.cache[mode] = { contentHash, createdAt: new Date().toISOString(), model: config.model, result };
      await writeSubjectMap(config, map, sha);
      return json(res, 200, { ok: true, cached: false, contentHash, summary: result });
    } finally { inFlight.delete(lockKey); }
  } catch (error) {
    return json(res, error.status || 502, { ok: false, reason: error.message || 'summary-service-error' });
  }
};
