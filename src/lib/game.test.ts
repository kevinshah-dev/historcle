import { describe, expect, it } from "vitest";
import { HISTORCLE_QUESTIONS } from "@/data/questions";
import { DAILY_QUESTION_COUNT, getDailyQuestions, getNewYorkDateKey } from "@/lib/daily";
import { getDistanceMiles, getQuestionScore } from "@/lib/geo";

describe("Historcle scoring", () => {
  it("awards full credit inside the close radius", () => {
    expect(getQuestionScore(0)).toBe(1000);
    expect(getQuestionScore(50)).toBe(1000);
  });

  it("uses the distance falloff after the close radius", () => {
    expect(getQuestionScore(5000)).toBe(0);
    expect(getQuestionScore(2525)).toBe(354);
  });

  it("calculates Haversine distance in miles", () => {
    const distance = getDistanceMiles(
      { latitude: 40.7128, longitude: -74.006 },
      { latitude: 51.5074, longitude: -0.1278 },
    );

    expect(Math.round(distance)).toBe(3461);
  });
});

describe("Historcle daily selection", () => {
  it("selects the same unique questions for the same date", () => {
    const first = getDailyQuestions("2026-07-01", HISTORCLE_QUESTIONS);
    const second = getDailyQuestions("2026-07-01", HISTORCLE_QUESTIONS);

    expect(first.map((question) => question.id)).toEqual(second.map((question) => question.id));
    expect(new Set(first.map((question) => question.id)).size).toBe(DAILY_QUESTION_COUNT);
  });

  it("changes the question set when the New York date changes", () => {
    const first = getDailyQuestions("2026-07-01", HISTORCLE_QUESTIONS);
    const second = getDailyQuestions("2026-07-02", HISTORCLE_QUESTIONS);

    expect(first.map((question) => question.id)).not.toEqual(second.map((question) => question.id));
  });

  it("rolls over by America/New_York rather than UTC", () => {
    expect(getNewYorkDateKey(new Date("2026-07-02T03:59:00Z"))).toBe("2026-07-01");
    expect(getNewYorkDateKey(new Date("2026-07-02T04:00:00Z"))).toBe("2026-07-02");
  });
});

describe("Historcle question bank", () => {
  it("starts with exactly 100 typed questions", () => {
    expect(HISTORCLE_QUESTIONS).toHaveLength(100);
  });
});
