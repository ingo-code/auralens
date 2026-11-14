import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/*
 * Paid evals against the real Claude API (scripts/eval/*.eval.ts). Never part
 * of `npm test`: the default config only picks up *.test.ts files.
 *   EVAL_CONFIRM=1 npx vitest run -c vitest.eval.config.mts
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["scripts/eval/**/*.eval.ts"],
    testTimeout: 60 * 60 * 1000,
    hookTimeout: 60 * 1000,
  },
});
