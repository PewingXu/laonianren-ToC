import { useEffect, useRef, useState } from 'react';
import { AI_ENABLED } from '../../lib/featureFlags';

/**
 * 通用的报告 AI 文案 hook（起坐 / 站立 / 步态共用）。
 *
 * 为什么不各写一份
 * ---------------------------------------------------------------
 * 三项要的字段不同，但「异步取文案」这件事的骨架完全一样：
 *   报告先渲染 → AI 回来再替换 → 失败就一直用兜底 → 同一份数据只请求一次
 * 差异只有两处：请求函数、返回值校验。把这两处做成参数即可。
 * 握力的 useGripAiCopy 早于此文件写成、校验规则也更特殊（含 kg 即作废），
 * 保持原样不动，避免为了统一而改动已实测通过的链路。
 *
 * 关键设计：同一份数据只请求一次
 * ---------------------------------------------------------------
 * hook 会随父组件重渲染反复执行。没有 requestedKeyRef 这道闸门，
 * 会对着同一条记录反复调 LLM —— 既慢又烧 token。
 *
 * @param {object} options
 * @param {object|null} options.facts       事实摘要（buildXxxAiFacts 的输出）
 * @param {object|null} options.patientInfo { name, gender, age }
 * @param {Function} options.request        (patientInfo, facts) => Promise<{success, data}>
 * @param {Function} options.validate       (payload) => object|null，返回 null 视为不可用
 * @param {Array}    options.keyFields      参与「是否同一份数据」判断的 facts 字段名
 * @returns {{copy: object|null, status: 'idle'|'loading'|'ready'|'failed'}}
 */
export function useAssessmentAiCopy({
  facts,
  patientInfo,
  request,
  validate,
  keyFields = [],
}) {
  const [state, setState] = useState({ copy: null, status: 'idle' });
  const requestedKeyRef = useRef(null);

  useEffect(() => {
    if (!AI_ENABLED || !facts) return undefined;

    // 数据无效时不请求：报告本身已经写明「数据异常、请重测」，
    // 再让 AI 编一段安慰话只会稀释这个结论
    if (facts.is_valid === false) return undefined;

    const key = JSON.stringify(keyFields.map((field) => facts[field] ?? null));
    if (requestedKeyRef.current === key) return undefined;
    requestedKeyRef.current = key;

    let cancelled = false;
    setState({ copy: null, status: 'loading' });

    Promise.resolve()
      .then(() => request(patientInfo || {}, facts))
      .then((res) => {
        if (cancelled) return;
        const copy = res?.success ? validate(res.data) : null;
        setState(copy ? { copy, status: 'ready' } : { copy: null, status: 'failed' });
      })
      .catch(() => {
        if (!cancelled) setState({ copy: null, status: 'failed' });
      });

    return () => { cancelled = true; };
    // keyFields / request / validate 都是模块级常量，不进依赖数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts, patientInfo]);

  return state;
}

/* ════════════════════════════════════════════════
   三项各自的返回值校验
   —— 口径必须与对应 mapper 完全一致，否则会出现
      「hook 放过了、mapper 又丢掉」的空转
   ════════════════════════════════════════════════ */

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * 起坐：evaluation.health{preface,result,details[1-3]} + advice[4]{title,detail,icon}
 * icon 白名单与顺序见 mapSitStandReport 的 ADVICE_ICONS / DEFAULT_ADVICE
 */
const SITSTAND_ADVICE_ICONS = ['activity', 'armchair', 'droplets', 'dumbbell'];

export function validateSitStandCopy(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const health = payload.evaluation?.health;
  const preface = text(health?.preface);
  const result = text(health?.result);
  const details = Array.isArray(health?.details)
    ? health.details.map(text).filter(Boolean)
    : [];
  // mapper 要求 1~3 条；超过 3 条会被 textArray 整段丢弃，这里先截断
  const validHealth = preface && result && details.length > 0
    ? { preface, result, details: details.slice(0, 3) }
    : null;

  const rawAdvice = Array.isArray(payload.advice) ? payload.advice : [];
  const advice = rawAdvice.length === 4
    ? SITSTAND_ADVICE_ICONS.map((icon, index) => {
      const item = rawAdvice[index];
      const title = text(item?.title);
      const detail = text(item?.detail);
      // icon 由我们按位置钉死，不信 LLM 返回的值 —— 它写错一个字整块就废了
      return title && detail ? { title, detail, icon } : null;
    })
    : [];
  const validAdvice = advice.length === 4 && advice.every(Boolean) ? advice : null;

  if (!validHealth && !validAdvice) return null;
  return { health: validHealth, advice: validAdvice };
}

/** 站立：evaluation（一整段字符串）+ advice[3]{id,title,detail} */
const STANDING_ADVICE_IDS = ['balance', 'posture', 'footcare'];

export function validateStandingCopy(payload) {
  if (!payload || typeof payload !== 'object') return null;

  // mapper 读的是 data.evaluation 且用 textOr —— 必须是字符串，对象会被丢弃
  const evaluation = text(payload.evaluation);

  const rawAdvice = Array.isArray(payload.advice) ? payload.advice : [];
  const advice = STANDING_ADVICE_IDS.map((id, index) => {
    const item = rawAdvice[index];
    const title = text(item?.title);
    const detail = text(item?.detail);
    return title && detail ? { id, title, detail } : null;
  });
  const validAdvice = advice.every(Boolean) ? advice : null;

  if (!evaluation && !validAdvice) return null;
  return { evaluation: evaluation || null, advice: validAdvice };
}

/**
 * 步态：assessmentSummary{body,strength} + scoreExplanation
 *      + recommendations[3]{id,title,description,icon,tone}
 * icon/tone 是白名单（walking|stretch|water / green|orange|blue），
 * 任一条不合规 mapRecommendations 就返回 [] —— 所以这里也按位置钉死。
 */
const GAIT_RECOMMENDATIONS = [
  { id: 'walk', icon: 'walking', tone: 'green' },
  { id: 'stretch', icon: 'stretch', tone: 'orange' },
  { id: 'safety', icon: 'water', tone: 'blue' },
];

export function validateGaitCopy(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const body = text(payload.assessmentSummary?.body);
  const strength = text(payload.assessmentSummary?.strength);
  const explanation = text(payload.scoreExplanation);

  const raw = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const recommendations = raw.length === GAIT_RECOMMENDATIONS.length
    ? GAIT_RECOMMENDATIONS.map((meta, index) => {
      const item = raw[index];
      const title = text(item?.title);
      const description = text(item?.description);
      return title && description ? { ...meta, title, description } : null;
    })
    : [];
  const validRecommendations = recommendations.length === GAIT_RECOMMENDATIONS.length
    && recommendations.every(Boolean)
    ? recommendations
    : null;

  if (!body && !strength && !explanation && !validRecommendations) return null;
  return {
    assessmentSummary: body || strength ? { body, strength } : null,
    scoreExplanation: explanation || null,
    recommendations: validRecommendations,
  };
}
