const { configureLogging } = require('./util/configureLogging')
configureLogging('progress')

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron')
const path = require('path')
const { fork, spawn, spawnSync } = require('child_process')
const { getHardwareFingerprint } = require('./util/getWinConfig')
const { getKeyfromWinuuid } = require('./util/getServer')
const { initDb, getCsvData } = require('./util/db')
const http = require('http')
const fs = require('fs')
const { initAutoUpdater, registerUpdaterIpcHandlers, cleanupUpdater } = require('./updater')
// const { startWorker, callPy } = require('./pyWorker')  // [已迁移到JS算法] Python子进程不再需要
const isPackaged = app.isPackaged

// ⚠️ 白屏防护：单实例锁。多开会抢占 22999/19245/19999 端口，
// 导致第二个实例的页面服务或后端起不来而白屏。这里直接让后开的实例退出，聚焦已有窗口。
if (!app.requestSingleInstanceLock()) {
  console.warn('[startup] 检测到应用已在运行，本次启动退出')
  app.quit()
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      if (wins[0].isMinimized()) wins[0].restore()
      wins[0].focus()
    }
  })
}

const devWebRoot = path.join(__dirname, 'client', 'dist')
const prodWebRoot = path.join(__dirname, 'renderer-build')
const webRoot = isPackaged ? prodWebRoot : devWebRoot
// ⚠️ 端口必须落在 15001-49151 区间，原因见下（这是"偶尔白屏"的真正根因）：
//
// Windows 的 winnat 服务（Hyper-V / WSL2 / Docker 的 NAT）启动时，会从 TCP
// 动态端口范围里抢占若干 100 端口的段做端口转发。被抢占的段在内核层面禁止
// 任何进程 bind —— listen 直接返回 EACCES，且 netstat 里看不到任何占用进程。
// 抢占的位置每次开机都会漂移，所以表现为"有时能启动、有时白屏"。
//
// 本机的动态范围被设成了 1024-15000（微软默认是 49152-65535），等于把所有常用
// 开发端口都暴露在抢占区里。实测撞过：5173（vite）、8765（Python AI）。
// 选 15001-49151 的好处是：无论动态范围保持 1024-15000，还是日后改回微软默认的
// 49152-65535，这个区间都在抢占区之外，两种配置下都安全。
//
// 排查命令：netsh interface ipv4 show excludedportrange protocol=tcp
const defaultDevPort = process.env.VITE_DEV_PORT || '15173'
let devServerUrl = process.env.VITE_DEV_SERVER_URL || `http://localhost:${defaultDevPort}`
let viteProcess = null
let apiChild = null  // serialServer 子进程引用
let pythonAiChild = null
let webServer = null // 打包版托管前端页面的本地 http 服务（退出时需关闭，否则端口残留导致下次白屏）
const pythonAiPort = parseInt(process.env.PYTHON_API_PORT || '18765', 10)
// vite 子进程继承 process.env，而 vite 只把 VITE_ 前缀的变量暴露给浏览器代码。
// 这样 gripPythonApi.js 的直连兜底地址能跟着实际端口走，不必写死。
process.env.VITE_PYTHON_API_PORT = String(pythonAiPort)

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const shouldOpenDevTools = process.env.OPEN_DEVTOOLS !== '0'

async function checkDevServerOnce(url, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForDevServer(url, timeoutMs = 20000) {
  const start = Date.now()
  console.log('[vite] waiting for dev server at:', url)
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkDevServerOnce(url, 1000)
    if (ok) {
      console.log('[vite] dev server is reachable at:', url)
      return true
    }
    // eslint-disable-next-line no-await-in-loop
    await wait(500)
  }
  // 如果默认端口不可达，扫描附近端口。
  // 注意：这个兜底只能救"端口被占用"（vite 遇 EADDRINUSE 会自己 +1 递增，Electron
  // 需要找到它换去了哪）。救不了 EACCES —— 那种情况 vite 是直接退出、根本没在监听，
  // 而且预留段宽达 100 个端口，+1..+20 全在同一段里。EACCES 只能靠换到安全区间解决。
  const basePort = parseInt(new URL(url).port, 10) || 15173
  console.log('[vite] default port not reachable, scanning ports', basePort, '-', basePort + 20)
  for (let p = basePort + 1; p <= basePort + 20; p++) {
    const tryUrl = url.replace(':' + basePort, ':' + p)
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkDevServerOnce(tryUrl, 500)
    if (ok) {
      console.log('[vite] found dev server at port:', p)
      devServerUrl = tryUrl
      return true
    }
  }
  console.log('[vite] dev server not found on any port')
  return false
}

async function checkPythonAiOnce(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${pythonAiPort}/health`, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForPythonAi(timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkPythonAiOnce(1000)
    if (ok) return true
    // eslint-disable-next-line no-await-in-loop
    await wait(500)
  }
  return false
}

// vite 三次尝试中捕获到的端口级失败原因（'EACCES' | 'EADDRINUSE' | null）
let viteFatalHint = null

function startViteDevServer() {
  if (viteProcess) return Promise.resolve()
  viteFatalHint = null

  // 前端项目在 front-end 目录
  const clientDir = path.join(__dirname, '..', '..', 'front-end')
  console.log('[vite] frontend dir:', clientDir)
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const viteArgs = ['run', 'dev', '--', '--port', defaultDevPort]
  const viteBin = path.join(
    clientDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite'
  )

  // 所有 spawn 策略统一使用 shell: true 以兼容 Windows
  const attempts = [
    () => {
      console.log('[vite] attempt 1: npm run dev (shell)')
      return spawn(npmCmd, viteArgs, { cwd: clientDir, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
    },
    () => {
      if (!fs.existsSync(viteBin)) return null
      console.log('[vite] attempt 2: direct vite bin')
      return spawn(viteBin, ['--port', defaultDevPort], { cwd: clientDir, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
    },
    () => {
      // 最后兜底：用 npx vite
      console.log('[vite] attempt 3: npx vite')
      const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
      return spawn(npxCmd, ['vite', '--port', defaultDevPort], { cwd: clientDir, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
    }
  ]

  return new Promise((resolve) => {
    let settled = false
    let attemptIndex = 0

    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    const startAttempt = () => {
      let child
      try {
        child = attempts[attemptIndex]()
        if (!child) throw new Error('vite spawn skipped')
      } catch (err) {
        console.log('[vite] spawn throw:', err.message)
        if (attemptIndex + 1 < attempts.length) {
          attemptIndex += 1
          startAttempt()
          return
        }
        finish()
        return
      }

      viteProcess = child
      let timer = null

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        child?.stdout?.off('data', onData)
        child?.stderr?.off('data', onData)
        child?.off('error', onError)
        child?.off('exit', onExit)
      }

      const ready = () => {
        cleanup()
        console.log('[vite] ready, devServerUrl =', devServerUrl)
        finish()
      }

      const onData = (chunk) => {
        const text = chunk.toString()
        if (text && text.trim()) {
          process.stdout.write(`[vite] ${text}`)
        }
        // 记下端口级失败，供失败页显示真实原因（否则只会提示"请运行 npm run start"，
        // 而 EACCES 时怎么运行都没用，反而把人带偏）
        if (/EACCES/.test(text)) {
          viteFatalHint = 'EACCES'
        } else if (/EADDRINUSE/.test(text)) {
          viteFatalHint = 'EADDRINUSE'
        }
        const localMatch =
          text.match(/https?:\/\/localhost:(\d+)/i) ||
          text.match(/https?:\/\/127\.0\.0\.1:(\d+)/i) ||
          text.match(/https?:\/\/\[::1\]:(\d+)/i)
        const anyMatch = text.match(/https?:\/\/[^\s]+/i)
        if (localMatch) {
          devServerUrl = localMatch[0]
          ready()
          return
        }
        if (anyMatch && text.includes('Local')) {
          devServerUrl = anyMatch[0]
          ready()
          return
        }
        if (text.includes('ready in')) {
          ready()
        }
      }

      const onError = (err) => {
        cleanup()
        console.log('[vite] start error:', err.message)
        if (attemptIndex + 1 < attempts.length) {
          attemptIndex += 1
          startAttempt()
          return
        }
        viteProcess = null
        finish()
      }

      const onExit = (code, signal) => {
        cleanup()
        if (!settled) {
          console.log(`[vite] exited: code=${code} signal=${signal}`)
        }
        if (code !== 0 && attemptIndex + 1 < attempts.length) {
          attemptIndex += 1
          startAttempt()
          return
        }
        if (code !== 0) {
          viteProcess = null
        }
        finish()
      }

      timer = setTimeout(ready, 15000)

      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)
      child.on('error', onError)
      child.on('exit', onExit)
    }

    startAttempt()
  })
}

function openWeb({ hostname, port, fn, webRoot }) {
  const server = http.createServer((req, res) => {
    const rawUrl = req.url || '/'
    const pathname = rawUrl.split('?')[0] || '/'
    const isRoot = pathname === '/'
    const targetPath = isRoot ? 'index.html' : pathname
    const filePath = path.join(webRoot, targetPath)

    fs.readFile(filePath, (err, data) => {
      if (!err) {
        res.statusCode = 200
        res.setHeader('Content-Type', getContentType(filePath))
        res.end(data)
        return
      }

      // SPA fallback: return index.html for non-asset routes
      if (path.extname(pathname) === '') {
        const indexPath = path.join(webRoot, 'index.html')
        fs.readFile(indexPath, (indexErr, indexData) => {
          if (indexErr) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'text/plain')
            res.end('Internal Server Error')
            return
          }
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html')
          res.end(indexData)
        })
        return
      }

      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain')
      res.end('Not Found')
    })
  });

  // ⚠️ 白屏防护：端口被占用（上次未退干净 / 多开实例 / 被其他软件占用）时，
  // listen 回调永不触发 → 窗口永远不 loadURL → 纯白屏。
  // 因此必须处理 error：EADDRINUSE 自动换端口重试，并把实际端口回传给 fn。
  const MAX_PORT_TRIES = 20
  let tryPort = port

  const attachErrorHandler = () => {
    server.removeAllListeners('error')
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE' && tryPort - port < MAX_PORT_TRIES) {
        tryPort += 1
        console.warn(`[web] 端口 ${tryPort - 1} 被占用，改用 ${tryPort} 重试`)
        listenOnce()
        return
      }
      console.error('[web] 本地页面服务启动失败:', err)
      // 兜底：直接从磁盘加载 index.html，避免白屏（SPA 路由用 hash 兜底）
      try {
        const indexPath = path.join(webRoot, 'index.html')
        if (fs.existsSync(indexPath) && typeof fn === 'function') {
          fn(null, indexPath)
        }
      } catch (e) {
        console.error('[web] 兜底加载 index.html 也失败:', e)
      }
    })
  }

  const listenOnce = () => {
    attachErrorHandler()
    server.listen(tryPort, hostname, () => {
      console.log(`[web] 本地页面服务已启动: http://${hostname}:${tryPort}`)
      fn(tryPort)
    })
  }

  listenOnce()
  webServer = server

  function getContentType(filePath) {
    const extname = path.extname(filePath);
    switch (extname) {
      case '.html':
        return 'text/html';
      case '.css':
        return 'text/css';
      case '.js':
        return 'text/javascript';
      case '.json':
        return 'application/json';
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.woff2':
        return 'font/woff2';
      default:
        return 'text/plain';
    }
  }
}
function startApiChild() {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, './server/serialServer.js'), {
      silent: false,
      env: {
        ...process.env,
        isPackaged: isPackaged,
        appPath: app.getAppPath(),
        userData: app.getPath('userData'),
        resourcesPath: process.resourcesPath
      }
    })
    apiChild = child  // 保存引用以便退出时清理

    const readyTimer = setTimeout(() => {
      reject(new Error('API child not ready in time'));
    }, 15000);

    child.on('message', (msg) => {
      if (msg.type === 'ready') {
        clearTimeout(readyTimer);
        apiPort = msg.port;
        console.log(`[backend] serialServer ready on port ${msg.port}`);
        resolve(msg.port);
      } else if (msg?.type === 'error') {
        clearTimeout(readyTimer);
        console.error('[backend] serialServer error message:', msg);
        reject(new Error(`API child error: ${msg.code || ''} ${msg.message || ''}`));
      }
    })

    child.on('exit', (code, signal) => {
      // 如果需要可在这里做自动重启
      console.log(`API child exited: code=${code} signal=${signal}`);
    });
  })
}

// const child1 = fork(path.join(__dirname, './pyWorker.js'), {
//   env: {
//     isPackaged: isPackaged,
//     appPath: app.getAppPath()
//   }
// })

const createWindow = async () => {
  const win = new BrowserWindow({
    // width: 800,
    // height: 600,
    fullscreen: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true
    },

    icon: path.join(__dirname, 'logo.ico')

  })
  
  // win.maximize()
  if (shouldOpenDevTools) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  // ⚠️ 白屏防护：页面加载失败时自动重试（最多 5 次，每次间隔 1.5s）。
  // 覆盖"页面服务比窗口晚就绪""dev server 重启"等竞态导致的空白页面。
  let reloadTries = 0
  win.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return // -3 = ERR_ABORTED（正常的导航取消）
    console.error(`[window] 页面加载失败(${errorCode} ${errorDesc}): ${validatedURL}`)
    if (reloadTries < 5) {
      reloadTries += 1
      setTimeout(() => {
        if (!win.isDestroyed()) {
          console.log(`[window] 第 ${reloadTries} 次重试加载: ${validatedURL}`)
          win.webContents.reload()
        }
      }, 1500)
    }
  })
  win.webContents.on('did-finish-load', () => { reloadTries = 0 })
  // 渲染进程崩溃（如内存耗尽）后自动恢复，而不是留下白屏
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[window] 渲染进程异常退出:', details?.reason)
    if (!win.isDestroyed() && details?.reason !== 'clean-exit') {
      setTimeout(() => { if (!win.isDestroyed()) win.webContents.reload() }, 1000)
    }
  })

  const hostname = "127.0.0.1";
  const port = 22999; // 原为 2999，落在 winnat 抢占区（1024-15000）内，见文件顶部端口说明


  // win.loadURL('http://sensor.bodyta.com/4096')

  // win.loadURL('https://sensor.bodyta.com/jqtools2')

  // openWeb 会回传实际监听到的端口（可能因占用而顺延）；端口不可用时回传 fallbackFile 兜底
  function fn(actualPort, fallbackFile) {
    if (actualPort) {
      win.loadURL(`http://${hostname}:${actualPort}`)
    } else if (fallbackFile) {
      console.warn('[window] 退回 file:// 加载:', fallbackFile)
      win.loadFile(fallbackFile)
    }
  }

  if (!isPackaged) {
    console.log('[window] checking dev server first:', devServerUrl)
    let ok = await waitForDevServer(devServerUrl, 3000)
    if (!ok) {
      console.log('[window] starting vite dev server...')
      await startViteDevServer()
      console.log('[window] vite started, devServerUrl =', devServerUrl)
      ok = await waitForDevServer(devServerUrl, 20000)
    }
    console.log('[window] waitForDevServer result:', ok, 'url:', devServerUrl)
    if (!ok) {
      const safeUrl = devServerUrl
      const failedPort = (() => {
        try { return new URL(safeUrl).port || defaultDevPort } catch { return defaultDevPort }
      })()
      let diagnosis
      if (viteFatalHint === 'EACCES') {
        // 最常见也最容易误诊的一种：端口被 Windows 内核预留，任何程序都 bind 不了
        diagnosis =
          `原因：端口 ${failedPort} 被 Windows 内核预留了（listen 报 EACCES）。\n` +
          `这不是"端口被占用"——该端口上没有任何进程，是 winnat（Hyper-V/WSL2/Docker 的 NAT）\n` +
          `从 TCP 动态端口范围里抢占了一整段，段内谁都 bind 不了，且每次开机抢的位置会漂移。\n\n` +
          `排查：在 PowerShell 执行\n` +
          `    netsh interface ipv4 show excludedportrange protocol=tcp\n` +
          `若 ${failedPort} 落在某个 Start-End 区间内，即为此原因。\n\n` +
          `解决：换一个不在抢占区的端口重启，例如\n` +
          `    set VITE_DEV_PORT=15173 && npm start\n` +
          `（注意：重跑 npm run start 无效，换端口才有用）`
      } else if (viteFatalHint === 'EADDRINUSE') {
        diagnosis =
          `原因：端口 ${failedPort} 已被其他进程占用（EADDRINUSE）。\n\n` +
          `排查：netstat -ano | findstr :${failedPort}  找到占用进程后关闭它，\n` +
          `或换端口启动：set VITE_DEV_PORT=15173 && npm start`
      } else {
        diagnosis =
          `vite 没有成功启动，且未捕获到端口级错误。\n` +
          `请查看本窗口启动终端里 [vite] 开头的日志定位原因。`
      }
      const msg = encodeURIComponent(
        `无法连接 Vite 开发服务器：${safeUrl}\n\n${diagnosis}\n`
      )
      win.loadURL(`data:text/plain;charset=utf-8,${msg}`)

      const retryTimer = setInterval(async () => {
        const alive = await checkDevServerOnce(devServerUrl, 1000)
        if (alive) {
          clearInterval(retryTimer)
          win.loadURL(devServerUrl)
        }
      }, 2000)
      win.on('closed', () => clearInterval(retryTimer))
      return
    }
    win.loadURL(devServerUrl)
    return
  }

  if (!fs.existsSync(path.join(webRoot, 'index.html'))) {
    console.log(`[web] index.html not found: ${webRoot}`)
  }

  openWeb({ hostname, port, fn, webRoot })
}







function pyBin() {
  const isDev = !app.isPackaged
  if (process.platform === 'win32') {
    return isDev
      ? path.join(__dirname, 'python', 'venv', 'Scripts', 'python.exe')
      : path.join(process.resourcesPath, 'python', 'venv', 'Scripts', 'python.exe')
  } else {
    return isDev
      ? path.join(__dirname, 'python', 'venv', 'bin', 'python')
      : path.join(process.resourcesPath, 'python', 'venv', 'bin', 'python')
  }
}
function apiPy() {
  const isDev = !app.isPackaged
  return isDev
    ? path.join(__dirname, 'python', 'app', 'api.py')
    : path.join(process.resourcesPath, 'python', 'app', 'api.py')
}

function pyAiBin() {
  const isDev = !app.isPackaged
  const candidates = process.platform === 'win32'
    ? [
        isDev
          ? path.join(__dirname, 'python', 'venv', 'Scripts', 'python.exe')
          : path.join(process.resourcesPath, 'python', 'venv', 'Scripts', 'python.exe'),
        'python',
        'py'
      ]
    : [
        isDev
          ? path.join(__dirname, 'python', 'venv', 'bin', 'python')
          : path.join(process.resourcesPath, 'python', 'venv', 'bin', 'python'),
        isDev
          ? path.join(__dirname, 'python', 'venv', 'bin', 'python3')
          : path.join(process.resourcesPath, 'python', 'venv', 'bin', 'python3'),
        'python3',
        'python'
      ]

  return candidates.find((candidate) => !candidate.includes(path.sep) || fs.existsSync(candidate))
}

function aiApiPy() {
  const isDev = !app.isPackaged
  return isDev
    ? path.join(__dirname, 'python', 'app', 'algorithms', 'api_server.py')
    : path.join(process.resourcesPath, 'python', 'app', 'algorithms', 'api_server.py')
}

function aiRequirementsPath() {
  const isDev = !app.isPackaged
  return isDev
    ? path.join(__dirname, 'python', 'requirements-electron.txt')
    : path.join(process.resourcesPath, 'python', 'requirements-electron.txt')
}

function checkPythonAiDeps(pythonBin) {
  if (!pythonBin) {
    return { ok: false, reason: 'Python runtime not found' }
  }

  const probeCode = [
    'import fastapi',
    'import uvicorn',
    'import numpy',
    'import pydantic',
    'import matplotlib',
    'import pandas',
    'import cv2',
    'import scipy',
    'import skimage',
    'from PIL import Image',
  ].join('; ')

  try {
    const result = spawnSync(pythonBin, ['-c', probeCode], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      encoding: 'utf8',
    })

    if (result.status === 0) {
      return { ok: true }
    }

    const detail = (result.stderr || result.stdout || '').trim() || `exit ${result.status}`
    return { ok: false, reason: detail }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

async function startPythonAiChild() {
  if (await checkPythonAiOnce(1000)) {
    console.log(`[pyai] Python AI service already running on port ${pythonAiPort}`)
    return
  }

  if (pythonAiChild && !pythonAiChild.killed) {
    const ok = await waitForPythonAi(5000)
    if (ok) return
  }

  const pythonBin = pyAiBin()
  const scriptPath = aiApiPy()

  if (!pythonBin) {
    throw new Error('Python runtime not found for AI service')
  }
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`AI api server not found: ${scriptPath}`)
  }

  const depsCheck = checkPythonAiDeps(pythonBin)
  if (!depsCheck.ok) {
    const requirementsPath = aiRequirementsPath()
    const installHint = fs.existsSync(requirementsPath)
      ? `Install Python deps with: ${pythonBin} -m pip install -r "${requirementsPath}"`
      : 'Install the Python AI dependencies before starting the packaged app'
    throw new Error(`Python AI dependencies missing: ${depsCheck.reason}. ${installHint}`)
  }

  console.log(`[pyai] starting AI service with ${pythonBin}`)
  console.log(`[pyai] script path: ${scriptPath}`)

  const child = spawn(pythonBin, [scriptPath], {
    cwd: path.dirname(scriptPath),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHON_API_PORT: String(pythonAiPort)
    },
    shell: false,
    windowsHide: true
  })

  pythonAiChild = child

  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString()
    if (text && text.trim()) {
      process.stdout.write(`[pyai] ${text}`)
    }
  })

  child.stderr?.on('data', (chunk) => {
    const text = chunk.toString()
    if (text && text.trim()) {
      process.stderr.write(`[pyai] ${text}`)
    }
  })

  child.on('error', (err) => {
    console.error('[pyai] start error:', err.message)
  })

  child.on('exit', (code, signal) => {
    console.log(`[pyai] exited: code=${code} signal=${signal}`)
    if (pythonAiChild === child) {
      pythonAiChild = null
    }
  })

  const ok = await waitForPythonAi(15000)
  if (!ok) {
    throw new Error(`Python AI service did not become ready on port ${pythonAiPort}`)
  }

  console.log(`[pyai] ready on http://127.0.0.1:${pythonAiPort}`)
}

/** 主进程里直接像调用函数一样用 */
// function callPy(fn, args) {
//   return new Promise((resolve, reject) => {
//     const child = spawn(pyBin(), [apiPy()], {
//       stdio: ['pipe', 'pipe', 'pipe'],
//       env: { ...process.env, PYTHONUNBUFFERED: '1' }
//     })
//     let out = '', err = ''
//     child.stdout.on('data', d => (out += d.toString()))
//     child.stderr.on('data', d => (err += d.toString()))
//     child.on('error', e => reject(new Error('spawn error: ' + e.message)))
//     child.on('close', code => {
//       if (code !== 0) return reject(new Error(`Python exit ${code}\n${err}`))
//       try {
//         const last = (out.trim().split(/\r?\n/).pop() || '{}')
//         // console.log(last, 'last')
//         const res = JSON.parse(last)
//         if (res.ok) resolve(res.data)
//         else reject(new Error(res.error + '\n' + (res.trace || '')))
//       } catch (e) {
//         reject(new Error('Parse fail: ' + e.message + '\nraw: ' + out))
//       }
//     })
//     child.stdin.write(JSON.stringify({ fn, args }) + '\n')
//     child.stdin.end()
//   })
// }

let py = null;
let buf = '';
const pending = new Map();

// function startPy() {
//   py = spawn(pyBin(), [apiPy()], { stdio: ['pipe','pipe','pipe'] });
//   py.stdout.on('data', d => {
//     buf += d.toString();
//     const lines = buf.split(/\r?\n/); buf = lines.pop() || '';
//     for (const line of lines) {
//       if (!line.trim()) continue;
//       const msg = JSON.parse(line);
//       const cb = pending.get(msg.id);
//       if (cb) { pending.delete(msg.id); cb(msg.data); }
//     }
//   });
//   py.stderr.on('data', d => console.error('[PY]', d.toString()));
//   py.on('exit', ()=>{ py=null; setTimeout(startPy, 300); });
// }

// function callPy(fn, args) {
//   if (!py) startPy();
//   const id = Math.random().toString(36).slice(2);
//   return new Promise(resolve => {
//     pending.set(id, resolve);
//     py?.stdin.write(JSON.stringify({ id, fn, args }) + '\n');
//   });
// }


// child.on('message', (msg) => {
//   console.log('主线程', msg)
// })

function startServerProcess() {

}

/* ═══════════════════════════════════════════
   报告 PDF 导出（Chromium 原生打印）
   ───────────────────────────────────────────
   走 webContents.printToPDF：由 Chromium 自己的排版引擎出 PDF，所以
   文字是矢量的（可选中、可搜索、放大不糊）、字体内嵌、@media print 和
   break-inside 生效、CSS zoom 正确参与排版。

   为什么不用前端原来的 html2canvas + jsPDF（lib/pdfExport.jsx）：那条路是
   用 JS 重新实现一套 CSS 子集、把页面截成位图再贴进 PDF。0810 报告交付包
   大量用了 zoom（步态 1440×0.8333、起坐内容 1.1833）、渐变画布和
   material-symbols 图标字体 —— 位图路线会错算 zoom、丢渐变、图标渲染成豆腐块，
   而且分页得手算切画布。那套仍保留给综合报告和旧版报告组件用，没有删。

   ⚠️ printBackground 必须为 true。关掉的话所有卡片底色、渐变画布、
      能力色胶片全部消失，导出来只剩黑字白纸。

   缩放比 scale 由渲染进程算好传进来：交付包五个页面都是 1200 CSS px 宽的固定
   设计稿，而 A4 一页装不下 1200px，Chromium 的 printToPDF 不会自动"适应页宽"
   （超宽内容直接横向裁掉），所以必须显式给 scale。
   ═══════════════════════════════════════════ */
let reportPrintIpcRegistered = false
const registerReportPrintIpcHandlers = () => {
  // 幂等：兜底建窗路径也会调一次，ipcMain.handle 同名重复注册会抛
  if (reportPrintIpcRegistered) return
  reportPrintIpcRegistered = true

  ipcMain.handle('report:print-to-pdf', async (event, options = {}) => {
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)
    const {
      fileName = 'report',
      title = '评估报告',
      landscape = false,
      scale = 1,
      marginMm = 8,
    } = options || {}

    // 文件名里会带患者姓名，Windows 下 \ / : * ? " < > | 会让保存直接失败，先消毒
    const safeName = String(fileName).replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim().slice(0, 120) || 'report'
    // Electron 的 margins 单位是英寸
    const marginInch = Math.max(0, Number(marginMm) || 0) / 25.4
    // printToPDF 的 scale 合法区间是 0.1 ~ 2
    const safeScale = Math.min(2, Math.max(0.1, Number(scale) || 1))

    try {
      // 先问存哪：用户取消就不用白跑一次整页渲染
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: `${title} —— 导出 PDF`,
        defaultPath: path.join(app.getPath('documents'), `${safeName}.pdf`),
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      })
      if (canceled || !filePath) return { ok: false, canceled: true }

      const pdf = await webContents.printToPDF({
        printBackground: true,
        landscape: !!landscape,
        pageSize: 'A4',
        margins: { top: marginInch, bottom: marginInch, left: marginInch, right: marginInch },
        scale: safeScale,
        // false = 用上面 JS 传的 pageSize/margins；CSS 里的 @page size 只留给
        // 浏览器里 window.print() 的兜底路径用
        preferCSSPageSize: false,
      })

      await fs.promises.writeFile(filePath, pdf)
      console.log(`[print] PDF 已保存: ${filePath} (${(pdf.length / 1024).toFixed(0)}KB, scale=${safeScale})`)
      return { ok: true, filePath }
    } catch (err) {
      console.error('[print] PDF 导出失败:', err)
      return { ok: false, error: err?.message || String(err) }
    }
  })
}

// 调用你的函数（示例）
// async function demo(matrix) {
//   // 构造一条 1024 长度的测试数据

//   // console.log(matrix)
//   // const data = new Array(10).fill(new Array(1024).fill(50)); // 可以放多条
//   // const res = await callPy('cal_cop_fromData', { data : matrix });
//   const res = await callPy('cal_cop_fromData', { data: matrix });
//   console.log(res);
//   console.log('结果:', res, new Date().getTime()); // { left: [...], right: [...] }
// }

app.whenReady().then(async () => {
  // ⚠️ 白屏防护：createWindow() 之前的任何一步抛异常/挂起，都会导致窗口永不创建（表现为白屏）。
  // 因此启动阶段的所有前置步骤都必须容错，绝不让它们阻断建窗。
  try {
    const uuid = await getHardwareFingerprint()
    const dateKey = await getKeyfromWinuuid(uuid)
    console.log(uuid, dateKey)
  } catch (err) {
    console.warn('[startup] 硬件指纹/授权校验失败，继续启动:', err?.message)
  }

  // 开始本地api线程（startApiChild 有 15s 超时会 reject；端口被上次残留进程占用时必然触发。
  // 这里必须捕获：后端起不来也要把界面打开，让用户看到"设备未连接"而不是白屏。）
  try {
    await startApiChild()
  } catch (err) {
    console.error('[backend] serialServer 启动失败，界面仍会打开（设备相关功能不可用）:', err?.message)
  }
  try {
    await startPythonAiChild()
  } catch (err) {
    console.warn('[pyai] AI service unavailable, continuing without AI report generation:', err.message)
  }
  // 开启python线程
  // startWorker(); // [已迁移到JS算法] Python子进程不再需要
  await createWindow()

  Menu.setApplicationMenu(null);
  registerUpdaterIpcHandlers()
  registerReportPrintIpcHandlers()

  // 初始化自动更新（仅在打包后的生产环境启用）
  if (isPackaged) {
    const allWindows = BrowserWindow.getAllWindows()
    if (allWindows.length > 0) {
      initAutoUpdater(allWindows[0])
    }
  } else {
    console.log('[updater] 开发模式，跳过自动更新初始化')
  }

  // const data1 = await getCsvData('D:/jqtoolsWin - 副本/python/app/静态数据集1.csv')

  // const matrix = data1.map((a) => JSON.parse(a.data))

  // try {
  //   console.log('setTimeout')
  //   const data = await callPy('getData', { data: new Array(1024).fill(20)})

  //   //  {
  //   //   'frameData': new Array(1024).fill(0),
  //   //   'tim': new Date().getTime() % 1000,
  //   //   'threshold_factor': 25,
  //   //   'continuous_on_bed_duration_minutes': 1.0,
  //   //   'unlock_sitting_alarm_duration_minutes': 1.0,
  //   //   'unlock_falling_alarm_duration_minutes': 1.0,
  //   //   'sosPeakThreshold': 25.0,
  //   //   'points_threshold_in': 3.0
  //   // }
  //   console.log(data, 'data')
  // }
  // catch (e) {
  //   console.error('[PY ERROR]', e)
  // }


  // try {
  //   const r1 = await callPy('cal_cop_fromData', {data : new Array(10).fill(new Array(1024).fill(0))})
  //   // const r2 = await callPy('add_and_scale', { a: 1, b: 2, scale: 10 })
  //   console.log('[PY] add =>', r1)
  //   console.log('[PY] add_and_scale =>', r2)
  // } catch (e) {
  //   console.error('[PY ERROR]', e)
  // }
  // try {
  //   const a = await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  //   await demo(matrix)
  // } catch (e) {
  //   console.log(e)
  // }
}).catch(async (err) => {
  // ⚠️ 白屏最后兜底：启动流程无论出什么问题，都要保证有一个可见窗口
  console.error('[startup] 启动流程异常，尝试兜底创建窗口:', err)
  try {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
      Menu.setApplicationMenu(null)
      // 兜底窗口里报告 PDF 导出也要能用
      registerReportPrintIpcHandlers()
    }
  } catch (e) {
    console.error('[startup] 兜底创建窗口失败:', e)
  }
})

// 进程级兜底：未捕获异常不要直接带走整个应用（否则表现为闪退或白屏）
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason)
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  // 清理自动更新定时器
  cleanupUpdater()
  // 关闭托管前端页面的本地 http 服务，避免端口残留导致下次启动白屏
  if (webServer) {
    try { webServer.close() } catch (e) { console.warn('[web] 关闭页面服务失败:', e?.message) }
    webServer = null
  }
  // 清理 Vite 开发服务器子进程
  if (viteProcess) {
    viteProcess.kill()
    viteProcess = null
  }
  // 清理 serialServer 子进程（占用端口 19245 + 19999）
  if (apiChild) {
    apiChild.kill()
    apiChild = null
  }
  if (pythonAiChild) {
    pythonAiChild.kill()
    pythonAiChild = null
  }
})

// 兜底：确保进程退出时强制清理所有子进程
app.on('will-quit', () => {
  if (apiChild && !apiChild.killed) {
    apiChild.kill('SIGKILL')
    apiChild = null
  }
  if (viteProcess && !viteProcess.killed) {
    viteProcess.kill('SIGKILL')
    viteProcess = null
  }
  if (pythonAiChild && !pythonAiChild.killed) {
    pythonAiChild.kill('SIGKILL')
    pythonAiChild = null
  }
})
