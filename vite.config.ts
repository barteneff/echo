import { defineConfig } from 'vite';

// Project Pages: https://<user>.github.io/echo/
export default defineConfig({
  base: '/echo/',
  server: {
    port: 5173,
  },
});
