/**
 * Navigation smoke tests — verifies every main page loads without a crash.
 *
 * Runs in standalone mode (NEXT_PUBLIC_AUTH_MODE=standalone) so Auth0 is bypassed.
 * The backend GraphQL server is expected at http://localhost:8000 with a real DB.
 *
 * To run:
 *   NEXT_PUBLIC_AUTH_MODE=standalone npx playwright test
 */

import { test, expect } from '@playwright/test';

const BASE = '/zentinelle';

const PAGES = [
  { path: '/agents/', title: 'Agents' },
  { path: '/agents/register/', title: 'Register' },
  { path: '/agent-groups/', title: 'Agent Groups' },
  { path: '/policies/', title: 'Policies' },
  { path: '/policies/create/', title: 'Create Policy' },
  { path: '/risk/', title: 'Risk' },
  { path: '/monitoring/', title: 'Monitoring' },
  { path: '/compliance/', title: 'Compliance' },
  { path: '/audit-logs/', title: 'Audit Logs' },
  { path: '/prompts/', title: 'Prompts' },
  { path: '/models/', title: 'Models' },
  { path: '/graph/', title: 'Graph' },
  { path: '/network/', title: 'Network' },
  { path: '/retention/', title: 'Retention' },
  { path: '/usage/', title: 'Usage' },
  { path: '/settings/', title: 'Settings' },
];

test.describe('Page smoke tests', () => {
  for (const { path, title } of PAGES) {
    test(`${title} page loads without crash`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);

      // Should not show a crash / 500 error
      await expect(page.locator('body')).not.toContainText('Application error');
      await expect(page.locator('body')).not.toContainText('Internal Server Error');
      await expect(page.locator('body')).not.toContainText('500');

      // Sidebar should be visible (means layout rendered)
      await expect(page.locator('nav, aside, [data-testid="sidebar"]').first()).toBeVisible();
    });
  }
});
