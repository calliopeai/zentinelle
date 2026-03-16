/**
 * Agent management e2e tests.
 */

import { test, expect } from '@playwright/test';

const BASE = '/zentinelle';

test.describe('Agents page', () => {
  test('loads agent list', async ({ page }) => {
    await page.goto(`${BASE}/agents/`);

    // Header should contain "Agents"
    await expect(page.getByText(/agent/i).first()).toBeVisible();

    // No crash
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('search and filter controls exist', async ({ page }) => {
    await page.goto(`${BASE}/agents/`);

    // Search input
    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput.first()).toBeVisible();
  });

  test('register agent page has required form fields', async ({ page }) => {
    await page.goto(`${BASE}/agents/register/`);

    // Name field
    await expect(page.getByPlaceholder(/agent name|my.*agent/i).first()).toBeVisible();

    // Submit button
    await expect(page.getByRole('button', { name: /register|create|submit/i }).first()).toBeVisible();
  });
});

test.describe('Agent Groups', () => {
  test('loads agent groups page', async ({ page }) => {
    await page.goto(`${BASE}/agent-groups/`);

    await expect(page.getByText(/group/i).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
  });
});
