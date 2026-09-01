import { overviewImages } from '../assets';

export const staticContent = Object.freeze({
  abilities: Object.freeze({
    sitstand: Object.freeze({
      title: '起身能力',
      description: '从坐姿站起的能力',
      status: Object.freeze({ good: '表现良好', caution: '仍有提升空间' }),
      insight: '起身时间略长，建议加强下肢力量训练。',
      image: overviewImages.sitstand,
      metrics: Object.freeze({
        duration: Object.freeze({ label: '起身时间', unit: '秒', reference: '参考值 < 1.20 秒', icon: 'timer' }),
        kneeStrength: Object.freeze({ label: '膝部力量', unit: 'N·m', reference: '参考值 > 85 N·m', icon: 'dumbbell' }),
        stability: Object.freeze({ label: '稳定性', unit: '%', reference: '参考值: 稳定', icon: 'chart-no-axes-combined' }),
      }),
    }),
    gait: Object.freeze({
      title: '步态能力',
      description: '行走时的稳定性和流畅度',
      status: Object.freeze({ good: '表现良好', caution: '仍有提升空间' }),
      insight: '步速、步幅和对称性良好，行走节奏稳定，继续保持。',
      image: overviewImages.gait,
      metrics: Object.freeze({
        speed: Object.freeze({ label: '步速', unit: 'm/s', reference: '0.9-1.3', icon: 'gauge' }),
        length: Object.freeze({ label: '步幅', unit: 'm', reference: '1.0-1.3', icon: 'ruler' }),
        cadence: Object.freeze({ label: '步频', unit: '步/分', reference: '90-120', icon: 'footprints' }),
        symmetry: Object.freeze({ label: '对称性', unit: '%', reference: '> 85%', icon: 'scale' }),
      }),
    }),
    standing: Object.freeze({
      title: '双脚稳定性',
      description: '站立时身体的稳定控制能力',
      status: Object.freeze({ good: '表现良好', caution: '左脚多留意' }),
      insight: '左脚重心偏移略大，身体晃动稍高，站立时需多留意。',
      image: overviewImages.standing,
      metrics: Object.freeze({
        balance: Object.freeze({ label: '左右重心差异', unit: '%', reference: '0%-30%', icon: 'scale' }),
        sway: Object.freeze({ label: '身体晃动幅度', unit: 'mm', reference: '0-30', icon: 'waves' }),
      }),
    }),
    grip: Object.freeze({
      title: '左右手力量平衡',
      description: '双手握力与力量平衡情况',
      status: Object.freeze({ good: '表现良好', caution: '仍有提升空间' }),
      insight: '两只手力量接近，整体比较均衡，继续保持。',
      image: overviewImages.grip,
      metrics: Object.freeze({
        left: Object.freeze({ label: '左手握力', unit: 'N', reference: '参考值: 较强', icon: 'hand' }),
        right: Object.freeze({ label: '右手握力', unit: 'N', reference: '参考值: 较强', icon: 'hand' }),
        difference: Object.freeze({ label: '左右差异', unit: '%', reference: '参考值: 均衡', icon: 'scale' }),
      }),
    }),
  }),
  hero: Object.freeze({
    title: '今天气色真不错，充满活力！',
    content: '身体各项机能都在稳步前行，就像今天温暖的阳光一样。继续保持您的好习惯，享受每一天！',
    status: '状态绝佳',
    image: overviewImages.portrait,
  }),
  advice: Object.freeze([
    Object.freeze({ title: '增强下肢力量', action: '每天完成 10 次坐站练习', content: '提升腿部力量，帮助日常起身更轻松。' }),
    Object.freeze({ title: '增加身体柔韧性', action: '每天拉伸 5-10 分钟', content: '缓解肌肉紧张，让身体更灵活舒适。' }),
    Object.freeze({ title: '保持步行习惯', action: '每天散步 20-30 分钟', content: '保持活动能力，维持良好的步行状态。' }),
    Object.freeze({ title: '维持手部力量', action: '每天进行 5 分钟握力练习', content: '帮助手部保持力量，提高生活便利性。' }),
  ]),
  expertInsight: '您最近把身体照顾得真好！不仅各项指标都稳稳的，精神状态也看起来特别棒。按您现在这样的节奏，每天吃好睡好，偶尔活动活动，以后的日子一定会越来越舒心自在的。',
  peerComparison: Object.freeze({ intro: '在您的同龄朋友圈里', percentile: 78, summary: '依然保持着满满的健康活力！', mock: true }),
  trend: Object.freeze({ title: '您的小小进步轨迹', summary: '看着这些向上的小点点，真为您高兴', points: Object.freeze([{ label: '6月25日', score: 62 }, { label: '6月30日', score: 66 }, { label: '7月5日', score: 68 }, { label: '今日', score: 72 }]) }),
  nextAssessment: Object.freeze({ title: '期待下次与您见面', heading: '相约30天后', content: '给身体一点时间，我们下次再来看看有什么新惊喜。', days: 30 }),
});
