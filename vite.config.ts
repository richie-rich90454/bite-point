import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      reporter: ["text", "html"],
      include: ["src/simulation/**", "src/input/**"],
    },
  },
});
