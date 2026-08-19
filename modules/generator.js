/**
 * generator.js — Multi-Layer AI Question Generator
 * Phối hợp nhiều AI Models (Cerebras, Gemini, Groq) để tạo bộ đề đa tầng.
 */

import { DB } from './db.js';

const API_KEYS = {
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

class KeyManager {
  constructor() {
    this.counters = { cerebras: 0, gemini: 0, groq: 0 };
  }
  
  getKey(provider) {
    const keys = API_KEYS[provider];
    if (!keys || keys.length === 0) return '';
    const key = keys[this.counters[provider] % keys.length];
    this.counters[provider]++;
    return key;
  }
}

const keys = new KeyManager();

// System prompt base
const BASE_SYSTEM_PROMPT = `Bạn là chuyên gia giảng dạy môn Quản lý Chất lượng và An toàn Thực phẩm tại Việt Nam.
Nhiệm vụ: Tạo câu hỏi trắc nghiệm 4 đáp án (A, B, C, D) từ nội dung được cung cấp. Chỉ có duy nhất 1 đáp án đúng.
Trọng tâm: Vét sạch mọi khía cạnh có thể ra thi, sinh ra TẤT CẢ các câu hỏi có thể khai thác, tuyệt đối không lặp lại ý tưởng.

ĐỊNH DẠNG BẮT BUỘC (JSON Object chứa mảng 'questions'):
{
  "questions": [
    {
      "q": "Câu hỏi...",
      "options": ["A", "B", "C", "D"],
      "correct": 0,
      "difficulty": 1,
      "chapter": 1,
      "exp": "Giải thích ngắn gọn"
    }
  ]
}
Tuyệt đối chỉ trả về JSON hợp lệ, không có markdown hay bất kỳ chữ nào khác.`;

// Prompts theo Layer
const LAYER_PROMPTS = {
  layer1: `${BASE_SYSTEM_PROMPT}\n\nYÊU CẦU ĐẶC BIỆT (TẦNG NHẬN BIẾT - LAYER 1):\n- Hỏi về định nghĩa, tiêu chuẩn cơ bản.\n- Thuộc tính difficulty luôn bằng 1.`,
  layer3: `${BASE_SYSTEM_PROMPT}\n\nYÊU CẦU ĐẶC BIỆT (TẦNG VẬN DỤNG - LAYER 3):\n- Tạo câu hỏi tình huống thực tế, xử lý sự cố tại nhà máy thực phẩm.\n- Thuộc tính difficulty luôn bằng 2.`,
  layer4: `${BASE_SYSTEM_PROMPT}\n\nYÊU CẦU ĐẶC BIỆT (TẦNG SUY LUẬN SÂU - LAYER 4):\n- Tạo câu hỏi cực khó mang tính tổng hợp, phân tích rủi ro (Risk Assessment). Đòi hỏi suy luận logic, có các bẫy (distractor) hợp lý.\n- Thuộc tính difficulty luôn bằng 3.`
};

export const Generator = {
  async fromText(text, targetCount, onProgress = null) {
    const allQuestions = [];
    const chunks = _splitTextIntoChunks(text, 2500); // 2500 chars ~ 500 từ
    
    const countPerChunk = Math.ceil(targetCount / chunks.length);
    const countPerLayer = Math.max(3, Math.ceil(countPerChunk / 3)); 
    
    for (let i = 0; i < chunks.length; i++) {
      if (allQuestions.length >= targetCount) break;
      
      const chunk = chunks[i];
      onProgress && onProgress(Math.round((i / chunks.length) * 80), `Đang quét đoạn ${i+1}/${chunks.length} đa tầng (Cerebras + Gemini)...`);
      
      try {
          // Chạy 3 luồng song song
          const [qL1, qL3, qL4] = await Promise.all([
            _callOpenAIFormat('cerebras', 'gpt-oss-120b', LAYER_PROMPTS.layer1, chunk, countPerLayer, 'groq'),
            _callGemini(LAYER_PROMPTS.layer3, chunk, countPerLayer),
            _callOpenAIFormat('cerebras', 'gpt-oss-120b', LAYER_PROMPTS.layer4, chunk, countPerLayer, 'groq')
          ]);
          
          allQuestions.push(...qL1, ...qL3, ...qL4);
      } catch (e) {
          console.error("Lỗi chunk " + i, e);
      }
    }
    
    onProgress && onProgress(90, 'Chuẩn hóa và lọc trùng lặp...');
    
    // Lọc hợp lệ
    let validQuestions = allQuestions.filter(q => q && q.q && Array.isArray(q.options) && q.options.length === 4);
    
    // Loại trùng text
    const seen = new Set();
    validQuestions = validQuestions.filter(q => {
        const hash = q.q.toLowerCase().replace(/\\s+/g, '');
        if (seen.has(hash)) return false;
        seen.add(hash);
        return true;
    });

    // Trộn ngẫu nhiên
    for (let i = validQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validQuestions[i], validQuestions[j]] = [validQuestions[j], validQuestions[i]];
    }

    onProgress && onProgress(100, 'Hoàn thành quét đa tầng!');
    return validQuestions.slice(0, targetCount);
  }
};

/**
 * Gọi API dạng OpenAI (Cerebras, Groq)
 */
async function _callOpenAIFormat(primaryProvider, model, systemPrompt, content, count, fallbackProvider) {
  let provider = primaryProvider;
  let key = keys.getKey(provider);
  let endpoint = provider === 'cerebras' ? 'https://api.cerebras.ai/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions';
  
  const userMsg = `Nội dung tài liệu:\n${content}\n\nHãy sinh ${count} câu hỏi theo cấu trúc JSON object { "questions": [...] }. Trả lời ĐÚNG chuẩn JSON.`;
  
  const attemptCall = async (pvd, apikey, url, mod) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apikey}` },
      body: JSON.stringify({
        model: mod,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) throw new Error(`${pvd} lỗi ${res.status}`);
    const data = await res.json();
    return _parseJSONString(data.choices[0].message.content);
  };
  
  try {
    return await attemptCall(provider, key, endpoint, model);
  } catch (err) {
    console.warn(`[Multi-Layer] Lỗi ${provider}, Fallback sang ${fallbackProvider}...`, err);
    if (!fallbackProvider) return [];
    
    const fbKey = keys.getKey('groq');
    return await attemptCall('groq', fbKey, 'https://api.groq.com/openai/v1/chat/completions', 'openai/gpt-oss-120b').catch(e => {
        console.error('Fallback Groq failed:', e);
        return [];
    });
  }
}

/**
 * Gọi API Gemini (Layer 3)
 */
async function _callGemini(systemPrompt, content, count) {
  const key = keys.getKey('gemini');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`;
  
  const userMsg = `Nội dung tài liệu:\n${content}\n\nHãy sinh ${count} câu hỏi theo cấu trúc JSON object { "questions": [...] }. Trả lời ĐÚNG chuẩn JSON.`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    
    if (!res.ok) throw new Error(`Gemini lỗi ${res.status}`);
    const data = await res.json();
    return _parseJSONString(data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.warn('[Multi-Layer] Lỗi Gemini, Fallback sang Groq...', err);
    const fbKey = keys.getKey('groq');
    
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${fbKey}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return _parseJSONString(data.choices[0].message.content);
  }
}

function _parseJSONString(str) {
  try {
    let clean = str.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed.questions) ? parsed.questions : (Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    console.error('Lỗi parse JSON:', e);
    return [];
  }
}

function _splitTextIntoChunks(text, chunkSize) {
  if (text.length <= chunkSize) return [text];
  const chunks = [];
  let index = 0;
  while (index < text.length) {
    let nextIndex = index + chunkSize;
    if (nextIndex < text.length) {
      const spaceIdx = text.lastIndexOf(' ', nextIndex);
      if (spaceIdx > index + chunkSize / 2) {
        nextIndex = spaceIdx;
      }
    }
    chunks.push(text.slice(index, nextIndex).trim());
    index = nextIndex;
  }
  return chunks;
}
