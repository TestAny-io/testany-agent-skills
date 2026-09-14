import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4771',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', request => {
            if (request.hasHeader('origin')) request.setHeader('origin', 'http://127.0.0.1:4771');
          });
        },
      },
    },
  },
});
