// Build the frontend first (ng build --configuration development).
// Uses an isolated profile and the real desktop window/Angular task creation path.
const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const run = async () => {
  const tmp = path.resolve('.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const profile = fs.mkdtempSync(path.join(tmp, 'quick-add-e2e-'));
  const frontend = path.resolve('.tmp/angular-dist/browser/index.html');
  assert.ok(fs.existsSync(frontend), 'Build the frontend before running this smoke test');
  const env = { ...process.env, NODE_ENV: 'PROD' };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = path.join(
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32'
      ? 'electron.exe'
      : process.platform === 'darwin'
        ? 'Electron.app/Contents/MacOS/Electron'
        : 'electron',
  );
  const app = await electron.launch({
    executablePath: path.resolve(executable),
    args: ['.', `--user-data-dir=${profile}`],
    env,
    timeout: 60000,
  });
  const errors = [];
  const collect = (page) => page.on('pageerror', (error) => errors.push(error.message));
  app.on('window', collect);
  try {
    const page = await app.firstWindow();
    collect(page);
    await page.waitForURL(/#\//, { timeout: 60000 });
    await page.locator('main-header').waitFor({ timeout: 60000 });
    await page
      .locator('.loading-full-page-wrapper')
      .waitFor({ state: 'hidden', timeout: 60000 });
    await page.evaluate(() => {
      for (const key of [
        'SUP_ONBOARDING_PRESET_DONE',
        'SUP_ONBOARDING_HINTS_DONE',
        'SUP_IS_SHOW_TOUR',
        'SUP_EXAMPLE_TASKS_CREATED',
      ])
        localStorage.setItem(key, 'true');
      localStorage.setItem('DARK_MODE', 'dark');
    });
    await page.goto(pathToFileURL(frontend).href);
    await page.locator('main-header').waitFor({ timeout: 60000 });
    await page
      .locator('.loading-full-page-wrapper')
      .waitFor({ state: 'hidden', timeout: 60000 });
    const main = await app.browserWindow(page);
    const assertMainHidden = async () =>
      assert.equal(await main.evaluate((win) => win.isVisible()), false);
    const openCapture = async () => {
      const opening = app.waitForEvent('window', { timeout: 30000 });
      await main.evaluate((win) => {
        win.hide();
        win.webContents.send('OPEN_QUICK_ADD_TASK');
      });
      const popup = await opening;
      await popup.locator('textarea.main-input').waitFor();
      await expect(popup.locator('body')).toHaveClass(/isDarkTheme/);
      await expect.poll(() => popup.evaluate(() => innerHeight)).toBeLessThan(200);
      await assertMainHidden();
      return popup;
    };
    let popup = await openCapture();
    assert.equal(
      await popup.evaluate(() => getComputedStyle(document.body).backgroundColor),
      'rgba(0, 0, 0, 0)',
    );
    await popup.locator('[data-test="add-task-bar-due-btn"]').click();
    await popup.locator('dialog-schedule-task').waitFor();
    await popup.keyboard.press('Escape');
    await expect(popup.locator('dialog-schedule-task')).toHaveCount(0);
    await expect.poll(() => popup.evaluate(() => innerHeight)).toBeLessThan(200);
    await popup.getByRole('button', { name: 'Estimate', exact: true }).click();
    await popup.getByRole('menuitem', { name: '30m', exact: true }).click();
    await popup.locator('textarea.main-input').fill('Capture UI check #capture');
    await popup.locator('textarea.main-input').press('Enter');
    await Promise.all([
      popup.waitForEvent('close'),
      popup.locator('dialog-confirm button[e2e="confirmBtn"]').click(),
    ]);
    await expect(
      page.locator('task').filter({ hasText: 'Capture UI check' }),
    ).toHaveCount(1);
    await assertMainHidden();

    popup = await openCapture();
    await expect(popup.getByRole('button', { name: 'Tags', exact: true })).toBeVisible();
    await popup.screenshot({ path: '.tmp/quick-add-verified.png', omitBackground: true });
    await popup.locator('[data-test="add-task-bar-deadline-btn"]').click();
    await popup.locator('dialog-deadline').waitFor();
    await popup.keyboard.press('Escape');
    await expect(popup.locator('dialog-deadline')).toHaveCount(0);
    await popup.getByRole('button', { name: 'Tags', exact: true }).click();
    await expect(popup.getByRole('menuitem', { name: /capture/ })).toBeVisible();
    await popup.keyboard.press('Escape');
    await popup.locator('[data-test="add-task-bar-note-btn"]').click();
    await expect(popup.locator('textarea')).toHaveCount(2);
    await popup.locator('textarea.main-input').fill('Keep this draft');
    const count = app.windows().length;
    await main.evaluate((win) => win.webContents.send('OPEN_QUICK_ADD_TASK'));
    await expect(popup.locator('textarea.main-input')).toHaveValue('Keep this draft');
    assert.equal(app.windows().length, count);
    await Promise.all([
      popup.waitForEvent('close'),
      popup.locator('textarea.main-input').press('Escape'),
    ]);

    popup = await openCapture();
    await popup.locator('[data-test="add-task-bar-repeat-btn"]').click();
    await popup.getByRole('menuitem', { name: 'Custom…', exact: true }).click();
    await popup.locator('textarea.main-input').fill('Custom repeat capture');
    await popup.locator('textarea.main-input').press('Enter');
    await popup.locator('dialog-edit-task-repeat-cfg').waitFor();
    await assertMainHidden();
    await Promise.all([popup.waitForEvent('close'), popup.keyboard.press('Escape')]);
    await expect(
      page.locator('task').filter({ hasText: 'Custom repeat capture' }),
    ).toHaveCount(1);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: compact themed popup, schedule/deadline, estimate, tags, notes, draft reuse, Enter, Escape, custom repeat, main window hidden',
    );
    console.log('Screenshot: .tmp/quick-add-verified.png');
  } finally {
    await app.close();
    assert.ok(profile.startsWith(tmp + path.sep));
    fs.rmSync(profile, { recursive: true, force: true });
  }
};
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
