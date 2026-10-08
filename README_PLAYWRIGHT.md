# 📱 PLAYWRIGHT MOBILE TESTING

## ✨ Tác dụng của Playwright

Playwright giúp bạn:

1. **🔍 Mô phỏng thiết bị mobile thật**
   - iPhone 12 Pro, Pixel 5, Samsung Galaxy, iPad...
   - Viewport size, user agent, touch events chính xác

2. **📸 Test responsive UI tự động**
   - Chụp screenshot tất cả devices
   - So sánh visual regression
   - Kiểm tra layout không bị vỡ

3. **🎯 Test tương tác mobile**
   - Touch gestures (tap, swipe, pinch)
   - Mobile menu behavior
   - Keyboard mobile
   - Scroll performance

4. **⚡ Train AI chính xác hơn**
   - Verify UI trước khi training
   - Capture visual feedback
   - Test edge cases (small screens)

---

## 🚀 Cách sử dụng

### **1. Test nhanh với script đơn giản**

```bash
npm run test:mobile
```

**Chức năng:**
- Mở browser hiển thị (headless: false)
- Test 5 devices: iPhone 12 Pro, iPhone SE, Pixel 5, Galaxy S21, iPad Pro
- Chụp screenshot full page → `./screenshots/`
- Test scroll, click mobile menu

---

### **2. Test suite đầy đủ (recommended)**

```bash
npm test
```

**Test cases:**
- ✅ Trang chủ hiển thị đúng
- ✅ Navigation menu hoạt động
- ✅ Chat interface responsive
- ✅ Scroll behavior
- ✅ Touch gestures
- ✅ Font size readable (≥14px)
- ✅ Images không overflow
- ✅ Buttons đủ lớn cho touch (≥36px height)

**Output:**
```
📱 iPhone 12 Pro
   ✅ Viewport: 390x844
   ✅ Mobile menu clickable
   ✅ Chat input functional
   📸 Screenshot captured

📱 Pixel 5
   ✅ Viewport: 393x851
   ...
```

---

### **3. Test với UI mode (interactive)**

```bash
npm run test:ui
```

**Tính năng:**
- 🖱️ Click từng test để chạy
- 👁️ Xem browser real-time
- 🐛 Debug step-by-step
- 📊 View traces, screenshots

---

### **4. Test với browser hiển thị**

```bash
npm run test:headed
```

Xem browser thực tế khi test chạy (không headless)

---

## 📂 Cấu trúc files

```
d:\QLCL\
├── playwright.config.js          # Config chính
├── test-mobile.js                # Script test nhanh
├── tests/
│   └── mobile-ui.spec.js         # Test suite đầy đủ
├── screenshots/                  # Auto-generated screenshots
└── test-results/                 # Test reports + videos
```

---

## 🎯 Use Cases cho project của bạn

### **Scenario 1: Kiểm tra responsive layout**
```bash
npm run test:mobile
```
→ Chụp screenshot tất cả devices
→ Review visual trong `./screenshots/`

### **Scenario 2: Test mobile menu**
Playwright sẽ tự động:
- Tìm hamburger button
- Click để mở menu
- Verify menu visible

### **Scenario 3: Test chat interface trên mobile**
```javascript
// tests/mobile-ui.spec.js đã có sẵn
test('Chat interface responsive', async ({ page }) => {
  const chatInput = page.locator('#userQuestion');
  await chatInput.fill('Test mobile input');
  // ✅ Verify typing works
});
```

### **Scenario 4: Train AI với feedback chính xác**
1. Chạy test → capture screenshots
2. So sánh expected vs actual
3. Fix UI issues
4. Re-train với data chính xác

---

## 🔧 Customization

### **Thêm device mới:**

Sửa `playwright.config.js`:
```javascript
projects: [
  {
    name: 'iPhone 14 Pro Max',
    use: { ...devices['iPhone 14 Pro Max'] }
  }
]
```

### **Thêm test case mới:**

Sửa `tests/mobile-ui.spec.js`:
```javascript
test('Tính năng mới của bạn', async ({ page }) => {
  await page.goto('/');
  // Your test logic
});
```

---

## 📊 Test Reports

Sau khi chạy test, xem report:

```bash
npx playwright show-report
```

**Report bao gồm:**
- ✅/❌ Pass/Fail status
- 📸 Screenshots
- 🎥 Videos (nếu fail)
- 📜 Traces (debug chi tiết)

---

## 💡 Tips

1. **Test locally trước khi deploy**
   ```bash
   node server.js  # Terminal 1
   npm test        # Terminal 2
   ```

2. **Chụp screenshot để so sánh**
   ```bash
   npm run test:mobile
   # Check ./screenshots/ folder
   ```

3. **Debug test fail**
   ```bash
   npm run test:ui
   # Click vào test fail → xem trace
   ```

4. **CI/CD integration**
   - Playwright chạy headless trên CI
   - Auto-upload artifacts (screenshots, videos)

---

## 🎓 Kết luận

**Playwright giúp bạn:**
- ✅ **Verify** mobile UI trước khi training AI
- ✅ **Catch bugs** sớm (layout vỡ, button không click được)
- ✅ **Document** UI behavior với screenshots
- ✅ **Automate** testing cho CI/CD

**→ Train AI chính xác hơn vì UI đã được verify trên nhiều devices thật!**
