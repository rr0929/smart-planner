import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// [Inference] This configuration is optimized for Tailwind v4. This is the expected setup to avoid PostCSS conflicts.
// [Unverified] Ensure the 'base' matches your GitHub repository name exactly.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  base: '/smart-planner/', 
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
})