# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-ui.spec.js >> Responsive Layout Tests >> Buttons có kích thước đủ lớn cho touch
- Location: tests\mobile-ui.spec.js:139:5

# Error details

```
Error: page.goto: Test ended.
Call log:
  - navigating to "http://localhost:3000/", waiting until "load"

```

# Test source

```ts
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
> 140 |         await page.goto('/');
      |                    ^ Error: page.goto: Test ended.
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