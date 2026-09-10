import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const url = process.env.SITE_URL || 'http://localhost:8082';
await mkdir('.orb-review', { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, viewport, colorScheme] of [
    ['desktop-dark', { width: 1280, height: 1000 }, 'dark'],
    ['mobile-light', { width: 390, height: 844 }, 'light'],
  ]) {
    const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('THREE.')) errors.push(message.text());
    });
    await page.goto(url);
    const figure = page.locator('.silver-orb');
    await page.waitForSelector('.silver-orb[data-ready]');
    await page.waitForFunction(() => document.querySelector('.silver-orb').dataset.visible === 'true');
    assert.equal(await page.locator('.silver-orb button').count(), 0);
    assert.equal(await page.locator('.silver-orb-hint').isVisible(), false);
    await page.locator('.silver-orb-drag').hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.silver-orb-hint')).visibility === 'visible');
    await page.mouse.move(0, 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.silver-orb').dataset.motion === 'paused');
    await page.screenshot({ path: `.orb-review/${name}.png`, fullPage: true });

    const canvas = page.locator('.silver-orb-stage canvas');
    const before = await canvas.screenshot();
    const drag = page.locator('.silver-orb-drag');
    const bounds = await drag.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.6, { steps: 8 });
    await page.mouse.up();
    const after = await canvas.screenshot();
    assert.equal(before.equals(after), false, 'Drag changes the rendered orb while paused');
    await drag.press('ArrowUp');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(after.equals(await canvas.screenshot()), false, 'Arrow keys rotate the orb');
    await page.waitForTimeout(150);
    const settled = await canvas.screenshot();
    await page.waitForTimeout(150);
    assert.equal(settled.equals(await canvas.screenshot()), true, 'Paused rendering is stable');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelector('.silver-orb').dataset.motion !== 'paused');
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(() => document.querySelector('.silver-orb').dataset.motion === 'rippling');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.getByRole('link', { name: 'can be found here' }).getAttribute('href'), './cv.html');

    // Move the orb out of view even on a large viewport, then confirm its observer suspends work.
    await page.evaluate(() => { document.body.style.paddingBottom = '1500px'; window.scrollTo(0, 1300); });
    await page.waitForFunction(() => document.querySelector('.silver-orb').dataset.visible === 'false');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => document.querySelector('.silver-orb').dataset.visible === 'true');
    assert.deepEqual(errors, []);
    console.log(`${name}: render, drag, keyboard, pause, scroll, visibility, layout, and resume link passed`);
    await page.close();
  }

  for (const [name, viewport] of [
    ['cv-desktop', { width: 1280, height: 900 }],
    ['cv-mobile', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport, colorScheme: 'dark' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${url}/cv.html`);
    const orb = page.locator('.silver-orb-traveler');
    await page.waitForSelector('.silver-orb[data-ready]');
    const start = await orb.boundingBox();
    const hintStart = await page.locator('.silver-orb-hint').boundingBox();
    await page.screenshot({ path: `.orb-review/${name}-top.png` });
    if (viewport.width <= 760) {
      const heading = await page.locator('h1').boundingBox();
      const resume = await page.locator('.resume').boundingBox();
      assert.ok(start.y + start.height <= heading.y, 'Mobile orb sits above the name');
      assert.ok(resume.width > viewport.width - 60, 'Mobile CV uses full text width');
      await page.evaluate(() => window.scrollTo(0, 80));
      await page.waitForFunction(() => document.querySelector('.silver-orb').dataset.motion === 'rippling');
      await page.evaluate(() => window.scrollTo(0, 1000));
      await page.waitForFunction(() => document.querySelector('.silver-orb').dataset.visible === 'false');
      const offscreen = await orb.boundingBox();
      assert.ok(offscreen.y + offscreen.height < 0, 'Mobile orb scrolls away');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `.orb-review/${name}-middle.png` });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => document.querySelector('.silver-orb').dataset.visible === 'true');
    } else {
    await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2));
    await page.waitForFunction(() => document.querySelector('.silver-orb').dataset.motion === 'rippling');
    const middle = await orb.boundingBox();
    assert.ok(middle.y > start.y + 100, 'Orb travels downward with scroll');
    assert.ok(middle.width < start.width * 0.8, 'Orb shrinks as reading progresses');
    assert.ok(Math.abs((middle.x + middle.width / 2) - (start.x + start.width / 2)) < 1, 'Orb travels straight down');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `.orb-review/${name}-middle.png` });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    const bottom = await orb.boundingBox();
    const hintBottom = await page.locator('.silver-orb-hint').boundingBox();
    assert.ok(Math.abs(hintBottom.width - hintStart.width) < 1 && Math.abs(hintBottom.height - hintStart.height) < 1, 'Hover text keeps its rendered size');
    assert.ok(bottom.width >= start.width * 0.5 - 1, 'Orb stays at least half its starting size');
    assert.ok(bottom.width < middle.width, 'Orb continues shrinking toward the bottom');
    assert.ok(bottom.y > middle.y && bottom.y + bottom.height <= viewport.height, 'Orb reaches bottom within viewport');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    assert.ok(Math.abs((await orb.boundingBox()).width - start.width) < 1, 'Returning to the top restores its size');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.silver-orb').style.getPropertyValue('--orb-travel') === '0px');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await orb.isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(`${name}: ${viewport.width <= 760 ? 'header placement and scroll-away' : 'scroll travel and shrinking'}, ripples, reduced motion, and print passed`);
    await page.close();
  }

  const reduced = await browser.newPage({ reducedMotion: 'reduce' });
  await reduced.goto(url);
  await reduced.waitForSelector('.silver-orb[data-ready]');
  await reduced.waitForFunction(() => document.querySelector('.silver-orb').dataset.motion === 'paused');
  assert.equal(await reduced.locator('.silver-orb-drag').isVisible(), true);
  await reduced.close();

  for (const failure of ['javascript-disabled', 'webgl-unavailable', 'lighting-unavailable']) {
    const page = await browser.newPage({ javaScriptEnabled: failure !== 'javascript-disabled' });
    if (failure === 'webgl-unavailable') {
      await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type.startsWith('webgl') ? null : getContext.call(this, type, ...args);
        };
      });
    }
    if (failure === 'lighting-unavailable') await page.route('**/*.hdr', (route) => route.abort());
    await page.goto(url);
    if (failure !== 'javascript-disabled') await page.waitForSelector('.silver-orb[data-status="fallback"]');
    const poster = page.locator('.silver-orb-poster');
    assert.equal(await poster.isVisible(), true);
    assert.equal(await poster.evaluate((image) => image.complete && image.naturalWidth > 0), true);
    assert.equal(await page.locator('.silver-orb-pause').isVisible(), false);
    await page.close();
    console.log(`${failure}: still-image fallback passed`);
  }
  console.log('Reduced motion: starts paused');
} finally {
  await browser.close();
}
