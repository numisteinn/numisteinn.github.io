import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch();
const url = process.env.SITE_URL || 'http://localhost:8082';
await mkdir('.orb-review', { recursive: true });
try {
  for (const colorScheme of ['light', 'dark']) {
    for (const width of [390, 1280]) {
      // The figure must work without JavaScript, including its controls.
      const page = await browser.newPage({
        viewport: { width, height: 900 }, colorScheme,
        javaScriptEnabled: false, reducedMotion: 'reduce',
      });
      await page.goto(`${url}/cv.html#thesis-search-title`);
      const figure = page.locator('.thesis-search');
      await figure.scrollIntoViewIfNeeded();
      const states = [];
      for (const risk of [10, 5, 1]) {
        await page.locator(`#thesis-risk-${risk}`).check();
        states.push(await figure.evaluate((element) => {
          return {
            regions: [...element.querySelectorAll('.thesis-regions polygon')]
              .filter((node) => getComputedStyle(node).fill !== 'rgba(0, 0, 0, 0)').length,
            found: [...element.querySelectorAll('.thesis-match')].filter((node) => getComputedStyle(node).fill === getComputedStyle(node).stroke).length,
            readouts: [...element.querySelectorAll('.thesis-readout span')].filter((node) => node.offsetParent).map((node) => node.textContent),
            transition: getComputedStyle(element.querySelector('.thesis-regions polygon')).transitionDuration,
          };
        }));
      }
      for (const [i, state] of states.entries()) {
        assert.equal(state.readouts.length, 2, 'One search and one average readout show per alpha');
        assert.match(state.readouts[0], new RegExp(`Finds ${state.found} of 10`), 'Readout matches the drawn matches');
        assert.match(state.readouts[1], new RegExp(`limit ${[10, 5, 1][i]}%`));
        assert.equal(state.transition, '0s', 'Reduced motion disables transitions');
      }
      assert.ok(states[0].regions < states[1].regions && states[1].regions < states[2].regions, 'Stricter alpha checks more regions');
      assert.ok(states[0].found < states[2].found, 'Stricter alpha finds more matches');
      await page.locator('#thesis-risk-5').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#thesis-risk-1').isChecked(), true);
      await page.locator('#thesis-risk-5').check();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await figure.screenshot({ path: `.orb-review/thesis-${colorScheme}-${width}.png` });
      await page.emulateMedia({ media: 'print' });
      assert.equal(await figure.isVisible(), false);
      console.log(`${colorScheme} ${width}: regions, matches, readouts, keyboard, no-JS, reduced motion, layout, and print passed`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
