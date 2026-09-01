import React from 'react';

/**
 * 全局错误边界
 * ---------------------------------------------------------------
 * 没有它时，任意一处渲染异常都会让整棵 React 树卸载，页面变成纯白（用户只看到白屏，
 * 无任何提示，也无法自行恢复）。这里兜住异常并给出可操作的恢复入口。
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 打到控制台便于排查（Electron 里可在 DevTools 看到）
    console.error('[ErrorBoundary] 渲染异常:', error, info?.componentStack);
    this.setState({ info });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    // 用 hash/pathname 直接跳，避免依赖 router 上下文（此时上下文可能已损坏）
    window.location.href = '/';
  };

  handleClearAndReload = () => {
    // 历史记录数据损坏是白屏的常见诱因，提供一键清理入口（仅清本机缓存数据，不动数据库）
    if (!window.confirm('将清空本机的历史记录缓存与排名统计（不影响已保存的采集数据库），确定继续？')) return;
    try {
      localStorage.removeItem('sarcopenia_assessment_history');
      localStorage.removeItem('sarcopenia_score_distribution');
    } catch (e) {
      console.error('清理本机缓存失败:', e);
    }
    window.location.reload();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#F5F6F8', padding: 24, boxSizing: 'border-box',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}>
        <div style={{
          maxWidth: 680, width: '100%', background: '#FFFFFF', borderRadius: 14,
          border: '1px solid #E8ECF0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', padding: 28,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 10, background: '#FEF2F2', color: '#DC2626',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700,
            }}>!</span>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>页面出现异常</h1>
          </div>
          <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.7, margin: '0 0 16px' }}>
            界面渲染时发生错误，已阻止页面变为空白。可先点「重新加载」；若反复出现，
            多数是本机历史记录缓存数据异常，可尝试「清理缓存并重载」。
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
            <button onClick={this.handleReload} style={btnPrimary}>重新加载</button>
            <button onClick={this.handleGoHome} style={btnSecondary}>返回首页</button>
            <button onClick={this.handleClearAndReload} style={btnDanger}>清理缓存并重载</button>
          </div>

          <details style={{ fontSize: 12, color: '#8896A6' }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none' }}>技术细节（反馈问题时请截图此处）</summary>
            <pre style={{
              marginTop: 10, padding: 12, background: '#FAFBFC', border: '1px solid #E8ECF0',
              borderRadius: 8, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', fontSize: 11, lineHeight: 1.6, color: '#4A5568',
            }}>
              {String(error?.stack || error?.message || error)}
              {info?.componentStack ? `\n\n组件栈：${info.componentStack}` : ''}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}

const btnBase = {
  padding: '10px 20px', fontSize: 14, fontWeight: 600, borderRadius: 10,
  cursor: 'pointer', border: 'none',
};
const btnPrimary = { ...btnBase, background: '#0066CC', color: '#fff' };
const btnSecondary = { ...btnBase, background: '#fff', color: '#4A5568', border: '1px solid #D1D9E0' };
const btnDanger = { ...btnBase, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' };
