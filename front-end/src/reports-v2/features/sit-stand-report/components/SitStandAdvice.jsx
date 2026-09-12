import {
  Activity,
  Armchair,
  CheckCircle2,
  Droplets,
  Dumbbell,
} from 'lucide-react';

const ADVICE_ICONS = {
  activity: Activity,
  armchair: Armchair,
  droplets: Droplets,
  dumbbell: Dumbbell,
};

/* 四条建议的色调，与首屏/指标卡的四色体系对应 */
const ADVICE_TONES = {
  activity: 'green',
  armchair: 'blue',
  droplets: 'purple',
  dumbbell: 'orange',
};

/**
 * 个性化改善建议。DOM 结构照握力（GripAdvice）：
 *   区标题 h2 + 卡片网格；每张卡 = 顶部色条 + 图标 + h3 + 带对勾的条目列表。
 *
 * 之前是塞在右侧 255px 窄栏里的纵向列表，10px 正文。
 *
 * 起坐的 mapper 契约是**正好 4 条**（活动 / 起身安全 / 休息补水 / 腿部练习），
 * 握力是 3 条，所以这里网格是 4 列而不是 3 列 —— 内容不同，样式一致。
 * 每条只有一段 detail，所以列表里就一个条目。
 */
export function SitStandAdvice({ advice }) {
  const items = Array.isArray(advice) ? advice : [];
  if (items.length === 0) return null;

  return (
    <section className="sit-stand-report__advice-section" aria-labelledby="sit-stand-advice-title">
      <h2 id="sit-stand-advice-title">个性化改善建议</h2>
      <div className="sit-stand-report__advice-grid">
        {items.map((item) => {
          const Icon = ADVICE_ICONS[item.icon] || Activity;
          const tone = ADVICE_TONES[item.icon] || 'green';
          return (
            <article
              className={`sit-stand-report__advice-card sit-stand-report__advice-card--${tone}`}
              key={`${item.icon}-${item.title}`}
            >
              <div className="sit-stand-report__advice-heading">
                <Icon aria-hidden="true" />
                <h3>{item.title}</h3>
              </div>
              <ul>
                <li>
                  <CheckCircle2 aria-hidden="true" />
                  <span>{item.detail}</span>
                </li>
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
