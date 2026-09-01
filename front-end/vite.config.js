import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // ⚠️ 15173 不是随便选的：Windows 的 winnat 会在 TCP 动态端口范围（本机被设为
    // 1024-15000）里抢占若干 100 端口宽的段，段内任何进程都 bind 不了，listen 直接
    // 报 EACCES 且 netstat 看不到占用者，抢占位置每次开机漂移。5173 正落在实测到的
    // 5169-5268 段里，会导致 vite 起不来、Electron 白屏。15001-49151 区间在当前配置
    // 和微软默认的 49152-65535 两种情况下都安全。详见 back-end/code/index.js 顶部说明。
    port: Number(process.env.VITE_DEV_PORT) || 15173,
    host: true,
    allowedHosts: true,
    proxy: {
      // 后端 HTTP API 代理
      '/api/backend': {
        target: 'http://localhost:19245',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/backend/, ''),
      },
      // Python FastAPI 代理（端口同样避开抢占区；由 Electron 通过环境变量下发）
      '/pyapi': {
        target: `http://127.0.0.1:${Number(process.env.PYTHON_API_PORT) || 18765}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pyapi/, ''),
      },
      // 后端 WebSocket 代理
      '/ws/backend': {
        target: 'ws://localhost:19999',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws\/backend/, ''),
      },
    },
  }
})
