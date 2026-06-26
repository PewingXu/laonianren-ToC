import React, { useState, useRef } from 'react';

/**
 * 轻量悬浮提示组件：一个"?"小图标，鼠标移上去显示一个小弹窗，
 * 用于解释某个评分指标"怎么算的"。纯 CSS + state 实现，无第三方依赖。
 */
export default function InfoTooltip({ text, side = 'top', iconColor = 'var(--zeiss-blue, #0066CC)', iconOpacity = 0.75 }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  if (!text) return null;

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(true);
  };
  const hide = () => {
    timerRef.current = setTimeout(() => setOpen(false), 80);
  };

  const popStyle = {
    position: 'absolute',
    zIndex: 50,
    width: 'max-content',
    maxWidth: 280,
    padding: '8px 10px',
    borderRadius: 8,
    background: '#FFFFFF',
    border: '1px solid var(--border-light, #E5E9EF)',
    boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
    fontSize: 11,
    lineHeight: 1.6,
    color: 'var(--text-secondary, #4B5563)',
    whiteSpace: 'normal',
    textAlign: 'left',
    ...(side === 'top'
      ? { bottom: '140%', left: '50%', transform: 'translateX(-50%)' }
      : { top: '140%', left: '50%', transform: 'translateX(-50%)' }),
  };

  return (
    <span
      className="relative inline-flex items-center align-middle"
      style={{ cursor: 'help' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={() => setOpen(v => !v)}
    >
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
          color: '#FFFFFF',
          background: iconColor,
          opacity: iconOpacity,
        }}
      >
        ?
      </span>
      {open && (
        <span style={popStyle} onMouseEnter={show} onMouseLeave={hide}>
          {text}
        </span>
      )}
    </span>
  );
}
