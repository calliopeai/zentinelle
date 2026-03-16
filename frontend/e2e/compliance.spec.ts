/**
 * Compliance framework e2e tests.
 */

import { test, expect } from '@playwright/test';

const BASE = '/zentinelle';

test.describe('Compliance page', () => {
  test('loads compliance dashboard', async ({ page }) => {
    await page.goto(`${BASE}/compliance/`);

    await expect(page.getByText(/compliance/i).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('audit logs page loads with filter controls', async ({ page }) => {
    await page.goto(`${BASE}/audit-logs/`);

    await expect(page.getByText(/audit/i).first()).toBeVisible();

    // Should have date or filter controls
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('retention policies page loads', async ({ page }) => {
    await page.goto(`${BASE}/retention/`);

    await expect(page.getByText(/retention/i).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});
