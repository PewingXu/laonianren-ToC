import { Hand } from 'lucide-react';

export function GripDifferenceRing({ metric }) {
  const progress = metric.chartValue ?? 0;

  return (
    <div className="grip-report__difference-ring" role="img" aria-label="左右手握力差异">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--grip-line)" strokeWidth="2" />
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          pathLength="100"
          stroke="var(--grip-orange)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${100 - progress}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      {/*
        每只手一列：图标 / 「左手」/「243.36 N」三行纵向排列。
        原实现是 grid-template-columns: auto auto，四个子元素（svg、文字、b、small）
        自动流成三行，单位 N 被挤到第三行、内容溢出 128px 的圆环，
        表现为数字和环线叠在一起。这里改成显式的纵向结构，数值与单位同一行不换行。
      */}
      <div className="grip-report__difference-content">
        <div className="grip-report__hand-values">
          <span>
            <Hand aria-hidden="true" />
            <em>左手</em>
            <b>{metric.leftForce ?? '--'}<small>{metric.forceUnit}</small></b>
          </span>
          <span>
            <Hand aria-hidden="true" />
            <em>右手</em>
            <b>{metric.rightForce ?? '--'}<small>{metric.forceUnit}</small></b>
          </span>
        </div>
        <p>差异<b>{metric.value ?? '--'}</b><span>%</span></p>
      </div>
    </div>
  );
}
