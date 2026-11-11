// The interface alone in a normal browser, for testing without Electron (see src/renderer/src/dev/browserApi.ts).
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@renderer': resolve(__dirname, 'src/renderer/src') } },
  plugins: [react()],
  server: { port: 5199, strictPort: true }
})
