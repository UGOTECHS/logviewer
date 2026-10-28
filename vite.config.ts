import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Built for the domain root (Vercel or any static host). Set VITE_BASE to serve it under a sub-path.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
