import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// 两个 HTML 入口共用同一份 React UI：
//   index.html      → 纯网页版，pnpm dev 直接开
//   sidepanel.html  → Chrome 扩展的侧边栏
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // MV3 的默认 CSP 是 script-src 'self'，vite 注入的内联 modulepreload polyfill 会被拦掉
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        web: resolve(__dirname, 'index.html'),
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        headless: resolve(__dirname, 'headless.html'),
      },
    },
  },
});
