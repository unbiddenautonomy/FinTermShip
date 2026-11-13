import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    // Every term card loaded, as the server would send them to a learner who has reached them all.
    setupFiles: ['src/test/setup.ts'],
  },
  build: {
    rollupOptions: {
      output: {
        // Split what changes at different speeds, so a new release only
        // re-downloads the part that changed: React, the outline and other content, the mode data, and the app.
        // Term cards are not in the build at all: the server sends them.
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react';
          // The metro map, tickers and claims load only when a mode that needs them opens.
          if (id.includes('/src/data/modes/')) return 'modes';
          if (id.includes('/src/data/')) return 'content';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
