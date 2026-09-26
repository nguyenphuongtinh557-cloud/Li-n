# 🚀 FTECA 24 - Hệ Thống Học Tập Thông Minh

Hệ thống ôn thi và học tập Ngành Công nghệ Thực phẩm với AI trợ lý thông minh.

---

## 📋 Yêu Cầu Hệ Thống

- **Node.js:** ≥ 18.0.0
- **Browser:** Chrome, Firefox, Edge (phiên bản mới nhất)
- **RAM:** ≥ 4GB
- **Disk:** ≥ 500MB

---

## 🔧 Cài Đặt

### 1. Clone hoặc tải project về máy

```bash
git clone <repository-url>
cd QLCL
```

### 2. Cài đặt dependencies (nếu cần)

```bash
npm install
```

> **Lưu ý:** Project này chủ yếu là frontend, nên không cần nhiều dependencies.

---

## 🚀 Chạy Local Server

### Cách 1: Dùng npm script (Khuyến nghị)

```bash
npm start
```

hoặc

```bash
npm run dev
```

Server sẽ chạy tại: **http://localhost:3000**

### Cách 2: Dùng Python (nếu chưa có Node.js)

```bash
# Python 3
python -m http.server 3000

# Hoặc Python 2
python -m SimpleHTTPServer 3000
```

### Cách 3: Dùng Live Server (VS Code Extension)

1. Cài đặt extension **Live Server** trong VS Code
2. Right-click vào `index.html`
3. Chọn **"Open with Live Server"**

---

## 📂 Cấu Trúc Project

```
QLCL/
├── index.html              # Trang chủ
├── app.js                  # Logic chính của app
├── style.css               # Styles chính
├── server.js               # Local development server
├── package.json            # NPM configuration
│
├── modules/                # JavaScript modules
│   ├── aiPool.js          # AI API management
│   ├── cera.js            # Chatbot AI
│   ├── db.js              # Database management
│   ├── auth.js            # Authentication
│   ├── articles.js        # Articles module
│   ├── mindmap.js         # Mindmap visualization
│   ├── generator.js       # Question generator
│   └── ...
│
├── api/                    # API endpoints
│   ├── lesson-summary.js
│   ├── document-summary.js
│   └── subject-details.js
│
├── data/                   # Data files
│   ├── seed_questions.js
│   ├── cms_articles.json
│   ├── learning_resources.json
│   └── ...
│
└── docs/                   # Documentation
    ├── API_KEYS_STATUS.md
    ├── CHATBOT_PROMPT_ARCHITECTURE.md
    ├── SO_SANH_MODELS_VA_GIA_THANH.md
    └── ...
```

---

## 🎯 Tính Năng Chính

### 1. 🧠 AI Chatbot (FTECA 24)
- Trợ lý AI chuyên gia QLCL & ATTP
- Powered by **Groq AI** (FREE, siêu nhanh)
- Context-aware (biết câu hỏi đang làm)
- Auto-correction (tự động sửa câu sai)

### 2. 📚 Ngân Hàng Câu Hỏi
- Hàng nghìn câu hỏi trắc nghiệm
- Nhiều môn học: QLCL, ATTP, Vi sinh, Hóa học...
- Tìm kiếm thông minh với weighted scoring

### 3. 📖 Tóm Tắt Tài Liệu
- Upload PDF/Word/TXT
- AI tóm tắt tự động (Gemini AI)
- 3 chế độ: Nhanh, Chi tiết, Học sâu
- Mindmap visualization

### 4. 🎓 Học Tập Thông Minh
- Study Reader với AI Summary
- Highlight & Note-taking
- Flashcards tự động
- Progress tracking

### 5. 📊 Dashboard Admin
- Quản lý câu hỏi
- Tạo đề thi tự động
- Thống kê & báo cáo
- User management

---

## 🔑 API Keys Configuration

Project sử dụng các AI APIs:

### Free APIs (Đang hoạt động):
- ✅ **Groq AI** (3 keys) - Chatbot primary
- ✅ **Gemini AI** (3 keys) - Document summarization
- ✅ **Mistral AI** (1 key) - Fallback

### Premium APIs (Cần credits):
- 💳 **OpenRouter** - DeepSeek R1, Claude 3.5, GPT-4o
- 💳 **Cerebras AI** - Backup engine
- 💳 **SambaNova** - Fast inference

### Headroom context compression (tùy chọn):
- Headroom chỉ nén lịch sử chat FTECA; tài liệu gốc và Knowledge Bank không bị nén.
- QLCL tự động dùng lịch sử gốc nếu Headroom Proxy chưa chạy hoặc gặp lỗi.
- Cài proxy bằng Python: `pip install "headroom-ai[proxy]"`, sau đó chạy `headroom proxy --port 8787`.

### Tra cứu nguồn cục bộ và xuất sơ đồ tư duy
- `modules/knowledgeBase.js` là bộ tra cứu do QLCL tự viết, tìm trong nội dung môn học đã xuất bản và đưa mã nguồn/trích đoạn phù hợp vào prompt FTECA.
- Nội dung giáo trình không được gửi sang dịch vụ RAG bên ngoài bởi tính năng này; khi không có nguồn phù hợp, FTECA được yêu cầu nói rõ thay vì bịa.
- Sơ đồ tư duy SVG hiện có hỗ trợ tải xuống trực tiếp bằng nút tải, không đóng gói mã nguồn hay tài sản của AnythingLLM, Dify, Khoj hoặc Excalidraw.

### Tải tài nguyên theo nhu cầu
- Trang khởi động không còn tải sẵn PDF.js, Mammoth, TinyMCE hoặc dashboard Admin.
- Các thư viện này được nạp bằng dynamic loader khi người dùng mở tính năng tương ứng.
- CSS riêng của trang môn học và Admin cũng được nạp khi mở route tương ứng; CSS dùng chung vẫn được giữ ở shell để tránh nhấp nháy giao diện.
- Dữ liệu nội dung lớn vẫn nên tiếp tục tách API theo môn/chủ đề ở bước tiếp theo; thay đổi hiện tại loại bỏ các tải thừa mà không phá URL hoặc router hiện có.
- Ngân hàng câu hỏi seed cũng được import khi vào khu vực Ôn tập/Lịch sử/Tạo đề, thay vì tải trong trang chủ.
- Đồng bộ tài nguyên, bài viết, subject details và thông báo chạy nền sau khi route đầu tiên được khôi phục; các deep-link không còn bị chặn bởi chuỗi đồng bộ toàn hệ thống.
- Có thể đổi địa chỉ proxy bằng biến môi trường `HEADROOM_PROXY_URL`.

### Chia sẻ URL bản tóm tắt
- API `/api/summary-share` lưu nội dung được chia sẻ trong Firestore; cần cấu hình biến môi trường phía máy chủ `FIREBASE_SERVICE_ACCOUNT_JSON` bằng JSON service account Firebase.
- Trên Vercel, vào **Project → Settings → Environment Variables**, thêm `FIREBASE_SERVICE_ACCOUNT_JSON` với toàn bộ JSON service account làm giá trị, chọn các môi trường cần dùng (Production/Preview), lưu và redeploy. Giữ biến này ở server-side; không đặt trong mã frontend hoặc gửi qua chat.
- URL công khai chỉ đọc được nội dung đã chia sẻ. Khi chủ sở hữu xóa bản tóm tắt khỏi lịch sử, hệ thống thu hồi URL tương ứng; thao tác thu hồi yêu cầu đăng nhập bằng đúng tài khoản đã tạo link.
- Nếu chưa cấu hình Firebase Admin, API trả lỗi dịch vụ chưa sẵn sàng và không tạo link giả.

> **Chi tiết:** Xem file `API_KEYS_STATUS.md`

---

## 📱 Responsive Design

Project responsive hoàn toàn:
- ✅ Desktop (≥1024px)
- ✅ Tablet (768px - 1023px)
- ✅ Mobile (320px - 767px)

---

## 🧪 Testing

```bash
# Test subject canvas
npm run test:subject-canvas

# Test subject API
npm run test:subject-api
```

---

## 🚀 Deployment

### Netlify (Khuyến nghị):

1. Push code lên GitHub
2. Connect repository với Netlify
3. Build settings:
   - Build command: (để trống)
   - Publish directory: `.`
4. Deploy!

### Vercel:

```bash
vercel --prod
```

### GitHub Pages:

1. Push lên GitHub
2. Settings → Pages
3. Source: main branch / root
4. Save

---

## 🔒 Security Notes

- ⚠️ API keys hiện tại hardcoded trong code
- 🔐 Khuyến nghị: Di chuyển sang environment variables
- 🚫 Không commit `.env` file lên git
- ✅ Sử dụng `.gitignore` để bảo vệ sensitive files

---

## 📄 License

Private project - All rights reserved.

---

## 👥 Contributors

- **Nguyễn Hoàng Phúc** - Founder & Developer
- **Dương Ngọc Trâm** - Co-founder & Content Manager

---

## 📞 Support

Có vấn đề? Liên hệ:
- 📧 Email: support@fteca24.edu.vn
- 💬 Chatbot: Trong ứng dụng
- 🐛 Issues: GitHub Issues

---

## 🎉 Changelog

### v1.0.0 (2026-09-12)
- ✅ Chatbot chuyển sang Groq primary engine
- ✅ Sửa lỗi cache khi upload file mới
- ✅ Thêm documentation đầy đủ
- ✅ Tối ưu performance

---

**Made with ❤️ by FTECA 24 Team**
