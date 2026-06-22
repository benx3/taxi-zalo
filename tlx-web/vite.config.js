import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  // base: "./" để assets dùng relative path — bắt buộc khi serve cùng domain với tlx-driver
  // (/admin/assets/... và /accountant/assets/... sẽ không conflict với /assets/ của driver)
  base: "./",
});
