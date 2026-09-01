import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildOverviewRoute } from '../../health-overview/utils/reportRoute';

export function GaitReportState({ status, error, onRetry, recordId }) {
  if (status === 'loading') {
    return <p role="status">正在加载步态报告</p>;
  }

  if (status === 'empty') {
    return (
      <section className="gait-report__page-state">
        <h1>未找到步态评估报告</h1>
        <p>本次记录没有可用的步态详细数据。</p>
        <Link to={buildOverviewRoute(recordId)}>
          <ArrowLeft aria-hidden="true" size={18} />
          <span>返回健康总报告</span>
        </Link>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="gait-report__page-state">
        <p role="alert">加载步态报告失败{error?.message ? `：${error.message}` : ''}</p>
        <button type="button" onClick={onRetry}>重新加载</button>
      </section>
    );
  }

  return null;
}
