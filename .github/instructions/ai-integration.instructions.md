# Hướng Dẫn Tích Hợp AI - FTECA-24 AI Engine Architecture

Tệp hướng dẫn này quy định tiêu chuẩn tích hợp, quản lý API key, xử lý quota và Prompt Engineering cho hệ thống AI Trợ lý Học tập FTECA-24.

---

## 1. Kiến Trúc AI Pool & Chiến Lược Fallback (Multi-Provider AI Pool)

Hệ thống FTECA-24 sử dụng mô hình AI Pool đa nền tảng (`modules/aiPool.js`), tự động chuyển đổi mô hình khi một nhà cung cấp gặp sự cố hoặc hết Quota (Rate Limit 429/503).

### 1.1 Phân Cấp Ưu Tiên Model (AI Models Hierarchy)
1. **Primary Model Group (Gemini Series):** `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash`. Dành cho trích xuất kiến thức, tóm tắt tài liệu chuyên sâu và sinh đề thi Công nghệ Thực phẩm.
2. **Backup Model Group (Groq LLMs):** `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`. Dành cho phản hồi nhanh chatbot và fallback khẩn cấp.
3. **Specialized Engine:** Headroom AI & custom KB RAG pipeline (`modules/knowledgeBase.js`, `api/document-summary.js`).

### 1.2 Mẫu Xử Lý Fallback & Quota Guard
```javascript
import { callGeminiAPI } from './aiPool.js';

export async function generateStudySummaryWithFallback(prompt, systemInstruction) {
  try {
    // 1. Thử nghiệm model chính
    return await callGeminiAPI({
      model: 'gemini-1.5-flash',
      prompt,
      systemInstruction,
      temperature: 0.3
    });
  } catch (error) {
    console.warn('[AI Pool Warning] Gemini Primary gặp lỗi hoặc hết Quota, kích hoạt Fallback Model:', error.message);
    
    // 2. Tự động chuyển đổi sang Groq hoặc Gemini Secondary
    return await callGeminiAPI({
      model: 'groq/llama-3.3-70b-versatile',
      prompt,
      systemInstruction,
      temperature: 0.3
    });
  }
}
```

---

## 2. Quy Trình RAG & Tóm Tắt Tài Liệu (Knowledge Base & Chunking)

### 2.1 Cắt Nhỏ Tài Liệu (Document Chunking Strategy)
- Theo đúng chuẩn quy định tại `CHUNKING_FIX.md`: Khi xử lý giáo trình hoặc tài liệu PDF Ngành Công nghệ Thực phẩm dài, phải chia nhỏ tài liệu theo từng chương/mục (kích thước ~1500 - 2500 tokens) kèm overlap (150-200 tokens) để giữ ngữ cảnh.
- Tránh truyền toàn bộ file PDF vượt quá context window không cần thiết.

### 2.2 System Prompt Architecture (Chuyên Ngành Công Nghệ Thực Phẩm)
- Tất cả System Prompt phải định nghĩa rõ vai trò: *"Bạn là Chuyên gia AI Giảng dạy Ngành Công nghệ Thực phẩm FTECA-24..."*
- Ngôn ngữ đầu ra: Tiếng Việt chuẩn hóa chuyên ngành (ví dụ: HACCP, ISO 22000, Enzyme, Vi sinh vật thực phẩm, Phản ứng Maillard, Đóng hộp thực phẩm).

---

## 3. Trích Xuất JSON Cấu Trúc & Làm Sạch Phản Hồi

- Khi yêu cầu AI trả về JSON (đề thi, flashcard, bảng tóm tắt):
  - Luôn sử dụng JSON schema validation (`test_lesson_summary_schema.js`).
  - Xử lý loại bỏ Markdown Code Fences (` ```json ... ``` `) trước khi gọi `JSON.parse()`.
  ```javascript
  export function cleanAndParseJSON(rawResponse) {
    const cleaned = rawResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  }
  ```
