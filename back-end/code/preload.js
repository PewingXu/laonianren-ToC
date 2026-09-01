// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPath: (file) => file.path,

  // ====== 自动更新 API ======
  // 检查更新
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  // 下载更新
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  // 安装更新并重启
  installUpdate: () => ipcRenderer.invoke('install-update'),
  // 获取当前版本信息
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // 监听更新状态
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('update-status', handler)
    // 返回取消监听函数
    return () => ipcRenderer.removeListener('update-status', handler)
  },

  // ====== 报告 PDF 导出（Chromium 原生打印）======
  // 主进程调 webContents.printToPDF 出矢量 PDF（文字可选可搜、字体内嵌），
  // 再用系统保存对话框让用户选存哪。不走 html2canvas 位图截图。
  // 前端在 lib/reportPdf.jsx 里调用；渲染进程只负责标记打印范围和算缩放比。
  // 返回 { ok, filePath } / { ok:false, canceled:true } / { ok:false, error }
  printReportToPdf: (options) => ipcRenderer.invoke('report:print-to-pdf', options)
});
