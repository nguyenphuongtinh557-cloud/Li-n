# Biến Môi Trường - Environment Variables

Tài liệu này mô tả tất cả các biến môi trường cần thiết để chạy FTECA 24 với đầy đủ tính năng.

## 🔐 Bảo Mật Quan Trọng

**CẢNH BÁO:** Không commit file `.env` hoặc bất kỳ file nào chứa API keys vào Git!

Các biến môi trường nên được:
- Lưu trong file `.env` ở local (đã được thêm vào `.gitignore`)
- Cấu hình trong Vercel/Netlify Environment Variables khi deploy
- Không bao giờ hardcode trong source code

---

## 📝 Danh Sách Biến Môi Trường

### 🔥 Firebase (Bắt Buộc)

Firebase được sử dụng cho authentication và lưu trữ dữ liệu.

```bash
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}
```

**Cách lấy:**
1. Vào [Firebase Console](https://console.firebase.google.com/)
2. Chọn project của bạn
3. Settings → Service Accounts
4. Click "Generate New Private Key"
5. Copy toàn bộ nội dung JSON (một dòng)

**Quan trọng:** Đảm bảo JSON hợp lệ và ở dạng single-line.

---

### 🐙 GitHub Integration (Bắt Buộc cho Sync)

GitHub được dùng để sync dữ liệu câu hỏi, articles, resources.

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-repo-name
```

**Cách lấy GITHUB_TOKEN:**
1. Vào GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
2. Generate new token với quyền: `repo` (full control)
3. Copy token (chỉ hiển thị 1 lần!)

**GITHUB_OWNER & GITHUB_REPO:**
- Owner: tên user/organization của bạn
- Repo: tên repository chứa data (có thể là repo này)

---

### 👥 Admin Emails (Bắt Buộc)

Danh sách email có quyền admin, cách nhau bởi dấu phẩy.

```bash
ADMIN_EMAILS=admin@example.com,admin2@example.com
```

**Mặc định:** `nguyenphuongtinh557@gmail.com,macnghich@gmail.com`

---

### 🤖 AI Gateway (Bắt Buộc cho Tính Năng AI)

Toàn bộ model AI (Groq, Gemini, OpenRouter, Mistral, SambaNova, Cerebras, Cloudflare) đi qua **FTECA AI Gateway**. Key nhà cung cấp chỉ nằm trong gateway, không đặt trong QLCL.

```bash
AI_GATEWAY_URL=https://your-gateway-domain
AI_GATEWAY_KEY=gw_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Tùy chọn:**

```bash
# Alias model cho tóm tắt tài liệu (mặc định: gemini-3.5-flash-lite)
GATEWAY_SUMMARY_ALIAS=gemini-3.5-flash-lite
```

**Cách lấy key:**
1. Đăng nhập Admin UI của gateway
2. Vào "Khóa API" → tạo client key mới (dạng `gw_live_...`)
3. Copy key (chỉ hiển thị 1 lần)

**Kiến trúc:**
- Client (`modules/aiPool.js`) → `/api/ai-proxy` (Bearer Firebase ID token)
- Server (`api/*.js`) → gateway (Bearer `AI_GATEWAY_KEY`)
- Gateway tự xoay key, fallback model và circuit breaker

---

## 📦 File Cấu Hình

### Local Development (.env)

Tạo file `.env` ở root project:

```bash
# Firebase
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# GitHub
GITHUB_TOKEN=ghp_xxxx
GITHUB_OWNER=your-username
GITHUB_REPO=your-repo

# Admin
ADMIN_EMAILS=admin@example.com

# AI Gateway
AI_GATEWAY_URL=https://your-gateway-domain
AI_GATEWAY_KEY=gw_live_xxxx
```

### Vercel Deployment

1. Vào Vercel Dashboard → Project → Settings → Environment Variables
2. Thêm từng biến một với:
   - **Key:** Tên biến (e.g., `AI_GATEWAY_URL`)
   - **Value:** Giá trị của biến
   - **Environment:** Production, Preview, Development (chọn tất cả)
3. Click "Save"
4. Redeploy project để áp dụng

**Lưu ý quan trọng với Vercel:**
- `FIREBASE_SERVICE_ACCOUNT_JSON` phải là JSON hợp lệ (single-line)
- Kiểm tra log nếu có lỗi parse JSON
- Có thể cần escape quotes nếu paste vào UI

---

## 🔍 Kiểm Tra Cấu Hình

### Script Kiểm Tra API Keys

Chạy script để test tất cả API keys:

```bash
node check_api_quota.js
```

Script này sẽ:
- ✅ Kiểm tra từng key có hoạt động không
- 📊 Hiển thị quota còn lại
- ⚠️ Cảnh báo key nào hết quota hoặc invalid

### Kiểm Tra Trong App

1. Đăng nhập bằng tài khoản admin
2. Vào "Cài đặt" → "API Status"
3. Xem trạng thái từng provider

---

## 🚨 Xử Lý Lỗi Thường Gặp

### Lỗi: "Firebase authentication not configured"

**Nguyên nhân:** `FIREBASE_SERVICE_ACCOUNT_JSON` không được set hoặc invalid JSON

**Giải pháp:**
1. Kiểm tra biến có được set chưa: `echo $FIREBASE_SERVICE_ACCOUNT_JSON`
2. Validate JSON: [jsonlint.com](https://jsonlint.com/)
3. Đảm bảo không có line breaks trong JSON
4. Trên Vercel: Copy-paste lại JSON vào Environment Variable

### Lỗi: "AI gateway is not configured" / "ai-gateway-error"

**Nguyên nhân:** Thiếu `AI_GATEWAY_URL` hoặc `AI_GATEWAY_KEY`, hoặc gateway không phản hồi

**Giải pháp:**
1. Kiểm tra 2 biến đã set trong `.env` / Vercel
2. Kiểm tra gateway còn chạy: `curl $AI_GATEWAY_URL/health`
3. Kiểm tra client key còn hiệu lực trong Admin UI → "Khóa API"
4. Redeploy sau khi đổi biến

### Lỗi: "Rate limit exceeded"

**Nguyên nhân:** Gateway trả 429 khi toàn bộ key của model đã hết quota

**Giải pháp:**
1. Thêm key/provider trong Admin UI gateway
2. Kiểm tra cảnh báo trong Admin UI → "Cảnh báo"
3. Gateway tự fallback model nếu có route dự phòng

### Lỗi: "github-read-404" khi sync

**Nguyên nhân:** `GITHUB_REPO` hoặc `GITHUB_OWNER` sai, hoặc token không có quyền

**Giải pháp:**
1. Kiểm tra tên repo chính xác
2. Đảm bảo token có scope `repo`
3. Kiểm tra repo visibility (private cần token có quyền)

---

## 📊 Quota & Giới Hạn

Quota do gateway quản lý theo từng key/provider. Admin UI hiển thị mức dùng, lỗi 429 và trạng thái circuit breaker thời gian thực.

### Khuyến Nghị

1. **Nhiều key/provider trong gateway** để tự động xoay khi hết quota
2. **Fallback model:** cấu hình route dự phòng cho từng feature
3. **Monitoring:** theo dõi trang "Nhật ký & Mức dùng" của gateway

---

## 🔐 Best Practices Bảo Mật

### ✅ Nên Làm

- ✅ Dùng `.env` file cho local development
- ✅ Thêm `.env` vào `.gitignore`
- ✅ Dùng environment variables platform (Vercel, Netlify) cho production
- ✅ Rotate keys định kỳ (3-6 tháng)
- ✅ Giới hạn scope của API keys (chỉ cấp quyền cần thiết)
- ✅ Monitor usage để phát hiện abuse

### ❌ Không Nên Làm

- ❌ Hardcode keys trong source code
- ❌ Commit keys vào Git
- ❌ Share keys qua email/chat
- ❌ Dùng cùng key cho dev và production
- ❌ Để keys trong public repository
- ❌ Sử dụng keys không có rate limiting

---

## 🆘 Hỗ Trợ

Nếu gặp vấn đề:

1. Kiểm tra log server: `vercel logs` hoặc console.log local
2. Chạy script test: `node check_api_quota.js`
3. Xem documentation của từng provider
4. Liên hệ team qua issue tracker

---

## 📚 Tài Liệu Tham Khảo

- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Groq API Docs](https://console.groq.com/docs/)
- [Gemini API Docs](https://ai.google.dev/docs)
- [Mistral API Docs](https://docs.mistral.ai/)
- [OpenRouter Docs](https://openrouter.ai/docs)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)

---

**Cập nhật lần cuối:** January 2025  
**Phiên bản:** 2.0 (AI Generation System Refactor)
