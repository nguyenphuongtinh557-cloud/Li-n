# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-ui.spec.js >> Mobile UI Tests >> Trang chủ hiển thị đúng trên mobile
- Location: tests\mobile-ui.spec.js:10:5

# Error details

```
Error: expect(page).toHaveTitle(expected) failed

Expected pattern: /Quản Lý Chất Lượng/i
Received string:  "FTECA 24"
Timeout: 5000ms

Call log:
  - Expect "toHaveTitle" with timeout 5000ms
    13 × locator resolved to <html lang="vi" data-theme="light">…</html>
       - unexpected value "FTECA 24"

```

```yaml
- complementary:
  - img "FTECA 24 Logo"
  - button ""
  - text: Chương Trình Đào Tạo 🎓 Công Nghệ Thực Phẩm 
  - navigation:
    - button " Trang chủ"
    - button " Đọc báo & Tin tức"
    - button " Không gian học tập"
    - button " Hướng dẫn tính năng"
    - text: TÍNH NĂNG AI NÂNG CAO
    - button " Tạo câu hỏi bằng AI"
    - button " Tóm tắt giáo trình"
    - button " Lên kế hoạch ôn thi Sắp ra"
    - button " Nâng cấp tài khoản PRO"
- banner:
  - button ""
  - text: 
  - 'textbox "Tìm môn học theo tên hoặc mã môn (vd: FT4468, GE4091)..."'
  - button "Chuyển sang chế độ tối"
  - button "Mở thông báo": 
  - button:
    - img
- main:
  - text: 🎓 Ngành Công Nghệ Thực Phẩm · FTECA 24
  - heading "Xin chào! Chúng tôi là FTECA 24" [level=1]
  - paragraph:
    - text: Đây là nơi mà tụi mình chia sẻ, đăng tải và lưu trữ những thông tin, tài liệu, đề thi, trải nghiệm và phương pháp tiếp cận theo góc nhìn cá nhân.
    - strong: Một lần nữa, chào mừng các bạn đến với đại gia đình này!
  - button " Vào Khu Vực Ôn Tập"
  - button " Tìm Hiểu Ngành CNTP"
  - img "Sinh viên CNTP học tập"
  - text: 📚 65+ Môn học CNTP  65+ Môn học hỗ trợ  5.000+ Câu hỏi ngân hàng đề  AI Trợ lý thông minh 24/7  1K+ Sinh viên đang học 
  - heading "Thi Thử Trực Tuyến" [level=3]
  - paragraph: Đề thi tương tự bài kiểm tra chính thức, có đồng hồ đếm ngược và chấm điểm tự động.
  - text:  
  - heading "Luyện Tập Theo Chủ Đề" [level=3]
  - paragraph: Ôn tập từng chương, từng chủ đề với hàng nghìn câu hỏi có đáp án giải thích chi tiết.
  - text:  
  - heading "AI Tạo Câu Hỏi" [level=3]
  - paragraph: Upload tài liệu, AI tự động phân tích và tạo bộ câu hỏi ôn tập cá nhân hóa cho bạn.
  - text:  
  - heading "Ngân Hàng Đề Thi" [level=3]
  - paragraph: Kho lưu trữ toàn bộ câu hỏi, phân loại rõ ràng theo môn học, chủ đề và mức độ khó.
  - text: 
- complementary "Cài đặt":
  - heading " Cài Đặt" [level=2]
  - button "Đóng": 
  - text: "Chế Độ Tối Bảo vệ mắt khi học khuya Tỉ Lệ Độ Khó Đề Thi Hiện tại: 50% Dễ / 30% TB / 20% Khó"
  - button " Lưu Cài Đặt"
  - paragraph: Khu Vực Nguy Hiểm
  - button " Xóa Toàn Bộ Dữ Liệu"
- button "Mở trợ lý FTECA 24":
  - img "FTECA 24"
- img
```

# Test source

```ts
  1   | /**
  2   |  * MOBILE UI TEST SUITE
  3   |  * Test responsive behavior trên các thiết bị mobile
  4   |  */
  5   | 
  6   | import { test, expect } from '@playwright/test';
  7   | 
  8   | test.describe('Mobile UI Tests', () => {
  9   |     
  10  |     test('Trang chủ hiển thị đúng trên mobile', async ({ page }) => {
  11  |         await page.goto('/');
  12  |         
  13  |         // Kiểm tra title
> 14  |         await expect(page).toHaveTitle(/Quản Lý Chất Lượng/i);
      |                            ^ Error: expect(page).toHaveTitle(expected) failed
  15  |         
  16  |         // Kiểm tra viewport mobile
  17  |         const viewport = page.viewportSize();
  18  |         expect(viewport.width).toBeLessThanOrEqual(768);
  19  |         
  20  |         console.log(`   📱 Viewport: ${viewport.width}x${viewport.height}`);
  21  |     });
  22  | 
  23  |     test('Navigation menu hoạt động trên mobile', async ({ page }) => {
  24  |         await page.goto('/');
  25  |         
  26  |         // Tìm mobile menu button
  27  |         const menuButton = page.locator('button[data-mobile-menu], .mobile-menu-btn, .hamburger');
  28  |         
  29  |         if (await menuButton.count() > 0) {
  30  |             await menuButton.first().click();
  31  |             await page.waitForTimeout(500);
  32  |             
  33  |             // Kiểm tra menu đã mở
  34  |             const menu = page.locator('.mobile-menu, .nav-menu');
  35  |             await expect(menu).toBeVisible();
  36  |             
  37  |             console.log('   ✅ Mobile menu clickable');
  38  |         } else {
  39  |             console.log('   ⚠️  No mobile menu button found');
  40  |         }
  41  |     });
  42  | 
  43  |     test('Chat interface responsive trên mobile', async ({ page }) => {
  44  |         await page.goto('/');
  45  |         
  46  |         // Tìm chat container
  47  |         const chatContainer = page.locator('#chatContainer, .chat-container');
  48  |         
  49  |         if (await chatContainer.count() > 0) {
  50  |             await expect(chatContainer).toBeVisible();
  51  |             
  52  |             // Kiểm tra input field
  53  |             const chatInput = page.locator('textarea[placeholder*="câu hỏi"], #userQuestion');
  54  |             await expect(chatInput).toBeVisible();
  55  |             
  56  |             // Test typing
  57  |             await chatInput.fill('Test mobile input');
  58  |             const value = await chatInput.inputValue();
  59  |             expect(value).toBe('Test mobile input');
  60  |             
  61  |             console.log('   ✅ Chat input functional');
  62  |         }
  63  |     });
  64  | 
  65  |     test('Scroll behavior trên mobile', async ({ page }) => {
  66  |         await page.goto('/');
  67  |         
  68  |         // Scroll xuống cuối trang
  69  |         await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  70  |         await page.waitForTimeout(1000);
  71  |         
  72  |         // Kiểm tra scroll position
  73  |         const scrollY = await page.evaluate(() => window.scrollY);
  74  |         expect(scrollY).toBeGreaterThan(0);
  75  |         
  76  |         console.log(`   ✅ Scrolled to: ${scrollY}px`);
  77  |     });
  78  | 
  79  |     test('Touch gestures hoạt động', async ({ page }) => {
  80  |         await page.goto('/');
  81  |         
  82  |         // Test tap gesture
  83  |         const element = page.locator('body');
  84  |         await element.tap();
  85  |         
  86  |         console.log('   ✅ Touch gestures working');
  87  |     });
  88  | 
  89  |     test('Chụp screenshot full page', async ({ page }, testInfo) => {
  90  |         await page.goto('/');
  91  |         
  92  |         // Chờ page load hoàn toàn
  93  |         await page.waitForLoadState('networkidle');
  94  |         
  95  |         // Screenshot
  96  |         const screenshot = await page.screenshot({ fullPage: true });
  97  |         await testInfo.attach('full-page', { 
  98  |             body: screenshot, 
  99  |             contentType: 'image/png' 
  100 |         });
  101 |         
  102 |         console.log(`   📸 Screenshot captured for ${testInfo.project.name}`);
  103 |     });
  104 | });
  105 | 
  106 | test.describe('Responsive Layout Tests', () => {
  107 |     
  108 |     test('Font size readable trên mobile', async ({ page }) => {
  109 |         await page.goto('/');
  110 |         
  111 |         const bodyFontSize = await page.evaluate(() => {
  112 |             return window.getComputedStyle(document.body).fontSize;
  113 |         });
  114 |         
```