const fs = require('fs');
let code = fs.readFileSync('modules/docSummarizerEngine.js', 'utf8');

// Replace Principles
code = code.replace(/NGUYÊN TẮC VIẾT\r?\n═══════════════════════════════════════════════════════════\r?\n\r?\nĐƯỢC PHÉP:[\s\S]*?OUTPUT JSON/, 
`NGUYÊN TẮC VIẾT "HỌC SÂU" (DEEP LEARNING)
═══════════════════════════════════════════════════════════

ĐƯỢC PHÉP:
✅ Thay đổi cách diễn đạt, tổ chức lại thứ tự để sinh viên dễ học, dễ nhớ.
✅ Nhóm các facts (kiến thức) liên quan thành đoạn văn liền mạch, mạch lạc.
✅ Tạo bảng so sánh từ các fact tương phản có trong Bank.
✅ Giải thích chuỗi quan hệ (A → B) NẾU cả A và B đều có trong Bank.
✅ Sử dụng domain_expansions từ Bank, nhưng PHẢI ghi rõ [AI MỞ RỘNG - ƯD CNTP].

TUYỆT ĐỐI KHÔNG ĐƯỢC:
❌ KHÔNG TẠO OUTLINE (DÀN Ý). TRUNG TÂM của tài liệu là \`chapters[].content\`. Nó phải là một bài giảng hoàn chỉnh: Heading → Giải thích bản chất → Thuộc tính → Số liệu → Cơ chế/Chức năng → Ví dụ. Tuyệt đối không chỉ liệt kê tên khái niệm rồi bỏ trống nội dung.
❌ KHÔNG ĐƯỢC LƯỢC BỎ kiến thức quan trọng chỉ để làm bài ngắn lại. Độ dài phải tương xứng với mật độ kiến thức trong Bank.
❌ KHÔNG làm mất hoặc bóp méo số liệu (value, unit), điều kiện (condition), ngoại lệ (exception) hay thuộc tính (attribute) từ Bank. Số liệu phải được bê nguyên văn.
❌ KHÔNG tạo kiến thức mới cho các mục Key points, Pitfalls, Questions. Mọi điểm "dễ nhầm" hay "trọng tâm" phải được trích xuất hoàn toàn từ Knowledge Bank.
❌ KHÔNG tự bịa fact, mechanism, thiết bị, hay ứng dụng công nghệ không có trong Bank.

═══════════════════════════════════════════════════════════
OUTPUT JSON`);

// Replace Output JSON definition for chapters and concepts
code = code.replace(
  /"chapters": \[\r?\n\s+\{ "title": "Tên chương\/phần theo tài liệu", "content": "Nội dung chính" \}\r?\n\s+\],/,
  `"chapters": [
    { 
      "title": "Tên chương/phần", 
      "content": "Toàn bộ nội dung giảng giải chi tiết bằng Markdown. TRÌNH BÀY ĐẦY ĐỦ: Bản chất → Đặc điểm → Số liệu → Cấu tạo → Chức năng → Điều kiện → Ví dụ (nếu Bank có). Sử dụng H3 (###) để phân mục. KHÔNG tạo danh sách rỗng (Outline)." 
    }
  ],`
);

code = code.replace(
  /"concepts": \[\r?\n\s+\{\r?\n\s+"name": "Tên khái niệm",\r?\n\s+"tier": "A\|B\|C\|D",\r?\n\s+"definition": "Định nghĩa\/bản chất",\r?\n\s+"key_facts": \["Fact quan trọng 1", "Fact quan trọng 2"\],\r?\n\s+"numbers": \["Số liệu quan trọng kèm đơn vị và thuộc tính chính xác"\],\r?\n\s+"comparisons": \[\{ "vs": "Khái niệm đối chiếu", "diff": "Điểm khác biệt" \}\],\r?\n\s+"citations": \[\{ "text_span": "đoạn text tương ứng", "fact_ids": \["F001"\] \}\]\r?\n\s+\}\r?\n\s+\],/,
  `"concepts": [
    {
      "name": "Tên khái niệm",
      "tier": "A|B|C|D",
      "definition": "Định nghĩa/bản chất",
      "attributes": ["Các đặc điểm/tính chất quan trọng (chỉ lấy từ Bank)"],
      "conditions_exceptions": ["Điều kiện bắt buộc hoặc ngoại lệ (ví dụ: 'kỵ khí bắt buộc', 'chỉ ở một số loài')"],
      "key_facts": ["Fact quan trọng (nếu chưa nằm ở attribute)"],
      "numbers": ["Số liệu quan trọng kèm đơn vị và thuộc tính chính xác"],
      "comparisons": [{ "vs": "Khái niệm đối chiếu", "diff": "Điểm khác biệt" }],
      "citations": [{ "text_span": "đoạn text", "fact_ids": ["F001"] }]
    }
  ],`
);

// Replace Memory Layer to emphasize TỪ BANK
code = code.replace(/"key_points": \["Điểm quan trọng cần nhớ"\],/, `"key_points": ["Điểm cốt lõi rút ra TỪ BANK"],`);
code = code.replace(/"pitfalls": \["Điểm dễ nhầm"\],/, `"pitfalls": ["Điểm dễ nhầm lẫn rút ra TỪ BANK"],`);
code = code.replace(/"questions": \["Câu hỏi tự kiểm tra"\],/, `"questions": ["Câu hỏi tự kiểm tra TỪ BANK"],`);

fs.writeFileSync('modules/docSummarizerEngine.js', code);
console.log('Patched docSummarizerEngine.js successfully!');
