export type Stats = {
  streak: number;
  lastCompletedDate?: string;
  completions: number;
  behavioralIntegrity: number;
  workforceReadiness: number;
  denialCount: number;
  insultsReceived: number;
  unlockUntil?: number;
  confessionSamples: string[];
};

const KEY = "productivityCaptcha.stats";

export const defaultStats: Stats = {
  streak: 0,
  completions: 0,
  behavioralIntegrity: 64,
  workforceReadiness: 12,
  denialCount: 0,
  insultsReceived: 0,
  confessionSamples: []
};

export function readStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaultStats, ...JSON.parse(raw) } : defaultStats;
  } catch {
    return defaultStats;
  }
}

export function writeStats(stats: Stats) {
  localStorage.setItem(KEY, JSON.stringify(stats));
}

export function completeSession(score: number, denied: boolean) {
  const today = new Date().toISOString().slice(0, 10);
  const current = readStats();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const streak =
    current.lastCompletedDate === today
      ? current.streak
      : current.lastCompletedDate === yesterday
        ? current.streak + 1
        : 1;

  const next = {
    ...current,
    streak,
    lastCompletedDate: today,
    completions: current.completions + 1,
    behavioralIntegrity: Math.max(3, Math.min(99, Math.round((current.behavioralIntegrity + score) / 2))),
    workforceReadiness: score,
    denialCount: current.denialCount + (denied ? 1 : 0),
    unlockUntil: undefined
  };
  writeStats(next);
  return next;
}

export function saveConfession(confession: string) {
  const current = readStats();
  const confessionSamples = [confession, ...current.confessionSamples].slice(0, 6);
  writeStats({ ...current, confessionSamples });
}
