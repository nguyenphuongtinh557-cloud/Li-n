# Web App Testing Instructions - FTECA-24

Tệp hướng dẫn này quy định tiêu chuẩn kiểm thử, chạy test suite và xác minh chất lượng cho dự án FTECA-24.

---

## 1. Khung Kiểm Thử (Testing Framework & Architecture)

Dự án FTECA-24 sử dụng **Node.js Native Test Runner** (`node --test`) cùng thư viện `node:assert` chuẩn để kiểm thử các module frontend/backend, schema dữ liệu và tích hợp API.

### 1.1 Danh Sách Câu Lệnh Test Tiêu Chuẩn (package.json)
| Lệnh (`npm run ...`) | Tập tin test mục tiêu | Mô tả chức năng kiểm thử |
| :--- | :--- | :--- |
| `npm run test:lumi-study` | `test_lumi_study_assistant.js` | Kiểm tra Trợ lý học tập AI Lumi & xử lý ngữ cảnh |
| `npm run test:summary-markdown` | `test_summary_markdown.js` | Kiểm tra trình biên dịch Markdown & bảng dữ liệu |
| `npm run test:summary-explanation-ui` | `test_summary_explanation_ui.js` | Kiểm tra logic UI giải thích tóm tắt bài học |
| `npm run test:summary-rich-editor` | `test_summary_rich_text_editor.js` | Kiểm tra Trình soạn thảo văn bản Rich Text |
| `npm run test:summary-document-history` | `test_summary_document_history.js` | Kiểm tra lịch sử tài liệu tóm tắt (Node --test) |
| `npm run test:summary-study-drawing` | `test_summary_study_drawing.js` | Kiểm tra sơ đồ/vẽ minh họa bài học |
| `npm run test:subject-canvas` | `test_subject_canvas.js` | Kiểm tra Canvas môn học & giao diện trực quan |
| `npm run test:subject-api` | `test_subject_details_api.js` | Kiểm tra API chi tiết môn học & dữ liệu backend |

---

## 2. Quy Tắc Viết Unit Test & Integration Test

### 2.1 Cấu Trúc File Test Khảo Chuẩn (`node --test`)
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocumentSummary } from './modules/docSummarizerEngine.js';

test('Khối kiểm thử: docSummarizerEngine - Parse cấu trúc dữ liệu', async (t) => {
  await t.test('Nên trích xuất đúng danh sách khái niệm từ Markdown', () => {
    const sampleInput = `### Khái niệm chính\n- **HACCP**: Hệ thống phân tích mối nguy.`;
    const result = parseDocumentSummary(sampleInput);

    assert.ok(result);
    assert.strictEqual(Array.isArray(result.concepts), true);
    assert.strictEqual(result.concepts[0].title, 'HACCP');
  });
});
```

### 2.2 Quy Tắc Mocking Dịch Vụ Bên Ngoài (LLM / Firebase)
- **Không thực hiện gọi API live (Gemini, Groq, Firebase live DB) trong Unit Test cố định.**
- Sử dụng Stub / Mock response hợp lệ để đảm bảo test chạy độc lập, tốc độ cao và không tiêu tốn Quota API key khi kiểm thử tự động.

---

## 3. Quy Trình Xác Minh & Kiểm Lỗi (Verification Checklist)

Trước khi xác nhận hoàn tất bất kỳ tính năng hoặc sửa lỗi nào:
1. **Chạy Test Suite liên quan:** Thực thi câu lệnh `npm run test:<module>` thích hợp.
2. **Kiểm tra Cú pháp & Bundling:** Nếu có thay đổi ở các file bundled (`modules/themeMorphIcon.js`, `modules/summaryDocx.js`), phải chạy `npm run build` để xác nhận esbuild tạo bundle thành công không lỗi.
3. **Không Bỏ Qua Error Log:** Tuyệt đối không che giấu lỗi runtime (silent catch), không xóa bớt file test hoặc comment out test case đang fail.
