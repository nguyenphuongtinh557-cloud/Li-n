# ✅ Checklist: Setup & Testing Tính năng Lịch sử Câu hỏi AI

## 🔧 Bước 1: Cài đặt Dependencies

```powershell
# Cài đặt dotenv package
npm install

# Verify installation
npm ls dotenv
# ✅ Expected: dotenv@16.4.5
```

---

## 🔑 Bước 2: Cấu hình Environment Variables

### 2.1. Tạo file `.env`
```powershell
# Copy template
Copy-Item .env.example .env
```

### 2.2. Điền các API keys cần thiết

#### **FIREBASE (BẮT BUỘC cho lưu lịch sử theo tài khoản)**
1. Vào Firebase Console: https://console.firebase.google.com/
2. Chọn project của bạn
3. Project Settings → Service Accounts
4. Generate New Private Key
5. Copy toàn bộ JSON vào `FIREBASE_SERVICE_ACCOUNT_JSON`

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"fteca-24",...}
```

#### **AI GATEWAY (BẮT BUỘC cho tính năng AI)**
1. Đăng nhập Admin UI của gateway
2. Vào "Khóa API" → tạo client key (`gw_live_...`)
3. Điền URL gateway và key vào `.env`

```env
AI_GATEWAY_URL=https://your-gateway-domain
AI_GATEWAY_KEY=gw_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Không đặt key Groq/Gemini/OpenRouter... trong QLCL — chúng nằm trong gateway.

### 2.3. Verify `.env` file
```powershell
# Check if .env exists
Test-Path .env
# ✅ Expected: True

# Check if .gitignore contains .env
Select-String -Path .gitignore -Pattern "^\.env$"
# ✅ Expected: .env found
```

---

## 🚀 Bước 3: Khởi động Server

```powershell
npm start
```

**Expected output:**
```
> fteca-24@1.0.0 prestart
> npm run build

> fteca-24@1.0.0 build
> esbuild modules/themeMorphIcon.js modules/summaryDocx.js modules/studySpaceAssistantAnimation.js --bundle --format=esm --minify --legal-comments=inline --outdir=vendor

> fteca-24@1.0.0 start
> node server.js

🚀 FTECA 24 server running on http://localhost:3000
```

**Nếu lỗi:**
- ❌ `Cannot find module 'dotenv'` → Chạy `npm install`
- ❌ `FIREBASE_SERVICE_ACCOUNT_JSON is not set` → Kiểm tra `.env`
- ❌ Port 3000 busy → Đổi port trong `server.js` hoặc kill process cũ

---

## 🧪 Bước 4: Test Luồng Hoàn Chỉnh

### 4.1. Đăng nhập
- [ ] Mở http://localhost:3000
- [ ] Nhấn "Đăng nhập bằng Google"
- [ ] Chọn tài khoản Google
- [ ] ✅ Thấy avatar và tên hiển thị góc phải

### 4.2. Mở trang "Tạo câu hỏi bằng AI"
- [ ] Nhấn sidebar → "Tạo câu hỏi bằng AI"
- [ ] ✅ Thấy khu vực "Câu hỏi AI của tôi"
- [ ] ✅ Nếu chưa có lịch sử: "Chưa có lượt sinh câu hỏi"

### 4.3. Test Upload PDF
- [ ] Nhấn "Tải tài liệu lên"
- [ ] Chọn một file PDF (tốt nhất < 10MB)
- [ ] ✅ Thấy PDF xuất hiện trong "Tài Liệu Đã Thêm"
- [ ] ✅ File có icon PDF và tên file

### 4.4. Test Sinh câu hỏi
- [ ] Chọn môn học từ dropdown (ví dụ: "Công nghệ Chế biến Thủy sản")
- [ ] Chọn số câu hỏi: 5
- [ ] Nhấn "Sinh câu hỏi ngay"
- [ ] ⏳ Đợi 10-30 giây (tùy model AI)
- [ ] ✅ Thấy toast: "AI đã sinh X/Y câu. Hãy xem lại nội dung trước khi lưu."
- [ ] ✅ Modal "Thẩm Định & Biên Tập Đề Thi AI" mở ra
- [ ] ✅ Thấy danh sách câu hỏi với 4 đáp án

### 4.5. Test Lưu lịch sử
- [ ] Cuộn xuống "Câu hỏi AI của tôi"
- [ ] ✅ Thấy lượt sinh mới xuất hiện:
  - Tên PDF
  - "5 câu · Công nghệ Chế biến Thủy sản · [hôm nay] · Bản nháp"
  - Nút "Mở" và "Xóa"

**Kiểm tra toast message:**
- ✅ Nếu thành công: "Đã lưu vào lịch sử cá nhân"
- ⚠️ Nếu chỉ local: "Chỉ lưu tạm trên thiết bị này; chưa đồng bộ lên máy chủ."

### 4.6. Test Mở lại lịch sử
- [ ] Nhấn nút "Mở" trên lượt sinh
- [ ] ✅ Modal "Thẩm Định & Biên Tập" mở lại
- [ ] ✅ Thấy đầy đủ câu hỏi đã sinh trước đó
- [ ] ✅ Có thể chỉnh sửa câu hỏi/đáp án

### 4.7. Test Chỉnh sửa câu hỏi
- [ ] Sửa câu hỏi đầu tiên
- [ ] Đợi 700ms (auto-save debounce)
- [ ] Đóng modal
- [ ] Nhấn "Mở" lại
- [ ] ✅ Chỉnh sửa đã được lưu

**Kiểm tra Console:**
```javascript
// Mở DevTools (F12) → Console
// Không thấy error về auto-save
```

### 4.8. Test Lưu vào Ngân hàng đề
- [ ] Trong modal chỉnh sửa, chọn lại môn học nếu cần
- [ ] Nhấn "Lưu vào ngân hàng đề"
- [ ] ✅ Toast: "Đã lưu X câu vào ngân hàng đề môn [tên môn]"
- [ ] ✅ Modal đóng
- [ ] ✅ Lịch sử cập nhật trạng thái: "Đã lưu ngân hàng"

### 4.9. Test Xóa lịch sử
- [ ] Nhấn nút "Xóa" (icon thùng rác)
- [ ] ✅ Popup xác nhận: "Xóa lượt sinh này khỏi lịch sử cá nhân?"
- [ ] Nhấn OK
- [ ] ✅ Toast: "Đã xóa lượt sinh khỏi lịch sử."
- [ ] ✅ Item biến mất khỏi danh sách

### 4.10. Test Làm mới
- [ ] Nhấn nút "Làm mới" (icon rotate)
- [ ] ✅ Danh sách reload
- [ ] ✅ Thấy spinner "Đang tải lịch sử..." rồi hiện danh sách

---

## 🔍 Bước 5: Kiểm tra Firestore

### 5.1. Vào Firebase Console
1. Firestore Database
2. Collection: `aiQuestionHistory`
3. ✅ Thấy documents với UID và email của bạn

### 5.2. Kiểm tra structure
```javascript
{
  uid: "abc123...",
  email: "user@example.com",
  source: {
    title: "document.pdf",
    type: "pdf",
    url: "...",
    contentPreview: "..."
  },
  generationConfig: {
    subjectId: "ft4468",
    subjectName: "Công nghệ Chế biến Thủy sản",
    count: 5
  },
  questions: [...],
  status: "draft",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## 🐛 Bước 6: Test Edge Cases

### 6.1. Test Offline Fallback
- [ ] Mở DevTools → Network tab
- [ ] Chọn "Offline" mode
- [ ] Sinh câu hỏi mới
- [ ] ⚠️ Toast: "Chỉ lưu tạm trên thiết bị này; chưa đồng bộ lên máy chủ."
- [ ] ✅ Câu hỏi vẫn xuất hiện trong lịch sử
- [ ] ✅ Badge "Chỉ lưu trên thiết bị này"

### 6.2. Test Multiple Accounts
- [ ] Đăng xuất
- [ ] Đăng nhập tài khoản khác
- [ ] Vào "Tạo câu hỏi bằng AI"
- [ ] ✅ Chỉ thấy lịch sử của tài khoản mới
- [ ] ✅ Không thấy lịch sử của tài khoản cũ

### 6.3. Test Gateway Fallback
- [ ] Nếu một key/provider trong gateway hết quota
- [ ] ✅ Gateway tự chuyển sang key/model khác
- [ ] ✅ User không thấy lỗi

### 6.4. Test Very Large PDF
- [ ] Upload PDF > 10MB
- [ ] ✅ Hiển thị warning hoặc từ chối upload
- [ ] ✅ Toast: "File vượt quá giới hạn 10MB"

---

## ✅ Checklist Tổng hợp

### Dependencies
- [x] `dotenv` đã cài đặt trong `package.json`
- [ ] Chạy `npm install` thành công
- [ ] `npm ls dotenv` hiển thị version

### Environment
- [ ] File `.env` đã tạo từ `.env.example`
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON` đã điền
- [ ] Ít nhất `AI_GATEWAY_URL` + `AI_GATEWAY_KEY` đã điền
- [ ] `.env` có trong `.gitignore`

### Server
- [ ] `npm start` chạy không lỗi
- [ ] Server lắng nghe port 3000
- [ ] Mở được http://localhost:3000

### Authentication
- [ ] Đăng nhập Google thành công
- [ ] Avatar hiển thị góc phải
- [ ] Firebase token được lấy thành công

### AI Generation Flow
- [ ] Upload PDF/DOCX thành công
- [ ] Chọn môn học và số câu hỏi
- [ ] Sinh câu hỏi thành công
- [ ] Modal chỉnh sửa mở ra
- [ ] Toast thông báo rõ ràng

### History UI
- [ ] Danh sách lịch sử hiển thị
- [ ] Mỗi item có đầy đủ metadata
- [ ] Nút "Mở" hoạt động
- [ ] Nút "Xóa" có xác nhận
- [ ] Nút "Làm mới" reload danh sách
- [ ] Trạng thái (draft/reviewed/saved_to_bank) hiển thị

### Storage & Sync
- [ ] Lượt sinh được lưu vào Firestore
- [ ] LocalStorage backup hoạt động
- [ ] Auto-save edits sau 700ms
- [ ] Xóa đồng bộ cả Firestore + localStorage
- [ ] Offline fallback hoạt động

### Security
- [ ] API keys không xuống client (check DevTools → Sources)
- [ ] Firebase token trong Authorization header
- [ ] Backend verify token trước mỗi request
- [ ] User chỉ thấy lịch sử của mình

### Edge Cases
- [ ] Offline mode: lưu local + cảnh báo
- [ ] Đổi tài khoản: cache clear, chỉ thấy lịch sử mới
- [ ] API quota exceeded: toast error rõ ràng
- [ ] File quá lớn: từ chối với message

---

## 🚨 Known Issues Cần Fix Trước Deploy

### 1. ❌ Model Mistral đã deprecated
**File:** `modules/questionGeneratorCore.js`
**Issue:** Sử dụng `open-mistral-nemo-2407` (deprecated 2026-05-22)
**Fix:** Đã đổi sang `ministral-8b-latest` ✅

### 2. ❌ Cache không gắn với UID
**File:** `modules/aiQuestionHistory.js`
**Issue:** Cache dùng chung cho tất cả user
**Fix:** Đã thêm `ensureCacheForCurrentUser()` ✅

### 3. ❌ Missing dotenv dependency
**File:** `package.json`
**Issue:** `server.js` import `dotenv/config` nhưng package chưa có
**Fix:** Đã thêm `"dotenv": "^16.4.5"` vào dependencies ✅

### 4. ⚠️ .env.example có model cũ
**File:** `.env.example`
**Issue:** Ghi chú "Model: open-mistral-nemo-2407"
**Fix:** Đã cập nhật thành "ministral-8b-latest" ✅

### 5. ⏳ Chưa có Firestore Security Rules
**Status:** TODO
**Action Required:** Setup security rules trong Firebase Console

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /aiQuestionHistory/{historyId} {
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid;
      allow read, update, delete: if request.auth != null
                                   && resource.data.uid == request.auth.uid;
    }
  }
}
```

---

## 📊 Test Results Template

```markdown
## Test Results - [Date]

**Tester:** [Your name]
**Environment:** Local dev server (http://localhost:3000)
**Browser:** Chrome/Firefox/Edge [version]

### Setup
- [ ] dotenv installed: ✅/❌
- [ ] .env configured: ✅/❌
- [ ] Server starts: ✅/❌

### Core Flow
- [ ] Login: ✅/❌
- [ ] Upload PDF: ✅/❌
- [ ] Generate questions: ✅/❌ (Model used: _______)
- [ ] Save to history: ✅/❌ (Source: API/Local)
- [ ] Reopen history: ✅/❌
- [ ] Edit questions: ✅/❌
- [ ] Delete history: ✅/❌

### Edge Cases
- [ ] Offline mode: ✅/❌
- [ ] Multiple accounts: ✅/❌
- [ ] Large PDF: ✅/❌

### Issues Found
1. [Describe issue]
2. [Describe issue]

### Notes
[Any additional observations]
```

---

## 🎯 Khi nào coi như "Hoàn thành"?

✅ **Checklist đầy đủ:**
1. Tất cả dependencies đã cài
2. .env đã cấu hình với ít nhất 1 AI API key + Firebase
3. Server khởi động không lỗi
4. Toàn bộ test flow (4.1 → 4.10) PASS
5. Firestore Security Rules đã setup
6. Không có errors trong Console
7. Test với ít nhất 2 tài khoản khác nhau
8. Test offline fallback hoạt động

✅ **Khi deploy production:**
- Vercel environment variables đã cấu hình
- Firebase security rules đã deploy
- Test trên domain production
- Monitoring/logging hoạt động

---

## 📞 Support

**Nếu gặp lỗi:**
1. Kiểm tra Console (F12) → có error gì?
2. Kiểm tra Network tab → API calls có fail?
3. Kiểm tra `.env` → keys có đúng format?
4. Restart server và thử lại

**Common Errors:**
- `Authentication required` → Đăng nhập lại
- `API error: 401` → API key sai hoặc expired
- `Quota exceeded` → Đổi sang API key khác
- `Cannot find module` → `npm install` lại
