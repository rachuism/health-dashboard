// Persists a daily snapshot of the four metrics the recovery-signal model
// (see ml/) trains on. Local-only (localStorage), never sent anywhere — kept
// separate from Google/Strava auth state on purpose. Feature names match
// ml/model.py's FEATURE_ORDER so an export here can be fed straight into
// ml/train_recovery_model.py --history.

export type Feeling = "bad" | "okay" | "good";

// The four numeric metrics the recovery-signal model trains/scores on --
// kept as its own type (rather than deriving from DailyHistoryEntry's keys)
// so recovery.ts's feature vector can't accidentally widen to include
// `feeling`/`flagged`, which aren't numeric.
export type MetricKey = "hrvMs" | "rhrBpm" | "sleepMinutes" | "activeZoneMinutes";

export type DailyHistoryEntry = {
  date: string;
  hrvMs: number | null;
  rhrBpm: number | null;
  sleepMinutes: number | null;
  activeZoneMinutes: number | null;
  // Self-reported, and the recovery-signal verdict once computed -- kept
  // side by side so getFeelingConcordance() can check whether "flagged"
  // days actually track how the day felt, instead of just trusting the model's
  // own math.
  feeling: Feeling | null;
  flagged: boolean | null;
};

type CompleteHistoryEntry = DailyHistoryEntry & Record<MetricKey, number>;

const STORAGE_KEY = "health-dashboard/daily-history";

// UTC-keyed so recording never depends on the browser's local timezone
// setting; entries near midnight may land on a different calendar day than
// the user's local one, but the key stays consistent day to day.
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadAll(): Record<string, DailyHistoryEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DailyHistoryEntry>) : {};
  } catch {
    return {};
  }
}

function saveAll(entries: Record<string, DailyHistoryEntry>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// Merges into today's entry instead of overwriting it, since exercise and
// vitals are fetched independently in dashboard.ts and can each succeed or
// fail on their own -- a failed fetch must never clobber a metric that a
// previous successful fetch already recorded for today. Only non-null
// values are merged in: a null here means "not fetched successfully", not
// "confirmed zero".
export function recordTodayMetrics(partial: Partial<Omit<DailyHistoryEntry, "date">>): void {
  const entries = loadAll();
  const date = todayKey();
  const existing: DailyHistoryEntry =
    entries[date] ??
    { date, hrvMs: null, rhrBpm: null, sleepMinutes: null, activeZoneMinutes: null, feeling: null, flagged: null };

  const updates = Object.fromEntries(Object.entries(partial).filter(([, value]) => value != null));
  entries[date] = { ...existing, ...updates };
  saveAll(entries);
}

export function recordTodayFeeling(feeling: Feeling): void {
  recordTodayMetrics({ feeling });
}

export function getHistory(): DailyHistoryEntry[] {
  return Object.values(loadAll()).sort((a, b) => a.date.localeCompare(b.date));
}

export function getTodayEntry(): DailyHistoryEntry | undefined {
  return loadAll()[todayKey()];
}

export function isCompleteEntry(entry: DailyHistoryEntry): entry is CompleteHistoryEntry {
  return entry.hrvMs != null && entry.rhrBpm != null && entry.sleepMinutes != null && entry.activeZoneMinutes != null;
}

// Shape matches ml/data/synthetic_history.json -- days with any metric still
// missing are dropped, since the autoencoder needs a complete 4-value vector
// per day.
export function exportCompleteHistoryJson(): string {
  return JSON.stringify(getHistory().filter(isCompleteEntry), null, 2);
}

export type FeelingConcordance = {
  ratedDays: number;
  badRateWhenFlagged: number | null;
  badRateWhenNotFlagged: number | null;
};

const MIN_RATED_DAYS = 10;

// Checks whether "flagged" days actually track how the day felt, rather than
// just trusting the model's own math (see the conversation this came from --
// the model had only ever been validated against synthetic anomalies, never
// against a real person's felt experience). Needs both a feeling rating and
// a computed recovery signal for the same day, so this only reflects days
// where updateRecoverySignal() ran and the feeling buttons were used.
export function getFeelingConcordance(): FeelingConcordance | null {
  const rated = getHistory().filter(
    (e): e is DailyHistoryEntry & { feeling: Feeling; flagged: boolean } => e.feeling != null && e.flagged != null
  );
  if (rated.length < MIN_RATED_DAYS) return null;

  const flagged = rated.filter((e) => e.flagged);
  const notFlagged = rated.filter((e) => !e.flagged);
  const badRate = (days: DailyHistoryEntry[]) =>
    days.length ? days.filter((e) => e.feeling === "bad").length / days.length : null;

  return {
    ratedDays: rated.length,
    badRateWhenFlagged: badRate(flagged),
    badRateWhenNotFlagged: badRate(notFlagged),
  };
}
