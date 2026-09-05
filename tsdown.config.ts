import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/langchain.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
  clean: true,
  external: ["@langchain/core"],
});
