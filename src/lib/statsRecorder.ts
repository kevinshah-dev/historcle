"use client";

import { useAuth, useUser } from "@clerk/react";
import { useEffect, useMemo } from "react";

type ScoreSubmission = {
  gameId: string;
  mode: "daily" | "streak";
  score: number;
  maxScore?: number | null;
  playedOn: string;
  playedAt?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

const STATS_API_URL = (
  process.env.NEXT_PUBLIC_CLOSEENOUGH_STATS_API_URL || ""
).replace(/\/+$/, "");

export function useScoreSubmission(payload: ScoreSubmission | null) {
  const { getToken } = useAuth();
  const { isLoaded, isSignedIn, user } = useUser();
  const payloadFingerprint = useMemo(
    () => (payload ? JSON.stringify(payload) : ""),
    [payload],
  );

  useEffect(() => {
    if (!STATS_API_URL || !isLoaded || !isSignedIn || !user || !payloadFingerprint) {
      return;
    }

    const submission = JSON.parse(payloadFingerprint) as ScoreSubmission;
    const storageKey = [
      "closeenough",
      "score-submitted",
      user.id,
      submission.gameId,
      submission.idempotencyKey,
    ].join(":");

    if (window.localStorage.getItem(storageKey)) {
      return;
    }

    let cancelled = false;

    async function submitScore() {
      try {
        const token = await getToken();

        if (!token || cancelled) {
          return;
        }

        const response = await fetch(`${STATS_API_URL}/v1/scores`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(submission),
        });

        if (!response.ok) {
          throw new Error(`Stats API returned ${response.status}`);
        }

        window.localStorage.setItem(storageKey, new Date().toISOString());
      } catch (error) {
        console.warn("Could not save CloseEnough score history.", error);
      }
    }

    submitScore();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, payloadFingerprint, user]);
}
