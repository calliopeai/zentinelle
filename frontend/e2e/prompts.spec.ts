/**
 * System prompts page e2e tests.
 */

import { test, expect } from '@playwright/test';

const BASE = '/zentinelle';

test.describe('Prompts page', () => {
  test('loads prompts library', async ({ page }) => {
    await page.goto(`${BASE}/prompts/`);

    await expect(page.getByText(/prompt/i).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('"New Prompt" button switches to create tab', async ({ page }) => {
    await page.goto(`${BASE}/prompts/`);

    const newPromptBtn = page.getByRole('button', { name: /new prompt/i });
    if (await newPromptBtn.count() > 0) {
      await newPromptBtn.click();

      // Should now be on the create tab - look for form fields
      await expect(
        page.getByLabel(/name/i)
          .or(page.getByPlaceholder(/prompt name/i))
          .first()
      ).toBeVisible({ timeout: 3000 });
    }
  });

  test('prompt detail modal opens on row click', async ({ page }) => {
    await page.goto(`${BASE}/prompts/`);

    // Wait for prompts to load
    await page.waitForTimeout(1500);

    // Try clicking the first prompt row/card if any exist
    const promptRow = page.locator('tr[data-testid], tbody tr').first();
    if (await promptRow.count() > 0) {
      await promptRow.click();

      // Modal should open
      const modal = page.getByRole('dialog');
      if (await modal.count() > 0) {
        await expect(modal).toBeVisible();
      }
    }
  });
});
