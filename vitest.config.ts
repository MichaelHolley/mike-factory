import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "server",
          include: ["src/**/*.test.ts", "test/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
      "web/vitest.config.ts",
    ],
  },
});
