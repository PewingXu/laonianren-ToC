/**
 * Python backend API helpers.
 * Prefer the Vite proxy in dev, but fall back to direct local URLs when the
 * proxy cannot reach the Python service.
 */

import { sanitizeAiReport } from './aiTextSanitizer';
import { AI_ENABLED } from './featureFlags';

// 端口避开 Windows winnat 的抢占区（详见 back-end/code/index.js 顶部说明）：
// 原来的 8765 落在实测到的 8712-8811 预留段里，Python 服务会间歇性 bind 失败。
// Electron 启动时把实际端口写进 VITE_PYTHON_API_PORT，vite 再暴露给浏览器代码。
const PYTHON_API_PORT = import.meta.env?.VITE_PYTHON_API_PORT || '18765';
const DIRECT_PYTHON_API_BASE = `http://127.0.0.1:${PYTHON_API_PORT}`;
const PYTHON_API_BASE_CANDIDATES = [
  '/pyapi',
  DIRECT_PYTHON_API_BASE,
];

let preferredPythonApiBase = PYTHON_API_BASE_CANDIDATES[0];
const inFlightAiRequests = new Map();
let runtimeLlmApiKey = '';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPythonApiBases() {
  return [...new Set([preferredPythonApiBase, ...PYTHON_API_BASE_CANDIDATES])];
}

async function isPythonAiServiceRunning() {
  try {
    const res = await fetch(`${DIRECT_PYTHON_API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchPythonApi(path, buildInit, options = {}) {
  const {
    maxAttempts = 2,
    retryDelayMs = 500,
  } = options;

  let lastError = null;
  let lastResponse = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let sawRetryableFailure = false;

    for (const base of getPythonApiBases()) {
      try {
        const res = await fetch(`${base}${path}`, buildInit());

        if (res.ok) {
          preferredPythonApiBase = base;
          return res;
        }

        // Retry when the Vite proxy returns 5xx because the Python port is unreachable.
        if (base === '/pyapi' && res.status >= 500) {
          lastResponse = res;
          sawRetryableFailure = true;
          continue;
        }

        preferredPythonApiBase = base;
        return res;
      } catch (err) {
        lastError = err;
        sawRetryableFailure = true;
      }
    }

    if (!sawRetryableFailure || attempt === maxAttempts) {
      break;
    }

    await sleep(retryDelayMs);
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError || new Error('Python backend is unavailable');
}

async function parseErrorResponse(res) {
  let detail = `HTTP ${res.status}`;

  try {
    const body = await res.json();
    detail = body.error || body.detail || body.message || detail;
  } catch {
    try {
      detail = await res.text();
    } catch {}
  }

  if (
    res.status >= 500 &&
    (
      !detail ||
      detail === `HTTP ${res.status}` ||
      /ECONNREFUSED|proxy error|cannot connect/i.test(detail)
    )
  ) {
    const isRunning = await isPythonAiServiceRunning();
    if (!isRunning) {
      return `Python AI service is not running on 127.0.0.1:${PYTHON_API_PORT}`;
    }
    return detail && detail !== `HTTP ${res.status}`
      ? detail
      : `Python AI service returned HTTP ${res.status}`;
  }

  return detail;
}

export function setRuntimeLlmApiKey(apiKey) {
  runtimeLlmApiKey = (apiKey || '').trim();
}

function withOptionalLlmApiKey(body) {
  if (!runtimeLlmApiKey) {
    return body;
  }
  return {
    ...body,
    llm_api_key: runtimeLlmApiKey,
  };
}

async function postAiReport(path, body) {
  const payload = JSON.stringify(body);
  const requestKey = `${path}::${payload}`;

  if (inFlightAiRequests.has(requestKey)) {
    return inFlightAiRequests.get(requestKey);
  }

  const requestPromise = (async () => {
    try {
      const res = await fetchPythonApi(path, () => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(120000),
      }), {
        maxAttempts: 2,
        retryDelayMs: 500,
      });

      if (!res.ok) {
        return { success: false, error: await parseErrorResponse(res) };
      }

      const data = await res.json();
      return data?.success ? { ...data, data: sanitizeAiReport(data.data) } : data;
    } catch (err) {
      const isRunning = await isPythonAiServiceRunning();
      return {
        success: false,
        error: isRunning ? err.message : `Python AI service is not running on 127.0.0.1:${PYTHON_API_PORT}`,
      };
    } finally {
      inFlightAiRequests.delete(requestKey);
    }
  })();

  inFlightAiRequests.set(requestKey, requestPromise);
  return requestPromise;
}

export async function checkPythonBackend() {
  try {
    const res = await fetchPythonApi('/health', () => ({
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    }));
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function fetchLlmConfig() {
  try {
    const res = await fetchPythonApi('/llm-config', () => ({
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    }));

    if (!res.ok) {
      return { success: false, error: await parseErrorResponse(res) };
    }

    const data = await res.json();
    if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'success')) {
      return data;
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function analyzeGripCSV(csvContent, handType) {
  const payload = JSON.stringify({
    csv_content: csvContent,
    hand_type: handType,
  });

  const res = await fetchPythonApi('/analyze-grip', () => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }));

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }

  return res.json();
}

export async function analyzeSitStandCSV(standCsv, sitCsv, username) {
  const res = await fetchPythonApi('/analyze-sitstand', () => {
    const form = new FormData();
    form.append('stand_file', new Blob([standCsv], { type: 'text/csv' }), 'stand.csv');
    form.append('sit_file', new Blob([sitCsv], { type: 'text/csv' }), 'sit.csv');
    form.append('username', username || 'User');
    return {
      method: 'POST',
      body: form,
    };
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }

  return res.json();
}

export async function analyzeStandingCSV(csvContent, fps = 42, thresholdRatio = 0.8) {
  const res = await fetchPythonApi('/analyze-standing', () => {
    const form = new FormData();
    form.append('csv_file', new Blob([csvContent], { type: 'text/csv' }), 'standing.csv');
    form.append('fps', String(fps));
    form.append('threshold_ratio', String(thresholdRatio));
    return {
      method: 'POST',
      body: form,
    };
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }

  return res.json();
}

export async function generateGripAIReport(patientInfo, gripData) {
  if (!AI_ENABLED) return null; // AI 停用：不发起任何请求
  return postAiReport('/generate-grip-ai-report', withOptionalLlmApiKey({
    patient_info: patientInfo,
    grip_data: gripData,
  }));
}

/**
 * 握力报告的 toC 文案（reports-v2 的「AI 健康总结」+「个性化改善建议」）。
 *
 * 与 generateGripAIReport 的区别只在后端 prompt：那个出专业判读，
 * 这个出面向老人和家属的口语化文案。
 *
 * @param {object} patientInfo { name, gender, age }
 * @param {object} facts       gripReportEnrich.buildGripAiFacts() 的输出
 * @returns {Promise<{success:boolean,data?:{aiSummary,advice},error?:string}>}
 */
export async function generateGripTocAIReport(patientInfo, facts) {
  if (!AI_ENABLED) return null; // AI 停用：不发起任何请求
  return postAiReport('/generate-grip-toc-ai-report', withOptionalLlmApiKey({
    patient_info: patientInfo,
    assessment_data: facts,
  }));
}

/* ── 以下三个是 toC 报告页（reports-v2）用的文案接口 ──
 * 与同名的非 toc 版本只差 prompt：那些产出专业判读，这些产出
 * 面向老人和家属的口语化文案，字段形状与各自 mapper 的契约对齐。
 * 入参 facts 是前端 assessmentAiFacts.buildXxxAiFacts() 的输出。
 */
export async function generateSitStandTocAIReport(patientInfo, facts) {
  if (!AI_ENABLED) return null;
  return postAiReport('/generate-sitstand-toc-ai-report', withOptionalLlmApiKey({
    patient_info: patientInfo,
    assessment_data: facts,
  }));
}

export async function generateStandingTocAIReport(patientInfo, facts) {
  if (!AI_ENABLED) return null;
  return postAiReport('/generate-standing-toc-ai-report', withOptionalLlmApiKey({
    patient_info: patientInfo,
    assessment_data: facts,
  }));
}

export async function generateGaitTocAIReport(patientInfo, facts) {
  if (!AI_ENABLED) return null;
  return postAiReport('/generate-gait-toc-ai-report', withOptionalLlmApiKey({
    patient_info: patientInfo,
    assessment_data: facts,
  }));
}

export async function generateSitStandAIReport(patientInfo, assessmentData) {
  return postAiReport('/generate-sitstand-ai-report', withOptionalLlmApiKey({
    patient_info: patientInfo,
    assessment_data: assessmentData,
  }));
}

export async function generateStandingAIReport(patientInfo, assessmentData) {
  return postAiReport('/generate-standing-ai-report', withOptionalLlmApiKey({
    patient_info: patientInfo,
    assessment_data: assessmentData,
  }));
}

export async function generateGaitAIReport(patientInfo, assessmentData) {
  return postAiReport('/generate-gait-ai-report', withOptionalLlmApiKey({
    patient_info: patientInfo,
    assessment_data: assessmentData,
  }));
}

export async function streamGripAIReport(patientInfo, gripData, onChunk) {
  if (!AI_ENABLED) return; // AI 停用：不发起任何请求
  try {
    const payload = JSON.stringify(withOptionalLlmApiKey({
      patient_info: patientInfo,
      grip_data: gripData,
    }));
    const res = await fetchPythonApi('/stream-grip-ai-report', () => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(120000),
    }));

    if (!res.ok) {
      return { success: false, error: await parseErrorResponse(res) };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const payloadChunk = JSON.parse(line.slice(6));
          if (payloadChunk.error) {
            return { success: false, error: payloadChunk.error };
          }
          if (payloadChunk.chunk) {
            fullText += payloadChunk.chunk;
            onChunk(fullText);
          }
        } catch {}
      }
    }

    const data = JSON.parse(fullText);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function analyzeGaitCSV(csvContents) {
  const res = await fetchPythonApi('/analyze-gait', () => {
    const form = new FormData();
    csvContents.forEach((csv, i) => {
      form.append(`file${i + 1}`, new Blob([csv], { type: 'text/csv' }), `${i + 1}.csv`);
    });
    return {
      method: 'POST',
      body: form,
    };
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }

  return res.json();
}
