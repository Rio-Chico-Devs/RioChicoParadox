import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build → one self-contained preview.html with CSS, JS and
// assets all inlined. Uses HashRouter (VITE_SINGLEFILE) so internal links
// work when the file is opened directly from disk (file://).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    'import.meta.env.VITE_SINGLEFILE': JSON.stringify('1'),
  },
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100000000, // inline every asset, no external files
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
  },
});
