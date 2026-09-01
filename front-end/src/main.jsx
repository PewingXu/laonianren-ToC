import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// ── 0810 报告交付包样式（src/reports-v2/）──
// 必须在 index.css 之后引入：index.css 是唯一的 Tailwind 入口，报告样式属于其上的增量。
// 各报告 CSS 自身已用 body:has(.xxx-report) 条件作用域，只在对应报告页生效。
// embedded.css 放在最后，靠顺序覆盖交付包中与外壳冲突的布局规则。
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/be-vietnam-pro/700.css'
import 'material-symbols/outlined.css'
import './reports-v2/styles/globals.css'
import './reports-v2/styles/health-overview.css'
import './reports-v2/styles/grip-report.css'
import './reports-v2/styles/sit-stand-report.css'
import './reports-v2/styles/standing-report.css'
import './reports-v2/styles/gait-report.css'
import './reports-v2/styles/embedded.css'
// 打印/PDF 导出样式，必须最后引入：它要覆盖上面所有文件里的 vh、overflow、固定高度
import './reports-v2/styles/print.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* ErrorBoundary 放在最外层：任何渲染异常都显示错误页与恢复入口，而不是白屏 */}
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
