// Copies the static landing page (repo-root /landing folder) into dist/,
// so the built output is: dist/index.html (landing) + dist/app/ (the PWA).
import { cpSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const landingSrc = path.join(root, 'landing')
const distDir = path.join(root, 'dist')

if (!existsSync(landingSrc)) {
  console.warn('[copy-landing] No landing/ folder found at repo root — skipping.')
  process.exit(0)
}

if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })

cpSync(landingSrc, distDir, { recursive: true })
console.log('[copy-landing] Copied landing/ -> dist/')
