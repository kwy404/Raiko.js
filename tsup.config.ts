import { defineConfig } from 'tsup'
import entries from './tsup.entries.json'

export default defineConfig({
  entry: entries,
  format: ['esm'],
  dts: false,
  target: 'es2022',
  platform: 'neutral',
  splitting: true,
  clean: true,
  treeshake: true,
  external: ['react', 'vue', 'vite', 'sharp', 'nodemailer', 'drizzle-orm', /^node:/],
})
