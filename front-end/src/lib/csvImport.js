/**
 * CSV 导入解析与算法入参组装（评分排名用，四项全支持）
 * ---------------------------------------------------------------
 * 系统导出格式：每行一帧，列
 *   timestamp,date,assessment_id,sample_type,
 *   {key}_pressure,{key}_area,{key}_max,{key}_min,{key}_avg,{key}_data, ...
 * {key}_data 是该帧原始压力数组的 JSON 字符串 "[...]"（统计列算法不用）。
 * 注意：导出 CSV 不含 IMU 与 stamp 列 → 握力 imu_data 传 null（算法容忍，仅无抖动检测）。
 * 去重策略：采集端写库时已按 stamp 去重，现代导出的 CSV 无重复行——
 *   仅起坐做“连续相同帧签名”去重（其采集端点本身就是这个逻辑）；
 *   站立/步态不做内容去重（会误删静止/空垫时逐位相同的合法帧）。
 * 时间戳：exportCsv 对缺失时间戳写空串（Number('')===0），凡依赖时间的项目必须校验 ts>0。
 *
 * 各项目组装规则（与 serialServer 采集报告端点严格对齐）：
 *   握力(1)   HL_data/HR_data(256)，times=相对秒 (t-t0)/1000 保留3位（任一 ts 无效则 times=null）；
 *             左右手各调一次算法，包装 {left,right,activeHand}
 *   起坐(3)   stand=foot4/foot1(4096, 北京优先foot4、广州优先foot1)，sit=sit_data(1024)；
 *             times=格式化时间串（无效 ts 行跳过）；各自连续同帧去重；不翻转
 *   静态(4)   北京取 foot4 且每帧上下翻转；广州取 foot1 不翻；fps=42；不去重
 *   步态(5)   foot1~4 四块同帧齐全才收，两地一致；board_data 每帧 JSON.stringify；
 *             board_times=4×格式化时间串（无效 ts 行跳过）；不去重
 */

export const SAMPLE_TYPE_TO_TYPE = { 1: 'grip', 3: 'sitstand', 4: 'standing', 5: 'gait' };
export const TYPE_LABEL = { grip: '握力', sitstand: '起坐', standing: '站立', gait: '步态' };

/* ─── CSV 解析（处理引号内逗号；每帧一行、引号内无换行）─── */
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { fields.push(cur); cur = ''; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

export function parseCsv(text) {
  const clean = String(text || '').replace(/^﻿/, ''); // 去 BOM
  const lines = clean.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 2) return { columns: [], rows: [] };
  const columns = parseCsvLine(lines[0]).map(s => s.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row = {};
    columns.forEach((c, idx) => { row[c] = vals[idx]; });
    rows.push(row);
  }
  return { columns, rows };
}

/* ─── 工具 ─── */

// 64x64 垂直翻转（行倒序），与后端 flipFoot64x64Vertical 一致（北京静态报告用）
function flipFoot64x64Vertical(arr) {
  if (!Array.isArray(arr) || arr.length !== 4096) return arr;
  const size = 64;
  const out = new Array(arr.length);
  for (let r = 0; r < size; r++) {
    const src = (size - 1 - r) * size;
    const dst = r * size;
    for (let c = 0; c < size; c++) out[dst + c] = arr[src + c];
  }
  return out;
}

// 与 serialServer formatTimestamp 完全一致：YYYY/MM/DD HH:mm:ss:SSS
function formatTimestamp(ts) {
  const d = new Date(Number(ts));
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds(), 3)}`;
}

function parseArrCell(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v) return null;
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a : null;
  } catch { return null; }
}

// 有效毫秒时间戳：非空、数字、>0（exportCsv 对 falsy 时间戳写空串，Number('')===0 必须挡住）
function validTs(v) {
  if (typeof v === 'string' && v.trim() === '') return false;
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

// 收集某列的 (帧, 时间戳ms)；跳过无数据帧。
// requireTs=true 时同时跳过时间戳无效的行（该帧无法参与时间对齐）。
function collectFramesWithTs(rows, col, requireTs = false) {
  const frames = [];
  const tss = [];
  for (const r of rows) {
    const a = parseArrCell(r[col]);
    if (!a || !a.length) continue;
    if (requireTs && !validTs(r.timestamp)) continue;
    frames.push(a);
    tss.push(Number(r.timestamp));
  }
  return { frames, tss };
}

// 连续相同帧去重（与起坐采集端点 lastSig 逻辑一致；替代 CSV 缺失的 stamp 去重）
function dedupeConsecutive(frames, tss) {
  const outF = [];
  const outT = [];
  let lastSig = null;
  for (let i = 0; i < frames.length; i++) {
    const sig = JSON.stringify(frames[i]);
    if (sig !== lastSig) {
      outF.push(frames[i]);
      outT.push(tss[i]);
      lastSig = sig;
    }
  }
  return { frames: outF, tss: outT };
}

function hasColumnData(rows, col) {
  return rows.some(r => {
    const v = r[col];
    return typeof v === 'string' && v.length > 2; // "[...]" 至少 3 字符
  });
}

export function detectType(rows) {
  const st = rows.find(r => r.sample_type != null && String(r.sample_type).trim() !== '');
  const key = st ? String(st.sample_type).trim() : '';
  return SAMPLE_TYPE_TO_TYPE[key] || null;
}

/* ─── 各项目组装 ─── */

// 握力：返回 { left: algoInput|null, right: algoInput|null }（历史页对 left/right 分别调后端）
function buildGripInput(rows) {
  const build = (col, handType) => {
    if (!hasColumnData(rows, col)) return null;
    const { frames, tss } = collectFramesWithTs(rows, col);
    if (!frames.length) return null;
    // 任一时间戳无效则整体放弃 times（与端点"无 timeArr 则 null"一致），避免 0/NaN 污染时间轴
    const allValid = tss.every(t => Number.isFinite(t) && t > 0);
    const t0 = tss[0];
    const times = allValid
      ? tss.map(t => parseFloat(((t - t0) / 1000).toFixed(3)))
      : null;
    return {
      sensor_data: frames,
      hand_type: handType,
      imu_data: null, // 导出 CSV 不含 IMU；算法容忍 null（仅缺抖动检测）
      times,
    };
  };
  const left = build('HL_data', '左手');
  const right = build('HR_data', '右手');
  if (!left && !right) throw new Error('CSV 中未找到 HL_data / HR_data 握力数据列');
  return { left, right };
}

// 起坐：stand 北京优先 foot4、广州优先 foot1（按列存在性兜底）；sit 用 sit_data；连续同帧去重
function buildSitStandInput(rows, region, username) {
  const standOrder = region === 'beijing'
    ? ['foot4_data', 'foot1_data', 'foot_data']
    : ['foot1_data', 'foot4_data', 'foot_data'];
  const standCol = standOrder.find(c => hasColumnData(rows, c));
  if (!standCol) throw new Error('CSV 中未找到脚垫数据列（foot1_data/foot4_data）');
  if (!hasColumnData(rows, 'sit_data')) throw new Error('CSV 中未找到坐垫数据列（sit_data）');

  // times 是必需的格式化时间串 → 时间戳无效的行跳过；连续同帧去重与端点 lastSig 逻辑一致
  const standRaw = collectFramesWithTs(rows, standCol, true);
  const sitRaw = collectFramesWithTs(rows, 'sit_data', true);
  const stand = dedupeConsecutive(standRaw.frames, standRaw.tss);
  const sit = dedupeConsecutive(sitRaw.frames, sitRaw.tss);
  if (!stand.frames.length || !sit.frames.length) throw new Error('起坐数据不完整（脚垫或坐垫无有效帧）');

  return {
    stand_data: stand.frames,
    sit_data: sit.frames,
    stand_times: stand.tss.map(formatTimestamp),
    sit_times: sit.tss.map(formatTimestamp),
    username: username || 'user',
  };
}

// 静态站立：北京取 foot4 且每帧上下翻转；广州取 foot1 不翻。
// 不做内容去重：采集端写库时已按 stamp 去重（现代导出无重复行），
// 内容去重反而会误删静止站立时逐位相同的合法帧，压缩时长（fps 固定 42）。
function buildStandingInput(rows, region) {
  const order = region === 'beijing'
    ? ['foot4_data', 'foot1_data', 'foot_data']
    : ['foot1_data', 'foot_data', 'foot4_data'];
  const col = order.find(c => hasColumnData(rows, c));
  if (!col) throw new Error('CSV 中未找到脚垫数据列（foot1_data/foot4_data/foot_data）');
  const { frames } = collectFramesWithTs(rows, col);
  if (!frames.length) throw new Error('站立数据无有效帧');
  const oriented = region === 'beijing' ? frames.map(flipFoot64x64Vertical) : frames;
  return { data_array: oriented, fps: 42, threshold_ratio: 0.8 };
}

// 步态：foot1~4 四块同帧齐全才收（与端点一致）；两地线序一致。
// 不做内容去重（同 standing 的理由：现代导出无重复行，内容去重会误折叠空垫/静止的合法帧）；
// 时间戳无效的行跳过（防 NaN/1970 污染 board_times 导致 Python 时间对齐崩溃）。
function buildGaitInput(rows) {
  const cols = ['foot1_data', 'foot2_data', 'foot3_data', 'foot4_data'];
  const missing = cols.filter(c => !hasColumnData(rows, c));
  if (missing.length) throw new Error(`CSV 缺少步态数据列：${missing.join('、')}`);

  const data = [[], [], [], []];
  const times = [[], [], [], []];
  for (const r of rows) {
    if (!validTs(r.timestamp)) continue; // 无有效时间戳的帧无法参与时间对齐
    const frames = cols.map(c => parseArrCell(r[c]));
    if (frames.some(f => !f || !f.length)) continue; // 四块必须同帧齐全
    const ts = formatTimestamp(r.timestamp);
    for (let i = 0; i < 4; i++) {
      data[i].push(frames[i]);
      times[i].push(ts);
    }
  }
  if (!data[0].length) throw new Error('步态数据无四块垫齐全的有效帧');

  return {
    board_data: data.map(block => block.map(arr => JSON.stringify(arr))),
    board_times: times,
  };
}

export function buildAlgoInput(type, rows, region, username) {
  switch (type) {
    case 'grip': return buildGripInput(rows);
    case 'sitstand': return buildSitStandInput(rows, region, username);
    case 'standing': return buildStandingInput(rows, region);
    case 'gait': return buildGaitInput(rows);
    default: throw new Error(`未知项目类型: ${type}`);
  }
}

/**
 * 高层：解析一个 csv 文本 → { type, algoInput, frameCount }
 * grip 的 algoInput 为 { left, right }（调用方分别请求后端并包装 {left,right,activeHand}）
 */
export function prepareImport(csvText, region, username) {
  const { rows } = parseCsv(csvText);
  if (!rows.length) throw new Error('CSV 无有效数据行');
  const type = detectType(rows);
  if (!type) throw new Error('无法从 sample_type 列判定项目类型（需为 1握力/3起坐/4站立/5步态）');
  const algoInput = buildAlgoInput(type, rows, region, username);
  return { type, algoInput, frameCount: rows.length };
}

/**
 * Excel 工作簿拆解：广州版“批量导出数据”产出的 姓名_日期_四项评估数据.xlsx，
 * 一个 sheet = 一个项目，sheet 内容与 exportCsv 的 CSV 表格同款。
 * 每个 sheet 转回 csv 文本后即可走 prepareImport（sample_type 列自动判型，不依赖 sheet 名）。
 * @returns Promise<Array<{ sheetName, csvText }>>
 */
export async function extractCsvSheetsFromXlsx(arrayBuffer) {
  const XLSX = await import('xlsx'); // 动态加载，避免拖累主包
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const out = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const csvText = XLSX.utils.sheet_to_csv(sheet);
    if (csvText && csvText.trim()) out.push({ sheetName, csvText });
  }
  return out;
}
