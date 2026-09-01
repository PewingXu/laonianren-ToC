import { ArrowLeft, CalendarDays, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildOverviewRoute } from '../../health-overview/utils/reportRoute';

export function StandingReportHeader({ recordId, recordedAt, onShare, onShowDate }) {
  return (
    <header className="standing-report__header">
      <div className="standing-report__header-leading">
        <Link
          className="standing-report__icon-button"
          to={buildOverviewRoute(recordId)}
          aria-label="返回总报告"
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <div className="standing-report__title-group">
          <h1>站立能力详细报告</h1>
          <p>检测时间：{recordedAt}</p>
        </div>
      </div>
      <div className="standing-report__header-actions">
        <button className="standing-report__share-button" type="button" onClick={onShare}>
          <Share2 aria-hidden="true" />
          <span>分享给家人</span>
        </button>
        <button
          className="standing-report__icon-button"
          type="button"
          aria-label="查看检测日期"
          onClick={onShowDate}
        >
          <CalendarDays aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
