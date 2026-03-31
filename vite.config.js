import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["wwh666.wh1234567.com", "localhost"],
    host: "0.0.0.0",
    port: 5181,
    proxy: {
      // 当我们在前端请求带 /api/ 前缀的链接时，Vite 会将请求代理到我们的 Node.js 后端服务
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true
      }
    }
  }
})