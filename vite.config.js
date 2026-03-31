import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 当我们在前端请求带 /api/doubao 前缀的链接时，Vite 会拦截它
      '/api/doubao': {
        target: 'https://ark.cn-beijing.volces.com', // 目标真实域名
        changeOrigin: true, // 欺骗目标服务器，说我是同源请求
        // 把前缀替换掉，拼接成火山引擎真实的路径
        rewrite: (path) => path.replace(/^\/api\/doubao/, '')
      }
    }
  }
})