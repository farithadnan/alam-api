import { defineConfig } from "vitest/config";

export default defineConfig({
  // The per-host politeness gap is for real upstreams, not for mocked tests.
  test: { env: { HTTP_HOST_GAP_MS: "0" } },
  test: {
    include: ["test/**/*.test.ts"],
    server: {
      deps: {
        external: ["node:sqlite"],
      },
    },
  },
});
