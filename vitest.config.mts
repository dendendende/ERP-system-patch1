import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts", "supabase/tests/**/*.test.ts"],
    // One file at a time: the database tests share one database, and several switch off every
    // bank account or bill inside their transaction — in parallel those row locks can deadlock.
    fileParallelism: false,
  },
});
