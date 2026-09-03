/**
 * 0810 报告交付包的本地数据网关
 * ---------------------------------------------------------------
 * 交付包的页面只依赖两个方法（见 BACKEND_HANDOFF.md §3）：
 *   { getOverviewRecord(recordId), getAssessmentReport(type, { recordId, assessmentId }) }
 *
 * 交付包自带的 legacySoftwareGateway 走的是 backendBridge + HttpResult 拆包，这里不能用：
 * backendBridge 上虽然也有 getGripReport / getStandingReport / getGaitReport / getSitStandReport，
 * 但那四个方法打的是 /getHandPdf、/getDbHeatmap、/getFootPdf、/getSitAndFootPdf，
 * 入参是 { timestamp, collectName, assessmentId }，作用是拿原始采集数据重跑算法，
 * 返回 { code, data: { render_data } } —— 与交付包契约只是方法名相同、语义不同。
 *
 * 本系统的报告数据实际来自 IndexedDB（historyService），而且记录结构与交付包
 * BACKEND_HANDOFF.md §5 要求的形状逐字一致（id / sessionId / patientName / patientGender /
 * patientAge / patientWeight / institution / updatedAt / assessments.<type>.{completed,
 * assessmentId, report.reportData}），所以直接读取即可，无需字段映射。
 */
import { getRecord, getHistory } from './historyService';
import { getRecordScores, getRankIncludingSelf, getCount } from './scoreRanking';
import { enrichGripReportData, buildGripTrend } from './gripReportEnrich';
import { enrichSitStandReportData } from './sitStandReportEnrich';

/**
 * 全部详情报告类型。
 *
 * 这个常量同时驱动 enrichRecord（总览页数据）、getAssessmentReport 的类型校验
 * 和 createMemoryRecordGateway 的组装循环 —— 全系统只有这四项设备实测评估。
 */
export const REPORT_TYPES = Object.freeze(['grip', 'sitstand', 'standing', 'gait']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 站立报告的足弓字段补偿。
 *
 * mapStandingReport 的 footSources/firstFootValue 只在 data.left / data.left_foot 等
 * 「一层」里找 archIndex、archType、totalArea，不会递归。而本系统前端算法模式下
 * 足弓数据嵌在 left.archAnalysis.archIndex（assessmentScoring.js 里是
 * `left.archAnalysis.archIndex ?? left.archIndex`，两种嵌法都真实存在）。
 * 不补偿的话足弓那张卡会降级成「数据不足」。
 *
 * 这里把 archAnalysis 的键上提一层。优先级与 assessmentScoring 保持一致：
 * archAnalysis 里的值覆盖平铺值。
 */
function flattenArchAnalysis(footData) {
  if (!isObject(footData) || !isObject(footData.archAnalysis)) return footData;
  return { ...footData, ...footData.archAnalysis };
}

function withFlattenedArch(reportData) {
  if (!isObject(reportData)) return reportData;
  const left = flattenArchAnalysis(reportData.left);
  const right = flattenArchAnalysis(reportData.right);
  if (left === reportData.left && right === reportData.right) return reportData;
  return { ...reportData, ...(left ? { left } : {}), ...(right ? { right } : {}) };
}

/**
 * 用本系统的评分频次表补 peerComparison。
 *
 * 只补交付包能接受的字段，且这些值全部来自已入库的真实评分统计，
 * 不是前端或 AI 猜出来的（BACKEND_HANDOFF.md §7.3 / §11 的红线）。
 *
 * 各页校验口径不同：
 *   - grip：percentile 单独校验即可（§8.2）
 *   - gait：percentile + sampleSize 两者必须同时有效（§9.2）
 *   - standing：同 gait（见 mapStandingReport 里 hasPeerComparison 的判定）
 *   - sitstand：要求 percentile / sampleSize / averageDuration / rankPercent 四值同时
 *     有效，缺一则四个一起丢弃（§7.3）。频次表只存「分数 → 人数」，给不出
 *     averageDuration（平均起身秒数），所以起坐页的同龄对比保持隐藏，不在这里伪造。
 */
function buildPeerComparison(type, recordId) {
  if (type === 'sitstand') return null;

  const score = getRecordScores(recordId)?.[type];
  if (!Number.isFinite(score)) return null;

  const sampleSize = getCount(type);
  if (!(sampleSize > 0)) return null;

  const { percent } = getRankIncludingSelf(type, score);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;

  return {
    percentile: Math.round(percent * 10) / 10,
    sampleSize,
    // rankPercent 语义是「排在前百分之几」，与超越百分比互补
    rankPercent: Math.round((100 - percent) * 10) / 10,
  };
}

/**
 * 按类型增强单份报告数据。只做补偿与注入，不改动任何实测值。
 * 已有的后端 peerComparison 优先，不覆盖。
 *
 * @param {string} type
 * @param {object} reportData
 * @param {object} [context]
 * @param {string} [context.recordId] 算同龄对比要用
 * @param {object} [context.patient]  { gender, age, weight }；握力打分要靠 gender 定 AWGS 切点
 * @param {Array}  [context.trend]    握力历史趋势点，调用方算好传入
 */
function enrichReportData(type, reportData, context = {}) {
  if (!isObject(reportData)) return reportData;
  if (!REPORT_TYPES.includes(type)) return reportData;

  const { recordId, patient, trend } = context;

  let next = type === 'standing' ? withFlattenedArch(reportData) : reportData;

  /*
   * 握力：补 V3 评分、分档、参考线、CV、保持率。
   *
   * 放在这里而不是各宿主页里，是为了让「历史记录打开」「测完即看」
   * 「CSV 调试台」三条路径拿到完全一致的口径 —— 否则会出现调试能过、
   * 上机数值不同这类最难查的问题。
   */
  if (type === 'grip') {
    next = enrichGripReportData(next, { patientInfo: patient, trend });
  }

  /* 起坐：补 V3 评分、分档、参考线、周期稳定性。理由同握力 —— 放在网关里
     才能让「历史记录」「测完即看」「CSV 调试台」三条路径拿到一致口径。 */
  if (type === 'sitstand') {
    next = enrichSitStandReportData(next, { patientInfo: patient });
  }

  if (!isObject(next.peerComparison)) {
    const peer = buildPeerComparison(type, recordId);
    if (peer) next = { ...next, peerComparison: peer };
  }

  return next;
}

/** 从记录里取出打分需要的患者信息（性别决定握力 AWGS 切点） */
function patientOf(record) {
  return {
    gender: record?.patientGender ?? null,
    age: record?.patientAge ?? null,
    weight: record?.patientWeight ?? null,
  };
}

/**
 * 补 assessmentId。
 *
 * 交付包的 useXxxReport hook 有一道硬闸门：assessments[type].assessmentId 必须是非空字符串，
 * 否则整页直接进 empty 态（显示「尚未完成」），哪怕 reportData 里测量值齐全。
 * 而 AssessmentContext.jsx:233 存的是 `val.assessmentId || null` —— 模拟/回放模式、
 * 以及早期历史记录都可能落成 null，那样会出现「有数据却说没测」的假空。
 *
 * assessmentId 在交付包的 4 个页面里一处都不展示（只在 mapper 里被带进结果对象），
 * 纯粹是身份/闸门字段，所以这里只在「completed 为真且 reportData 有效」时补一个派生值，
 * 不会把伪造编号显示给用户，也不会影响任何实测数值。
 */
function resolveAssessmentId(assessment, type, recordId) {
  const raw = assessment?.assessmentId;
  if (typeof raw === 'string' && raw.trim()) return raw;
  return `local:${recordId}:${type}`;
}

/**
 * 取出并增强某一项的 report。
 * 兼容两种存法：assessments[type].report.reportData 与 assessments[type].reportData
 * （assessmentScoring.js 里同样是这两条兜底）。
 */
function readAssessmentReport(record, type, { trend } = {}) {
  const assessment = record?.assessments?.[type];
  if (!isObject(assessment)) return null;

  const report = assessment.report;
  const reportData = isObject(report?.reportData)
    ? report.reportData
    : (isObject(assessment.reportData) ? assessment.reportData : null);
  if (!reportData) return null;

  const enriched = enrichReportData(type, reportData, {
    recordId: record.id,
    patient: patientOf(record),
    trend,
  });
  return { ...(isObject(report) ? report : {}), reportData: enriched };
}

/**
 * 把四项报告按同样规则增强后放回记录。
 * 让总览页的能力卡和详情页读到完全相同的数值，不会出现两处对不上。
 */
function enrichRecord(record) {
  if (!record) return null;

  const assessments = { ...(record.assessments || {}) };
  for (const type of REPORT_TYPES) {
    const enriched = readAssessmentReport(record, type);
    if (!enriched) continue;
    assessments[type] = {
      ...assessments[type],
      report: enriched,
      assessmentId: resolveAssessmentId(assessments[type], type, record.id),
    };
  }
  return { ...record, assessments };
}

export function createLocalReportGateway() {
  return {
    /** 总览页数据源。记录结构已与交付包一致，读出来增强即可，无需字段映射。 */
    async getOverviewRecord(recordId) {
      return enrichRecord(await getRecord(recordId));
    },

    async getAssessmentReport(type, { recordId } = {}) {
      if (!REPORT_TYPES.includes(type)) {
        throw new TypeError(`Unsupported assessment report type: ${type}`);
      }
      const record = await getRecord(recordId);
      if (!record) return null;
      // 握力趋势图要至少 6 条历史握力记录才显示（mapTrend 的硬校验），
      // 只在打开握力详情页时才多读一次历史，其余三项不付这个代价
      const trend = type === 'grip' ? buildGripTrend(await getHistory()) : undefined;
      return readAssessmentReport(record, type, { trend });
    },
  };
}

/** 全应用共用一个实例即可：内部无状态，每次调用都重新读 IndexedDB */
export const localReportGateway = createLocalReportGateway();

/**
 * 按 sessionId 定位「当前这一轮评估」的已落库记录。
 *
 * Dashboard 上的综合报告是本轮 session 的实时汇总，它手里只有 sessionId
 * （AssessmentContext 的 state），没有历史记录的 id —— saveAssessmentSession
 * 只返回 true，不返回新建记录的 id。
 *
 * 用已落库记录（而不是 Dashboard 自己拼的 currentRecord）的原因是：总览页的四张能力卡
 * 会用 record.id 生成 /history/report?id=&type= 的跳转链接。拿占位 id 拼出来的链接
 * 点进去必然是「未找到对应的记录」，所以这里必须取到真实 id。
 */
export function createSessionReportGateway(sessionId) {
  async function findRecord() {
    if (typeof sessionId !== 'string' || !sessionId.trim()) return null;
    const history = await getHistory();
    return history.find((item) => item?.sessionId === sessionId) || null;
  }

  return {
    async getOverviewRecord() {
      return enrichRecord(await findRecord());
    },
    async getAssessmentReport(type) {
      if (!REPORT_TYPES.includes(type)) {
        throw new TypeError(`Unsupported assessment report type: ${type}`);
      }
      const record = await findRecord();
      if (!record) return null;
      const trend = type === 'grip' ? buildGripTrend(await getHistory()) : undefined;
      return readAssessmentReport(record, type, { trend });
    },
  };
}

/**
 * 内存态 gateway：给「刚测完、还没落库」的评估流程用。
 *
 * 评估页（GripAssessment 等）测完先把 reportData 放在 React state 里，
 * completeAssessment 才异步写 IndexedDB，所以那一刻用 localReportGateway 读不到。
 * 这里直接用手里的 reportData 拼一份符合 mapper 要求的 record，
 * 走的仍是同一套增强逻辑（足弓摊平 / peerComparison），保证测完看到的报告
 * 与之后从历史记录打开的报告完全一致。
 *
 * @param {object}  options
 * @param {string}  options.type        'grip' | 'sitstand' | 'standing' | 'gait'
 * @param {object}  options.reportData  评估页手里的 reportData
 * @param {object} [options.patient]    { name, gender, age, weight }
 * @param {string} [options.institution]
 * @param {string} [options.assessmentId]
 * @param {string} [options.recordId]   已落库的记录 id；有才能算同龄对比
 *
 * 注意：返回的对象必须在组件里 useMemo 缓存。交付包的 hook 把 gateway 放进 useEffect
 * 依赖数组，每次渲染新建一个会导致无限重新取数。
 */
export function createInMemoryReportGateway({
  type,
  reportData,
  patient,
  institution,
  assessmentId,
  recordId,
} = {}) {
  if (!REPORT_TYPES.includes(type)) {
    throw new TypeError(`Unsupported assessment report type: ${type}`);
  }

  return createMemoryRecordGateway({
    reports: { [type]: reportData },
    assessmentIds: assessmentId ? { [type]: assessmentId } : undefined,
    patient,
    institution,
    recordId,
    fallbackId: `pending:${type}`,
  });
}

/**
 * 多项内存态 gateway：手里有几项 reportData 就拼几项，一份记录同时喂总览页与详情页。
 *
 * 与 createInMemoryReportGateway 走的是同一套增强逻辑（足弓摊平 / peerComparison /
 * assessmentId 补偿），所以 CSV 调试页看到的报告与真机采集、以及之后从历史记录
 * 打开的报告是同一口径，不存在「调试能过、上机不过」的差异。
 *
 * @param {object}  options
 * @param {Record<string, object>} options.reports      { grip: reportData, gait: reportData, ... }
 * @param {Record<string, string>} [options.assessmentIds]
 * @param {object}  [options.patient]     { name, gender, age, weight }
 * @param {string}  [options.institution]
 * @param {string}  [options.recordId]    已落库记录 id；有才能算同龄对比
 * @param {string}  [options.fallbackId]  未落库时的占位 id
 *
 * 同样必须在组件里 useMemo 缓存（交付包 hook 把 gateway 放进 useEffect 依赖数组）。
 */
export function createMemoryRecordGateway({
  reports,
  assessmentIds,
  patient,
  institution,
  recordId,
  fallbackId = 'pending:memory',
} = {}) {
  // mapper 要求 record.id 非空；没落库时给个占位，它不会显示给用户
  const id = (typeof recordId === 'string' && recordId.trim()) ? recordId : fallbackId;
  // 只取一次：两个方法各自 new Date() 会让报告时间在同一页里不一致
  const updatedAt = new Date().toISOString();

  const assessments = {};
  for (const type of REPORT_TYPES) {
    const reportData = reports?.[type];
    if (!isObject(reportData)) continue;
    const rawId = assessmentIds?.[type];
    assessments[type] = {
      completed: true,
      assessmentId: (typeof rawId === 'string' && rawId.trim()) ? rawId : `local:${id}:${type}`,
      // recordId 为占位时 buildPeerComparison 查不到分数，同龄对比自然隐藏，不伪造
      report: {
        reportData: enrichReportData(type, reportData, {
          recordId,
          // 握力打分要靠 gender 定 AWGS 切点，所以这里必须把 patient 透传下去，
          // 否则「测完即看」和调试台会一律按女性 18kg 切点算，与历史页不一致
          patient,
        }),
      },
    };
  }

  const record = Object.keys(assessments).length ? {
    id,
    patientName: patient?.name || '',
    patientGender: patient?.gender ?? null,
    patientAge: patient?.age ?? null,
    patientWeight: patient?.weight ?? null,
    institution: institution || '',
    updatedAt,
    assessments,
  } : null;

  return {
    async getOverviewRecord() {
      return record;
    },
    async getAssessmentReport(requestedType) {
      if (!REPORT_TYPES.includes(requestedType)) {
        throw new TypeError(`Unsupported assessment report type: ${requestedType}`);
      }
      return record?.assessments?.[requestedType]?.report ?? null;
    },
  };
}
