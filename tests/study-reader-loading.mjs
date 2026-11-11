import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, webkit, devices, expect } from '@playwright/test';

const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
const subjectMap = JSON.parse(fs.readFileSync(new URL('../data/subject_details.json', import.meta.url), 'utf8'));
const lessons = subjectMap.FT4498.chapters.flatMap(chapter => chapter.lessons);
const targetLesson = lessons.at(-1);
const readerPath = `/mon/FT4498/tai-lieu/${targetLesson.id}`;
const device = process.env.TEST_DEVICE ? devices[process.env.TEST_DEVICE] : null;
if (process.env.TEST_DEVICE) assert.ok(device, 'Unknown Playwright device');
const engine = (process.env.TEST_BROWSER || device?.defaultBrowserType) === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ headless: true });
const mobileOptions = device || { viewport: { width: 390, height: 844 } };
console.log(`PROFILE ${process.env.TEST_DEVICE || 'desktop/mobile'} / ${engine.name()} ${browser.version()}`);

async function activate(locator) {
  if (device?.hasTouch) await locator.tap();
  else await locator.click();
}

async function runScenario(name, options = {}) {
  const context = await browser.newContext(options.desktop ? { viewport: { width: 1440, height: 1000 } } : mobileOptions);
  const page = await context.newPage();
  const errors = [];
  let subjectRequests = 0;
  let failSubject = Boolean(options.retry);
  let releaseSubject;
  let releaseUnrelated;
  const subjectGate = new Promise(resolve => { releaseSubject = resolve; });
  const unrelatedGate = new Promise(resolve => { releaseUnrelated = resolve; });
  page.on('pageerror', error => {
    if (!error.message.includes('sandboxed')) errors.push(error.message);
  });
  await page.route('**/api/subject-details', async route => {
    subjectRequests++;
    if (options.slow) await subjectGate;
    await route.fulfill(failSubject ? { status: 503, json: { ok: false } } : { json: { ok: true, subjectDetails: subjectMap } }).catch(() => {});
  });
  await page.route('**/api/resources', async route => {
    if (options.blockUnrelated) await unrelatedGate;
    await route.fulfill({ json: { ok: true, resources: [], deletedIds: [] } }).catch(() => {});
  });
  await page.route('**/api/announcements', route => route.fulfill({ json: { ok: true, announcements: [], deletedIds: [] } }));
  await page.route('**/raw.githubusercontent.com/**', async route => {
    const url = route.request().url();
    if (url.includes('subject_details.json')) {
      await route.fulfill(failSubject ? { status: 503, body: '' } : { json: subjectMap });
      return;
    }
    if (options.blockUnrelated && url.includes('cms_articles.json')) await unrelatedGate;
    await route.fulfill({ json: [] }).catch(() => {});
  });
  if (options.quota) {
    await page.addInitScript(() => localStorage.setItem('test-existing-user-data', 'x'.repeat(3_000_000)));
  }
  if (options.cached) {
    await page.addInitScript(({ map, stale }) => {
      const details = map.FT4498;
      if (stale) details.chapters[0].lessons = details.chapters[0].lessons.slice(0, 1);
      localStorage.setItem('qlcl_subject_details', JSON.stringify({ FT4498: details }));
    }, { map: subjectMap, stale: options.cached === 'stale' });
  }
  try {
    await page.goto(`${baseUrl}${readerPath}?zarsrc=30`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NavController?.activePage === 'study-reader');
    assert.equal(await page.evaluate(() => window.AuthModule.user), null);
    if (options.slow) {
      await expect(page.locator('#study-reader-content')).toContainText('Đang tải bài giảng');
      await expect.poll(() => subjectRequests).toBeGreaterThan(0);
      assert.equal(new URL(page.url()).pathname, readerPath);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('#study-reader-content')).toContainText('Đang tải bài giảng');
      assert.equal(new URL(page.url()).pathname, readerPath);
      releaseSubject();
    }
    if (options.retry) {
      await expect(page.locator('#study-reader-retry')).toBeVisible();
      await expect(page.locator('#study-reader-content')).not.toContainText('Chưa có nội dung tài liệu');
      failSubject = false;
      await activate(page.locator('#study-reader-retry'));
    }
    await expect(page.locator('#study-reader-content h1')).toContainText(targetLesson.title, { timeout: 15000 });
    await expect(page.locator('#study-reader-toc-list button')).toHaveCount(lessons.length);
    assert.equal(new URL(page.url()).pathname, readerPath);
    if (options.quota) {
      assert.equal(await page.evaluate(() => localStorage.getItem('test-existing-user-data').length), 3_000_000);
      assert.equal(await page.evaluate(() => localStorage.getItem('qlcl_subject_details')), null);
      assert.equal(await page.evaluate(async () => {
        const { DB } = await import('/modules/db.js');
        const details = DB.getSubjectDetails('FT4498');
        details.chapters.length = 0;
        return DB.getSubjectDetails('FT4498').chapters.length;
      }), subjectMap.FT4498.chapters.length);
    }
    for (const lesson of lessons) {
      if (options.desktop) {
        if (await page.locator('#study-reader-toc-toggle').isVisible()) await page.locator('#study-reader-toc-toggle').click();
      } else await activate(page.locator('[data-reader-mobile="toc"]'));
      await activate(page.locator('#study-reader-toc-list button').filter({ hasText: lesson.title }));
      await expect(page.locator('#study-reader-content h1')).toContainText(lesson.title);
      assert.ok((await page.locator('#study-reader-content').innerText()).length > 150);
      assert.equal(new URL(page.url()).pathname, `/mon/FT4498/tai-lieu/${lesson.id}`);
    }
    if (options.controls && !options.desktop) {
      await expect(page.locator('#study-reader-next-lesson')).toBeDisabled();
      await activate(page.locator('#study-reader-prev-lesson'));
      await expect(page.locator('#study-reader-content h1')).toContainText(lessons.at(-2).title);
      await activate(page.locator('#study-reader-next-lesson'));
      await expect(page.locator('#study-reader-content h1')).toContainText(targetLesson.title);
      await activate(page.locator('[data-reader-mobile="toc"]'));
      await page.locator('#study-reader-find').fill('5.3.');
      await expect(page.locator('#study-reader-toc-list button:visible')).toHaveCount(1);
      await page.locator('#study-reader-find').fill('không-có-bài-này');
      await expect(page.locator('#study-reader-toc-list button:visible')).toHaveCount(0);
      await page.locator('#study-reader-find').fill('');
      await expect(page.locator('#study-reader-toc-list button:visible')).toHaveCount(lessons.length);
      await activate(page.locator('#study-reader-toc-list .study-reader-toc-chapter'));
      await expect(page.locator('#study-reader-toc-list button:visible')).toHaveCount(0);
      await activate(page.locator('#study-reader-toc-list .study-reader-toc-chapter'));
      await expect(page.locator('#study-reader-toc-list button:visible')).toHaveCount(lessons.length);
      await activate(page.locator('#study-reader-back'));
      await expect(page.locator('#study-reader-content h1')).toBeVisible();
    }
    releaseUnrelated();
    releaseSubject();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#study-reader-content h1')).toContainText(targetLesson.title, { timeout: 15000 });
    await expect(page.locator('#study-reader-toc-list button')).toHaveCount(lessons.length);
    const moduleUrls = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name).filter(url => /\/modules\/(db|sync)\.js/.test(url)));
    assert.equal(new Set(moduleUrls.filter(url => url.includes('/db.js'))).size, 1);
    assert.equal(new Set(moduleUrls.filter(url => url.includes('/sync.js'))).size, 1);
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}`);
  } finally {
    releaseSubject();
    releaseUnrelated();
    await context.close();
  }
}

async function testDelayedResources(resourceLink) {
  const context = await browser.newContext(mobileOptions);
  const page = await context.newPage();
  const resource = { id: 'reader-regression-resource', subjectId: 'FT4498', name: 'Tài liệu kiểm thử', content: '<p>Nội dung tài liệu tải chậm.</p>', url: `${baseUrl}/data/subject_details.json` };
  let releaseResources;
  const gate = new Promise(resolve => { releaseResources = resolve; });
  await page.route('**/api/subject-details', route => route.fulfill({ json: { ok: true, subjectDetails: subjectMap } }));
  await page.route('**/api/resources', async route => {
    await gate;
    await route.fulfill({ json: { ok: true, resources: [resource], deletedIds: [] } }).catch(() => {});
  });
  await page.route('**/raw.githubusercontent.com/**', route => route.fulfill({ json: [] }));
  const path = resourceLink ? `/mon/FT4498/tai-lieu/${resource.id}` : readerPath;
  try {
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#study-reader-toc-list button')).toHaveCount(lessons.length, { timeout: 15000 });
    assert.equal(new URL(page.url()).pathname, path);
    if (resourceLink) {
      await expect(page.locator('#study-reader-content')).toContainText('Đang tải bài giảng');
      await expect(page.locator('#study-reader-content h1')).toHaveCount(0);
    } else {
      await expect(page.locator('#study-reader-content h1')).toContainText(targetLesson.title);
    }
    releaseResources();
    await expect(page.locator('#study-reader-toc-list button')).toHaveCount(lessons.length + 1);
    await expect(page.locator('#study-reader-content h1')).toContainText(resourceLink ? resource.name : targetLesson.title);
    await expect(page.locator('#study-reader-resource-link')).toHaveAttribute('href', resource.url);
    assert.equal(new URL(page.url()).pathname, path);
    console.log(`PASS late resources ${resourceLink ? 'preserve resource deep link' : 'refresh TOC without changing lesson'}`);
  } finally {
    releaseResources();
    await context.close();
  }
}

async function testSaveUnderQuota() {
  const context = await browser.newContext(mobileOptions);
  const page = await context.newPage();
  let writes = 0;
  await page.addInitScript(() => localStorage.setItem('test-existing-user-data', 'x'.repeat(3_000_000)));
  await page.route('**/api/subject-details', async route => {
    if (route.request().method() === 'PUT') {
      writes++;
      await route.fulfill({ json: { ok: true, subjectDetails: route.request().postDataJSON().details, source: 'local-file' } });
    } else await route.fulfill({ json: { ok: true, subjectDetails: subjectMap } });
  });
  await page.route('**/api/resources', route => route.fulfill({ json: { ok: true, resources: [], deletedIds: [] } }));
  await page.route('**/raw.githubusercontent.com/**', route => route.fulfill({ json: [] }));
  try {
    await page.goto(`${baseUrl}${readerPath}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#study-reader-content h1')).toContainText(targetLesson.title, { timeout: 15000 });
    const saved = await page.evaluate(async () => {
      const { DB } = await import('/modules/db.js');
      const details = DB.getSubjectDetails('FT4498');
      details.name = 'Tên kiểm thử';
      const result = await DB.saveSubjectDetails('FT4498', details);
      return { ok: result.ok, fileSaved: result.localFileSaved, name: DB.getSubjectDetails('FT4498').name };
    });
    assert.deepEqual(saved, { ok: true, fileSaved: true, name: 'Tên kiểm thử' });
    assert.equal(writes, 1);
    console.log('PASS storage quota does not block authoritative save (mocked PUT)');
  } finally {
    await context.close();
  }
}

try {
  await runScenario(`${device ? 'mobile touch' : 'desktop'} guest opens exact lesson and all TOC entries`, { desktop: !device, controls: true });
  await runScenario('mobile lesson loads while unrelated requests remain stalled', { slow: true, blockUnrelated: true });
  await runScenario('mobile storage quota keeps lessons readable without deleting user data', { quota: true });
  await runScenario('mobile failed requests show retry and recover the exact lesson', { retry: true });
  await runScenario('cached guest keeps the requested lesson after refresh', { cached: true });
  await runScenario('old cache missing the shared lesson updates without opening another lesson', { cached: 'stale' });
  await testDelayedResources(true);
  await testDelayedResources(false);
  await testSaveUnderQuota();
} finally {
  await browser.close();
}
