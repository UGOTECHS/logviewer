import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the project at https://ugotechs.github.io/logviewer/.
// Set VITE_BASE=/ to build for a root-hosted deployment.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/logviewer/',
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
