import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync } from "node:fs";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  // ship the dashboard template alongside the compiled code
  onSuccess: async () => {
    mkdirSync("dist/web", { recursive: true });
    copyFileSync("src/web/template.html", "dist/web/template.html");
  },
});
