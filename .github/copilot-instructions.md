# Hướng Dẫn GitHub Copilot & AI Agent - Dự Án FTECA-24

Dự án: **FTECA-24** (Hệ thống ôn thi và học tập Ngành Công nghệ Thực phẩm tích hợp AI).  
Kiến trúc: HTML5, CSS3 Custom Tokens, Modular Vanilla ES6 Javascript, Node.js Serverless (Vercel API routes), Firebase Admin SDK, Gemini & Groq AI Engines.

---

## 1. GSAP Skills & Quy Tắc Animation (Trọng Tâm Copilot Instructions)

Hệ thống sử dụng **GSAP (GreenSock Animation Platform)** để mang lại trải nghiệm mượt mà, cao cấp cho sinh viên Ngành Công nghệ Thực phẩm.

### 1.1 Nguyên Tắc Hoạt Họa GSAP Standard
- **Tối ưu Hiệu năng (Hardware Acceleration):** Chỉ animate các thuộc tính kích hoạt GPU composite layer: `transform` (`x`, `y`, `scale`, `rotation`, `skewX`) và `opacity`. Hạn chế animate `width`, `height`, `top`, `margin`, `padding` để tránh gây layout reflow.
- **Quản lý Timeline & Cleanup:**
  - Luôn khởi tạo timeline với `gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.4 } })`.
  - Khi xóa hoặc thay đổi DOM/module (ví dụ: chuyển tab navigation), phải dọn dẹp animation đang chạy bằng `gsap.killTweensOf(target)` hoặc `tl.kill()`.
- **Hiệu Ứng Micro-interactions:**
  - Button hover: `gsap.to(btn, { scale: 1.03, duration: 0.2, ease: 'back.out(1.7)' })`.
  - Card Entrance / Staggering: `gsap.from('.quiz-card', { opacity: 0, y: 20, stagger: 0.08, duration: 0.5, ease: 'power2.out' })`.
  - Notification Popups / Mascots: `gsap.fromTo('.mascot-container', { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, ease: 'elastic.out(1, 0.75)', duration: 0.6 })`.

### 1.2 Mẫu Code GSAP Khảo Chuẩn Cho ES6 Module
```javascript
import { gsap } from 'gsap';

export function animateCardSequence(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  // Dọn dẹp animation cũ nếu có
  gsap.killTweensOf(`${containerSelector} .item-card`);

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out', duration: 0.4 }
  });

  tl.fromTo(container, 
    { opacity: 0, y: 15 },
    { opacity: 1, y: 0 }
  ).fromTo(`${containerSelector} .item-card`,
    { opacity: 0, y: 25, scale: 0.95 },
    { opacity: 1, y: 0, scale: 1, stagger: 0.06 },
    "-=0.2"
  );

  return tl;
}
```

---

## 2. Danh Mục Hướng Dẫn Chuyên Biệt (Skill Modules)

Mỗi khía cạnh kỹ thuật trong dự án FTECA-24 được quy định chi tiết tại các tệp instruction chuyên biệt sau:

1. **Frontend Design Guidelines:** `frontend-design.instructions.md`  
   *(Quy chuẩn UI/UX, CSS Architecture, Color System, Responsive Layouts, Accessibility)*
2. **Web App Testing Guidelines:** `testing.instructions.md`  
   *(Quy trình kiểm thử Node.js test runner, unit tests, integration testing, verification commands)*
3. **Hướng Dẫn Tích Hợp AI:** `ai-integration.instructions.md`  
   *(Kiến trúc AI Pool, Gemini/Groq APIs, Knowledge Base RAG Engine, Quota Fallbacks, Prompt Engineering)*
4. **Bảo Mật Firebase & API:** `firebase-api-security.instructions.md`  
   *(Firebase Admin SDK, Vercel Serverless Functions, API Keys, Authentication & Input Sanitization)*

---

## 3. Nguyên Tắc Lập Trình Chung Cho Copilot / AI Agent
- **Không tự ý phỏng đoán API/Schema:** Kiểm tra mã nguồn thật trước khi chỉnh sửa.
- **Bảo tồn API Contracts:** Giữ nguyên chữ ký hàm hiện có hoặc cập nhật toàn bộ vị trí gọi hàm nếu đổi signature.
- **Xác thực trước khi hoàn tất:** Luôn chạy các câu lệnh test (`npm test`, `node test_...js`) để xác nhận không gây ra rủi ro hay lỗi vỡ giao diện.
