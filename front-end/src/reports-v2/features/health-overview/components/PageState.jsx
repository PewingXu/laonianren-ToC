import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PageState({ status, error, onRetry }) {
  if (status === 'loading') {
    return <p role="status">正在加载健康报告</p>;
  }

  if (status === 'empty') {
    return (
      <section className="health-overview__page-state health-overview__page-state--empty">
        <h1>未找到评估记录</h1>
        <p>这条评估可能已被移除，或记录编号不正确。</p>
        <Link className="health-overview__state-return" to="/">
          <ArrowLeft aria-hidden="true" size={18} />
          <span>返回示例健康报告</span>
        </Link>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <div>
        <p role="alert">加载健康报告失败{error?.message ? `：${error.message}` : ''}</p>
        <button type="button" onClick={onRetry}>重新加载</button>
      </div>
    );
  }

  return null;
}
