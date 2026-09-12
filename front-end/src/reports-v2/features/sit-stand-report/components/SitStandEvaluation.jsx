import { Bot, CircleCheckBig, Sprout } from 'lucide-react';

/**
 * AI 健康总结。DOM 结构照握力（GripAiHealthSummary）：
 *   标题行（机器人图标 + h2）
 *   主结论块（对勾图标 + h3 + p）
 *   分隔线
 *   关注方向块（新芽图标 + h3 + p）
 *
 * 之前是一张 333px 定高的横排三栏面板（总体评价 / 本次检测发现 / 健康关注），
 * 正文只有 10px，跟握力那张纵向、15px 正文的卡完全不是一个尺度。
 *
 * 起坐的数据形状是 health = { preface, result, details[3] }：
 *   preface + result 拼成主标题，details[0..1] 拼成主正文，
 *   details[2]（「接下来该做什么」）单独放到「关注方向」块。
 * 「本次检测发现」那三条在首屏胶片里已经展示过，这里不再重复。
 */
export function SitStandEvaluation({ evaluation, pending = false }) {
  const health = evaluation?.health ?? {};
  const details = Array.isArray(health.details) ? health.details : [];

  const title = [health.preface, health.result].filter(Boolean).join('，') || '起身能力评估';
  const body = details.slice(0, 2).join('') || '';
  const focusBody = details[2] || '';

  return (
    <section
      className="sit-stand-report__ai-summary"
      aria-labelledby="sit-stand-ai-summary-title"
      aria-busy={pending || undefined}
    >
      <article className="sit-stand-report__ai-summary-card">
        <div className="sit-stand-report__ai-summary-title-row">
          <span className="sit-stand-report__ai-summary-icon" aria-hidden="true">
            <Bot />
          </span>
          <h2 id="sit-stand-ai-summary-title">AI 健康总结</h2>
          {pending ? (
            <span className="sit-stand-report__ai-summary-pending">正在生成…</span>
          ) : null}
        </div>

        <div className="sit-stand-report__ai-summary-copy">
          <span className="sit-stand-report__ai-summary-icon" aria-hidden="true">
            <CircleCheckBig />
          </span>
          <div>
            <h3>{title}</h3>
            {body ? <p>{body}</p> : null}
          </div>
        </div>

        {focusBody ? (
          <>
            <div className="sit-stand-report__ai-summary-divider" />
            <div className="sit-stand-report__ai-summary-focus">
              <span className="sit-stand-report__ai-summary-icon" aria-hidden="true">
                <Sprout />
              </span>
              <div>
                <h3>接下来怎么做</h3>
                <p>{focusBody}</p>
              </div>
            </div>
          </>
        ) : null}
      </article>
    </section>
  );
}
