import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { launchApp, closeApp, openThread, findComposer, closeComposerWindows } from '../helpers';

let electronApp: ElectronApplication;
let mainWindow: Page;
let configDir: string;

test.beforeAll(async () => {
  ({ electronApp, mainWindow, configDir } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp, configDir);
});

test.afterEach(async () => {
  await closeComposerWindows(electronApp);
});

test('fluent toolbar button opens composer', async () => {
  // The toolbar role only renders once a thread is selected.
  await openThread(mainWindow, 0);
  await mainWindow.locator('[data-testid="fluent-compose"]').first().click();

  const composerPage = await findComposer(electronApp);
  expect(composerPage).not.toBeNull();
});
