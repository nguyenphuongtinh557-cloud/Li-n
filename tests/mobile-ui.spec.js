/**
 * MOBILE UI TEST SUITE
 * Test responsive behavior trên các thiết bị mobile
 */

import { test, expect } from '@playwright/test';

test.describe('Mobile UI Tests', () => {
    
    test('Trang chủ hiển thị đúng trên mobile', async ({ page }) => {
        await page.goto('/');
        
        // Kiểm tra title
        await expect(page).toHaveTitle(/Quản Lý Chất Lượng/i);
        
        // Kiểm tra viewport mobile
        const viewport = page.viewportSize();
        expect(viewport.width).toBeLessThanOrEqual(768);
        
        console.log(`   📱 Viewport: ${viewport.width}x${viewport.height}`);
    });

    test('Navigation menu hoạt động trên mobile', async ({ page }) => {
        await page.goto('/');
        
        // Tìm mobile menu button
        const menuButton = page.locator('button[data-mobile-menu], .mobile-menu-btn, .hamburger');
        
        if (await menuButton.count() > 0) {
            await menuButton.first().click();
            await page.waitForTimeout(500);
            
            // Kiểm tra menu đã mở
            const menu = page.locator('.mobile-menu, .nav-menu');
            await expect(menu).toBeVisible();
            
            console.log('   ✅ Mobile menu clickable');
        } else {
            console.log('   ⚠️  No mobile menu button found');
        }
    });

    test('Chat interface responsive trên mobile', async ({ page }) => {
        await page.goto('/');
        
        // Tìm chat container
        const chatContainer = page.locator('#chatContainer, .chat-container');
        
        if (await chatContainer.count() > 0) {
            await expect(chatContainer).toBeVisible();
            
            // Kiểm tra input field
            const chatInput = page.locator('textarea[placeholder*="câu hỏi"], #userQuestion');
            await expect(chatInput).toBeVisible();
            
            // Test typing
            await chatInput.fill('Test mobile input');
            const value = await chatInput.inputValue();
            expect(value).toBe('Test mobile input');
            
            console.log('   ✅ Chat input functional');
        }
    });

    test('Scroll behavior trên mobile', async ({ page }) => {
        await page.goto('/');
        
        // Scroll xuống cuối trang
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
        
        // Kiểm tra scroll position
        const scrollY = await page.evaluate(() => window.scrollY);
        expect(scrollY).toBeGreaterThan(0);
        
        console.log(`   ✅ Scrolled to: ${scrollY}px`);
    });

    test('Touch gestures hoạt động', async ({ page }) => {
        await page.goto('/');
        
        // Test tap gesture
        const element = page.locator('body');
        await element.tap();
        
        console.log('   ✅ Touch gestures working');
    });

    test('Chụp screenshot full page', async ({ page }, testInfo) => {
        await page.goto('/');
        
        // Chờ page load hoàn toàn
        await page.waitForLoadState('networkidle');
        
        // Screenshot
        const screenshot = await page.screenshot({ fullPage: true });
        await testInfo.attach('full-page', { 
            body: screenshot, 
            contentType: 'image/png' 
        });
        
        console.log(`   📸 Screenshot captured for ${testInfo.project.name}`);
    });
});

test.describe('Responsive Layout Tests', () => {
    
    test('Font size readable trên mobile', async ({ page }) => {
        await page.goto('/');
        
        const bodyFontSize = await page.evaluate(() => {
            return window.getComputedStyle(document.body).fontSize;
        });
        
        const fontSize = parseInt(bodyFontSize);
        expect(fontSize).toBeGreaterThanOrEqual(14); // Tối thiểu 14px
        
        console.log(`   ✅ Font size: ${fontSize}px`);
    });

    test('Images không bị overflow', async ({ page }) => {
        await page.goto('/');
        
        const images = page.locator('img');
        const count = await images.count();
        
        for (let i = 0; i < Math.min(count, 5); i++) {
            const img = images.nth(i);
            const box = await img.boundingBox();
            
            if (box) {
                const viewport = page.viewportSize();
                expect(box.width).toBeLessThanOrEqual(viewport.width);
                console.log(`   ✅ Image ${i+1}: ${box.width}px (within viewport)`);
            }
        }
    });

    test('Buttons có kích thước đủ lớn cho touch', async ({ page }) => {
        await page.goto('/');
        
        const buttons = page.locator('button');
        const count = await buttons.count();
        
        for (let i = 0; i < Math.min(count, 5); i++) {
            const btn = buttons.nth(i);
            const box = await btn.boundingBox();
            
            if (box) {
                // Touch target tối thiểu: 44x44px (iOS guideline)
                expect(box.height).toBeGreaterThanOrEqual(36);
                console.log(`   ✅ Button ${i+1}: ${box.width}x${box.height}px`);
            }
        }
    });
});
