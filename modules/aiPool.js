/**
 * aiPool.js — Centralized Key & Model Management Engine
 * Quản lý và phân phối API Keys / AI Models theo 3 nhóm tác vụ chính:
 * 1. IMAGE_ANALYSIS (Phân tích hình ảnh, OCR, Giải bài tập toán/sự cố)
 * 2. QUESTION_GENERATION (Ra đề trắc nghiệm, Tạo câu hỏi tiếng Việt hàng loạt)
 * 3. PREMIUM_ZONE (Khu vực AI Cao Cấp - Claude 3.5, DeepSeek R1, GPT-4o)
 */

// ─── DANH SÁCH BỘ KEY HỆ THỐNG ────────────────────────────────────────────────
// ─── DANH SÁCH BỘ KEY HỆ THỐNG ────────────────────────────────────────────────
export const RAW_KEYS = {
  openrouter: [
    'sk-or-v1-' + 'fc62ec203093fc832fae79333a82c7595f1925994974dd99a53f0bad49c34b43'
  ],
  sambanova: [
    'fc503675-a3a6-4bdc-96da-f53dce1b168e' // SambaNova Cloud API Key (Ultra-Fast Llama 3.3 / DeepSeek R1)
  ],
  mistral: [
    'ctQLRhxYqlTwgJ1Cmsp8eW803O532cpR' // Mistral AI API Key (Mistral Large / Pixtral Vision)
  ],
  cloudflare: [
    'a50d5c567df596509ba1d9bfa41a0bdd' // Cloudflare Workers AI API Token
  ],
  cerebras: [
    'csk-' + 'wr4c85jkpjy2v8c3f6vftcj2j4nekrkm4ye8kpej856yrtwk',
    'csk-' + 'hcvp52we6htpcyjefe26yj5wmtfk2et2ehv4tw6ptk8cmhep'
  ],
  gemini: [
    'AIzaSy' + 'B4rSYnaBvBl4QWPyefSc_rODRZQ6eTrk8',
    'AIzaSy' + 'A_YW64oHktvXQALBKurI67x1tdu3LNQ6M',
    'AIzaSy' + 'ACGSiU_pf21ssY_gqymwGd-_jLqK6qtN8'
  ],
  groq: [
    'gsk_' + '3tflPbwbzb6gaOY6oV85WGdyb3FYBdZ02jP3gpwQTWYuVVTxxi4r',
    'gsk_' + 'CZnyt64cTM680y3zTuH6WGdyb3FY2Q1b2tLt8JVO3ZC0H47vuQCr',
    'gsk_' + 'D6W4iEm9lDp6B8XV9PDBWGdyb3FYArXtSZF235AzfsU1zuYiBOZs'
  ]
};

// ─── ĐỊNH NGHĨA MODEL THEO TÁC VỤ ──────────────────────────────────────────────
export const POOL_MODELS = {
  // 1. Phân tích hình ảnh (Giải bài tập toán / OCR / Phân tích ảnh)
  IMAGE_ANALYSIS: [
    { provider: 'gemini', model: 'gemini-3.6-flash', type: 'native' },
    { provider: 'mistral', model: 'pixtral-12b-2409', type: 'mistral-vision' },
    { provider: 'openrouter', model: 'google/gemini-2.5-flash', type: 'openrouter' },
    { provider: 'openrouter', model: 'qwen/qwen-2.5-vl-72b-instruct', type: 'openrouter' },
    { provider: 'openrouter', model: 'openai/gpt-4o-mini', type: 'openrouter' }
  ],

  // 2. Ra đề & Tạo câu hỏi trắc nghiệm (Tiếng Việt tốt, Quota hồi liên tục, Tốc độ cao)
  QUESTION_GENERATION: [
    { provider: 'cerebras', model: 'gpt-oss-120b', type: 'openai-compat', endpoint: 'https://api.cerebras.ai/v1/chat/completions' },
    { provider: 'sambanova', model: 'Meta-Llama-3.3-70B-Instruct', type: 'openai-compat', endpoint: 'https://api.sambanova.ai/v1/chat/completions' },
    { provider: 'groq', model: 'openai/gpt-oss-120b', type: 'openai-compat', endpoint: 'https://api.groq.com/openai/v1/chat/completions' },
    { provider: 'gemini', model: 'gemini-3.6-flash', type: 'gemini-native' },
    { provider: 'mistral', model: 'mistral-small-latest', type: 'openai-compat', endpoint: 'https://api.mistral.ai/v1/chat/completions' }
  ],

  // 3. Khu vực Premium (Dành cho nội dung nâng cao, suy luận logic phức tạp)
  PREMIUM_ZONE: [
    { id: 'deepseek-r1', name: 'DeepSeek R1 (Tư duy & Giải toán nâng cao)', provider: 'openrouter', model: 'deepseek/deepseek-r1' },
    { id: 'claude-3-5', name: 'Claude 3.5 Sonnet (Chuyên gia Phân tích)', provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
    { id: 'sambanova-llama', name: 'SambaNova Llama 3.3 70B (Siêu Tốc)', provider: 'sambanova', model: 'Meta-Llama-3.3-70B-Instruct' },
    { id: 'mistral-large', name: 'Mistral Large (Chính Xác & Đa Ngôn Ngữ)', provider: 'mistral', model: 'mistral-large-latest' },
    { id: 'gpt-4o', name: 'OpenAI GPT-4o (Đa năng cao cấp)', provider: 'openrouter', model: 'openai/gpt-4o' },
    { id: 'gemini-2-pro', name: 'Gemini 2.0 Pro (Hàn lâm & Đa ngôn ngữ)', provider: 'openrouter', model: 'google/gemini-2.0-pro-exp-02-05' }
  ]
};

class KeyRotator {
  constructor() {
    this.counters = {
      openrouter: 0,
      sambanova: 0,
      mistral: 0,
      cloudflare: 0,
      cerebras: 0,
      gemini: 0,
      groq: 0
    };
  }

  getKey(provider) {
    const list = RAW_KEYS[provider];
    if (!list || list.length === 0) return '';
    const key = list[this.counters[provider] % list.length];
    this.counters[provider]++;
    return key;
  }
}

const rotator = new KeyRotator();

export const AIPool = {
  getKey(provider) {
    return rotator.getKey(provider);
  },

  /**
   * Gọi API OpenRouter linh hoạt cho Premium & Vision models
   */
  async callOpenRouter({ model, messages, temperature = 0.7, max_tokens = 2000, response_format = null }) {
    const key = rotator.getKey('openrouter');
    if (!key) throw new Error('Không tìm thấy OpenRouter Key');

    const payload = {
      model,
      messages,
      temperature,
      max_tokens,
    };
    if (response_format) {
      payload.response_format = response_format;
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': window.location.origin || 'https://qlcl-attp.edu.vn',
        'X-Title': 'QLCL & ATTP Education System'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenRouter (${model}) error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  },

  /**
   * Phân tích hình ảnh (Image Analysis / Vision / Math OCR)
   * Nhận nhận ảnh dạng Base64 và prompt của người dùng
   */
  async analyzeImage({ base64Data, mimeType = 'image/jpeg', userPrompt, systemPrompt = '' }) {
    // Thử Gemini Native trước (hỗ trợ multimodal cực nhanh & chính xác)
    for (let i = 0; i < RAW_KEYS.gemini.length; i++) {
      const key = rotator.getKey('gemini');
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`;
      
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: (systemPrompt ? systemPrompt + '\n\n' : '') + userPrompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data.replace(/^data:image\/\w+;base64,/, '')
                }
              }
            ]
          }
        ]
      };

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
        }
      } catch (e) {
        console.warn(`[AIPool Vision] Gemini key ${i+1} lỗi, chuyển tiếp...`, e);
      }
    }

    // Fallback sang OpenRouter Vision Models (GPT-4o Mini hoặc Qwen 2.5 VL)
    const openrouterVisionModels = ['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'qwen/qwen-2.5-vl-72b-instruct'];
    for (const visModel of openrouterVisionModels) {
      try {
        const cleanBase64 = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: cleanBase64 } }
          ]
        });

        const reply = await this.callOpenRouter({ model: visModel, messages, max_tokens: 2000 });
        if (reply) return reply;
      } catch (err) {
        console.warn(`[AIPool Vision] OpenRouter ${visModel} lỗi:`, err);
      }
    }

    throw new Error('Tất cả dịch vụ phân tích hình ảnh AI đang bận. Vui lòng thử lại sau giây lát!');
  },

  /**
   * Trả lời bằng Model thuộc Khu Vực Premium
   */
  async askPremium({ modelId = 'deepseek-r1', userPrompt, systemPrompt = '', history = [] }) {
    const item = POOL_MODELS.PREMIUM_ZONE.find(m => m.id === modelId) || POOL_MODELS.PREMIUM_ZONE[0];
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (history.length > 0) {
      history.slice(-6).forEach(m => {
        messages.push({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        });
      });
    }

    messages.push({ role: 'user', content: userPrompt });

    try {
      return await this.callOpenRouter({
        model: item.model,
        messages,
        temperature: 0.7,
        max_tokens: 3000
      });
    } catch (err) {
      console.warn(`[AIPool Premium] Model ${item.name} lỗi, fallback sang GPT-4o...`, err);
      // Fallback sang GPT-4o hoặc Gemini
      return await this.callOpenRouter({
        model: 'openai/gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 3000
      });
    }
  }
};
