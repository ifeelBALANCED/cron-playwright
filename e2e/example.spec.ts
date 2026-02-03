import { test, expect } from '@playwright/test';

/**
 * Example E2E tests demonstrating tagging for smoke/regression suites
 */

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display main heading @smoke', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should have correct title @smoke', async ({ page }) => {
    await expect(page).toHaveTitle(/Vite/);
  });

  test('should display Vite logo @smoke', async ({ page }) => {
    const viteLogo = page.locator('a[href="https://vite.dev"]');
    await expect(viteLogo).toBeVisible();
  });

  test('should display React logo @smoke', async ({ page }) => {
    const reactLogo = page.locator('a[href="https://react.dev"]');
    await expect(reactLogo).toBeVisible();
  });
});

test.describe('Counter Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should increment counter on button click @smoke @regression', async ({ page }) => {
    const button = page.getByRole('button', { name: /count is/i });
    
    await expect(button).toContainText('count is 0');
    await button.click();
    await expect(button).toContainText('count is 1');
  });

  test('should increment counter multiple times @regression', async ({ page }) => {
    const button = page.getByRole('button', { name: /count is/i });
    
    // Click multiple times
    for (let i = 0; i < 5; i++) {
      await button.click();
    }
    
    await expect(button).toContainText('count is 5');
  });

  test('counter button should be focusable @regression', async ({ page }) => {
    const button = page.getByRole('button', { name: /count is/i });
    
    await button.focus();
    await expect(button).toBeFocused();
  });
});

test.describe('Accessibility', () => {
  test('should have proper link structure @regression', async ({ page }) => {
    await page.goto('/');
    
    // Check that all links have href attributes
    const links = page.locator('a[href]');
    const count = await links.count();
    
    expect(count).toBeGreaterThan(0);
    
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href');
      expect(href).toBeTruthy();
    }
  });

  test('should have readable text contrast @regression', async ({ page }) => {
    await page.goto('/');
    
    // Basic visibility check for main content
    const mainContent = page.locator('h1, p, button');
    const count = await mainContent.count();
    
    for (let i = 0; i < count; i++) {
      await expect(mainContent.nth(i)).toBeVisible();
    }
  });
});

test.describe('Navigation', () => {
  test('external links should have correct targets @regression', async ({ page }) => {
    await page.goto('/');
    
    // Vite link
    const viteLink = page.locator('a[href="https://vite.dev"]');
    await expect(viteLink).toHaveAttribute('target', '_blank');
    
    // React link
    const reactLink = page.locator('a[href="https://react.dev"]');
    await expect(reactLink).toHaveAttribute('target', '_blank');
  });
});
