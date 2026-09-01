const MAX_TEXT_LENGTH = 500;
const MAX_ADVICE_ITEMS = 8;
const MAX_ADVICE_LENGTH = 300;
const MAX_NEXT_ASSESSMENT_DAYS = 365;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function boundedStringArray(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ADVICE_ITEMS) {
    return null;
  }

  const normalized = value.map((item) => boundedString(item, MAX_ADVICE_LENGTH));
  return normalized.every(Boolean) ? normalized : null;
}

function validPeerPercentile(value, allowMock) {
  if (!isObject(value) || !Number.isFinite(value.percentile) || value.percentile < 0 || value.percentile > 100) {
    return null;
  }

  const isVerified = Number.isFinite(value.sampleSize) && value.sampleSize > 0;
  if (!isVerified && (!allowMock || value.mock !== true)) {
    return null;
  }

  return value.percentile;
}

function validNextAssessmentDays(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_NEXT_ASSESSMENT_DAYS ? value : null;
}

function resolvePeerComparison(sources) {
  let percentile = null;
  for (const source of sources) {
    percentile = validPeerPercentile(source.content.peerComparison, source.allowMockPeer);
    if (percentile !== null) break;
  }
  if (percentile === null) return null;

  const peerSources = sources.map((source) => validSource(source.content.peerComparison));
  const intro = firstValid(peerSources.map((source) => source.intro), boundedString);
  const summary = firstValid(peerSources.map((source) => source.summary), boundedString);
  return {
    ...(intro ? { intro } : {}),
    percentile,
    ...(summary ? { summary } : {}),
  };
}

function resolveNextAssessment(sources) {
  const nextSources = sources.map((source) => validSource(source.content.nextAssessment));
  const title = firstValid(nextSources.map((source) => source.title), boundedString);
  const heading = firstValid(nextSources.map((source) => source.heading), boundedString);
  const content = firstValid(nextSources.map((source) => source.content), boundedString);
  const days = firstValid(nextSources.map((source) => source.days), validNextAssessmentDays);
  return title && heading && content && days !== null ? { title, heading, content, days } : null;
}

function validSource(source) {
  return isObject(source) ? source : {};
}

function validCacheKey(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function firstValid(sources, validator) {
  for (const source of sources) {
    const value = validator(source);
    if (value !== null) return value;
  }
  return null;
}

/** Creates the version-specific key used to validate persisted AI narrative content. */
export function buildNarrativeCacheKey({ recordId, updatedAt, promptVersion, modelVersion } = {}) {
  return JSON.stringify(
    [recordId, updatedAt, promptVersion, modelVersion].map((value) => String(value ?? '')),
  );
}

/** Resolves each narrative field independently, from current cache through manual and rule content. */
export function resolveNarrative({ cachedAi, manual, rules, expectedCacheKey } = {}) {
  const cachedKey = validCacheKey(cachedAi?.cacheKey);
  const expectedKey = validCacheKey(expectedCacheKey);
  const cachedContent = cachedKey !== null && expectedKey !== null && cachedKey === expectedKey
    ? validSource(cachedAi.content)
    : {};
  const sources = [
    { content: cachedContent, allowMockPeer: false },
    { content: validSource(manual), allowMockPeer: true },
    { content: validSource(rules), allowMockPeer: true },
  ];

  return {
    greeting: firstValid(sources.map((source) => source.content.greeting), boundedString),
    advice: firstValid(sources.map((source) => source.content.advice), boundedStringArray),
    expertInsight: firstValid(sources.map((source) => source.content.expertInsight), boundedString),
    peerComparison: resolvePeerComparison(sources),
    trendSummary: firstValid(sources.map((source) => source.content.trendSummary), boundedString),
    nextAssessment: resolveNextAssessment(sources),
  };
}
