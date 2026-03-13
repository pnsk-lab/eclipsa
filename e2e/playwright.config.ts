import { createServer } from "node:net";
import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port =
  Number(process.env.PLAYWRIGHT_E2E_PORT) ||
  (process.env.PLAYWRIGHT_E2E_PORT = String(await getAvailablePort(host)),
  Number(process.env.PLAYWRIGHT_E2E_PORT));
const baseURL = `http://${host}:${port}`;

function getAvailablePort(hostname: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, hostname, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to resolve an available port for Playwright."));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

export default defineConfig({
  testDir: "./test",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "./test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
  testMatch: "**/*.test.ts",
  webServer: {
    command: `bun vp dev --host ${host} --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
});
