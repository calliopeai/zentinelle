/**
 * Policy management e2e tests.
 */

import { test, expect } from '@playwright/test';

const BASE = '/zentinelle';

test.describe('Policies page', () => {
  test('loads policy list', async ({ page }) => {
    await page.goto(`${BASE}/policies/`);

    // Header
    await expect(page.getByText('Policies', { exact: false })).toBeVisible();

    // Should show either a policy row or the empty state
    const hasTable = await page.locator('table').count() > 0;
    const hasEmptyState = await page.getByText(/No policies/i).count() > 0;
    expect(hasTable || hasEmptyState).toBe(true);
  });

  test('create policy page renders form', async ({ page }) => {
    await page.goto(`${BASE}/policies/create/`);

    // Policy name field should exist
    await expect(page.getByLabel(/name/i).or(page.getByPlaceholder(/policy name/i))).toBeVisible();

    // Policy type selector
    await expect(page.locator('select, [role="combobox"]').first()).toBeVisible();
  });

  test('policies page filter controls work', async ({ page }) => {
    await page.goto(`${BASE}/policies/`);

    // Find a search input or filter control
    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('rate');
      // Should not crash
      await expect(page.locator('body')).not.toContainText('Application error');
    }
  });
});
