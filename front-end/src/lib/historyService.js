/**
 * 历史记录服务 - IndexedDB(主) + localStorage(旧数据只读) 双源
 * ---------------------------------------------------------------
 * 为什么这么改（性能与容量）：
 *  1) 报告里含大量 base64 图片，全塞 localStorage 会在几十人时爆 QuotaExceededError
 *     → 报告生成成功却存不进去，表现为"部分人报告出不来"。
 *  2) localStorage 每次保存都要 JSON.stringify 整个库再 setItem，是 O(全库) 操作；
 *     记录越多，每存一份报告越慢，且会阻塞主线程。
 *  3) 读取是同步 JSON.parse 整个库，几十 MB 时直接卡死界面。
 *
 * 现方案：
 *  - 旧数据留在 localStorage，**只读不再写**（老用户数据自动兼容，不做迁移）
 *  - 新数据/更新一律写 IndexedDB（GB 级配额，单条写 O(1)）
 *  - 读取时合并两源：同 id 以 IndexedDB 为准；删除写墓碑（_deleted）以剔除只读源里的旧记录
 *  - 不再有 200/500 条上限（原上限是为了不撑爆 localStorage，换容器后不需要）
 *
 * 注意：getHistory / 所有写函数均为 async，调用方需 await。
 */

import { idbGetAll, idbGet, idbPut, idbDelete, idbClear } from './idbStore';

const STORAGE_KEY = 'sarcopenia_assessment_history';

/** 读旧 localStorage 数据（只读；解析失败不抛，避免脏数据把页面弄白屏） */
function readLocalStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    const arr = data ? JSON.parse(data) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error('读取旧历史记录失败（将忽略本地缓存）:', e);
    return [];
  }
}

/**
 * 获取所有历史记录（合并 IndexedDB + 旧 localStorage，最新在前）
 * @returns {Promise<Array>}
 */
export async function getHistory() {
  const rawLS = readLocalStorage();
  let idbAll = [];
  try {
    idbAll = await idbGetAll();
  } catch (e) {
    console.warn('读取 IndexedDB 历史失败，仅使用本地缓存:', e?.message || e);
    idbAll = [];
  }

  const deleted = new Set();
  const idbMap = new Map();
  for (const r of idbAll) {
    if (!r || r.id == null) continue;
    if (r._deleted) { deleted.add(String(r.id)); continue; }
    idbMap.set(String(r.id), r);
  }

  const byId = new Map();
  for (const r of rawLS) {
    if (r && r.id != null) byId.set(String(r.id), r); // localStorage 打底
  }
  for (const [id, r] of idbMap) byId.set(id, r);       // IndexedDB 同 id 覆盖
  for (const id of deleted) byId.delete(id);           // 墓碑剔除

  const list = Array.from(byId.values());
  list.sort((a, b) => String(b.updatedAt || b.date || '').localeCompare(String(a.updatedAt || a.date || '')));
  return list;
}

/**
 * 根据 ID 获取单条记录（优先 IndexedDB 单条读，命中即返回，避免整库遍历）
 */
export async function getRecord(id) {
  if (id == null) return null;
  try {
    const one = await idbGet(String(id));
    if (one && !one._deleted) return one;
    if (one && one._deleted) return null; // 已删除
  } catch (e) {
    // 忽略，退回全量查找
  }
  const history = await getHistory();
  return history.find(r => String(r.id) === String(id)) || null;
}

/**
 * 保存一条评估记录
 */
export async function saveRecord(record) {
  try {
    const newRecord = {
      id: generateId(),
      ...record,
      date: new Date().toISOString(),
      dateStr: formatDate(new Date()),
      updatedAt: new Date().toISOString(),
    };
    await idbPut(newRecord);
    return newRecord;
  } catch (e) {
    console.error('保存历史记录失败:', e);
    return null;
  }
}

/**
 * 保存一次完整评估（可能包含多个评估类型），按 sessionId 归并
 * 只写 IndexedDB，单条 put，不再整库覆写
 */
export async function saveAssessmentSession(patientInfo, institution, assessments, sessionId) {
  try {
    const now = new Date();
    const dateStr = formatDate(now);
    const history = await getHistory();

    const existing = sessionId
      ? history.find(r => r.sessionId === sessionId)
      : null;

    if (existing) {
      // 更新已有记录（源自 localStorage 的旧记录会被 override 进 IndexedDB）
      const merged = {
        ...existing,
        assessments: { ...(existing.assessments || {}) },
      };
      for (const [type, data] of Object.entries(assessments)) {
        if (data?.completed) {
          merged.assessments[type] = {
            completed: true,
            report: data.report,
            assessmentId: data.assessmentId || existing.assessments?.[type]?.assessmentId || null,
            completedAt: now.toISOString(),
          };
        }
      }
      merged.updatedAt = now.toISOString();
      await idbPut(merged);
      return true;
    }

    // 创建新记录
    const assessmentData = {};
    for (const [type, data] of Object.entries(assessments)) {
      assessmentData[type] = {
        completed: data?.completed || false,
        report: data?.completed ? data.report : null,
        assessmentId: data?.assessmentId || null,
        completedAt: data?.completed ? now.toISOString() : null,
      };
    }

    await idbPut({
      id: generateId(),
      sessionId: sessionId || generateId(),
      patientName: patientInfo?.name,
      patientGender: patientInfo?.gender,
      patientAge: patientInfo?.age,
      patientWeight: patientInfo?.weight,
      institution: institution || '',
      assessments: assessmentData,
      date: now.toISOString(),
      dateStr,
      updatedAt: now.toISOString(),
    });
    return true;
  } catch (e) {
    console.error('保存评估记录失败:', e);
    return false;
  }
}

export async function updateAssessmentAiReport(recordId, assessmentType, aiReport) {
  try {
    const record = await getRecord(recordId);
    if (!record || !record.assessments?.[assessmentType]) return false;

    const assessment = { ...record.assessments[assessmentType] };
    const report = { ...(assessment.report || {}) };
    const reportData = { ...(report.reportData || {}) };
    reportData.aiReport = aiReport;
    report.reportData = reportData;
    assessment.report = report;

    await idbPut({
      ...record,
      assessments: { ...record.assessments, [assessmentType]: assessment },
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    console.error('更新 AI 报告失败:', e);
    return false;
  }
}

/**
 * 删除一条记录（写墓碑，兼容删除源自 localStorage 的旧记录）
 */
export async function deleteRecord(id) {
  try {
    await idbDelete(String(id));
    return true;
  } catch (e) {
    console.error('删除记录失败:', e);
    return false;
  }
}

/**
 * 列表用的轻量记录：剥掉 report（含大量 base64 图片），只保留列表与评分所需字段。
 * 报告详情页请用 getRecord(id) 单条读取完整数据。
 */
function toListItem(r) {
  const assessments = {};
  for (const [type, a] of Object.entries(r.assessments || {})) {
    assessments[type] = {
      completed: !!a?.completed,
      assessmentId: a?.assessmentId || null,
      completedAt: a?.completedAt || null,
      hasReport: !!a?.report?.reportData,
    };
  }
  return {
    id: r.id,
    sessionId: r.sessionId,
    patientName: r.patientName,
    patientGender: r.patientGender,
    patientAge: r.patientAge,
    patientWeight: r.patientWeight,
    institution: r.institution,
    date: r.date,
    dateStr: r.dateStr,
    updatedAt: r.updatedAt,
    assessments,
  };
}

/**
 * 搜索历史记录
 * @param {object} opts - { keyword, date, page, pageSize, light }
 *   light=true 时返回轻量列表项（不含报告数据），适合大数据量列表渲染
 */
export async function searchHistory({ keyword, date, page = 1, pageSize = 10, light = false }) {
  let records = await getHistory();

  if (keyword) {
    const kw = String(keyword);
    records = records.filter(r =>
      r.patientName?.includes(kw) ||
      r.institution?.includes(kw)
    );
  }

  if (date) {
    records = records.filter(r => r.dateStr === date || r.dateStr?.includes(date));
  }

  const total = records.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const sliced = records.slice(start, start + pageSize);
  const items = light ? sliced.map(toListItem) : sliced;

  return { items, total, totalPages, page };
}

/**
 * 清空所有历史记录（显式用户操作，两源都清）
 */
export async function clearHistory() {
  try {
    await idbClear();
  } catch (e) {
    console.warn('清空 IndexedDB 历史失败:', e?.message || e);
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('清空本地缓存历史失败:', e?.message || e);
  }
}

// ==================== 工具函数 ====================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

export default {
  getHistory,
  getRecord,
  saveRecord,
  saveAssessmentSession,
  updateAssessmentAiReport,
  deleteRecord,
  searchHistory,
  clearHistory,
};
