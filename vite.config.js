import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/yks-takip/',
  plugins: [react()],
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
  server: {
    allowedHosts: true,
  },
})
