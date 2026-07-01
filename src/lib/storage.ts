import type { StoredHistorcleGame } from "@/types/historcle";

const STORAGE_PREFIX = "historcle-daily";

function storageKey(date: string): string {
  return `${STORAGE_PREFIX}:${date}`;
}

export function loadDailyGame(date: string): StoredHistorcleGame | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey(date));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredHistorcleGame;
    return parsed.date === date ? parsed : null;
  } catch {
    window.localStorage.removeItem(storageKey(date));
    return null;
  }
}

export function saveDailyGame(state: StoredHistorcleGame): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey(state.date), JSON.stringify(state));
}
