/**
 * lib/directProviders.js — gọi thẳng Groq / Gemini / OpenRouter khi không dùng
 * AI gateway. Giữ nguyên hành vi cũ: xoay key khi hết quota, fallback sang
 * nhà cung cấp khác khi cả cụm key của provider chính đều lỗi.
 *
 * Env:
 *   GROQ_API_KEYS=k1,k2,k3        (hoặc GROQ_API_KEY=k1)
 *   GEMINI_API_KEYS=...
 *   OPENROUTER_API_KEYS=...
 */

const PROVIDER_ENV = {
  groq: 'GROQ',
  gemini: 'GEMINI',
  openrouter: 'OPENROUTER'
};

const OPENAI_COMPATIBLE = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions'
};

// Chỉ dùng 2 model: mọi provider phía client đều quy về một trong hai.
const GROQ_TARGET = Object.freeze({ provider: 'groq', model: 'openai/gpt-oss-120b' });
const GEMINI_TARGET = Object.freeze({ provider: 'gemini', model: 'gemini-3.5-flash-lite' });

// Model Premium: vẫn chặn quyền khi client chọn, dù đầu ra dùng model thường.
const PREMIUM_REQUESTS = new Set([
  'deepseek/deepseek-r1',
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat',
  'anthropic/claude-3.5-sonnet',
  'mistralai/mistral-large',
  'mistralai/mistral-large-latest',
  'openai/gpt-4o',
  'gemma-4-26b-preview',
  'Meta-Llama-3.3-70B-Instruct',
  'google/gemini-2.0-pro-exp-02-05'
]);

const FALLBACK_TARGET = {
  groq: GEMINI_TARGET,
  gemini: GROQ_TARGET
};

const CALL_TIMEOUT_MS = 90_000;
// Vercel cắt function ở 300s. Mỗi lần thử tối đa 90s, tổng cho một provider
// 150s, rồi còn 120s cho provider dự phòng → luôn dưới ngưỡng.
const TARGET_BUDGET_MS = 150_000;
const FALLBACK_BUDGET_MS = 120_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const AUTH_FAILURE_COOLDOWN_MS = 10 * 60_000;

export function resolveTarget(provider) {
  const key = String(provider || '').toLowerCase();
  if (key === 'gemini') return GEMINI_TARGET;
  if (['groq', 'openrouter', 'mistral', 'sambanova', 'cerebras'].includes(key)) return GROQ_TARGET;
  return null;
}

export function isPremiumRequest(model) {
  return PREMIUM_REQUESTS.has(String(model || ''));
}

export function getProviderKeys(provider) {
  const prefix = PROVIDER_ENV[provider];
  if (!prefix) return [];
  const list = String(process.env[`${prefix}_API_KEYS`] || '').trim();
  const single = String(process.env[`${prefix}_API_KEY`] || '').trim();
  const raw = list ? list.split(/[,\s]+/) : [single];
  return [...new Set(raw.map((key) => key.trim()).filter(Boolean))];
}

export function hasAnyProviderKeys() {
  return Object.keys(PROVIDER_ENV).some((provider) => getProviderKeys(provider).length > 0);
}

const rotationState = new Map();

function stateFor(provider) {
  if (!rotationState.has(provider)) rotationState.set(provider, { cursor: 0, cooldown: new Map() });
  return rotationState.get(provider);
}

function coolDown(provider, key, ms) {
  stateFor(provider).cooldown.set(key, Date.now() + ms);
}

function availableKeys(provider) {
  const keys = getProviderKeys(provider);
  const { cooldown } = stateFor(provider);
  const now = Date.now();
  const fresh = keys.filter((key) => (cooldown.get(key) || 0) <= now);
  return fresh.length ? fresh : [];
}

function nextKey(provider, used) {
  const keys = availableKeys(provider).filter((key) => !used.has(key));
  if (!keys.length) return null;
  const state = stateFor(provider);
  const key = keys[state.cursor % keys.length];
  state.cursor = (state.cursor + 1) % 1_000_000;
  used.add(key);
  return key;
}

function providerError(status, data) {
  const message = data?.error?.message || data?.message || `Provider error ${status}`;
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeFetchError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return Object.assign(new Error('Nhà cung cấp AI không phản hồi kịp'), { status: 504 });
  }
  const reason = error?.cause?.code || error?.message || 'fetch failed';
  return Object.assign(new Error(`Không kết nối được nhà cung cấp AI (${reason})`), { status: 503 });
}

async function fetchJson(url, init, timeoutMs) {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(Math.max(1_000, timeoutMs)) });
  } catch (error) {
    throw normalizeFetchError(error);
  }
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function toGeminiContents(messages) {
  const systemParts = [];
  const contents = [];
  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    });
  }
  return { contents, systemInstruction: systemParts.length ? { parts: [{ text: systemParts.join('\n\n') }] } : undefined };
}

function readGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => part.text || '').join('').trim();
}

async function callOpenAiCompatible(provider, key, { model, messages, temperature, maxTokens, images }, timeoutMs) {
  const body = {
    model,
    messages: images
      ? messages.map((message, index) => (index === messages.length - 1
        ? { ...message, content: [{ type: 'text', text: message.content }, ...images.map((image) => ({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } }))] }
        : message))
      : messages,
    stream: false
  };
  if (typeof temperature === 'number') body.temperature = temperature;
  if (typeof maxTokens === 'number') body.max_tokens = maxTokens;

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://qlclvaluatattpcntp24adthu.vercel.app';
    headers['X-Title'] = 'FTECA 24';
  }

  const { ok, status, data } = await fetchJson(OPENAI_COMPATIBLE[provider], {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, timeoutMs);
  if (!ok) throw providerError(status, data);
  const content = data?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((part) => part.text || '').join('')
    : String(content || '');
  if (!text.trim()) throw Object.assign(new Error('Provider returned an empty response'), { status: 502 });
  return { content: text, model, usage: data?.usage };
}

async function callGemini(key, { model, messages, temperature, maxTokens, images }, timeoutMs) {
  const { contents, systemInstruction } = toGeminiContents(messages);
  if (images?.length) {
    const last = contents[contents.length - 1];
    if (last) {
      last.parts.push(...images.map((image) => ({ inline_data: { mime_type: image.mimeType, data: image.data } })));
    }
  }

  const body = { contents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  const generationConfig = {};
  if (typeof temperature === 'number') generationConfig.temperature = temperature;
  if (typeof maxTokens === 'number') generationConfig.maxOutputTokens = maxTokens;
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;

  const { ok, status, data } = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      // Key nằm ở header, không nhét vào URL để không lọt vào log.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body)
    },
    timeoutMs
  );
  if (!ok) throw providerError(status, data);
  const text = readGeminiText(data);
  if (!text) throw Object.assign(new Error('Gemini returned an empty response'), { status: 502 });
  return { content: text, model, usage: data?.usageMetadata };
}

function callWithKey(target, key, payload, timeoutMs) {
  return target.provider === 'gemini'
    ? callGemini(key, { ...payload, model: target.model }, timeoutMs)
    : callOpenAiCompatible(target.provider, key, { ...payload, model: target.model }, timeoutMs);
}

async function runTarget(target, payload, budgetMs) {
  const used = new Set();
  const deadline = Date.now() + budgetMs;
  let lastError = null;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 1_000) {
      throw lastError || Object.assign(new Error('Hết thời gian chờ nhà cung cấp AI'), { status: 504 });
    }
    const key = nextKey(target.provider, used);
    if (!key) break;
    try {
      return await callWithKey(target, key, payload, Math.min(CALL_TIMEOUT_MS, remaining));
    } catch (error) {
      lastError = error;
      if (error.status === 429) coolDown(target.provider, key, RATE_LIMIT_COOLDOWN_MS);
      else if (error.status === 401 || error.status === 403) coolDown(target.provider, key, AUTH_FAILURE_COOLDOWN_MS);
      if (error.status === 400) throw error;
    }
  }
  throw lastError || Object.assign(new Error(`Không có key khả dụng cho ${target.provider}`), { status: 503 });
}

export async function callDirect(target, payload) {
  if (!getProviderKeys(target.provider).length) {
    const fallback = FALLBACK_TARGET[target.provider];
    if (!fallback || !getProviderKeys(fallback.provider).length) {
      throw Object.assign(new Error(`Chưa cấu hình key cho ${target.provider}`), { status: 503 });
    }
    return runTarget(fallback, payload, FALLBACK_BUDGET_MS);
  }
  try {
    return await runTarget(target, payload, TARGET_BUDGET_MS);
  } catch (error) {
    // 400 là lỗi payload, đổi provider cũng hỏng y như vậy.
    if (error.status === 400) throw error;
    const fallback = FALLBACK_TARGET[target.provider];
    if (!fallback || !getProviderKeys(fallback.provider).length) throw error;
    try {
      const result = await runTarget(fallback, payload, FALLBACK_BUDGET_MS);
      console.warn(`[AI] ${target.provider} lỗi (${error.status || error.message}) — đã chuyển sang ${fallback.provider}`);
      return result;
    } catch {
      throw error;
    }
  }
}

export async function callDirectVision({ prompt, images }) {
  const payload = {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 4_000,
    images
  };
  if (getProviderKeys('gemini').length) return runTarget(GEMINI_TARGET, payload, TARGET_BUDGET_MS);
  throw Object.assign(new Error('Chưa cấu hình GEMINI_API_KEYS cho tính năng phân tích ảnh'), { status: 503 });
}
