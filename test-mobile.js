/**
 * PLAYWRIGHT MOBILE TESTING SCRIPT
 * Mô phỏng các thiết bị mobile để test responsive UI
 */

import { chromium, devices } from '@playwright/test';
import fs from 'fs';

async function testMobileDevices() {
    const browser = await chromium.launch({ 
        headless: false // Hiển thị browser để xem
    });

    // Danh sách thiết bị để test
    const mobileDevices = [
        'iPhone 12 Pro',
        'iPhone SE',
        'Pixel 5',
        'Samsung Galaxy S21',
        'iPad Pro'
    ];

    console.log('🚀 BẮT ĐẦU TEST MOBILE UI\n');

    for (const deviceName of mobileDevices) {
        console.log(`📱 Testing: ${deviceName}`);
        
        const device = devices[deviceName];
        const context = await browser.newContext({
            ...device,
            locale: 'vi-VN',
            timezoneId: 'Asia/Ho_Chi_Minh'
        });

        const page = await context.newPage();

        try {
            // Truy cập localhost
            await page.goto('http://localhost:3000', { 
                waitUntil: 'domcontentloaded',
                timeout: 10000 
            });

            await page.locator('#page-home:not(.hidden), #page-study-space:not(.hidden)').first().waitFor({
                state: 'visible',
                timeout: 10000
            });

            // Chờ page load
            await page.waitForTimeout(2000);

            // Chụp screenshot
            const screenshotPath = `./screenshots/${deviceName.replace(/\s+/g, '_')}.png`;
            await page.screenshot({ 
                path: screenshotPath,
                fullPage: true 
            });

            console.log(`   ✅ Screenshot saved: ${screenshotPath}`);

            // Test scroll
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1000);

            // Test click navigation (nếu có)
            const menuButton = await page.$('[data-mobile-menu]');
            if (menuButton) {
                await menuButton.click();
                await page.waitForTimeout(500);
                console.log(`   ✅ Mobile menu clickable`);
            }

        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        } finally {
            await context.close();
        }

        console.log('');
    }

    await browser.close();
    console.log('✅ HOÀN TẤT TEST MOBILE!');
}

// Tạo thư mục screenshots
if (!fs.existsSync('./screenshots')) {
    fs.mkdirSync('./screenshots');
}

// Chạy test
testMobileDevices().catch(console.error);
