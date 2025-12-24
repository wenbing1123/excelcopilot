import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  // Electron 生产环境通过 loadFile(dist/index.html) 打开，资源路径必须是相对的
  base: mode === 'development' ? '/' : './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
}));
