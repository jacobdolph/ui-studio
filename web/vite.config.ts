import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// BASE_PATH is set by the GitHub Pages workflow (project sites live under /<repo>/).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
