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
