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
import { formatKnowledgeContext, searchSubjectKnowledge } from './knowledgeBase.js';

// ─── System Prompt & High EQ GenZ Companion Knowledge Engine ─────────────────
const CERA_SYSTEM = `
# ROLE & PERSONALITY:
Bạn là "FTECA" — Bạn đồng hành GenZ cực kỳ thông minh, tinh tế, EQ cao và có gu nói chuyện tự nhiên như một người bạn thực thụ ngoài đời.

# NGUYÊN TẮC GIAO TIẾP (EQ CAO, TINH TẾ & TỰ NHIÊN):
1. NÓI CHUYỆN TỰ NHIÊN NHƯ NGƯỜI THẬT:
   - Nhắn tin tự nhiên, gãy gọn như người thật chat Messenger/Zalo.
   - TUYỆT ĐỐI CẤM dùng ngoặc kép vô lý quanh các từ lóng (KHÔNG bao giờ viết kiểu: "đánh giá", "siêu máy", "đơ", "xịt").
   - TUYỆT ĐỐI CẤM cười giả tạo, CẤM bịa từ gượng gạo (như "cười rụt rụt", "chấn động kịch trần").
2. NHẠY CẢM VỚI MỈA MAI & CHÊ NHẠT (SARCASM DETECT):
   - Phải nhận biết ngay khi bạn học dùng giọng mỉa mai, chê nhạt hoặc xoáy (VD: "hơ hơ mắc cười ghê", "hủm là sao", "vui ghê ha").
   - Đáp lại tinh tế, dí dỏm và nhận sai tự nhiên (VD: "Ủa mỉa mai tớ đúng hông 🗿", "Thôi tớ xin lỗi, miếng đùa này hơi xu 😭", "Nhạt quá đúng không, để tớ rút kinh nghiệm 😭").
3. PHẢN HỒI NGẮN GỌN (1-2 CÂU):
   - Ngắn gọn, súc tích. Không giải thích định nghĩa từ ngữ của bạn học ngoại trừ khi họ hỏi trực tiếp.
4. XƯNG HÔ THÂN MẬT: Xưng "FTECA" (hoặc "tớ", "mình") - gọi người dùng là "bạn" hoặc "cậu". Không dùng từ "sếp".
5. KIẾN THỨC CHUYÊN MÔN: Chỉ khi bạn học chủ động hỏi về kiến thức Công nghệ Thực phẩm / QLCL mới trả lời chuẩn xác, dễ hiểu và súc tích.
`;

// ─── Trạng thái chatbot ───────────────────────────────────────────────────────
let _currentContext = null; // câu hỏi hiện tại đang hiển thị trên màn hình

/**
 * Đặt ngữ cảnh câu hỏi hiện tại (được gọi từ app.js khi render câu)
 * @param {object|null} question - câu hỏi đang hiển thị
 */
export function setCurrentQuestion(question) {
  _currentContext = question;
}

function formatCurrentQuestionContext() {
  const question = _currentContext;
  if (!question) return '';

  const labels = ['A', 'B', 'C', 'D'];
  const options = (question.options || []).map((option, index) => `${labels[index]}. ${option}`).join('\n');
  const selected = Number.isInteger(question.userAns)
    ? `${labels[question.userAns]}. ${question.options?.[question.userAns] || ''}`
    : 'Bỏ trống';
  const correct = `${labels[question.correct] || 'Đáp án đúng'}. ${question.options?.[question.correct] || ''}`;
  const reviewGuidance = question.isExamReview
    ? Number.isInteger(question.userAns)
      ? `Hãy nói rõ vì sao lựa chọn ${labels[question.userAns]} chưa đúng, vì sao đáp án ${labels[question.correct]} đúng, và điểm phân biệt giữa hai lựa chọn.`
      : 'Người học bỏ trống câu này; hãy nêu đáp án đúng và giải thích kiến thức trọng tâm, không giả định họ đã chọn phương án sai.'
    : '';

  return `[Ngữ cảnh câu hỏi đang ôn:\nMôn học: ${question.subjectName || question.subjectId || 'Chưa xác định'}\nChương: ${question.chapterName || question.chapter || 'Chưa xác định'}\nCâu hỏi: ${question.q || ''}\nCác phương án:\n${options}\nNgười học chọn: ${selected}\nĐáp án đúng: ${correct}\nLời giải hiện có: ${question.exp || 'Chưa có lời giải.'}${reviewGuidance ? `\nYêu cầu giải thích: ${reviewGuidance}` : ''}]`;
}

// ─── Gọi Groq AI (PRIMARY ENGINE - Siêu nhanh & FREE) ────────────────────────────
async function callGroq(userMessage, systemPrompt) {
  try {
    return await AIPool.callChat({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      maxTokens: 1500
    });
  } catch (err) {
    console.warn('[Groq] Gateway call failed:', err.message);
    throw new Error('Groq AI Failed');
  }
}

// ─── Gọi AI (Groq làm PRIMARY ENGINE) ──────────────────────────────────────
async function askAI(userMessage, systemPrompt = CERA_SYSTEM) {
  console.log('[CERA] 🚀 Sử dụng Groq AI (Primary Engine)');

  try {
    return await callGroq(userMessage, systemPrompt);
  } catch (groqError) {
    console.warn('[CERA] ⚠️ Groq lỗi, thử backup qua gateway...', groqError);

    try {
      return await AIPool.callChat({
        provider: 'cerebras',
        model: 'gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        maxTokens: 1500
      });
    } catch (backupError) {
      console.warn('[CERA] Backup cũng thất bại:', backupError.message);
      throw new Error('⚠️ FTECA đang hơi bận tí xíu nè! Cậu thử lại sau vài giây nha~ 🪷');
    }
  }
}

async function compressChatHistory(history) {
  if (!Array.isArray(history) || history.length < 4) return history;
  const totalChars = history.reduce((sum, item) => sum + String(item?.content || '').length, 0);
  if (totalChars < 2400) return history;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch('/api/headroom-compress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        messages: history.map(item => ({
          role: item?.role === 'assistant' ? 'assistant' : 'user',
          content: String(item?.content || '')
        }))
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok && Array.isArray(payload.messages)) {
      console.info('[CERA] Headroom compressed chat history:', {
        tokensBefore: payload.tokensBefore,
        tokensAfter: payload.tokensAfter,
        tokensSaved: payload.tokensSaved
      });
      return payload.messages;
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('[CERA] Headroom history compression unavailable:', error.message);
    }
  } finally {
    clearTimeout(timeout);
  }
  return history;
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
  const compactHistory = await compressChatHistory(history);
  const context = formatCurrentQuestionContext();
  const knowledgeQuery = _currentContext
    ? [userText, _currentContext.q, _currentContext.options?.[_currentContext.correct], _currentContext.exp].filter(Boolean).join(' ')
    : userText;
  const knowledgeContext = formatKnowledgeContext(searchSubjectKnowledge(
    knowledgeQuery,
    _currentContext?.subjectId || DB.getActiveSubject()
  ));

  // ── 0. Kiểm tra nếu là Chế độ Premium ─────────────────────────────────────
  if (options.isPremium || options.premiumModelId) {
    let contextPrompt = CERA_SYSTEM + '\n\n';
    if (context) contextPrompt += `${context}\n\n`;
    if (knowledgeContext) contextPrompt += `${knowledgeContext}\n\n`;
    const modelId = options.premiumModelId || 'deepseek-r1';
    const resp = await AIPool.askPremium({
      modelId,
      userPrompt: userText,
      systemPrompt: contextPrompt,
      history: compactHistory
    });
    return `💎 **PREMIUM AI (${modelId.toUpperCase()})**\n\n${resp}`;
  }

  // ── 1. Phát hiện báo câu sai → BẮT BUỘC gọi AI xác minh live ────────────
  const reportWrongPattern = /câu\s*(này|đó|trên|số\s*\d+|#?\d+)?\s*(bị\s*)?(sai|lỗi|nhầm|không\s*đúng|không\s*chính\s*xác)/;
  if (reportWrongPattern.test(text) && _currentContext && !_currentContext.isExamReview) {
    return verifyAndFixQuestion(_currentContext);
  }

  // ── 2. Phát hiện Yêu cầu Hành động đặc biệt (Dịch thuật, Tóm tắt, Giải thích sâu, Ví dụ...) ───
  const actionPattern = /(dịch|translate|nghĩa\s*là|nghĩa\s*của|tóm\s*tắt|sâu\s*hơn|ví\s*dụ|tại\s*sao|phân\s*tích|so\s*sánh|cho\s*biết|như\s*thế\s*nào|hướng\s*dẫn)/i;
  if (actionPattern.test(userText)) {
    let contextPrompt = CERA_SYSTEM + '\n\n';
    if (context) contextPrompt += `${context}\n\n`;
    if (compactHistory.length > 0) {
      contextPrompt += 'Lịch sử trò chuyện:\n';
      compactHistory.slice(-4).forEach(m => {
        contextPrompt += `${m.role === 'user' ? 'Sinh viên' : 'FTECA 24'}: ${m.content}\n`;
      });
      contextPrompt += '\n';
    }
    if (knowledgeContext) contextPrompt += `${knowledgeContext}\n\n`;
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
  if (currentKeywords.some(k => text === k || text.includes(k)) && _currentContext && !_currentContext.isExamReview) {
    return buildLocalExplanation(_currentContext);
  }

  // ── 5. Gọi FTECA AI trực tiếp cho mọi cuộc trò chuyện ──────────────────

  // ── 7. Không có dữ liệu → Gọi CERA AI ────────────────────────────────────
  let contextPrompt = CERA_SYSTEM + '\n\n';
  if (context) contextPrompt += `${context}\n\n`;
  if (knowledgeContext) contextPrompt += `${knowledgeContext}\n\n`;
  if (compactHistory.length > 0) {
    contextPrompt += 'Lịch sử trò chuyện:\n';
    compactHistory.slice(-6).forEach(m => {
      contextPrompt += `${m.role === 'user' ? 'Sinh viên' : 'FTECA 24'}: ${m.content}\n`;
    });
    contextPrompt += '\n';
  }
  contextPrompt += `Sinh viên hỏi: ${userText}`;

  const aiReply = await askAI(contextPrompt);
  saveKnowledgeCache(userText, aiReply);
  return aiReply;
}
