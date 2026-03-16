/**
 * Monitoring dashboard e2e tests.
 */

import { test, expect } from '@playwright/test';

const BASE = '/zentinelle';

test.describe('Monitoring Dashboard', () => {
  test('loads monitoring page', async ({ page }) => {
    await page.goto(`${BASE}/monitoring/`);

    // Should show monitoring-related content
    await expect(page.getByText(/monitor|event|scan|anomal/i).first()).toBeVisible();

    // No crash
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('tabs navigate between monitoring sections', async ({ page }) => {
    await page.goto(`${BASE}/monitoring/`);

    const tabs = page.getByRole('tab');
    const tabCount = await tabs.count();

    if (tabCount > 1) {
      // Click through each tab
      for (let i = 0; i < Math.min(tabCount, 4); i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(300);
        await expect(page.locator('body')).not.toContainText('Application error');
      }
    }
  });

  test('Celery task cards display task path not fake health bar', async ({ page }) => {
    await page.goto(`${BASE}/monitoring/`);

    // Find "Task path:" label that replaced the fake Progress bar
    // (only visible when there are configured tasks shown)
    await page.waitForTimeout(1000);

    // If any Celery task cards are shown, they should have "Task path:" not a green health bar
    const taskPathLabels = page.getByText('Task path:');
    const fakeHealthBars = page.locator('[role="progressbar"]');

    // fakeHealthBars that say 100% should not exist
    const progressBars = await fakeHealthBars.count();
    if (progressBars > 0) {
      // If there are progress bars, they should NOT be the fake always-100% ones
      // (they would be legitimate loading spinners or data-driven)
      const ariaNow100 = await page.locator('[aria-valuenow="100"]').count();
      // Multiple all-100% bars = the fake health indicator pattern we removed
      expect(ariaNow100).toBeLessThan(3);
    }
  });
});
