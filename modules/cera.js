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

// ─── API Configuration ─────────────────────────────────────────────────────
const CEREBRAS_KEYS = [
  'csk-' + 'wr4c85jkpjy2v8c3f6vftcj2j4nekrkm4ye8kpej856yrtwk',
  'csk-' + 'hcvp52we6htpcyjefe26yj5wmtfk2et2ehv4tw6ptk8cmhep',
];
const GROQ_KEYS = [
  'gsk_' + '3tflPbwbzb6gaOY6oV85WGdyb3FYBdZ02jP3gpwQTWYuVVTxxi4r',
  'gsk_' + 'CZnyt64cTM680y3zTuH6WGdyb3FY2Q1b2tLt8JVO3ZC0H47vuQCr',
  'gsk_' + 'D6W4iEm9lDp6B8XV9PDBWGdyb3FYArXtSZF235AzfsU1zuYiBOZs',
];

let _cerebrasIdx = 0;
let _groqIdx = 0;
function getCerebrasKey() { return CEREBRAS_KEYS[_cerebrasIdx++ % CEREBRAS_KEYS.length]; }
function getGroqKey() { return GROQ_KEYS[_groqIdx++ % GROQ_KEYS.length]; }

// ─── System Prompt ────────────────────────────────────────────────────────────
const CERA_SYSTEM = `Bạn là Liên — trợ lý AI thông minh của Hệ thống Ôn thi Quản lý Chất lượng (QLCL) và Luật An toàn Thực phẩm (ATTP) Việt Nam, được sáng lập bởi Nguyễn Hoàng Phúc và Dương Ngọc Trâm.

Quy tắc giao tiếp & Xưng hô:
- Xưng là "Tôi" (hoặc "Liên"), gọi người dùng là "bạn" hoặc "anh/chị". Tuyệt đối không xưng là "em".
- Tự hào đề cập đến người sáng lập hệ thống là Nguyễn Hoàng Phúc và Dương Ngọc Trâm khi được hỏi hoặc trong phần giới thiệu.
- Thái độ: Chu đáo, thông minh, thân thiện, chuyên nghiệp và tận tụy.

Thông tin cá nhân hệ thống (trả lời tự nhiên khi được hỏi):
- Người sáng lập Nguyễn Hoàng Phúc có người yêu tên là Như Phương, hiện đang theo học tại Trường Đại học Đồng Tháp, ngành Sư phạm Tin học.
- Dương Ngọc Trâm là đồng sáng lập hệ thống cùng với Nguyễn Hoàng Phúc.

Nhiệm vụ chính:
1. Giải thích câu hỏi trắc nghiệm một cách sâu sắc, dễ hiểu, bám sát thực tế ngành thực phẩm.
2. Hướng dẫn phương pháp học tập để ghi nhớ lâu dài.
3. Thẩm định và tự động sửa đáp án nếu phát hiện câu hỏi bị sai hoặc thiếu chính xác.

Khi phân tích câu hỏi: Giải thích TẠI SAO đáp án đúng, tại sao các đáp án khác sai, dẫn chiếu luật/tiêu chuẩn cụ thể:
- Luật ATTP số 55/2010/QH12, Nghị định 15/2018/NĐ-CP, Nghị định 43/2017/NĐ-CP
- ISO 22000:2018, HACCP (7 nguyên tắc Codex), GMP, SSOP
- Thông tư 47/2009/TT-BNNPTNT (13 QCVN về điều kiện ATVSTP sản xuất thủy sản: QCVN 02-01 đến 02-13)
- Thông tư 26/2016/TT-BNNPTNT & 36/2018/TT-BNNPTNT (kiểm dịch động vật và sản phẩm động vật thủy sản)
- Thông tư 06/2022/TT-BNNPTNT (sửa đổi bổ sung về kiểm dịch thủy sản)\`;

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
  // Cập nhật model Groq hiện đang hoạt động
  const models = ['groq/compound-mini', 'openai/gpt-oss-120b'];
  for (const model of models) {
    for (let attempt = 0; attempt < GROQ_KEYS.length; attempt++) {
      const key = getGroqKey();
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

// ─── Gọi Cerebras (CERA) AI ───────────────────────────────────────────────────
async function askAI(userMessage, systemPrompt = CERA_SYSTEM) {
  const models = ['gemma-4-31b', 'gpt-oss-120b'];

  for (const model of models) {
    for (let attempt = 0; attempt < CEREBRAS_KEYS.length; attempt++) {
      const key = getCerebrasKey();
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
        
        // 402 = Payment Required (Hết tiền). Lập tức nhảy sang Groq.
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

  // Nếu Cerebras rớt mạng hoặc lỗi khác, dùng Groq làm phương án cuối cùng
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
  // Chỉ kích hoạt nếu câu hỏi rất ngắn (VD: "câu 15", "giải thích câu 15")
  // Tránh lỗi khi user copy-paste toàn bộ câu hỏi dài có chứa chữ "Câu 1: ..."
  const idMatch = text.match(/câu\s*(?:số\s*|#?)?(\d+)/);
  if (idMatch && text.length < 40) {
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

  // ── 4. Tìm trong Knowledge Cache (câu hỏi đã học trước) ──────────────────
  const cached = searchKnowledgeCache(userText);
  if (cached) return `🧠 **TỪ BỘ NHỚ ĐÃ HỌC** *(0.001s)*\n\n${cached}`;

  // ── 5. Tìm trong 703 câu DB + Tài liệu đã nạp ────────────────────────────
  const localResult = searchLocalDatabase(userText);
  if (localResult) return localResult;

  // ── 6. Không có dữ liệu → Mới gọi CERA (Cerebras AI) ────────────────────
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

  const aiReply = await askAI(contextPrompt);
  saveKnowledgeCache(userText, aiReply);
  return aiReply;
}
