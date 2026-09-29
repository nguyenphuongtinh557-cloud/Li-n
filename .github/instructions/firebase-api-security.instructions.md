# Hướng Dẫn Bảo Mật Firebase & API - FTECA-24 Security Protocol

Tệp hướng dẫn này quy định các tiêu chuẩn bảo mật bắt buộc áp dụng cho Firebase Admin SDK, Vercel Serverless Functions, quản lý API Key và phân quyền người dùng trong dự án FTECA-24.

---

## 1. Quản Lý Khóa Bí Mật (API Keys & Secrets Security)

- **TUYỆT ĐỐI KHÔNG commit API Key hoặc Firebase Credentials lên Git:**  
  Tất cả các khóa bí mật (`GEMINI_API_KEY`, `GROQ_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `FIREBASE_ADMIN_CREDENTIALS`) phải được đọc duy nhất qua `process.env`.
- **Kiểm tra trạng thái Key định kỳ:** Sử dụng các công cụ kiểm tra Quota và Key như `check_api_quota.js` hoặc `API_KEYS_STATUS.md` để phát hiện sự cố lọt lộ hoặc vô hiệu hóa key.

---

## 2. Firebase Admin SDK & Phân Quyền Người Dùng (Auth & RBAC)

### 2.1 Xác Thực Token (ID Token Verification)
Tất cả các API route Serverless (`/api/...`) hoặc module yêu cầu xác thực (`modules/auth.js`, `modules/admin.js`) phải kiểm tra `Authorization: Bearer <ID_TOKEN>` hợp lệ trước khi xử lý yêu cầu:

```javascript
import admin from 'firebase-admin';

export async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Thiếu Token xác thực.');
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken; // Trả về thông tin UID, Email, Admin claim
  } catch (error) {
    throw new Error('Unauthorized: Token không hợp lệ hoặc đã hết hạn.');
  }
}
```

### 2.2 Phân Quyền Quản Trị Viên (Admin Privileges Check)
Dành cho các endpoint nhạy cảm (Quản lý câu hỏi, Quản lý tài nguyên môn học, Dashboard):
```javascript
export async function requireAdminRole(req) {
  const decodedToken = await verifyAuthToken(req);
  if (!decodedToken.admin && decodedToken.role !== 'admin') {
    throw new Error('Forbidden: Bạn không có quyền truy cập quản trị viên.');
  }
  return decodedToken;
}
```

---

## 3. Bảo Mật Endpoint API Serverless & Anti-Injection

### 3.1 Sanitization Dữ Liệu Đầu Vào (Input Sanitization)
- **Chống XSS & Malicious Injection:** Mọi chuỗi ký tự nhận từ Client (`req.body`, `req.query`) phải được làm sạch bằng cách encode hoặc loại bỏ các thẻ script/html độc hại trước khi đưa vào Firestore hoặc truyền vào AI Prompts.
- **Hạn chế kích thước Payload (Payload Size Limits):** Giới hạn tối đa kích thước dữ liệu upload/sumary (tối đa 10MB) để chống tấn công từ chối dịch vụ (DoS).

### 3.2 Cấu Hình CORS & Header Bảo Mật (Vercel & Express)
- Quy định tiêu chuẩn CORS trong `vercel.json` và API handlers:
  - Chỉ cho phép các domain được ủy quyền kết nối (`Access-Control-Allow-Origin`).
  - Đặt các header bảo mật cơ bản: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`.

### 3.3 Che Giấu Lỗi Hệ Thống (Sanitized Error Responses)
- Không trả về chi tiết `stack trace`, đường dẫn tệp tin hệ thống hoặc thông tin kết nối DB cho người dùng cuối khi xảy ra lỗi `500 Internal Server Error`. Trả về thông báo lỗi tổng quát và log chi tiết tại phía Server.
