import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cartheonFonts } from './tools/cartheon-fonts.ts'

// https://vite.dev/config/
export default defineConfig({
  // dev server only: Cartheon's licensed font is read from this machine, never bundled
  plugins: [cartheonFonts(), react()],
  base: './',
  // Qollab wants index.html + main.js + main.css at the project root
  build: {
    outDir: 'qollab',
    cssCodeSplit: false,
    rollupOptions: {
      output: { entryFileNames: 'main.js', assetFileNames: 'main.css', inlineDynamicImports: true },
    },
  },
})
