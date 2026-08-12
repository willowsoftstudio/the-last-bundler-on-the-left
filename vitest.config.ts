import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.spec.u.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["web/backend/**/*.ts", "extensions/cart-transform/**/*.ts"]
    }
  }
});
