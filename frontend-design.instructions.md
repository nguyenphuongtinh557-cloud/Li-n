# Frontend Design Instructions - FTECA-24 Web App

Tệp hướng dẫn này quy định tiêu chuẩn thiết kế giao diện (UI), trải nghiệm người dùng (UX) và kiến trúc CSS cho hệ thống học tập Ngành Công nghệ Thực phẩm FTECA-24.

---

## 1. Triết Lý Thiết Kế & Palette Màu (Design System)

FTECA-24 hướng tới phong cách giao diện **Hiện đại - Đẳng cấp - Công nghệ (EdTech Premium)** dành cho sinh viên và giảng viên Công nghệ Thực phẩm.

### 1.1 Hệ Thống Biến CSS (CSS Tokens)
Tất cả thành phần giao diện phải sử dụng các biến CSS được quy định sẵn trong `style.css` hoặc bộ stylesheet tương ứng:

```css
:root {
  /* Brand Primary - Xanh Thực phẩm / Công nghệ tươi mới */
  --primary-50: #f0fdf4;
  --primary-500: #10b981;
  --primary-600: #059669;
  --primary-700: #047857;

  /* Accent & Gradients */
  --accent-cyan: #06b6d4;
  --accent-violet: #8b5cf6;
  --grad-primary: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
  --grad-glass: linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.3) 100%);

  /* Neutral Surface (Light Mode) */
  --bg-app: #f8fafc;
  --bg-card: #ffffff;
  --border-light: rgba(226, 232, 240, 0.8);
  --text-main: #0f172a;
  --text-muted: #64748b;

  /* Dark Mode Surfaces */
  --dark-bg-app: #0f172a;
  --dark-bg-card: #1e293b;
  --dark-border: rgba(255, 255, 255, 0.1);
  --dark-text-main: #f8fafc;

  /* Shadows & Glassmorphism */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-glass: 0 8px 32px 0 rgba(31, 38, 135, 0.07);
  --backdrop-blur: blur(12px);
}
```

---

## 2. Quy Tắc Thiết Kế Component & Bố Cục (Layout)

### 2.1 Card Elevation & Glassmorphism
- Các thẻ nội dung (Quiz card, Subject card, Summary block) sử dụng viền mảnh `1px solid var(--border-light)`, viền bo nhẹ (`border-radius: 12px` đến `16px`).
- Hiệu ứng hover cho Card:
  ```css
  .custom-card {
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
  }
  .custom-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
  }
  ```

### 2.2 Typography & Phân Cấp Nội Dung
- Phông chữ tiêu chuẩn: `Inter`, system UI font fallback (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`).
- `<h1>`: Tiêu đề trang, sử dụng `font-weight: 700`, kích thước linh hoạt `clamp(1.75rem, 4vw, 2.5rem)`. Chỉ có 1 thẻ `<h1>` duy nhất trên mỗi view/page.
- Tiêu đề phụ, thẻ phụ: `<h2>`, `<h3>` với tương phản rõ ràng.

### 2.3 Responsive Design & Fluid Spacing
- Sử dụng Flexbox & CSS Grid cho tất cả bố cục chính.
- Breakpoints chuẩn:
  - Mobile: `< 640px`
  - Tablet: `640px - 1024px`
  - Desktop: `> 1024px`
- Đảm bảo thanh điều hướng navigation (`navigation.js`), sidebar và bảng điều khiển (`adminDashboard.js`) thu gọn mượt mượt trên mobile.

---

## 3. Micro-interactions & Visual Polish

- **Trạng Thái Loading (Shimmer Skeletal):** Khi tải bài học hoặc câu hỏi AI, dùng shimmer skeleton thay vì spinner quay đơn điệu.
- **AI Streaming Response UI:** Đoạn văn bản do AI sinh ra cần có hiệu ứng xuất hiện tự nhiên, mã Markdown rendered đẹp mắt với highlight màu cho công thức hóa học / số liệu Công nghệ thực phẩm.
- **Nút Bấm Interactive:** Bắt buộc có `:hover`, `:active`, `:focus-visible` với outline rõ ràng cho accessibility.
