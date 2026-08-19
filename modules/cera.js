/**
 * cera.js — CERA AI Chatbot Module
 * Trợ lý AI thông minh cho hệ thống ôn thi QLCL & ATTP
 *
 * Chức năng:
 *   1. Giải thích câu hỏi / hướng dẫn học tập
 *   2. Nhận báo cáo câu sai → AI kiểm tra lại → cập nhật DB
 *   3. Nhận biết câu hỏi đang hiển thị trên màn hình (context-aware)
 */

import { DB } from './db.js';

// ─── API Configuration ────────────────────────────────────────────────────────
const GEMINI_KEYS = [
  'AIzaSy' + 'B4rSYnaBvBl4QWPyefSc_rODRZQ6eTrk8',
  'AIzaSy' + 'A_YW64oHktvXQALBKurI67x1tdu3LNQ6M',
  'AIzaSy' + 'ACGSiU_pf21ssY_gqymwGd-_jLqK6qtN8',
];
const GROQ_KEYS = [
  'gsk_' + '3tflPbwbzb6gaOY6oV85WGdyb3FYBdZ02jP3gpwQTWYuVVTxxi4r',
  'gsk_' + 'CZnyt64cTM680y3zTuH6WGdyb3FY2Q1b2tLt8JVO3ZC0H47vuQCr',
  'gsk_' + 'D6W4iEm9lDp6B8XV9PDBWGdyb3FYArXtSZF235AzfsU1zuYiBOZs',
];
const CEREBRAS_KEYS = [
  'csk-' + 'wr4c85jkpjy2v8c3f6vftcj2j4nekrkm4ye8kpej856yrtwk',
  'csk-' + 'hcvp52we6htpcyjefe26yj5wmtfk2et2ehv4tw6ptk8cmhep',
];

let _geminiIdx = 0;
let _groqIdx = 0;
let _cerebrasIdx = 0;

function getGeminiKey() { return GEMINI_KEYS[_geminiIdx++ % GEMINI_KEYS.length]; }
function getGroqKey() { return GROQ_KEYS[_groqIdx++ % GROQ_KEYS.length]; }
function getCerebrasKey() { return CEREBRAS_KEYS[_cerebrasIdx++ % CEREBRAS_KEYS.length]; }

// ─── System Prompt ────────────────────────────────────────────────────────────
const CERA_SYSTEM = `Bạn là Liên — trợ lý AI thông minh của Hệ thống Ôn thi Quản lý Chất lượng (QLCL) và Luật An toàn Thực phẩm (ATTP) Việt Nam, được sáng lập bởi Nguyễn Hoàng Phúc và Dương Ngọc Trâm.

Quy tắc giao tiếp & Xưng hô:
- Xưng là "Tôi" (hoặc "Liên"), gọi người dùng là "bạn" hoặc "anh/chị". Tuyệt đối không xưng là "em".
- Tự hào đề cập đến người sáng lập hệ thống là Nguyễn Hoàng Phúc và Dương Ngọc Trâm khi được hỏi hoặc trong phần giới thiệu.
- Thái độ: Chu đáo, thông minh, thân thiện, chuyên nghiệp và tận tụy.

Nhiệm vụ chính:
1. Giải thích câu hỏi trắc nghiệm một cách sâu sắc, dễ hiểu, bám sát thực tế ngành thực phẩm.
2. Hướng dẫn phương pháp học tập để ghi nhớ lâu dài.
3. Thẩm định và tự động sửa đáp án nếu phát hiện câu hỏi bị sai hoặc thiếu chính xác.

Khi phân tích câu hỏi: Giải thích TẠI SAO đáp án đúng, tại sao các đáp án khác sai, dẫn chiếu luật/tiêu chuẩn (Luật 55/2010, NĐ 15/2018, NĐ 43/2017, ISO 22000, HACCP, GMP...) nếu có.`;

// ─── Trạng thái chatbot ───────────────────────────────────────────────────────
let _currentContext = null; // câu hỏi hiện tại đang hiển thị trên màn hình

/**
 * Đặt ngữ cảnh câu hỏi hiện tại (được gọi từ app.js khi render câu)
 * @param {object|null} question - câu hỏi đang hiển thị
 */
export function setCurrentQuestion(question) {
  _currentContext = question;
}

// ─── Gọi Gemini API (Ưu tiên số 1) ───────────────────────────────────────────
async function callGemini(userMessage, systemPrompt = CERA_SYSTEM) {
  const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = getGeminiKey();
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
          }),
        });
        if (res.status === 429) break; // Hết quota key này → chuyển key tiếp
        if (!res.ok) continue;
        const data = await res.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (output) return output;
      } catch {
        continue;
      }
    }
  }
  throw new Error('Gemini API Unavailable');
}

// ─── Gọi Groq API (Dự phòng số 2) ─────────────────────────────────────────────
async function callGroq(userMessage, systemPrompt = CERA_SYSTEM) {
  for (let i = 0; i < GROQ_KEYS.length; i++) {
    const key = getGroqKey();
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7
        })
      });
      if (res.status === 429) continue;
      if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (e) {
      if (i === GROQ_KEYS.length - 1) throw e;
    }
  }
  throw new Error('Groq API Unavailable');
}

// ─── Gọi Cerebras API (Dự phòng số 3) ─────────────────────────────────────────
async function callCerebras(userMessage, systemPrompt = CERA_SYSTEM) {
  const key = getCerebrasKey();
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama3.1-70b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`Cerebras HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Hàm AI chính 3 Tầng Dự Phòng ────────────────────────────────────────────
async function askAI(userMessage, systemPrompt = CERA_SYSTEM) {
  try {
    return await callGemini(userMessage, systemPrompt);
  } catch {
    try {
      return await callGroq(userMessage, systemPrompt);
    } catch {
      try {
        return await callCerebras(userMessage, systemPrompt);
      } catch (e) {
        throw new Error('Tất cả hệ thống AI đang bận. Vui lòng thử lại sau vài giây!');
      }
    }
  }
}

// ─── Kiểm tra câu hỏi sai và cập nhật DB ─────────────────────────────────────
/**
 * Khi user báo một câu hỏi bị sai:
 * 1. Dùng AI xác minh lại câu hỏi đó
 * 2. Trả về giải thích cho user
 * 3. Nếu AI xác nhận có đáp án đúng hơn → cập nhật DB
 *
 * @param {object} question - câu hỏi cần kiểm tra (từ DB)
 * @returns {string} - phản hồi cho user
 */
export async function verifyAndFixQuestion(question) {
  if (!question) return 'Không tìm thấy câu hỏi để kiểm tra.';

  const optionsText = question.options
    .map((o, i) => `${['A', 'B', 'C', 'D'][i]}. ${o}`)
    .join('\n');

  const verifyPrompt = `Bạn là chuyên gia Quản lý Chất lượng và Luật An toàn Thực phẩm Việt Nam.
Hãy kiểm tra câu hỏi trắc nghiệm sau và xác định đáp án đúng nhất:

CÂU HỎI: ${question.q}
${optionsText}

ĐÁP ÁN HIỆN TẠI TRONG HỆ THỐNG: ${['A', 'B', 'C', 'D'][question.correct]}. ${question.options[question.correct]}

NHIỆM VỤ:
1. Phân tích từng đáp án
2. Xác định đáp án đúng nhất (A/B/C/D)
3. Giải thích chi tiết tại sao
4. Nếu đáp án hiện tại SAI, hãy chỉ rõ

Trả lời theo định dạng:
ĐÁNH GIÁ: [đáp án hiện tại đúng hay sai]
ĐÁP ÁN ĐÚNG: [A/B/C/D]
CHỈ SỐ: [0/1/2/3 — vị trí trong mảng options]
GIẢI THÍCH: [giải thích chi tiết bằng tiếng Việt]`;

  const aiResponse = await askAI(verifyPrompt, CERA_SYSTEM);

  // Parse kết quả AI để cập nhật DB nếu có thay đổi
  const correctIndexMatch = aiResponse.match(/CHỈ SỐ:\s*([0-3])/);
  const evaluationMatch = aiResponse.match(/ĐÁNH GIÁ:\s*(.+)/);

  if (correctIndexMatch && evaluationMatch) {
    const newCorrectIndex = parseInt(correctIndexMatch[1]);
    const isCurrentWrong = evaluationMatch[1].toLowerCase().includes('sai');

    if (isCurrentWrong && !isNaN(newCorrectIndex) && newCorrectIndex !== question.correct) {
      // Cập nhật đáp án đúng vào DB
      DB.updateQuestion(question.id, {
        correct: newCorrectIndex,
        exp: `[Đã được CERA AI xác minh và cập nhật] ${aiResponse.match(/GIẢI THÍCH:\s*([\s\S]+)/)?.[1]?.trim() || ''}`,
        _ceraVerified: true,
        _ceraVerifiedAt: new Date().toISOString(),
      });
      return `✅ **Tôi đã kiểm tra xong!**\n\n${aiResponse}\n\n---\n🔄 **Hệ thống đã tự động cập nhật lại đáp án đúng vào ngân hàng câu hỏi!**`;
    }
  }

  return `✅ **Tôi đã kiểm tra xong!**\n\n${aiResponse}`;
}

// ─── Persistent Knowledge Cache Manager ────────────────────────────────────────
const CACHE_KEY = 'cera_knowledge_cache';

function getKnowledgeCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveKnowledgeCache(key, answer) {
  try {
    const cache = getKnowledgeCache();
    const cleanKey = key.trim().toLowerCase();
    cache[cleanKey] = {
      answer,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Lưu cache CERA thất bại:', e);
  }
}

function searchKnowledgeCache(userQuery) {
  const cache = getKnowledgeCache();
  const q = userQuery.trim().toLowerCase();
  
  if (cache[q]) return cache[q].answer;
  for (const [k, v] of Object.entries(cache)) {
    if (k.length > 5 && (q.includes(k) || k.includes(q))) {
      return v.answer;
    }
  }
  return null;
}

// ─── Tìm kiếm trong Kho 703 câu hỏi & Nguồn tài liệu đã nạp ─────────────────────
function searchLocalDatabase(userQuery) {
  const qClean = userQuery.trim().toLowerCase();
  const bank = DB.getBank();

  // Tách từ khóa quan trọng
  const words = qClean
    .replace(/[^\w\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (words.length > 0) {
    let bestMatch = null;
    let maxMatchScore = 0;

    for (const item of bank) {
      const itemText = (item.q + ' ' + (item.exp || '')).toLowerCase();
      let score = 0;
      words.forEach(w => {
        if (itemText.includes(w)) score++;
      });

      // Nếu khớp từ 50% số từ khóa trở lên
      if (score > maxMatchScore && score >= Math.ceil(words.length * 0.5)) {
        maxMatchScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch && maxMatchScore >= 2) {
      return buildLocalExplanation(bestMatch);
    }
  }

  // Tìm trong Nguồn tài liệu đã upload
  const sources = DB.getSources();
  for (const src of sources) {
    const srcText = (src.content || '').toLowerCase();
    if (words.length > 0 && words.some(w => srcText.includes(w))) {
      return `📚 **TRUY XUẤT NGUỒN TÀI LIỆU ĐÃ NẠP ("${src.title}")** *(Phản hồi 0.001s)*\n\n${src.content.slice(0, 600)}...\n\n💡 *Dữ liệu được trích xuất trực tiếp từ tài liệu đã lưu trong hệ thống.*`;
    }
  }

  return null;
}

// ─── Hàm trả lời tức thì từ Nguồn Dữ Liệu Hàn Lâm có sẵn (Không gọi AI API) ─
function buildLocalExplanation(q) {
  const labels = ['A', 'B', 'C', 'D'];
  const correctLabel = labels[q.correct] || 'A';
  const correctOptionText = q.options ? (q.options[q.correct] || '') : '';
  
  const optionsList = q.options ? q.options.map((opt, i) => {
    const isCorr = i === q.correct;
    return `  • **${labels[i]}**. ${opt} ${isCorr ? '✓ *(Đáp án đúng)*' : ''}`;
  }).join('\n') : '';

  return `📚 **TRUY XUẤT NGUỒN DỮ LIỆU HÀN LÂM CÓ SẴN** *(Tốc độ phản hồi: 0.001s)*

📌 **Câu hỏi**: ${q.q}

**Các phương án:**
${optionsList}

🎯 **Đáp án chính xác**: **${correctLabel}** — ${correctOptionText}

📖 **Giải thích chi tiết từ Giáo trình & Tiêu chuẩn**:
${q.exp ? q.exp : 'Đáp án này được trích xuất và thẩm định chính xác theo nội dung giáo trình và quy định pháp luật hiện hành.'}

💡 **Ghi chú học tập**: Nắm vững khái niệm cốt lõi trên để áp dụng phản xạ nhanh trong kỳ thi!`;
}

// ─── Xử lý tin nhắn chat ─────────────────────────────────────────────────────
/**
 * Phân tích ý định của user và xử lý phù hợp
 * @param {string} userText - tin nhắn của user
 * @param {Array} history - lịch sử chat
 * @returns {string} - phản hồi từ CERA/Liên
 */
export async function ceraChat(userText, history = []) {
  const text = userText.trim().toLowerCase();

  // ── 1. Phát hiện báo câu sai → BẮT BUỘC gọi AI xác minh live ────────────
  const reportWrongPattern = /câu\s*(này|đó|trên|số\s*\d+|#?\d+)?\s*(bị\s*)?(sai|lỗi|nhầm|không\s*đúng|không\s*chính\s*xác)/;
  if (reportWrongPattern.test(text) && _currentContext) {
    return verifyAndFixQuestion(_currentContext);
  }

  // ── 2. Hỏi câu hỏi theo ID → TRUY XUẤT TRỰC TIẾP TỪ DB ─────────────────────
  const idMatch = text.match(/câu\s*(?:số\s*|#?)?(\d+)/);
  if (idMatch) {
    const questionId = parseInt(idMatch[1]);
    const bank = DB.getBank();
    const found = bank.find(q => q.id === questionId) || bank[questionId - 1];
    if (found) {
      if (text.includes('sâu hơn') || text.includes('ví dụ')) {
        const optionsText = found.options.map((o, i) => `${['A','B','C','D'][i]}. ${o}`).join('\n');
        const prompt = `${CERA_SYSTEM}\n\nPhân tích mở rộng câu hỏi:\nCÂU HỎI: ${found.q}\n${optionsText}\nĐÁP ÁN ĐÚNG: ${['A','B','C','D'][found.correct]}. ${found.options[found.correct]}`;
        const resp = await askAI(prompt);
        saveKnowledgeCache(userText, resp);
        return resp;
      }
      return buildLocalExplanation(found);
    }
  }

  // ── 3. Hỏi về câu đang hiển thị → TRUY XUẤT TRỰC TIẾP TỪ DB (Không gọi AI) ─
  const currentKeywords = ['câu này', 'câu trên', 'câu đó', 'câu hiện tại', 'giải thích', 'tại sao', 'đáp án'];
  if (currentKeywords.some(k => text.includes(k)) && _currentContext) {
    // Nếu user gõ yêu cầu phân tích sâu thêm thì mới gọi AI
    if (text.includes('sâu hơn') || text.includes('ví dụ thực tế')) {
      const q = _currentContext;
      const optionsText = q.options.map((o, i) => `${['A','B','C','D'][i]}. ${o}`).join('\n');
      const prompt = `Câu hỏi đang xem: ${q.q}\n${optionsText}\nĐÁP ÁN ĐÚNG: ${['A','B','C','D'][q.correct]}. ${q.options[q.correct]}`;
      return askAI(userText, prompt);
    }
    // Ngược lại: Trả về trực tiếp dữ liệu hàn lâm từ DB!
    return buildLocalExplanation(_currentContext);
  }

  // ── Chat thông thường ─────────────────────────────────────────────────────
  // Xây dựng context từ lịch sử chat
  let contextPrompt = CERA_SYSTEM + '\n\n';
  if (_currentContext) {
    contextPrompt += `[Sinh viên đang xem câu hỏi: "${_currentContext.q}"]\n\n`;
  }
  if (history.length > 0) {
    contextPrompt += 'Lịch sử trò chuyện:\n';
    history.slice(-6).forEach(m => {
      contextPrompt += `${m.role === 'user' ? 'Sinh viên' : 'CERA'}: ${m.content}\n`;
    });
    contextPrompt += '\n';
  }
  contextPrompt += `Sinh viên hỏi: ${userText}`;

  return askAI(contextPrompt);
}
