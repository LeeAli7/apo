// apo — public surface of the Apo engine (client side).

export { sha256Hex, cacheKey } from './hash';
export { APO_KEYS, storeGet, storeSet, loadJson, saveJson } from './store';
export { getDeviceId } from './device';
export {
  apiConfigured,
  solveRemote,
  structureRemote,
  explainRemote,
  quotaRemote,
  parseDocumentRemote,
  ApoApiError,
  APO_API_URL,
  type RemoteSolve,
  type RemoteStructure,
  type RemoteExplain,
  type RemoteQuota,
  type RemoteParsedDocument,
  type RemoteParsedQuestion,
} from './api';
export {
  ingestFile,
  parseQuestions,
  normalizeText,
  type ApoFileInput,
  type ApoQuestion,
  type IngestResult,
} from './ingest';
export {
  solveTest,
  buildChoicePayload,
  APO_ACCURACY_THRESHOLD,
  type SolveInput,
  type SolveResult,
  type ChoicePayload,
} from './solver';
export { explainText, buildExplainPrompt, type ExplainResult } from './explain';
export {
  isPro,
  setPro,
  quotaRemaining,
  quotaView,
  consumeQuota,
  pushHistory,
  readHistory,
  clearExplainCache,
  appVersion,
  setAppVersion,
  APO_FREE_DAILY,
  APO_HISTORY_CAP,
  type QuotaState,
  type QuotaView,
  type HistoryEntry,
} from './quota';
export { DECISION_ENGINE, EXPLAIN_MODEL, APO_COST_PER_1000_SOLVES_USD } from './providers';
