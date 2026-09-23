// Apo — типы и контракт с движком.
// Порог точности 0.80: ниже — автозапуск второй модели и пометка уточнения.
// NATIVE OWNER (Ares): движок держит APO_ACCURACY_THRESHOLD синхронно.
export const APO_CONFIDENCE_THRESHOLD = 0.80;

export const APO_KEYS = {
  history: 'apo_history_v1',
  quota: 'apo_quota_v1',
  sub: 'apo_sub_v1',
  explainCache: 'apo_explain_cache_v1',
} as const;

export interface ApoOption {
  key: string;
  text: string;
}

export interface ApoQuestion {
  id: string;
  stem: string;
  options: ApoOption[];
}

export interface ApoIngestResult {
  text: string;
  questions: ApoQuestion[];
  warnings: string[];
}

export interface ApoSolveResult {
  answerIndex: number;
  confidence: number[];
  ms: number;
  lowAccuracy: boolean;
  /** Ответ уточнён второй моделью (авто при точности ниже порога). */
  refined?: boolean;
}

export type ApoSubPlan = 'free' | 'base' | 'unlimited';

export interface ApoHistoryItem {
  id: string;
  stem: string;
  answer: string;
  confidence: number;
  at: number;
}
