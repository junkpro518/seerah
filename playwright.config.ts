import { defineConfig, devices } from "@playwright/test";

/**
 * E2E يعمل على مكدّس Supabase **محلي زائل** (supabase start + db reset) —
 * لا يمسّ السحابي إطلاقًا (مبدأ VI). تُضبط مفاتيح المكدّس المحلي عبر بيئة CI/المحلي.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
