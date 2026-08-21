import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/bwip-js')) {
            return 'barcode-preview';
          }
          if (id.includes('/src/features/system/') || id.includes('\\src\\features\\system\\')) {
            return 'system-console';
          }
          if (id.includes('/src/features/quality/') || id.includes('\\src\\features\\quality\\')) {
            return 'quality-console';
          }
          if (id.includes('/src/features/locations/') || id.includes('\\src\\features\\locations\\')) {
            return 'locations-console';
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4000,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4000,
    strictPort: true,
  },
});
