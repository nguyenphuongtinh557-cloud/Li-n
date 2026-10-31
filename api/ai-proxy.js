/**
 * api/ai-proxy.js — QLCL server-side AI proxy.
 *
 * Mọi lời gọi AI đều đi qua FTECA AI Gateway. Không có key nhà cung cấp
 * trong mã nguồn hay phía trình duyệt; chỉ cần một client key của gateway
 * nằm trong biến môi trường server.
 *
 * Env bắt buộc:
 *   FIREBASE_SERVICE_ACCOUNT_JSON — xác thực người dùng
 *   AI_GATEWAY_URL                — vd https://gateway.example.com
 *   AI_GATEWAY_KEY                — client key gw_live_...
 */

import admin from 'firebase-admin';
import { isAdminEmail } from '../lib/adminAccess.js';

const GATEWAY_FEATURE = 'qlcl-ai';
const GATEWAY_VISION_FEATURE = 'qlcl-vision';

// Tên model phía QLCL → alias đã đăng ký trong gateway.
const MODEL_ALIASES = {
  groq: {
    'openai/gpt-oss-120b': 'gpt-oss-120b',
    'openai/gpt-oss-20b': 'gpt-oss-20b',
    'groq/compound-mini': 'gpt-oss-20b'
  },
  gemini: {
    'gemini-3.5-flash-lite': 'gemini-3.5-flash-lite',
    'gemini-3.8-flash': 'gemini-3.8-flash',
    'gemini-2.5-flash': 'chat-default',
    'gemma-4-26b-preview': 'gemini-3.8-flash'
  },
  openrouter: {
    'openai/gpt-4o-mini': 'or-gpt-4o-mini',
    'openai/gpt-4o': 'or-gpt-4o',
    'google/gemini-2.5-flash-lite': 'or-gemini-2.5-flash-lite',
    'google/gemini-2.0-pro-exp-02-05': 'or-gemini-2.5-flash-lite',
    'google/gemini-2.0-flash-exp:free': 'or-gemini-2.5-flash-lite',
    'deepseek/deepseek-r1:free': 'or-deepseek-r1',
    'meta-llama/llama-3.3-70b-instruct': 'or-llama-3.3-70b',
    'deepseek/deepseek-chat': 'or-deepseek-chat',
    'deepseek/deepseek-r1': 'or-deepseek-r1',
    'qwen/qwen-2.5-vl-72b-instruct': 'or-qwen-vl',
    'anthropic/claude-3.5-sonnet': 'or-claude-3.5',
    'mistralai/mistral-large': 'or-mistral-large',
    'mistralai/mistral-large-latest': 'or-mistral-large',
    'mistralai/mistral-nemo': 'or-mistral-nemo'
  },
  mistral: {
    'open-mistral-nemo-2407': 'or-mistral-nemo',
    'ministral-8b-latest': 'or-mistral-nemo',
    'mistral-large-latest': 'or-mistral-large',
    'pixtral-12b-2409': 'or-qwen-vl'
  },
  sambanova: {
    'Meta-Llama-3.3-70B-Instruct': 'or-llama-3.3-70b'
  },
  cerebras: {
    'gpt-oss-120b': 'gpt-oss-120b'
  }
};

const DEFAULT_ALIASES = {
  groq: 'gpt-oss-120b',
  gemini: 'gemini-3.5-flash-lite',
  openrouter: 'or-gpt-4o-mini',
  mistral: 'or-mistral-nemo',
  sambanova: 'or-llama-3.3-70b',
  cerebras: 'gpt-oss-120b'
};

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

/**
 * Pass through 429 (student over budget) and 503/504 (gateway unavailable or
 * provider timeout) so the UI can tell "chờ chút" apart from a generic 502.
 */
function gatewayError(status, data) {
  const error = new Error(data?.error?.message || `Gateway error ${status}`);
  error.status = [429, 503, 504].includes(status) ? status : 502;
  return error;
}

const DEFAULT_FIREBASE_PROJECT_ID = 'fifth-chalice-507108-c5';

function getFirebaseConfig() {
  const firebaseServiceAccount = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();

  if (firebaseServiceAccount) {
    try {
      return { ok: true, serviceAccount: JSON.parse(firebaseServiceAccount) };
    } catch (error) {
      return { ok: false, reason: 'invalid-firebase-config', detail: error.message };
    }
  }

  // verifyIdToken chỉ cần projectId (thông tin công khai) để kiểm tra audience;
  // không cần service account cho việc xác thực token.
  return {
    ok: true,
    projectId: String(process.env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID).trim()
  };
}

function getFirebaseApp(firebaseConfig) {
  if (!admin.apps.length) {
    admin.initializeApp(firebaseConfig.serviceAccount
      ? { credential: admin.credential.cert(firebaseConfig.serviceAccount) }
      : { projectId: firebaseConfig.projectId });
  }
  return admin.app();
}

async function verifyUser(req, firebaseConfig) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    throw Object.assign(new Error('missing-auth-token'), { status: 401 });
  }

  getFirebaseApp(firebaseConfig);

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: String(decoded.email || '').trim().toLowerCase(),
      emailVerified: decoded.email_verified
    };
  } catch (error) {
    console.error('[AI Proxy] Token verification failed:', error.message);
    throw Object.assign(new Error('invalid-token'), { status: 401 });
  }
}

function getGatewayConfig() {
  const baseUrl = String(process.env.AI_GATEWAY_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(process.env.AI_GATEWAY_KEY || '').trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

function resolveGatewayAlias(provider, model) {
  const key = String(provider || '').toLowerCase();
  const map = MODEL_ALIASES[key];
  if (!map) return null;
  if (model && map[model]) return map[model];
  return DEFAULT_ALIASES[key] || null;
}

// Model trả phí chỉ dành cho tài khoản Premium. UI chỉ ẩn lựa chọn; server
// phải chặn vì sinh viên có thể gọi thẳng API bằng token Firebase của mình.
const PREMIUM_ALIASES = new Set([
  'or-deepseek-r1',
  'or-claude-3.5',
  'or-mistral-large',
  'or-gpt-4o'
]);
const MAX_TOKENS_LIMIT = 4096;
const ROLE_CACHE_TTL_MS = 60_000;
const roleCache = new Map();

function emailToDocId(email) {
  return String(email || '').trim().toLowerCase().replace(/[^a-z0-9_@.-]/g, '_');
}

function normalizeMaxTokens(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_TOKENS_LIMIT);
}

function normalizeTemperature(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(parsed, 0), 2);
}

async function getUserRole(firebaseConfig, email) {
  if (isAdminEmail(email)) return 'ADMIN';
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return 'NEWBIE';

  const cached = roleCache.get(cleanEmail);
  if (cached && cached.expiresAt > Date.now()) return cached.role;

  // verifyIdToken chỉ cần projectId, nhưng đọc Firestore cần service account.
  // Không có credentials thì không xác minh được quyền → coi là NEWBIE.
  if (!firebaseConfig.serviceAccount) return 'NEWBIE';

  getFirebaseApp(firebaseConfig);
  const snapshot = await admin.firestore().collection('users').doc(emailToDocId(cleanEmail)).get();
  const rawRole = snapshot.exists ? String(snapshot.get('role') || '').trim().toUpperCase() : '';
  const role = rawRole === 'PREMIUM' || rawRole === 'ADMIN' ? rawRole : 'NEWBIE';
  roleCache.set(cleanEmail, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
  return role;
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return null;
  const cleaned = messages
    .slice(0, 100)
    .filter((message) => message && ['user', 'assistant', 'system'].includes(message.role))
    .map((message) => ({ role: message.role, content: String(message.content ?? '').slice(0, 50_000) }))
    .filter((message) => message.content.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

const GATEWAY_TIMEOUT_MS = 125_000;

// Gateway tự cắt provider ở 120s; đợi thêm 5s rồi trả 504 để function không
// bị treo vô hạn khi gateway còn sống nhưng không bao giờ trả lời.
async function fetchGateway(url, init) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS) });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw Object.assign(new Error('AI gateway không phản hồi trong 125 giây'), { status: 504 });
    }
    const reason = error?.cause?.code || error?.message || 'fetch failed';
    throw Object.assign(new Error(`Không kết nối được AI gateway (${reason})`), { status: 503 });
  }
}

async function callGateway(gateway, { messages, modelAlias, temperature, maxTokens, userId }) {
  const response = await fetchGateway(`${gateway.baseUrl}/v1/internal/ai/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${gateway.apiKey}`
    },
    body: JSON.stringify({
      feature: GATEWAY_FEATURE,
      modelAlias,
      // uid đã xác minh bằng Firebase ID token — gateway dùng nó để giới hạn
      // số request mỗi phút cho từng học viên thay vì cho cả lớp.
      userId,
      input: { messages },
      options: {
        temperature: typeof temperature === 'number' ? temperature : undefined,
        maxTokens: typeof maxTokens === 'number' ? maxTokens : undefined,
        timeoutMs: 120_000
      },
      stream: false
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw gatewayError(response.status, data);
  }
  if (!data?.content) {
    throw new Error('Gateway returned an empty response');
  }

  return { content: data.content, model: data.model || modelAlias, usage: data.usage };
}

async function callGatewayVision(gateway, { prompt, images, userId }) {
  const response = await fetchGateway(`${gateway.baseUrl}/v1/internal/ai/vision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${gateway.apiKey}`
    },
    body: JSON.stringify({
      feature: GATEWAY_VISION_FEATURE,
      userId,
      images,
      prompt,
      options: { temperature: 0.2, maxTokens: 4_000, timeoutMs: 120_000 }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw gatewayError(response.status, data);
  }
  if (!data?.content) {
    throw new Error('Gateway returned an empty response');
  }

  return { content: data.content, model: data.model, usage: data.usage };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, {
      ok: false,
      error: 'method-not-allowed',
      message: 'Only POST method is allowed'
    });
  }

  try {
    const configResult = getFirebaseConfig();
    if (!configResult.ok) {
      return json(res, 503, {
        ok: false,
        error: configResult.reason,
        message: 'Firebase authentication not configured'
      });
    }

    let user;
    try {
      user = await verifyUser(req, configResult);
    } catch (error) {
      return json(res, error.status || 401, {
        ok: false,
        error: error.message,
        message: 'Authentication required'
      });
    }

    const gateway = getGatewayConfig();
    if (!gateway) {
      return json(res, 503, {
        ok: false,
        error: 'missing-gateway-config',
        message: 'AI gateway is not configured'
      });
    }

    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return json(res, 400, {
        ok: false,
        error: 'invalid-json',
        message: 'Request body must be valid JSON'
      });
    }

    if (body?.mode === 'vision') {
      const prompt = String(body.prompt || '').trim();
      const images = (Array.isArray(body.images) ? body.images : [])
        .slice(0, 5)
        .map((image) => ({
          data: String(image?.data || '').replace(/^data:[^;]+;base64,/, ''),
          mimeType: ALLOWED_IMAGE_TYPES.includes(image?.mimeType) ? image.mimeType : 'image/jpeg'
        }))
        .filter((image) => image.data);

      if (!prompt || images.length === 0) {
        return json(res, 400, {
          ok: false,
          error: 'invalid-vision-request',
          message: 'prompt and at least one image are required'
        });
      }

      const result = await callGatewayVision(gateway, { prompt, images, userId: user.uid });
      return json(res, 200, {
        ok: true,
        content: result.content,
        provider: 'gateway',
        model: result.model,
        usage: result.usage
      });
    }

    const { provider, model, temperature, max_tokens: maxTokens } = body || {};
    const messages = sanitizeMessages(body?.messages);
    const gatewayAlias = resolveGatewayAlias(provider, model);

    if (!provider || !messages) {
      return json(res, 400, {
        ok: false,
        error: 'invalid-request',
        message: 'Missing required fields: provider, messages'
      });
    }

    if (!gatewayAlias) {
      return json(res, 400, {
        ok: false,
        error: 'unsupported-model',
        message: `Unsupported provider/model: ${provider}/${model || '(default)'}`
      });
    }

    if (PREMIUM_ALIASES.has(gatewayAlias)) {
      if (user.emailVerified !== true) {
        return json(res, 403, {
          ok: false,
          error: 'email-verification-required',
          message: 'Vui lòng xác minh email trước khi dùng model Premium.'
        });
      }
      let role;
      try {
        role = await getUserRole(configResult, user.email);
      } catch (error) {
        console.error('[AI Proxy] Không đọc được role từ Firestore:', error.message);
        return json(res, 503, {
          ok: false,
          error: 'role-check-unavailable',
          message: 'Không xác minh được quyền Premium, vui lòng thử lại sau.'
        });
      }
      if (role === 'NEWBIE') {
        return json(res, 403, {
          ok: false,
          error: 'premium-required',
          message: 'Model này chỉ dành cho tài khoản Premium.'
        });
      }
    }

    const result = await callGateway(gateway, {
      messages,
      modelAlias: gatewayAlias,
      temperature: normalizeTemperature(temperature),
      maxTokens: normalizeMaxTokens(maxTokens),
      userId: user.uid
    });

    console.log(`[AI Proxy] ${user.uid} → ${provider}/${model || 'default'} ⇒ ${gatewayAlias}`);

    return json(res, 200, {
      ok: true,
      content: result.content,
      provider: 'gateway',
      model: result.model,
      usage: result.usage
    });
  } catch (error) {
    console.error('[AI Proxy] Error:', error.message);
    const errorCode = error.status === 429 ? 'rate-limited'
      : error.status === 503 ? 'gateway-unavailable'
      : error.status === 504 ? 'gateway-timeout'
      : 'ai-gateway-error';
    return json(res, error.status || 502, {
      ok: false,
      error: errorCode,
      message: error.message || 'AI service temporarily unavailable'
    });
  }
}
