import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/yks-takip/',
  plugins: [react()],
  server: {
    allowedHosts: true,
  },
})
