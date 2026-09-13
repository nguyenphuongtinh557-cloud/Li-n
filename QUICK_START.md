# ⚡ QUICK START - Chạy FTECA 24 trong 2 phút!

---

## 🚀 Cách 1: Node.js Server (Khuyến nghị)

### Bước 1: Mở Terminal/CMD tại thư mục project

**Windows:**
```bash
cd d:\QLCL
```

**Mac/Linux:**
```bash
cd /path/to/QLCL
```

### Bước 2: Chạy server

```bash
npm start
```

### Bước 3: Mở trình duyệt

Truy cập: **http://localhost:3000**

**Hoàn tất!** 🎉

---

## 🐍 Cách 2: Python Server (Không cần Node.js)

### Bước 1: Mở Terminal/CMD

```bash
cd d:\QLCL
```

### Bước 2: Chạy Python server

**Python 3:**
```bash
python -m http.server 3000
```

**Python 2:**
```bash
python -m SimpleHTTPServer 3000
```

### Bước 3: Mở trình duyệt

Truy cập: **http://localhost:3000**

**Hoàn tất!** 🎉

---

## 🌐 Cách 3: VS Code Live Server

### Bước 1: Cài extension

1. Mở VS Code
2. Extensions (Ctrl+Shift+X)
3. Tìm "Live Server"
4. Cài đặt

### Bước 2: Chạy

1. Mở file `index.html`
2. Right-click → **"Open with Live Server"**

**Hoàn tất!** 🎉

---

## 🎯 Commands Nhanh

### Node.js:
```bash
npm start          # Chạy server
npm run dev        # Chạy server (giống npm start)
```

### Python 3:
```bash
python -m http.server 3000
```

### Python 2:
```bash
python -m SimpleHTTPServer 3000
```

---

## 🔧 Troubleshooting

### Lỗi: "Port 3000 đã được sử dụng"

**Giải pháp 1:** Đổi port khác
```bash
# Node.js
PORT=8080 npm start

# Python
python -m http.server 8080
```

**Giải pháp 2:** Kill process trên port 3000

**Windows:**
```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Mac/Linux:**
```bash
lsof -ti:3000 | xargs kill
```

---

### Lỗi: "npm: command not found"

**Giải pháp:** Cài Node.js

1. Download: https://nodejs.org/
2. Cài đặt Node.js (LTS version)
3. Kiểm tra:
   ```bash
   node --version
   npm --version
   ```

Hoặc dùng **Cách 2 (Python)** hoặc **Cách 3 (Live Server)**

---

### Lỗi: "python: command not found"

**Giải pháp:** Cài Python

1. Download: https://www.python.org/
2. Cài đặt Python 3.x
3. ✅ Check "Add Python to PATH"
4. Kiểm tra:
   ```bash
   python --version
   ```

Hoặc dùng **Cách 1 (Node.js)** hoặc **Cách 3 (Live Server)**

---

## 📱 Truy Cập Từ Điện Thoại

### Bước 1: Tìm IP của máy tính

**Windows:**
```bash
ipconfig
```
→ Tìm "IPv4 Address" (VD: 192.168.1.100)

**Mac:**
```bash
ifconfig | grep "inet "
```

**Linux:**
```bash
hostname -I
```

### Bước 2: Mở trình duyệt trên điện thoại

Truy cập: **http://192.168.1.100:3000**

> **Lưu ý:** Điện thoại và máy tính phải cùng mạng WiFi

---

## ✅ Checklist

- [ ] Node.js hoặc Python đã cài
- [ ] Terminal/CMD mở đúng thư mục
- [ ] Server đang chạy (thấy message "Server Running")
- [ ] Truy cập http://localhost:3000
- [ ] Trang web hiển thị thành công

---

## 🎉 Kết Quả Mong Đợi

Khi chạy thành công, bạn sẽ thấy:

### Terminal:
```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║         🚀 FTECA 24 - Development Server Running          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

  ✅ Server: http://localhost:3000
  ✅ Network: http://192.168.1.100:3000
  ✅ Time: 12/09/2026, 10:30:00

  📂 Serving files from: d:\QLCL

  Press Ctrl+C to stop the server
```

### Browser:
- Trang chủ FTECA 24 hiển thị
- Sidebar với menu điều hướng
- Chatbot ở góc dưới phải
- Tất cả tính năng hoạt động

---

## 🛑 Dừng Server

Nhấn **Ctrl + C** trong Terminal/CMD

---

## 💡 Tips

### Tự động reload khi sửa code:

**Option 1:** Dùng nodemon
```bash
npm install -g nodemon
nodemon server.js
```

**Option 2:** Dùng Live Server (VS Code extension)

**Option 3:** Manual reload (F5) trong browser

---

### Xem logs:

- **Node.js:** Logs hiển thị trong Terminal
- **Browser:** Mở DevTools (F12) → Console tab

---

## 📚 Tài Liệu Thêm

- 📄 [README.md](README.md) - Documentation đầy đủ
- 🔑 [API_KEYS_STATUS.md](API_KEYS_STATUS.md) - API keys status
- 🧠 [CHATBOT_PROMPT_ARCHITECTURE.md](CHATBOT_PROMPT_ARCHITECTURE.md) - Chatbot architecture
- 💰 [SO_SANH_MODELS_VA_GIA_THANH.md](SO_SANH_MODELS_VA_GIA_THANH.md) - AI models comparison

---

**Chúc bạn code vui vẻ! 🚀**
