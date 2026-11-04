import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:15173",
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm --prefix .. run dev",
    url: "http://localhost:15173",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: "18137", VITE_PORT: "15173" },
  },
});
