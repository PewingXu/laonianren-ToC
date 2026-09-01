import { useEffect, useRef, useState } from 'react';
import { AI_ENABLED } from '../../../../lib/featureFlags';
import { generateGripTocAIReport } from '../../../../lib/gripPythonApi';
import { buildGripAiFacts } from '../../../../lib/gripReportEnrich';

/**
 * 取握力报告的 AI 文案（「AI 健康总结」+「个性化改善建议」）。
 *
 * 为什么单独做一个 hook，而不是塞进 useGripReport
 * ---------------------------------------------------------------
 * AI 是一次几秒到几十秒的网络请求，而报告的数值部分是本地算好的。
 * 如果混在一起等，用户要盯着空白页等 AI 返回。这里让报告先渲染出来，
 * AI 文案回来后再替换掉兜底文案，中途失败就一直用兜底 —— 报告永远可读。
 *
 * 校验口径与 mapGripReport 保持一致（那边是最终守门人）：
 *   - aiSummary 四段必须全部非空，缺一个整份丢弃
 *   - 四段里出现 kg 整份丢弃（交付包规定握力只显示 N）
 *   - advice 必须正好 3 组、id 依次 strength/nutrition/recovery、每组 2 条
 * 这里先挡一道，是为了不把半成品塞进 state 引起闪烁。
 *
 * @param {object|null} reportData 增强后的 reportData（gripReportEnrich 的输出）
 * @param {object|null} patientInfo { name, gender, age }
 * @returns {{aiSummary: object|null, advice: Array|null, status: 'idle'|'loading'|'ready'|'failed'}}
 */
export function useGripAiCopy(reportData, patientInfo) {
  const [state, setState] = useState({ aiSummary: null, advice: null, status: 'idle' });
  // 同一份报告只请求一次：hook 会因父组件重渲染反复执行，
  // 没有这道闸门会对着同一条记录反复烧 token
  const requestedKeyRef = useRef(null);

  useEffect(() => {
    if (!AI_ENABLED || !reportData) return undefined;

    const facts = buildGripAiFacts(reportData, patientInfo);
    if (!facts) return undefined;

    // 数据无效时不请求：报告本身已经明确写了「数据异常，请重测」，
    // 再让 AI 编一段安慰话只会稀释这个结论
    if (facts.is_valid === false) return undefined;

    const key = JSON.stringify([
      facts.max_force_n, facts.mean_force_n, facts.diff_percent,
      facts.retention_percent, facts.score, patientInfo?.gender,
    ]);
    if (requestedKeyRef.current === key) return undefined;
    requestedKeyRef.current = key;

    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'loading' }));

    generateGripTocAIReport(patientInfo || {}, facts)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.success ? res.data : null;
        const aiSummary = validSummary(payload?.aiSummary);
        const advice = validAdvice(payload?.advice);
        setState(aiSummary || advice
          ? { aiSummary, advice, status: 'ready' }
          : { aiSummary: null, advice: null, status: 'failed' });
      })
      .catch(() => {
        if (!cancelled) setState({ aiSummary: null, advice: null, status: 'failed' });
      });

    return () => { cancelled = true; };
  }, [reportData, patientInfo]);

  return state;
}

const SUMMARY_KEYS = ['title', 'body', 'focusTitle', 'focusBody'];

function validSummary(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const key of SUMMARY_KEYS) {
    const text = typeof value[key] === 'string' ? value[key].trim() : '';
    // 与 mapGripReport.mapAiHealthSummary 同一条校验：出现 kg 整份作废
    if (!text || /kg|公斤|千克/i.test(text.normalize('NFKC'))) return null;
    out[key] = text;
  }
  return out;
}

const ADVICE_IDS = ['strength', 'nutrition', 'recovery'];

function validAdvice(value) {
  if (!Array.isArray(value) || value.length !== ADVICE_IDS.length) return null;

  const groups = ADVICE_IDS.map((id, index) => {
    const source = value[index];
    if (!source || source.id !== id || !Array.isArray(source.items) || source.items.length !== 2) {
      return null;
    }
    const items = source.items.map((item) => (typeof item === 'string' ? item.trim() : ''));
    return items.every(Boolean) ? { id, items } : null;
  });

  return groups.every(Boolean) ? groups : null;
}
