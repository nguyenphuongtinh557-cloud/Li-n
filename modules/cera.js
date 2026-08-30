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
import { AIPool } from './aiPool.js';

// ─── System Prompt ────────────────────────────────────────────────────────────
// ─── System Prompt & Science AI Academic Knowledge Engine ─────────────────────
const CERA_SYSTEM = `Bạn là FTECA 24 — Trợ lý AI Chuyên gia Quản lý Chất lượng (QLCL) & Luật An toàn Thực phẩm (ATTP) Việt Nam.

QUY TẮC PHẢN HỒI (BẮT BUỘC TUÂN THỦ TUYỆT ĐỐI):
1. TRỌNG TÂM & NGẮN GỌN: Đi thẳng vào đáp án và nội dung phân tích/giải thích chuyên môn. Tuyệt đối KHÔNG chào hỏi dài dòng, KHÔNG chèn lời mở đầu dư thừa, KHÔNG gửi email hay thông tin cá nhân/người sáng lập vào câu trả lời.
2. XƯNG HÔ: Xưng "Tôi" (hoặc "FTECA 24"), gọi người dùng là "bạn" hoặc "anh/chị". Tuyệt đối không xưng "em".
3. CHUẨN XÁC HÀN LÂM: Trả lời chuẩn xác, dẫn chiếu chính xác điều khoản pháp luật (Luật ATTP 55/2010, NĐ 15/2018), tiêu chuẩn quốc tế (HACCP Codex 2020, ISO 22000:2018, ISO 9001:2015, GMP/SSOP) hoặc nguyên lý vi sinh/hóa học thực phẩm khi cần thiết.
4. CHỈ GIỚI THIỆU KHI ĐƯỢC HỎI TRỰC TIẾP: Chỉ đề cập đến thông tin người sáng lập (Nguyễn Hoàng Phúc & Dương Ngọc Trâm) khi người dùng trực tiếp hỏi "Bạn là ai?", "Ai sáng lập hệ thống này?".`;

// ─── Trạng thái chatbot ───────────────────────────────────────────────────────
let _currentContext = null; // câu hỏi hiện tại đang hiển thị trên màn hình

/**
 * Đặt ngữ cảnh câu hỏi hiện tại (được gọi từ app.js khi render câu)
 * @param {object|null} question - câu hỏi đang hiển thị
 */
export function setCurrentQuestion(question) {
  _currentContext = question;
}

// ─── Gọi Groq AI (Dự phòng cực nhanh & miễn phí) ────────────────────────────
async function callGroq(userMessage, systemPrompt) {
  const models = ['groq/compound-mini', 'openai/gpt-oss-120b'];
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = AIPool.getKey('groq');
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.7,
            max_tokens: 1500,
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const output = data.choices?.[0]?.message?.content;
        if (output) return output;
      } catch {
        continue;
      }
    }
  }
  throw new Error('Groq AI Failed');
}

// ─── Gọi Cerebras (CERA) AI hoặc AIPool ──────────────────────────────────────
async function askAI(userMessage, systemPrompt = CERA_SYSTEM) {
  const models = ['gpt-oss-120b'];

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const key = AIPool.getKey('cerebras');
      try {
        const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.7,
            max_tokens: 1500,
          }),
        });
        
        if (res.status === 402) {
          console.warn('Cerebras hết quota (402). Tự động chuyển sang Groq AI...');
          return await callGroq(userMessage, systemPrompt);
        }

        if (!res.ok) continue;
        const data = await res.json();
        const output = data.choices?.[0]?.message?.content;
        if (output) return output;
      } catch {
        continue;
      }
    }
  }

  try {
    return await callGroq(userMessage, systemPrompt);
  } catch (e) {
    throw new Error('⚠️ Cera AI đang bận. Vui lòng thử lại sau vài giây!');
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

// ─── Tìm kiếm trong Kho câu hỏi & Nguồn tài liệu đã nạp ────────────────────────
// Dùng weighted scoring: từ dài (>4 ký tự) = đặc trưng hơn → trọng số cao hơn
function searchLocalDatabase(userQuery) {
  const qClean = userQuery.trim().toLowerCase();
  const bank = DB.getBank();

  // Tách toàn bộ từ khóa (> 2 ký tự)
  const words = qClean
    .replace(/[^\w\sàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (words.length > 0) {
    // Phân loại từ khóa theo độ quan trọng
    const longWords  = words.filter(w => w.length > 4);  // đặc trưng cao, trọng số 3
    const shortWords = words.filter(w => w.length <= 4); // đặc trưng thấp, trọng số 1
    const maxPossibleScore = longWords.length * 3 + shortWords.length * 1;

    let bestMatch = null;
    let maxMatchScore = 0;

    for (const item of bank) {
      const qText   = item.q.toLowerCase();
      const expText = (item.exp || '').toLowerCase();
      const combined = qText + ' ' + expText;

      // Tính điểm weighted
      let score = 0;
      longWords.forEach(w  => { if (combined.includes(w)) score += 3; });
      shortWords.forEach(w => { if (combined.includes(w)) score += 1; });

      // Điều kiện 1: Phải đạt ≥ 60% tổng điểm tối đa
      if (maxPossibleScore > 0 && score < maxPossibleScore * 0.6) continue;

      // Điều kiện 2: Bắt buộc có ≥ 1 từ dài khớp (nếu query có từ dài)
      const hasLongMatch = longWords.length === 0 || longWords.some(w => combined.includes(w));
      if (!hasLongMatch) continue;

      // Điều kiện 3: Phần exp phải chứa ít nhất 1 từ dài liên quan → trả lời có nghĩa
      const expRelevant = longWords.length === 0 || longWords.some(w => expText.includes(w));
      if (!expRelevant) continue;

      if (score > maxMatchScore) {
        maxMatchScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch) {
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

  return `📌 **${q.q}**

${optionsList}

🎯 **Đáp án chính xác**: **${correctLabel}** — ${correctOptionText}

📖 **Giải thích**:
${q.exp ? q.exp : 'Đáp án được thẩm định chính xác theo nội dung giáo trình và quy định hiện hành.'}`;
}

// ─── Xử lý tin nhắn chat ─────────────────────────────────────────────────────
/**
 * Phân tích ý định của user và xử lý phù hợp
 * @param {string} userText - tin nhắn của user
 * @param {Array} history - lịch sử chat
 * @returns {string} - phản hồi từ FTECA 24
 */
// ─── Xử lý tin nhắn chat ─────────────────────────────────────────────────────
/**
 * Phân tích ý định của user và xử lý phù hợp
 * @param {string} userText - tin nhắn của user
 * @param {Array} history - lịch sử chat
 * @returns {string} - phản hồi từ FTECA 24
 */
/**
 * Phân tích hình ảnh (bài tập toán, sơ đồ, ảnh chụp đề thi) gửi vào CERA Chatbot
 * @param {string} base64Data - Dữ liệu ảnh Base64
 * @param {string} userText - Lời nhắn đi kèm
 * @param {Array} history - Lịch sử trò chuyện
 * @returns {string} Phản hồi phân tích từ AI Vision
 */
export async function ceraAnalyzeImage(base64Data, userText = '', history = []) {
  let prompt = `[YÊU CẦU: Phân tích hình ảnh và trả lời TRỌNG TÂM, NGẮN GỌN, ĐI THẲNG VÀO NỘI DUNG CHÍNH. Tuyệt đối KHÔNG gửi lời chào hay giới thiệu thừa thãi.]\n` + (userText || 'Hãy đọc và giải chi tiết hình ảnh được đính kèm.');
  if (_currentContext) {
    prompt += `\n[Bối cảnh liên quan: Câu hỏi hiện tại: "${_currentContext.q}"]`;
  }
  
  const response = await AIPool.analyzeImage({
    base64Data,
    userPrompt: prompt,
    systemPrompt: CERA_SYSTEM
  });
  
  return response;
}

// ─── Xử lý tin nhắn chat ─────────────────────────────────────────────────────
/**
 * Phân tích ý định của user và xử lý phù hợp
 * @param {string} userText - tin nhắn của user
 * @param {Array} history - lịch sử chat
 * @param {object} options - { isPremium: boolean, premiumModelId: string }
 * @returns {string} - phản hồi từ FTECA 24
 */
export async function ceraChat(userText, history = [], options = {}) {
  const text = userText.trim().toLowerCase();

  // ── 0. Kiểm tra nếu là Chế độ Premium ─────────────────────────────────────
  if (options.isPremium || options.premiumModelId) {
    let contextPrompt = CERA_SYSTEM + '\n\n';
    if (_currentContext) {
      contextPrompt += `[Bối cảnh: Sinh viên đang làm câu hỏi: "${_currentContext.q}"]\n\n`;
    }
    const modelId = options.premiumModelId || 'deepseek-r1';
    const resp = await AIPool.askPremium({
      modelId,
      userPrompt: userText,
      systemPrompt: contextPrompt,
      history
    });
    return `💎 **PREMIUM AI (${modelId.toUpperCase()})**\n\n${resp}`;
  }

  // ── 1. Phát hiện báo câu sai → BẮT BUỘC gọi AI xác minh live ────────────
  const reportWrongPattern = /câu\s*(này|đó|trên|số\s*\d+|#?\d+)?\s*(bị\s*)?(sai|lỗi|nhầm|không\s*đúng|không\s*chính\s*xác)/;
  if (reportWrongPattern.test(text) && _currentContext) {
    return verifyAndFixQuestion(_currentContext);
  }

  // ── 2. Phát hiện Yêu cầu Hành động đặc biệt (Dịch thuật, Tóm tắt, Giải thích sâu, Ví dụ...) ───
  const actionPattern = /(dịch|translate|nghĩa\s*là|nghĩa\s*của|tóm\s*tắt|sâu\s*hơn|ví\s*dụ|tại\s*sao|phân\s*tích|so\s*sánh|cho\s*biết|như\s*thế\s*nào|hướng\s*dẫn)/i;
  if (actionPattern.test(userText)) {
    let contextPrompt = CERA_SYSTEM + '\n\n';
    if (_currentContext) {
      const q = _currentContext;
      const opts = q.options ? q.options.map((o, i) => `${['A','B','C','D'][i]}. ${o}`).join('\n') : '';
      contextPrompt += `[Bối cảnh: Sinh viên đang xem câu hỏi: "${q.q}"\nCác đáp án:\n${opts}\nĐáp án đúng: ${['A','B','C','D'][q.correct]}]\n\n`;
    }
    if (history.length > 0) {
      contextPrompt += 'Lịch sử trò chuyện:\n';
      history.slice(-4).forEach(m => {
        contextPrompt += `${m.role === 'user' ? 'Sinh viên' : 'FTECA 24'}: ${m.content}\n`;
      });
      contextPrompt += '\n';
    }
    contextPrompt += `Sinh viên yêu cầu: ${userText}`;
    
    const resp = await askAI(contextPrompt);
    saveKnowledgeCache(userText, resp);
    return resp;
  }

  // ── 3. Hỏi câu hỏi theo ID ngắn (VD: "câu 15", "#15") ──────────────────────
  const idMatch = text.match(/^câu\s*(?:số\s*|#?)?(\d+)$/);
  if (idMatch) {
    const questionId = parseInt(idMatch[1]);
    const bank = DB.getBank();
    const found = bank.find(q => q.id === questionId) || bank[questionId - 1];
    if (found) {
      return buildLocalExplanation(found);
    }
  }

  // ── 4. Hỏi về câu đang hiển thị (VD: "câu này", "câu hiện tại") ─────────────
  const currentKeywords = ['câu này', 'câu trên', 'câu đó', 'câu hiện tại'];
  if (currentKeywords.some(k => text === k || text.includes(k)) && _currentContext) {
    return buildLocalExplanation(_currentContext);
  }

  // ── 5. Tìm trong Knowledge Cache (câu hỏi đã học trước) ──────────────────
  const cached = searchKnowledgeCache(userText);
  if (cached) return `🧠 **TỪ BỘ NHỚ ĐÃ HỌC** *(0.001s)*\n\n${cached}`;

  // ── 6. Tìm trong Kho câu hỏi DB (Chỉ trả DB khi không phải yêu cầu dịch/xử lý) ───
  const localResult = searchLocalDatabase(userText);
  if (localResult) return localResult;

  // ── 7. Không có dữ liệu → Gọi CERA AI ────────────────────────────────────
  let contextPrompt = CERA_SYSTEM + '\n\n';
  if (_currentContext) {
    contextPrompt += `[Sinh viên đang xem câu hỏi: "${_currentContext.q}"]\n\n`;
  }
  if (history.length > 0) {
    contextPrompt += 'Lịch sử trò chuyện:\n';
    history.slice(-6).forEach(m => {
      contextPrompt += `${m.role === 'user' ? 'Sinh viên' : 'FTECA 24'}: ${m.content}\n`;
    });
    contextPrompt += '\n';
  }
  contextPrompt += `Sinh viên hỏi: ${userText}`;

  const aiReply = await askAI(contextPrompt);
  saveKnowledgeCache(userText, aiReply);
  return aiReply;
}

