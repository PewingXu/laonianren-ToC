import { ArrowLeft, CalendarDays, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildOverviewRoute } from '../../health-overview/utils/reportRoute';

export function SitStandReportHeader({ recordId, recordedAt, onShare, onShowDate }) {
  return (
    <header className="sit-stand-report__header">
      <Link
        className="sit-stand-report__icon-button sit-stand-report__back-button"
        to={buildOverviewRoute(recordId)}
        aria-label="返回总报告"
      >
        <ArrowLeft aria-hidden="true" />
      </Link>
      <div className="sit-stand-report__title-group">
        <h1 className="sit-stand-report__page-title">起身详细报告</h1>
        <p>检测时间：{recordedAt}</p>
      </div>
      <div className="sit-stand-report__header-actions">
        <button className="sit-stand-report__share-button" type="button" onClick={onShare}>
          <Share2 aria-hidden="true" />
          <span>分享给家人</span>
        </button>
        <button
          className="sit-stand-report__icon-button sit-stand-report__calendar-button"
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
