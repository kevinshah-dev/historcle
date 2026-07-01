import type { HistorcleQuestion } from "@/types/historcle";

export const DAILY_QUESTION_COUNT = 5;
export const PUZZLE_EPOCH_DATE = "2026-07-01";
export const NEW_YORK_TIME_ZONE = "America/New_York";

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const random = seededRandom(seed);
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function getNewYorkDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not format the New York date.");
  }

  return `${year}-${month}-${day}`;
}

function parseDateAsUtc(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function getPuzzleNumber(date: string): number {
  const dayDelta = Math.floor(
    (parseDateAsUtc(date) - parseDateAsUtc(PUZZLE_EPOCH_DATE)) / 86_400_000,
  );

  return Math.max(1, dayDelta + 1);
}

export function getDailyQuestions(
  date: string,
  questions: HistorcleQuestion[],
  count = DAILY_QUESTION_COUNT,
): HistorcleQuestion[] {
  if (questions.length < count) {
    throw new Error(`Need at least ${count} Historcle questions.`);
  }

  const selected: HistorcleQuestion[] = [];
  const usedIds = new Set<string>();

  for (const question of seededShuffle(questions, `historcle:${date}`)) {
    if (usedIds.has(question.id)) {
      continue;
    }

    selected.push(question);
    usedIds.add(question.id);

    if (selected.length === count) {
      break;
    }
  }

  return selected;
}
