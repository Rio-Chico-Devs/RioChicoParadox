import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard build — clean URLs, hashed assets, served by any static host.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 5173,
  },
});
