import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api/em': { target: 'https://push2.eastmoney.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/em/, '') },
      '/api/emhis': { target: 'https://push2his.eastmoney.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/emhis/, '') },
      '/api/emdc': { target: 'https://datacenter-web.eastmoney.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/emdc/, '') },
      '/api/sina': { target: 'https://money.finance.sina.com.cn', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/sina/, '') },
    },
  },
})
