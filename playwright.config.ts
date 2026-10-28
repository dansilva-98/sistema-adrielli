import { defineConfig, devices } from "@playwright/test";

function e2ePort(): string {
  const value = process.env.E2E_PORT;
  return value && /^\d+$/.test(value) ? value : "3000";
}

const port = e2ePort();
const pnpm = process.platform === "win32" ? "corepack pnpm" : "pnpm";

function environment(): Record<string, string> {
  const entries = Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return {
    ...Object.fromEntries(entries),
    APP_ENV: "staging",
  };
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /patient-attachment\.spec\.ts/,
    },
    {
      name: "iphone",
      use: {
        ...devices["iPhone 13"],
        baseURL: `http://localhost:${port}`,
      },
      testMatch: /patient-attachment\.spec\.ts/,
    },
  ],
  webServer: {
    command: `${pnpm} build && ${pnpm} start --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: environment(),
  },
});
