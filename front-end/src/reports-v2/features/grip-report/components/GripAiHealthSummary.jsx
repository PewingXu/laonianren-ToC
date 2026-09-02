/**
 * 结论与建议卡。
 *
 * 改版说明：为什么去掉了原来那套「AI 卡片」装饰
 * ---------------------------------------------------------------
 * 原实现是：机器人图标徽章 +「AI 健康总结」大标题 + 右侧一张带闪光
 * 特效的假报告插画 + 每段前面一个绿色圆形图标 + 通篇绿色标题。
 *
 * 问题在于那张插画和闪光是纯装饰、零信息量，加上满屏圆形图标徽章，
 * 整块读起来像「AI 产品的宣传卡」，而不是医生给的结论 —— 而这一块
 * 恰恰是全报告最需要被当真的内容。
 *
 * 现在：删掉插画、闪光和圆形徽章；标题用墨色，绿色只留作左侧一条
 * 细强调线；AI 署名缩到底部一行小字。信息一个字没减，只是不再把
 * 「这是 AI 写的」当卖点展示。
 */
export function GripAiHealthSummary({ healthSummary, pending = false }) {
  return (
    <section
      className="grip-report__ai-summary"
      aria-labelledby="grip-ai-summary-title"
      aria-busy={pending || undefined}
    >
      <article className="grip-report__ai-summary-card">
        <div className="grip-report__ai-summary-eyebrow-row">
          <h2 id="grip-ai-summary-title" className="grip-report__ai-summary-eyebrow">
            这次结果说明什么
          </h2>
          {/* 生成中给个提示，否则用户会把兜底文案当成最终结果 */}
          {pending ? (
            <span className="grip-report__ai-summary-pending">正在生成…</span>
          ) : null}
        </div>

        <div className="grip-report__ai-summary-block">
          <h3>{healthSummary.title}</h3>
          <p>{healthSummary.body}</p>
        </div>

        <div className="grip-report__ai-summary-divider" />

        <div className="grip-report__ai-summary-block">
          <h3>{healthSummary.focusTitle}</h3>
          <p>{healthSummary.focusBody}</p>
        </div>

        <p className="grip-report__ai-summary-credit">
          以上结论由系统根据本次测量数据自动生成，供您和家人参考，不作为诊断依据。
        </p>
      </article>
    </section>
  );
}
