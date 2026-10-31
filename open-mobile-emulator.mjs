/* Mở cửa sổ Chrome giả lập iPhone (390x844, cảm ứng, mobile UA) trỏ vào trang chủ mobile FTECA.
   Dùng: node open-mobile-emulator.mjs — đóng cửa sổ browser là script tự thoát. */
import { chromium, devices } from '@playwright/test';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  ...devices['iPhone 13'],
  locale: 'vi-VN',
  timezoneId: 'Asia/Ho_Chi_Minh',
});
const page = await context.newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.NavController?.navigateToPage);
await page.evaluate(() => window.NavController.navigateToPage('home'));
await page.waitForSelector('.home-mobile', { state: 'visible' });
console.log('📱 Đã mở tab giả lập iPhone 13 — trang chủ mobile FTECA. Đóng cửa sổ để thoát.');

browser.on('disconnected', () => process.exit(0));
