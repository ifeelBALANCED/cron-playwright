import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration with HTML report output.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI for stability */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter configuration */
  reporter: process.env.CI
    ? [
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['github'],
        ['list'],
      ]
    : [['html', { outputFolder: 'playwright-report', open: 'on-failure' }]],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL - configured via environment */
    baseURL: getBaseURL(),
    
    /* Collect trace on failure */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    /* Mobile viewports */
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run local dev server before starting the tests (only in local dev) */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
      },
});

/**
 * Get base URL based on environment configuration
 */
function getBaseURL(): string {
  const env = process.env.TARGET_ENV || 'local';
  
  const urls: Record<string, string> = {
    local: 'http://localhost:5173',
    stage: process.env.STAGE_URL || 'https://stage.example.com',
    prod: process.env.PROD_URL || 'https://example.com',
  };
  
  return urls[env] || urls.local;
}
