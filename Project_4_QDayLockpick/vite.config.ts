import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cartheonFonts } from './tools/cartheon-fonts.ts'
import { review } from './tools/review/vite-plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  // both run on the dev server only: Cartheon's licensed font is read from this machine, never bundled,
  // and review() is the Alt+right-click note for Claude
  plugins: [cartheonFonts(), review(), react()],
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
