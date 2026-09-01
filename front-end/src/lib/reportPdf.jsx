import React from 'react';

/**
 * 报告 PDF 导出 —— Chromium 原生打印。
 *
 * 与 lib/pdfExport.jsx（html2canvas + jsPDF）的区别，也是这里另起一个文件的原因：
 *
 *   html2canvas 是用 JS 重新实现了一套 CSS 子集、把页面画成位图再贴进 PDF。
 *   0810 报告交付包大量用了 CSS zoom（步态 1440×0.8333、总览 0.8333、起坐内容 1.1833）、
 *   渐变画布、material-symbols 图标字体 —— 这几样正好都是 html2canvas 的坑：
 *   zoom 算错（Chromium ≥128 的 getBoundingClientRect 含 zoom、computed length 不含，
 *   html2canvas 两者混用）、conic-gradient/filter 直接丢、图标字体渲染成豆腐块，
 *   而且分页要手算切画布。
 *
 *   Chromium 原生打印是同一套排版引擎出 PDF：矢量文字（可选中、可搜索、放大不糊）、
 *   字体内嵌、@media print 和 break-inside 生效、zoom 正确参与排版。
 *
 * pdfExport.jsx 保留不动 —— 综合报告和旧版 components/report/ 那几个组件还在用它。
 *
 * 两条落地路径：
 *   Electron  → window.electronAPI.printReportToPdf → 主进程 webContents.printToPDF
 *               + dialog.showSaveDialog，不弹打印预览，直接出文件
 *   浏览器    → window.print()，弹 Chromium 打印预览，用户自己选「另存为 PDF」
 *
 * 打印范围由 reports-v2/styles/print.css 控制：这里在调用前给 <html> 打 data-printing、
 * 给报告滚动容器打 data-print-root，print.css 里的规则全部锁在这两个标记下。
 */

/* ── A4 可用宽度（CSS px，96px/inch） ── */
const MARGIN_MM = 8;
const mmToPx = (mm) => (mm / 25.4) * 96;
const A4_PORTRAIT_CONTENT_PX = mmToPx(210 - MARGIN_MM * 2);   // ≈ 733
const A4_LANDSCAPE_CONTENT_PX = mmToPx(297 - MARGIN_MM * 2);  // ≈ 1062

/*
 * 交付包五个页面的有效排版宽度（zoom 之后）统一是 1200 CSS px：
 *   总览页  .health-overview    内容区 max-width 1440px × zoom 0.8333 = 1200
 *   步态    .gait-report        width 1440px × zoom 0.8333            = 1200
 *   握力    .grip-report        width 1200px（无 zoom）
 *   站立    .standing-report    min-width 1200px
 *   起坐    .sit-stand-report   画布 1200 档，内容区另有 zoom 1.1833
 *
 * 这里用常量而不是 getBoundingClientRect() 去量：总览页的画布是 width:100% 流式的，
 * 在 1920 宽的窗口上量到的是 1900+ 而不是设计宽 1200，缩放比会被算成 0.38 那种没法看的值。
 *
 * Chromium 的 printToPDF 不会自动「适应页宽」—— 比纸宽的内容是直接横向裁掉的，
 * 所以缩放比必须显式算出来传给主进程。
 */
const REPORT_DESIGN_WIDTH_PX = 1200;

const PRINTING_ATTR = 'data-printing';
const PRINT_ROOT_ATTR = 'data-print-root';

/** 等两帧，确保 data-printing / data-print-root 已经落到 DOM 上并完成一次样式重算 */
function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

/** 纵向/横向各自的缩放比。printToPDF 的合法区间是 0.1 ~ 2 */
export function computePrintScale(landscape) {
  const paper = landscape ? A4_LANDSCAPE_CONTENT_PX : A4_PORTRAIT_CONTENT_PX;
  const raw = paper / REPORT_DESIGN_WIDTH_PX;
  return Math.min(2, Math.max(0.1, Math.round(raw * 1000) / 1000));
}

/** 当前是否跑在 Electron 里（有主进程可用） */
export function hasNativePrint() {
  return typeof window !== 'undefined'
    && !!window.electronAPI
    && typeof window.electronAPI.printReportToPdf === 'function';
}

/**
 * 导出报告 PDF。
 *
 * @param {HTMLElement|{current: HTMLElement}} container 报告的滚动容器（宿主里那个 overflow-auto 的 <main>）
 * @param {object}  options
 * @param {string}  options.fileName  不含扩展名的文件名，主进程会做非法字符消毒
 * @param {string}  options.title     保存对话框标题
 * @param {boolean} options.landscape 横向 A4。纵向缩放比 ≈0.61（正文约 7.3pt），
 *                                    横向 ≈0.885（正文约 10.6pt）但页数多一半
 * @returns {Promise<{ok: boolean, canceled?: boolean, error?: string, native?: boolean}>}
 */
export async function exportReportPdf(container, options = {}) {
  const el = container && container.nodeType === 1 ? container : container?.current;
  if (!el) {
    console.error('[report-pdf] 找不到报告容器');
    return { ok: false, error: '找不到报告容器' };
  }

  const {
    fileName = 'report',
    title = '评估报告',
    landscape = false,
  } = options;

  const html = document.documentElement;
  // 别人可能已经在打印（理论上不会并发，但不要把别人的标记擦掉）
  const hadPrinting = html.hasAttribute(PRINTING_ATTR);
  const hadRoot = el.hasAttribute(PRINT_ROOT_ATTR);

  html.setAttribute(PRINTING_ATTR, '');
  el.setAttribute(PRINT_ROOT_ATTR, '');

  try {
    await nextFrame();
    const scale = computePrintScale(landscape);

    if (hasNativePrint()) {
      const res = await window.electronAPI.printReportToPdf({
        fileName, title, landscape, scale, marginMm: MARGIN_MM,
      });
      if (res?.canceled) return { ok: false, canceled: true, native: true };
      if (!res?.ok) throw new Error(res?.error || '主进程未返回结果');
      console.log('[report-pdf] 已保存:', res.filePath);
      return { ok: true, native: true, filePath: res.filePath };
    }

    /*
     * 浏览器 / dev 环境：没有主进程，退化到打印预览。
     * 这条路拿不到 printToPDF 的 scale 参数，靠 Chrome 打印预览默认的「适应页宽」收缩，
     * 结果和上面那条不完全一致（页边距、缩放由用户在预览里定）。
     * window.print() 在 Chromium 里是阻塞的，预览关闭后才会往下走，所以 finally 的
     * 清理时机是对的。
     */
    window.print();
    return { ok: true, native: false };
  } catch (err) {
    console.error('[report-pdf] 导出失败:', err);
    return { ok: false, error: err?.message || String(err) };
  } finally {
    if (!hadPrinting) html.removeAttribute(PRINTING_ATTR);
    if (!hadRoot) el.removeAttribute(PRINT_ROOT_ATTR);
  }
}

/**
 * 报告页导出按钮。放在各宿主的 header 里，targetRef 指向包着报告的滚动容器。
 * 配色取 0810 交付包的自然绿 #4D8D54 / #EAF3EA，与报告页同语言。
 */
export function ReportPdfButton({
  targetRef,
  fileName,
  title,
  landscape = false,
  className,
  style,
  label = '导出 PDF',
  onDone,
}) {
  const [exporting, setExporting] = React.useState(false);

  const handleClick = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await exportReportPdf(targetRef, { fileName, title, landscape });
      // 用户在保存对话框里点取消不是错误，不弹提示
      if (!res.ok && !res.canceled) {
        alert(`PDF 导出失败：${res.error || '未知错误'}`);
      }
      onDone?.(res);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={exporting}
      title={hasNativePrint() ? '用 Chromium 原生打印导出矢量 PDF（文字可选可搜）' : '打开打印预览，选「另存为 PDF」'}
      className={className || 'text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold transition-all'}
      style={style || {
        color: '#4D8D54',
        background: '#EAF3EA',
        border: '1px solid rgb(77 141 84 / 24%)',
        opacity: exporting ? 0.6 : 1,
        cursor: exporting ? 'wait' : 'pointer',
      }}
    >
      {exporting ? (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zM7 9V5a2 2 0 012-2h6a2 2 0 012 2v4" />
        </svg>
      )}
      {exporting ? '导出中...' : label}
    </button>
  );
}

/** 文件名拼装：「姓名-项目-日期」。非法字符主进程会再消毒一遍 */
export function buildReportFileName(patientName, typeLabel, dateStr) {
  return [patientName || '未知', typeLabel, dateStr]
    .filter(Boolean)
    .join('-')
    .replace(/\s+/g, '');
}
