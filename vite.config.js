import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const wsid = process.env.WORKSPACE_ID
const BACKEND = 'http://localhost:8787'

// 프리뷰는 base(/preview/<wsid>/) 하위로 요청이 들어오므로 두 경로 모두 백엔드로 프록시한다.
const proxy = {
  '/api': { target: BACKEND, changeOrigin: true },
}
if (wsid) {
  proxy[`^/preview/${wsid}/api`] = {
    target: BACKEND,
    changeOrigin: true,
    rewrite: (p) => p.replace(new RegExp(`^/preview/${wsid}`), ''),
  }
}

export default defineConfig({
  plugins: [react()],
  base: wsid ? `/preview/${wsid}/` : '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy,
    hmr: {
      clientPort: 443,
    },
  },
})
