import { test, expect, type Page } from '@playwright/test';

const HEX_SIZE = 32;

type HexCoord = { q: number; r: number };
type DeploymentState = {
  spawnZone: HexCoord[];
  availableUnits: string[];
  deployments: Array<{ unitClass: string; coord: HexCoord }>;
  allPlaced: boolean;
};

type GameSnapshot = {
  phase: string;
  turn: number;
  playerId: number | null;
  selectedUnitId: number | null;
  moveRangeHexes: HexCoord[];
  attackRangeHexes: HexCoord[];
  smokeMoveCandidate: { unitId: number; from: HexCoord; to: HexCoord } | null;
  orders: Array<{ unitId: number; orderType: string; target: HexCoord }>;
  units: Array<{ id: number; owner: number; hp: number; coord: HexCoord }>;
};

async function setPlayerName(page: Page, name: string) {
  const input = page.getByTestId('player-name');
  await input.fill(name);
  await input.blur();
}

function hexToCanvasPoint(hex: HexCoord, width: number, height: number) {
  const x = HEX_SIZE * (1.5 * hex.q);
  const y = HEX_SIZE * ((Math.sqrt(3) / 2) * hex.q + Math.sqrt(3) * hex.r);
  return {
    x: width / 2 + x,
    y: height / 2 + y,
  };
}

async function readJson<T>(page: Page, testId: string): Promise<T> {
  const raw = await page.getByTestId(testId).textContent();
  if (!raw) {
    throw new Error(`Missing JSON payload for ${testId}`);
  }
  return JSON.parse(raw) as T;
}

async function clickHex(page: Page, canvasTestId: string, hex: HexCoord, button: 'left' | 'right' = 'left') {
  const canvas = page.getByTestId(canvasTestId);
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error(`Missing canvas bounds for ${canvasTestId}`);
  }
  const camera = await canvas.getAttribute('data-camera');
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
  const world = hexToCanvasPoint(hex, 0, 0);
  let point = hexToCanvasPoint(hex, box.width, box.height);

  if (camera) {
    const { x, y, zoom } = JSON.parse(camera) as { x: number; y: number; zoom: number };
    point = {
      x: ((world.x - x) * zoom) / dpr + box.width / 2,
      y: ((world.y - y) * zoom) / dpr + box.height / 2,
    };
  }

  await canvas.click({
    position: { x: point.x, y: point.y },
    button,
  });
}

async function deployArmy(page: Page) {
  const state = await readJson<DeploymentState>(page, 'deployment-state');
  expect(state.availableUnits.length).toBeGreaterThan(0);
  expect(state.spawnZone.length).toBeGreaterThanOrEqual(state.availableUnits.length);

  for (let i = 0; i < state.availableUnits.length; i += 1) {
    await page.getByTestId(`deploy-unit-${i}`).click();
    await clickHex(page, 'deployment-canvas', state.spawnZone[i]);
  }

  await expect(page.getByTestId('submit-deployment')).toHaveText('Deploy!');
  await page.getByTestId('submit-deployment').click();
}

async function queueRealOrder(page: Page) {
  const initialState = await readJson<GameSnapshot>(page, 'game-state');
  expect(initialState.smokeMoveCandidate).not.toBeNull();
  const move = initialState.smokeMoveCandidate!;

  await page.getByTestId(`select-unit-${move.unitId}`).click();

  await expect
    .poll(async () => {
      const state = await readJson<GameSnapshot>(page, 'game-state');
      return state.selectedUnitId === move.unitId && state.moveRangeHexes.length > 0;
    }, { timeout: 10_000 })
    .toBe(true);

  await clickHex(page, 'game-canvas', move.to);
  await expect(page.getByTestId('submit-orders')).toContainText('Submit (1)');
}

test('two players can deploy and submit a real turn through the core flow', async ({ browser }, testInfo) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();

  try {
    await alice.goto('/');
    await expect(alice.getByTestId('lobby-screen')).toBeVisible();
    await setPlayerName(alice, 'Alice');

    await alice.getByTestId('create-room').click();
    await expect(alice.getByTestId('create-room-dialog')).toBeVisible();
    await alice.getByTestId('turn-timer-number').fill('15');
    await alice.getByTestId('submit-create-room').click();

    await expect(alice.getByTestId('waiting-room')).toBeVisible();
    const roomCode = await alice.locator('code').innerText();

    await bob.goto('/');
    await expect(bob.getByTestId('lobby-screen')).toBeVisible();
    await setPlayerName(bob, 'Bob');
    await bob.getByTestId('refresh-rooms').click();
    await expect(bob.getByTestId(`room-${roomCode}`)).toBeVisible();
    await bob.getByTestId(`join-room-${roomCode}`).click();

    await expect(bob.getByTestId('waiting-room')).toBeVisible();
    await alice.getByTestId('ready-toggle').click();
    await bob.getByTestId('ready-toggle').click();

    await expect(alice.getByTestId('deployment-screen')).toBeVisible();
    await expect(bob.getByTestId('deployment-screen')).toBeVisible();

    await deployArmy(alice);
    await deployArmy(bob);

    await expect(alice.getByTestId('game-screen')).toBeVisible({ timeout: 25_000 });
    await expect(bob.getByTestId('game-screen')).toBeVisible({ timeout: 25_000 });
    await expect(alice.getByTestId('turn-bar')).toContainText('Turn 1');
    await expect(bob.getByTestId('turn-bar')).toContainText('Turn 1');
    await expect(alice.getByTestId('game-canvas')).toBeVisible();
    await expect(bob.getByTestId('game-canvas')).toBeVisible();

    await queueRealOrder(alice);
    await queueRealOrder(bob);
    await expect(alice.getByTestId('submit-orders')).toContainText('Submit (1)');
    await expect(bob.getByTestId('submit-orders')).toContainText('Submit (1)');

    await alice.getByTestId('game-canvas').screenshot({ path: testInfo.outputPath('smoke-turn-1.png') });
    await alice.getByTestId('submit-orders').click();
    await bob.getByTestId('submit-orders').click();

    await expect
      .poll(async () => {
        const state = await readJson<GameSnapshot>(alice, 'game-state');
        return state.phase !== 'planning' || state.turn > 1;
      }, { timeout: 10_000 })
      .toBe(true);

    await expect
      .poll(async () => {
        const state = await readJson<GameSnapshot>(bob, 'game-state');
        return state.phase !== 'planning' || state.turn > 1;
      }, { timeout: 10_000 })
      .toBe(true);
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
