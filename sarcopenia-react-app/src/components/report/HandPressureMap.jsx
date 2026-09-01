import React from 'react';

/**
 * HandPressureMap — 显示 Python 生成的手部压力分布图
 * 
 * 使用预生成的 hand_pressure_map.png 图片（基于线框手部模型 + 热力图叠加），
 * 浅色风格，与蔡司报告设计统一。
 */
export default function HandPressureMap({ fingers = [], totalForce = 0, hand = '左手' }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 12,
      border: '1px solid var(--border-light)',
      padding: '12px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 13,
        marginBottom: 8,
        fontWeight: 500,
        letterSpacing: '0.5px',
      }}>
        {hand} · 手部压力分布
      </div>
      <img
        src="/grip_report_data/hand_pressure_map.png"
        alt="手部压力分布图"
        style={{
          width: '100%',
          maxHeight: 560,
          objectFit: 'contain',
          borderRadius: 8,
          display: 'block',
          margin: '0 auto',
        }}
      />
    </div>
  );
}
