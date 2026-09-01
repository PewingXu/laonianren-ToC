/** @typedef {'grip' | 'sitstand' | 'standing' | 'gait'} AssessmentType */

/**
 * @typedef {object} LegacyAssessment
 * @property {boolean} completed
 * @property {string} assessmentId
 * @property {{reportData: object} | null} report
 */

/**
 * @typedef {object} LegacyAssessmentRecord
 * @property {string} id
 * @property {string} sessionId
 * @property {string} patientName
 * @property {string} patientGender
 * @property {number} patientAge
 * @property {number} patientWeight
 * @property {string} institution
 * @property {string} date
 * @property {string} dateStr
 * @property {string} updatedAt
 * @property {Record<AssessmentType, LegacyAssessment>} assessments
 */

/**
 * @typedef {object} MetricView
 * @property {string} label
 * @property {string} value
 * @property {string} [unit]
 * @property {string} [reference]
 * @property {string} [icon]
 */

/**
 * @typedef {object} StatusView
 * @property {string} label
 * @property {'positive' | 'caution' | 'muted'} tone
 */

/**
 * @typedef {object} AbilityView
 * @property {AssessmentType} type
 * @property {string} title
 * @property {string} description
 * @property {boolean} available
 * @property {number} score
 * @property {StatusView} status
 * @property {MetricView[]} metrics
 * @property {string} insight
 * @property {string} image
 */

/**
 * @typedef {object} PatientView
 * @property {string} name
 * @property {string} gender
 * @property {number | null} age
 * @property {number | null} weight
 * @property {string} institution
 */

/**
 * @typedef {object} HeroView
 * @property {string} title
 * @property {string} content
 * @property {string} status
 * @property {string} image
 * @property {number} score
 * @property {boolean} hasScore
 * @property {'positive' | 'caution' | 'unavailable'} state
 */

/**
 * @typedef {object} AdviceView
 * @property {string} title
 * @property {string} action
 * @property {string} content
 */

/**
 * @typedef {object} PeerComparisonView
 * @property {string} [intro]
 * @property {number} percentile
 * @property {string} [summary]
 */

/**
 * @typedef {object} TrendPointView
 * @property {string} label
 * @property {number} score
 */

/**
 * @typedef {object} TrendView
 * @property {string} title
 * @property {string} summary
 * @property {TrendPointView[]} points
 */

/**
 * @typedef {object} NextAssessmentView
 * @property {string} title
 * @property {string} heading
 * @property {string} content
 * @property {number} days
 */

/**
 * @typedef {object} HealthOverviewData
 * @property {string} recordId
 * @property {string} recordedAt
 * @property {PatientView} patient
 * @property {HeroView} hero
 * @property {AbilityView[]} abilities
 * @property {AdviceView[]} advice
 * @property {string} expertInsight
 * @property {PeerComparisonView | null} peerComparison
 * @property {TrendView} trend
 * @property {NextAssessmentView} nextAssessment
 * @property {string | null} reminderDate
 */

export {};
