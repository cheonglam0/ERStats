/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 등 서브경로 배포 대비 상대경로
  base: "./",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
