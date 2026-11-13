import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split what changes at different speeds, so a new release only
        // re-downloads the part that changed: React, the term content, the mode data, and the app.
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react';
          // The metro map, tickers and claims load only when a mode that needs them opens.
          if (id.includes('/src/data/modes/')) return 'modes';
          if (id.includes('/src/data/')) return 'content';
        },
      },
    },
    // The term content is one large chunk on purpose; it is cached for a year.
    chunkSizeWarningLimit: 1200,
  },
})
