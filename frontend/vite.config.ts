import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // sourcemap: true ships .map files alongside the JS bundle in prod so the
  // browser devtools can resolve minified stack frames to real file:line.
  // Slight bandwidth cost (maps are served on demand), well worth it while
  // we're stabilising the SemApps integration. Drop to `false` once stable.
  build: { sourcemap: true },
  server: { port: 5173, open: true }
});
