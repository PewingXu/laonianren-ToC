/**
 * 0810 报告交付包的浏览器边界注入。
 *
 * 交付包的页面刻意不直接碰 navigator / localStorage，而是通过 onShare、onSaveReminder
 * 两个回调把副作用交给宿主（交付包 App.jsx 里原本就是这么接的）。这里就是本系统的注入点。
 */
import { shareReport } from '../reports-v2/features/health-overview/utils/shareReport';
import { createReminderRepository } from '../reports-v2/features/health-overview/utils/reminderRepository';

/**
 * 分享报告摘要。Electron 里没有 navigator.share，会自动落到剪贴板分支，
 * 页面据返回值 'shared' / 'copied' 显示不同 toast。
 */
export function shareReportSummary(summary) {
  return shareReport(summary, { navigator: window.navigator });
}

const reminderRepository = createReminderRepository(window.localStorage);

/** 记录「下次评估提醒」日期，存 localStorage 的 health-overview:reminders */
export function saveAssessmentReminder(recordId, date) {
  return reminderRepository.save(recordId, date);
}

export { reminderRepository };
