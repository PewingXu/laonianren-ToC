const GAIT_FOOT_KEYS = Object.freeze(['foot1', 'foot2', 'foot3', 'foot4'])

function frameFromStoredValue(value, expectedFrameSize) {
  const frame = Array.isArray(value) ? value : value?.arr
  if (!Array.isArray(frame)) return null
  if (expectedFrameSize !== null && frame.length !== expectedFrameSize) return null
  return frame
}

function comparableStamp(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return `${typeof value}:${String(value)}`
  }
  try {
    return `json:${JSON.stringify(value)}`
  } catch {
    return null
  }
}

function finiteTimestamp(value) {
  if (value === undefined || value === null || value === '' || typeof value === 'boolean') {
    return null
  }
  const timestamp = Number(value)
  // Epoch timestamps are used to order streams and are serialized into the
  // Python parser's calendar format. Treat zero/negative values as missing so
  // malformed legacy rows cannot introduce a 1970 frame or move a stream
  // before the real acquisition window.
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

/**
 * Matrix rows are sparse by design: storageData writes only devices whose
 * stamp changed. Keep each board's native time series independent and let the
 * gait algorithm align the four streams by timestamp.
 */
function extractGaitBoardSeries(rows, {
  footKeys = GAIT_FOOT_KEYS,
  expectedFrameSize = 4096,
} = {}) {
  const boardData = footKeys.map(() => [])
  const boardTimes = footKeys.map(() => [])
  const seenStamps = footKeys.map(() => new Set())
  const rejectedFrames = footKeys.map(() => 0)
  const rejectedTimestamps = footKeys.map(() => 0)

  for (const row of Array.isArray(rows) ? rows : []) {
    let stored = {}
    try {
      stored = typeof row?.data === 'string'
        ? JSON.parse(row.data || '{}')
        : (row?.data || {})
    } catch {
      continue
    }
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) continue

    footKeys.forEach((footKey, index) => {
      if (!Object.prototype.hasOwnProperty.call(stored, footKey)) return

      const item = stored[footKey]
      const frame = frameFromStoredValue(item, expectedFrameSize)
      if (!frame) {
        rejectedFrames[index] += 1
        return
      }

      const rawStamp = item && !Array.isArray(item) && typeof item === 'object'
        ? item.stamp
        : null
      const stamp = comparableStamp(rawStamp)
      if (stamp !== null && seenStamps[index].has(stamp)) return

      const timestamp = finiteTimestamp(rawStamp) ?? finiteTimestamp(row?.timestamp)
      if (timestamp === null) {
        rejectedTimestamps[index] += 1
        return
      }

      boardData[index].push(frame)
      boardTimes[index].push(timestamp)
      if (stamp !== null) seenStamps[index].add(stamp)
    })
  }

  boardData.forEach((series, index) => {
    const ordered = series.map((frame, frameIndex) => ({
      frame,
      timestamp: boardTimes[index][frameIndex],
    })).sort((left, right) => left.timestamp - right.timestamp)
    boardData[index] = ordered.map((item) => item.frame)
    boardTimes[index] = ordered.map((item) => item.timestamp)
  })

  return { boardData, boardTimes, rejectedFrames, rejectedTimestamps }
}

module.exports = {
  GAIT_FOOT_KEYS,
  extractGaitBoardSeries,
}
