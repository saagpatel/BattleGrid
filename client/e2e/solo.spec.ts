import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function keyboardActivate(page: Page, locator: Locator) {
  await locator.focus();
  await expect(locator).toBeFocused();
  await page.keyboard.press('Enter');
}

async function startPuzzle(page: Page, index: number) {
  await keyboardActivate(page, page.getByRole('button', { name: /Open briefing/i }).nth(index));
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await keyboardActivate(page, page.getByRole('button', { name: /Start planning/i }));
  await expect(page.getByRole('heading', { name: 'Select a friendly unit' })).toBeVisible();
}

async function queueOrder(
  page: Page,
  unitName: RegExp,
  actionName: string,
  targetName: RegExp,
) {
  await keyboardActivate(page, page.getByRole('button', { name: unitName }).first());
  await keyboardActivate(page, page.getByRole('button', { name: actionName, exact: true }));
  await keyboardActivate(page, page.getByRole('button', { name: targetName }).first());
}

test('static non-root solo build completes all three puzzles offline with no backend calls', async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  const forbidden: string[] = [];
  let websocketCount = 0;

  await page.addInitScript(() => {
    class ForbiddenWebSocket {
      constructor() {
        throw new Error('WebSocket construction is forbidden in solo mode');
      }
    }
    class ForbiddenXHR {
      constructor() {
        throw new Error('XMLHttpRequest is forbidden in solo mode');
      }
    }
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: ForbiddenWebSocket });
    Object.defineProperty(window, 'XMLHttpRequest', { configurable: true, value: ForbiddenXHR });
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: () => {
        throw new Error('sendBeacon is forbidden in solo mode');
      },
    });
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const raw =
        typeof input === 'string' || input instanceof URL
          ? input.toString()
          : input.url;
      const url = new URL(raw, window.location.href);
      const staticAsset =
        url.origin === window.location.origin &&
        (url.pathname.endsWith('.wasm') ||
          url.pathname.endsWith('.js') ||
          url.pathname.endsWith('.css') ||
          url.pathname.endsWith('/battlegrid/'));
      if (!staticAsset) {
        throw new Error(`Non-static fetch forbidden: ${url.href}`);
      }
      return nativeFetch(input, init);
    };
  });

  page.on('websocket', () => {
    websocketCount += 1;
  });
  page.on('request', (request) => {
    requests.push(request.url());
    const url = new URL(request.url());
    const sameOrigin = url.origin === 'http://127.0.0.1:4173';
    const forbiddenPath = url.pathname === '/ws' || url.pathname.startsWith('/api/');
    if (!sameOrigin || forbiddenPath || request.resourceType() === 'xhr') {
      forbidden.push(`${request.resourceType()}:${request.url()}`);
    }
  });

  await page.goto('./');
  await expect(page).toHaveTitle('BattleGrid Solo Tactics');
  await page.waitForLoadState('networkidle');
  expect(requests.some((url) => url.endsWith('.wasm'))).toBe(true);
  expect(requests.every((url) => url.startsWith('http://127.0.0.1:4173/battlegrid/'))).toBe(true);
  expect(websocketCount).toBe(0);
  expect(forbidden).toEqual([]);

  await context.setOffline(true);

  await startPuzzle(page, 0);
  await expect(page.getByText(/Enemy Scout 2 will advance/i)).toBeVisible();
  await queueOrder(page, /Friendly Scout 1/i, 'Move', /Move to \(0, 0\)/i);
  await keyboardActivate(page, page.getByRole('button', { name: /Commit orders/i }));
  await expect(page.getByRole('heading', { name: 'Objective achieved' })).toBeVisible();
  await expect(page.getByText(/collided at \(0, 0\)/i)).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Replay frame' })).toHaveValue('1');
  await page.getByRole('slider', { name: 'Replay frame' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByText('Orders are queued. No resolution events have occurred.')).toBeVisible();
  await page.keyboard.press('End');

  await keyboardActivate(page, page.getByRole('button', { name: /Next puzzle/i }));
  await keyboardActivate(page, page.getByRole('button', { name: /Start planning/i }));
  await queueOrder(page, /Friendly Scout 1/i, 'Defend', /Defend \(\+2 defense/i);
  await keyboardActivate(page, page.getByRole('button', { name: /Commit orders/i }));
  await expect(page.getByRole('heading', { name: 'Objective achieved' })).toBeVisible();
  await expect(page.getByLabel('Puzzle result').getByText(/survived the assault/i)).toBeVisible();

  await keyboardActivate(page, page.getByRole('button', { name: /Next puzzle/i }));
  await keyboardActivate(page, page.getByRole('button', { name: /Start planning/i }));
  await queueOrder(page, /Friendly Siege 1/i, 'Ability', /Demolish terrain at \(1, 0\)/i);
  await queueOrder(page, /Friendly Archer 2/i, 'Attack', /Attack unit 3/i);
  await keyboardActivate(page, page.getByRole('button', { name: /Commit orders/i }));
  await expect(page.getByRole('heading', { name: 'Objective achieved' })).toBeVisible();
  await expect(page.getByText(/Terrain at \(1, 0\) changed from Forest to Plains/i)).toBeVisible();
  await expect(
    page.getByLabel('Puzzle result').getByText(/target unit 3 was destroyed/i),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(websocketCount).toBe(0);
  expect(forbidden).toEqual([]);
});

for (const viewport of [
  { name: 'narrow phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'large desktop', width: 1920, height: 1080 },
]) {
  test(`responsive planning surface has no horizontal clipping at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('./');
    await page.waitForLoadState('networkidle');
    await startPuzzle(page, 0);
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    await expect(page.getByRole('button', { name: /Commit orders/i })).toBeVisible();
    await expect(page.getByText('Text board summary')).toBeVisible();
  });
}

test.use({ reducedMotion: 'reduce' });
test('reduced motion uses discrete replay frames without autoplay', async ({ page }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await startPuzzle(page, 0);
  await queueOrder(page, /Friendly Scout 1/i, 'Move', /Move to \(0, 0\)/i);
  await keyboardActivate(page, page.getByRole('button', { name: /Commit orders/i }));
  const slider = page.getByRole('slider', { name: 'Replay frame' });
  await expect(slider).toHaveValue('1');
  await page.waitForTimeout(750);
  await expect(slider).toHaveValue('1');
});

test('a failed plan explains the exact missed objective', async ({ page }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await startPuzzle(page, 0);
  await queueOrder(page, /Friendly Scout 1/i, 'Move', /Move to \(-2, 1\)/i);
  await keyboardActivate(page, page.getByRole('button', { name: /Commit orders/i }));
  await expect(page.getByRole('heading', { name: 'Objective failed' })).toBeFocused();
  await expect(
    page.getByText(/the two moves did not contest the objective hex \(0, 0\)/i),
  ).toBeVisible();
});
