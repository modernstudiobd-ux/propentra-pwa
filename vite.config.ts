import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// IMPORTANT: base must match your GitHub repo name for Pages to work:
// https://<username>.github.io/<repo-name>/  ->  base: '/<repo-name>/'
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/app',
    emptyOutDir: true
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Propentra - Property Management & Billing',
        short_name: 'Propentra',
        description: 'Manage buildings, flats, tenants, billing, invoices and payments.',
        theme_color: '#1e3a8a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          { urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst', options: { cacheName: 'pages-cache' } }
        ]
      }
    })
  ]
})
