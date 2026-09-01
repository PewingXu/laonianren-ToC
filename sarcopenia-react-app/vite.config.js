import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { spawn } from 'child_process'
import fs from 'fs'

const PYTHON_API_PORT = 8765;

/**
 * Vite 插件：自动启动 Python FastAPI 后端
 */
function vitePluginPythonApi() {
  let pythonProcess = null;

  return {
    name: 'python-api-server',

    configureServer() {
      const projectRoot = path.resolve(__dirname);
      const apiScript = path.join(projectRoot, 'algorithms', 'api_server.py');

      if (!fs.existsSync(apiScript)) {
        console.log('[Python API] algorithms/api_server.py not found, skipping');
        return;
      }

      // 优先使用 Anaconda Python
      const anacondaPython = 'C:\\Users\\xpr12\\anaconda3\\python.exe';
      const cmd = fs.existsSync(anacondaPython) ? anacondaPython : 'python';
      const args = [apiScript];
      const env = { ...process.env, PYTHON_API_PORT: String(PYTHON_API_PORT), PYTHONIOENCODING: 'utf-8' };

      console.log(`[Python API] Starting python backend on port ${PYTHON_API_PORT}...`);

      pythonProcess = spawn(cmd, args, {
        cwd: path.join(projectRoot, 'algorithms'),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      pythonProcess.stdout?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[Python API] ${msg}`);
      });

      pythonProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[Python API] ${msg}`);
      });

      pythonProcess.on('error', (err) => {
        console.log(`[Python API] Failed to start: ${err.message}`);
        pythonProcess = null;
      });

      pythonProcess.on('exit', (code) => {
        if (code !== null && code !== 0) {
          console.log(`[Python API] Process exited with code ${code}`);
        }
        pythonProcess = null;
      });

      process.on('exit', () => {
        if (pythonProcess) {
          pythonProcess.kill();
          pythonProcess = null;
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), vitePluginPythonApi()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy: {
      '/pyapi': {
        target: `http://127.0.0.1:${PYTHON_API_PORT}`,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/pyapi/, ''),
        timeout: 600000,       // 10 分钟超时（Python 计算可能很慢）
        proxyTimeout: 600000,
      },
    },
  },
})