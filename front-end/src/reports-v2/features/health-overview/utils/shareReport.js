const SHARE_ERROR_MESSAGE = '无法分享报告';

export async function shareReport(summary, environment = {}) {
  if (typeof summary !== 'string' || !summary.trim()) {
    throw new Error(SHARE_ERROR_MESSAGE);
  }

  const shareNavigator = environment.navigator;

  if (typeof shareNavigator?.share === 'function') {
    await shareNavigator.share({ title: '健康报告', text: summary });
    return 'shared';
  }

  if (typeof shareNavigator?.clipboard?.writeText === 'function') {
    try {
      await shareNavigator.clipboard.writeText(summary);
      return 'copied';
    } catch (_error) {
      // Fall through to one consistent public error.
    }
  }

  throw new Error(SHARE_ERROR_MESSAGE);
}
