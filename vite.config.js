import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createApiRouter } from './server/router.js';

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    mode === 'development'
      ? {
          name: 'sheetnext-local-api',
          configureServer(server) {
            const api = createApiRouter();

            // healthcheck
            server.middlewares.use('/api/health', (req, res) => {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ ok: true }));
            });

            // API router
            server.middlewares.use('/api', api);

            // error fallback (if router throws)
            server.middlewares.use('/api', (err, req, res, next) => {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: String(err?.message || err) }));
            });
          },
        }
      : null,
  ].filter(Boolean),
  // Electron 生产环境通过 loadFile(dist/index.html) 打开，资源路径必须是相对的
  base: mode === 'development' ? '/' : './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
}));
