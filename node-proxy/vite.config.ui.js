// 新 UI（node-proxy/public 静态页）的开发服务器
// 作用：同源托管静态页 + 把 /enc-api 代理到稳定后端（本地后端开发期不稳定）
// 启动：cd node-proxy && npm run ui
// 访问：http://127.0.0.1:5004/public/login.html
// 注意：页面内 API 一律走同源相对路径 /enc-api，换后端只改这里的 target
// 生产运行不依赖本文件：静态页由 node-proxy 的 koa-static 托管，无代理需求
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  optimizeDeps: {
    // 只扫描新 UI 页面，避免 node-proxy 根下的历史文件（如 test2zip.html）触发依赖扫描报错
    entries: 'public/*.html'
  },
  server: {
    port: 5004,
    host: true,
    proxy: {
      '/enc-api': {
        target: 'http://192.168.5.12:5344',
        changeOrigin: true
      }
    }
  }
})
