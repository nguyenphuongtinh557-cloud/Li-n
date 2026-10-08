/**
 * PLAYWRIGHT CONFIGURATION
 * Config cho mobile testing
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 30000,
    retries: 1,
    
    use: {
        baseURL: 'http://localhost:3000',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'on-first-retry',
        locale: 'vi-VN',
        timezoneId: 'Asia/Ho_Chi_Minh'
    },

    projects: [
        // === MOBILE DEVICES (Chromium-based) ===
        {
            name: 'iPhone 12 Pro',
            use: { 
                ...devices['iPhone 12 Pro'],
                browserName: 'chromium'
            }
        },
        {
            name: 'iPhone SE',
            use: { 
                ...devices['iPhone SE'],
                browserName: 'chromium'
            }
        },
        {
            name: 'Pixel 5',
            use: { 
                ...devices['Pixel 5'],
                browserName: 'chromium'
            }
        },
        {
            name: 'Samsung Galaxy S21',
            use: { 
                ...devices['Galaxy S9+'],
                browserName: 'chromium'
            }
        },
        {
            name: 'iPad Pro',
            use: { 
                ...devices['iPad Pro'],
                browserName: 'chromium'
            }
        },

        // === DESKTOP (để so sánh) ===
        {
            name: 'Desktop Chrome',
            use: { 
                ...devices['Desktop Chrome'],
                browserName: 'chromium'
            }
        }
    ],

    webServer: {
        command: 'node server.js',
        port: 3000,
        timeout: 120000,
        reuseExistingServer: true
    }
});
