import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://127.0.0.1:3000",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 240_000,
    env: environment(),
  },
});
