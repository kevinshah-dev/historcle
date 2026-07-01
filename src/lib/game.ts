import { HISTORCLE_QUESTIONS } from "@/data/questions";
import { DAILY_QUESTION_COUNT, getDailyQuestions, getPuzzleNumber } from "@/lib/daily";
import {
  getAverageDistance,
  getDistanceMiles,
  getQuestionScore,
  getShareBand,
  getTotalScore,
  MAX_TOTAL_SCORE,
  normalizePoint,
} from "@/lib/geo";
import type { ConfirmedAnswer, GeoPoint, HistorcleQuestion, StoredHistorcleGame } from "@/types/historcle";

export function createGameState(date: string): StoredHistorcleGame {
  const questions = getDailyQuestions(date, HISTORCLE_QUESTIONS, DAILY_QUESTION_COUNT);

  return {
    date,
    puzzleNumber: getPuzzleNumber(date),
    questionIds: questions.map((question) => question.id),
    currentQuestionIndex: 0,
    draftGuesses: Array.from({ length: DAILY_QUESTION_COUNT }, () => null),
    confirmedAnswers: Array.from({ length: DAILY_QUESTION_COUNT }, () => null),
    completed: false,
  };
}

export function getQuestionsForState(state: StoredHistorcleGame): HistorcleQuestion[] {
  const byId = new Map(HISTORCLE_QUESTIONS.map((question) => [question.id, question]));
  return state.questionIds
    .map((id) => byId.get(id))
    .filter((question): question is HistorcleQuestion => Boolean(question));
}

export function isValidStoredGame(state: StoredHistorcleGame, date: string): boolean {
  return (
    state.date === date &&
    state.questionIds.length === DAILY_QUESTION_COUNT &&
    state.confirmedAnswers.length === DAILY_QUESTION_COUNT &&
    getQuestionsForState(state).length === DAILY_QUESTION_COUNT
  );
}

export function setDraftGuess(
  state: StoredHistorcleGame,
  questionIndex: number,
  guess: GeoPoint,
): StoredHistorcleGame {
  if (state.completed || state.confirmedAnswers[questionIndex]) {
    return state;
  }

  const draftGuesses = [...state.draftGuesses];
  draftGuesses[questionIndex] = normalizePoint(guess);

  return {
    ...state,
    draftGuesses,
  };
}

export function confirmCurrentGuess(state: StoredHistorcleGame): StoredHistorcleGame {
  const question = getQuestionsForState(state)[state.currentQuestionIndex];
  const guess = state.draftGuesses[state.currentQuestionIndex];

  if (!question || !guess || state.completed || state.confirmedAnswers[state.currentQuestionIndex]) {
    return state;
  }

  const distanceMiles = getDistanceMiles(guess, {
    latitude: question.latitude,
    longitude: question.longitude,
  });
  const confirmedAnswer: ConfirmedAnswer = {
    questionId: question.id,
    guess,
    distanceMiles: Number(distanceMiles.toFixed(2)),
    score: getQuestionScore(distanceMiles),
  };
  const confirmedAnswers = [...state.confirmedAnswers];
  confirmedAnswers[state.currentQuestionIndex] = confirmedAnswer;
  const completed = state.currentQuestionIndex === DAILY_QUESTION_COUNT - 1;

  return {
    ...state,
    confirmedAnswers,
    completed,
    completedAt: completed ? new Date().toISOString() : state.completedAt,
  };
}

export function advanceQuestion(state: StoredHistorcleGame): StoredHistorcleGame {
  if (state.completed) {
    return state;
  }

  const nextIndex = Math.min(state.currentQuestionIndex + 1, DAILY_QUESTION_COUNT - 1);

  return {
    ...state,
    currentQuestionIndex: nextIndex,
  };
}

export function getCompletedAnswers(state: StoredHistorcleGame): ConfirmedAnswer[] {
  return state.confirmedAnswers.filter((answer): answer is ConfirmedAnswer => Boolean(answer));
}

export function buildShareText(state: StoredHistorcleGame): string {
  const answers = getCompletedAnswers(state);
  const score = getTotalScore(state.confirmedAnswers);
  const squares = answers.map((answer) => getShareBand(answer.score)).join("");
  const averageDistance = Math.round(getAverageDistance(answers)).toLocaleString();

  return [
    `Historcle #${state.puzzleNumber} - ${score.toLocaleString()}/${MAX_TOTAL_SCORE.toLocaleString()}`,
    squares,
    `Avg distance: ${averageDistance} mi`,
  ].join("\n");
}
