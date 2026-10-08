# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-ui.spec.js >> Mobile UI Tests >> Chụp screenshot full page
- Location: tests\mobile-ui.spec.js:89:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - combobox [ref=e5]
    - text: Được hỗ trợ bởi
    - link [ref=e7] [cursor=pointer]:
      - /url: https://translate.google.com
      - text: Dịch
  - generic [ref=e9]:
    - complementary [ref=e10]:
      - generic [ref=e11]:
        - img "FTECA 24 Logo" [ref=e12]
        - button "" [ref=e13] [cursor=pointer]
      - generic [ref=e15] [cursor=pointer]:
        - generic [ref=e16]:
          - generic [ref=e17]: Chương Trình Đào Tạo
          - generic [ref=e18]: 🎓 Công Nghệ Thực Phẩm
        - generic [ref=e19]: 
      - navigation [ref=e20]:
        - generic [ref=e21]:
          - button " Trang chủ" [ref=e22] [cursor=pointer]:
            - generic [ref=e23]: 
            - generic [ref=e24]: Trang chủ
          - button " Đọc báo & Tin tức" [ref=e25] [cursor=pointer]:
            - generic [ref=e26]: 
            - generic [ref=e27]: Đọc báo & Tin tức
          - button " Không gian học tập" [ref=e28] [cursor=pointer]:
            - generic [ref=e29]: 
            - generic [ref=e30]: Không gian học tập
          - button " Hướng dẫn tính năng" [ref=e31] [cursor=pointer]:
            - generic [ref=e32]: 
            - generic [ref=e33]: Hướng dẫn tính năng
        - generic [ref=e34]: TÍNH NĂNG AI NÂNG CAO
        - generic [ref=e35]:
          - button " Tạo câu hỏi bằng AI" [ref=e36] [cursor=pointer]:
            - generic [ref=e37]: 
            - generic [ref=e38]: Tạo câu hỏi bằng AI
          - button " Tóm tắt giáo trình" [ref=e39] [cursor=pointer]:
            - generic [ref=e40]: 
            - generic [ref=e41]: Tóm tắt giáo trình
          - button " Lên kế hoạch ôn thi Sắp ra" [ref=e42] [cursor=pointer]:
            - generic [ref=e43]: 
            - generic [ref=e44]: Lên kế hoạch ôn thi
            - generic [ref=e45]: Sắp ra
          - text: 
          - button " Nâng cấp tài khoản PRO" [ref=e46] [cursor=pointer]:
            - generic [ref=e47]: 
            - generic [ref=e48]: Nâng cấp tài khoản
            - generic [ref=e49]: PRO
          - text: 
    - generic [ref=e50]:
      - banner [ref=e51]:
        - generic [ref=e52]:
          - button "" [ref=e53] [cursor=pointer]
          - generic [ref=e55]:
            - generic: 
            - 'textbox "Tìm môn học theo tên hoặc mã môn (vd: FT4468, GE4091)..." [ref=e56]'
        - generic [ref=e57]:
          - button "Chuyển sang chế độ tối" [ref=e58] [cursor=pointer]
          - button "Mở thông báo" [ref=e61] [cursor=pointer]:
            - generic [ref=e62]: 
            - generic "2 thông báo chưa đọc" [ref=e63]
          - button [ref=e65] [cursor=pointer]
      - main [ref=e71]:
        - generic [ref=e72]:
          - generic [ref=e73]:
            - generic [ref=e74]:
              - generic [ref=e75]: 🎓 Ngành Công Nghệ Thực Phẩm · FTECA 24
              - heading "Xin chào! Chúng tôi là FTECA 24" [level=1] [ref=e78]
              - paragraph [ref=e79]:
                - text: Đây là nơi mà tụi mình chia sẻ, đăng tải và lưu trữ những thông tin, tài liệu, đề thi, trải nghiệm và phương pháp tiếp cận theo góc nhìn cá nhân.
                - strong [ref=e80]: Một lần nữa, chào mừng các bạn đến với đại gia đình này!
              - generic [ref=e81]:
                - button " Vào Khu Vực Ôn Tập" [ref=e82] [cursor=pointer]:
                  - generic [ref=e83]: 
                  - text: Vào Khu Vực Ôn Tập
                - button " Tìm Hiểu Ngành CNTP" [ref=e84] [cursor=pointer]:
                  - generic [ref=e85]: 
                  - text: Tìm Hiểu Ngành CNTP
            - generic [ref=e86]:
              - img "Sinh viên CNTP học tập" [ref=e88]
              - generic [ref=e89]:
                - generic [ref=e90]: 📚
                - generic [ref=e91]:
                  - generic [ref=e92]: 65+
                  - generic [ref=e93]: Môn học CNTP
          - text: 
          - generic [ref=e94]:
            - generic [ref=e95]:
              - generic [ref=e96]: 
              - generic [ref=e98]:
                - generic [ref=e99]: 65+
                - generic [ref=e100]: Môn học hỗ trợ
            - generic [ref=e101]:
              - generic [ref=e102]: 
              - generic [ref=e104]:
                - generic [ref=e105]: 5.000+
                - generic [ref=e106]: Câu hỏi ngân hàng đề
            - generic [ref=e107]:
              - generic [ref=e108]: 
              - generic [ref=e110]:
                - generic [ref=e111]: AI
                - generic [ref=e112]: Trợ lý thông minh 24/7
            - generic [ref=e113]:
              - generic [ref=e114]: 
              - generic [ref=e116]:
                - generic [ref=e117]: 1K+
                - generic [ref=e118]: Sinh viên đang học
          - generic [ref=e119]:
            - generic [ref=e120] [cursor=pointer]:
              - generic [ref=e121]: 
              - heading "Thi Thử Trực Tuyến" [level=3] [ref=e123]
              - paragraph [ref=e124]: Đề thi tương tự bài kiểm tra chính thức, có đồng hồ đếm ngược và chấm điểm tự động.
              - generic [ref=e125]: 
            - generic [ref=e127] [cursor=pointer]:
              - generic [ref=e128]: 
              - heading "Luyện Tập Theo Chủ Đề" [level=3] [ref=e130]
              - paragraph [ref=e131]: Ôn tập từng chương, từng chủ đề với hàng nghìn câu hỏi có đáp án giải thích chi tiết.
              - generic [ref=e132]: 
            - generic [ref=e134] [cursor=pointer]:
              - generic [ref=e135]: 
              - heading "AI Tạo Câu Hỏi" [level=3] [ref=e137]
              - paragraph [ref=e138]: Upload tài liệu, AI tự động phân tích và tạo bộ câu hỏi ôn tập cá nhân hóa cho bạn.
              - generic [ref=e139]: 
            - generic [ref=e141] [cursor=pointer]:
              - generic [ref=e142]: 
              - heading "Ngân Hàng Đề Thi" [level=3] [ref=e144]
              - paragraph [ref=e145]: Kho lưu trữ toàn bộ câu hỏi, phân loại rõ ràng theo môn học, chủ đề và mức độ khó.
              - generic [ref=e146]: 
        - text: "                                                           ✦      ✧                              ✓  ⚠                                              +       #              *                                                                                                                                                                                        +            › › ›         +        + +"
  - complementary "Cài đặt" [ref=e148]:
    - generic [ref=e149]:
      - heading " Cài Đặt" [level=2] [ref=e150]:
        - generic [ref=e151]: 
        - text: Cài Đặt
      - button "Đóng" [ref=e152] [cursor=pointer]:
        - generic [ref=e153]: 
    - generic [ref=e154]:
      - generic [ref=e155]:
        - generic [ref=e156]:
          - generic [ref=e157]: Chế Độ Tối
          - generic [ref=e158]: Bảo vệ mắt khi học khuya
        - generic [ref=e160] [cursor=pointer]
      - generic [ref=e161]:
        - generic [ref=e162]: Tỉ Lệ Độ Khó Đề Thi
        - generic [ref=e163]: "Hiện tại: 50% Dễ / 30% TB / 20% Khó"
      - button " Lưu Cài Đặt" [ref=e168] [cursor=pointer]:
        - generic [ref=e169]: 
        - text: Lưu Cài Đặt
      - generic [ref=e170]:
        - paragraph [ref=e171]: Khu Vực Nguy Hiểm
        - button " Xóa Toàn Bộ Dữ Liệu" [ref=e172] [cursor=pointer]:
          - generic [ref=e173]: 
          - text: Xóa Toàn Bộ Dữ Liệu
  - generic "Thông báo"
  - button "Mở trợ lý FTECA 24" [ref=e174]:
    - img "FTECA 24" [ref=e176]
  - dialog [aria-hidden]:
    - generic:
      - generic:
        - generic:
          - generic: FTECA
          - generic: Sẵn sàng hỗ trợ
      - generic:
        - generic:
          - button:
            - generic: 
          - text:   
        - button:
          - generic: 
    - generic:
      - generic:
        - generic:
          - paragraph:
            - text: Hế lô cậu! Tớ là
            - strong: FTECA
            - text: — bạn đồng hành Ngành Công nghệ Thực phẩm đây! ✨ Cần tám chuyện hay hỏi bài gì cứ nhắn tớ nha~ 🪷
    - text:  
    - generic:
      - generic: 
      - textbox:
        - /placeholder: Nhắn tin cho FTECA...
      - button:
        - generic: 
  - option "A" [selected]
  - option "B"
  - option "C"
  - option "D"
  - iframe [aria-hidden] [ref=e181]
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
  14  |         await expect(page).toHaveTitle(/Quản Lý Chất Lượng/i);
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
> 93  |         await page.waitForLoadState('networkidle');
      |                    ^ Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
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
  115 |         const fontSize = parseInt(bodyFontSize);
  116 |         expect(fontSize).toBeGreaterThanOrEqual(14); // Tối thiểu 14px
  117 |         
  118 |         console.log(`   ✅ Font size: ${fontSize}px`);
  119 |     });
  120 | 
  121 |     test('Images không bị overflow', async ({ page }) => {
  122 |         await page.goto('/');
  123 |         
  124 |         const images = page.locator('img');
  125 |         const count = await images.count();
  126 |         
  127 |         for (let i = 0; i < Math.min(count, 5); i++) {
  128 |             const img = images.nth(i);
  129 |             const box = await img.boundingBox();
  130 |             
  131 |             if (box) {
  132 |                 const viewport = page.viewportSize();
  133 |                 expect(box.width).toBeLessThanOrEqual(viewport.width);
  134 |                 console.log(`   ✅ Image ${i+1}: ${box.width}px (within viewport)`);
  135 |             }
  136 |         }
  137 |     });
  138 | 
  139 |     test('Buttons có kích thước đủ lớn cho touch', async ({ page }) => {
  140 |         await page.goto('/');
  141 |         
  142 |         const buttons = page.locator('button');
  143 |         const count = await buttons.count();
  144 |         
  145 |         for (let i = 0; i < Math.min(count, 5); i++) {
  146 |             const btn = buttons.nth(i);
  147 |             const box = await btn.boundingBox();
  148 |             
  149 |             if (box) {
  150 |                 // Touch target tối thiểu: 44x44px (iOS guideline)
  151 |                 expect(box.height).toBeGreaterThanOrEqual(36);
  152 |                 console.log(`   ✅ Button ${i+1}: ${box.width}x${box.height}px`);
  153 |             }
  154 |         }
  155 |     });
  156 | });
  157 | 
```