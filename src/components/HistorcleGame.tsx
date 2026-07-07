"use client";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Compass,
  ExternalLink,
  LocateFixed,
  MapPin,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ClerkAuthControls } from "@/components/ClerkAuthControls";
import { ShareButton } from "@/components/ShareButton";
import { WorldMap } from "@/components/WorldMap";
import { getNewYorkDateKey } from "@/lib/daily";
import {
  formatMiles,
  getAverageDistance,
  getTotalScore,
  MAX_TOTAL_SCORE,
} from "@/lib/geo";
import {
  advanceQuestion,
  buildShareText,
  confirmCurrentGuess,
  createGameState,
  getCompletedAnswers,
  getQuestionsForState,
  isValidStoredGame,
  setDraftGuess,
} from "@/lib/game";
import { loadDailyGame, saveDailyGame } from "@/lib/storage";
import { useScoreSubmission } from "@/lib/statsRecorder";
import type { ConfirmedAnswer, HistorcleQuestion, StoredHistorcleGame } from "@/types/historcle";

const CENOUGH_GAMES_URL = "https://cenough.games";
const HISTORCLE_URL = "https://historcle.cenough.games";

function BrandMark() {
  return (
    <div className="brand-mark" aria-label="CloseEnough Historcle">
      <a href={CENOUGH_GAMES_URL} className="brand-home-link">
        CloseEnough
      </a>
      <a href={HISTORCLE_URL} className="brand-game-link">
        Historcle
      </a>
    </div>
  );
}

function loadOrCreateState(date: string): StoredHistorcleGame {
  const saved = loadDailyGame(date);
  if (saved && isValidStoredGame(saved, date)) {
    return saved;
  }

  const nextState = createGameState(date);
  saveDailyGame(nextState);
  return nextState;
}

function questionResultById(state: StoredHistorcleGame): Map<string, ConfirmedAnswer> {
  return new Map(
    state.confirmedAnswers
      .filter((answer): answer is ConfirmedAnswer => Boolean(answer))
      .map((answer) => [answer.questionId, answer]),
  );
}

function ResultsScreen({
  state,
  questions,
}: {
  state: StoredHistorcleGame;
  questions: HistorcleQuestion[];
}) {
  const answers = getCompletedAnswers(state);
  const resultById = questionResultById(state);
  const totalScore = getTotalScore(state.confirmedAnswers);
  const averageDistance = getAverageDistance(answers);
  const best = answers.reduce<ConfirmedAnswer | null>(
    (bestAnswer, answer) =>
      !bestAnswer || answer.distanceMiles < bestAnswer.distanceMiles ? answer : bestAnswer,
    null,
  );
  const worst = answers.reduce<ConfirmedAnswer | null>(
    (worstAnswer, answer) =>
      !worstAnswer || answer.distanceMiles > worstAnswer.distanceMiles ? answer : worstAnswer,
    null,
  );
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const shareText = buildShareText(state);

  return (
    <main className="result-shell">
      <nav className="top-nav" aria-label="Account">
        <BrandMark />
        <ClerkAuthControls />
      </nav>

      <section className="final-panel" aria-labelledby="final-title">
        <div className="final-score-block">
          <p className="small-label">Historcle #{state.puzzleNumber}</p>
          <h1 id="final-title">{totalScore.toLocaleString()}</h1>
          <p>out of {MAX_TOTAL_SCORE.toLocaleString()}</p>
          <div className="result-actions">
            <ShareButton text={shareText} />
            <a href={CENOUGH_GAMES_URL} className="games-link">
              Play More Games at cenough.games
              <ExternalLink aria-hidden="true" size={18} />
            </a>
          </div>
        </div>

        <div className="summary-metrics" aria-label="Score summary">
          <div>
            <span>Average distance</span>
            <strong>{formatMiles(averageDistance)}</strong>
          </div>
          <div>
            <span>Best guess</span>
            <strong>{best ? formatMiles(best.distanceMiles) : "0 mi"}</strong>
          </div>
          <div>
            <span>Worst guess</span>
            <strong>{worst ? formatMiles(worst.distanceMiles) : "0 mi"}</strong>
          </div>
        </div>
      </section>

      <section className="breakdown-panel" aria-label="Question breakdown">
        {questions.map((question, index) => {
          const result = resultById.get(question.id);
          return (
            <article className="breakdown-row" key={question.id}>
              <div>
                <span>Question {index + 1}</span>
                <h2>{question.answerLabel}</h2>
                <p>{question.year} - {question.category}</p>
              </div>
              <div className="breakdown-score">
                <strong>{result?.score.toLocaleString() ?? 0}</strong>
                <span>{result ? formatMiles(result.distanceMiles) : "No guess"}</span>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

export function HistorcleGame() {
  const [date, setDate] = useState<string | null>(null);
  const [state, setState] = useState<StoredHistorcleGame | null>(null);
  const [showFinal, setShowFinal] = useState(false);

  useEffect(() => {
    const dateKey = getNewYorkDateKey();
    const nextState = loadOrCreateState(dateKey);
    setDate(dateKey);
    setState(nextState);
    setShowFinal(nextState.completed);
  }, []);

  useEffect(() => {
    if (!date) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const nextDate = getNewYorkDateKey();
      if (nextDate === date) {
        return;
      }

      const nextState = loadOrCreateState(nextDate);
      setDate(nextDate);
      setState(nextState);
      setShowFinal(nextState.completed);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [date]);

  useEffect(() => {
    if (state) {
      saveDailyGame(state);
    }
  }, [state]);

  const questions = useMemo(() => (state ? getQuestionsForState(state) : []), [state]);
  const completedAnswers = useMemo(() => (state ? getCompletedAnswers(state) : []), [state]);
  const totalScore = state ? getTotalScore(state.confirmedAnswers) : 0;
  const currentQuestion = state ? questions[state.currentQuestionIndex] : null;
  const currentAnswer = state ? state.confirmedAnswers[state.currentQuestionIndex] : null;
  const currentGuess = state ? state.draftGuesses[state.currentQuestionIndex] : null;
  const questionNumber = state ? state.currentQuestionIndex + 1 : 1;
  const averageDistance = getAverageDistance(completedAnswers);

  useScoreSubmission(
    state?.completed
      ? {
          gameId: "historcle",
          mode: "daily",
          score: totalScore,
          maxScore: MAX_TOTAL_SCORE,
          playedOn: state.date,
          playedAt: state.completedAt,
          idempotencyKey: state.date,
          metadata: {
            completed: true,
            puzzleNumber: state.puzzleNumber,
            averageDistance: Number(averageDistance.toFixed(2)),
            completedAt: state.completedAt,
            questions: completedAnswers.map((answer) => ({
              questionId: answer.questionId,
              score: answer.score,
              distanceMiles: answer.distanceMiles,
            })),
          },
        }
      : null,
  );

  function updateGame(nextState: StoredHistorcleGame) {
    setState(nextState);
    saveDailyGame(nextState);
  }

  function handleSelect(point: { latitude: number; longitude: number }) {
    if (!state) {
      return;
    }

    updateGame(setDraftGuess(state, state.currentQuestionIndex, point));
  }

  function handleConfirm() {
    if (!state || !currentGuess) {
      return;
    }

    updateGame(confirmCurrentGuess(state));
  }

  function handleNext() {
    if (!state) {
      return;
    }

    if (state.completed) {
      setShowFinal(true);
      return;
    }

    updateGame(advanceQuestion(state));
  }

  if (!date || !state || !currentQuestion) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <Compass aria-hidden="true" size={28} />
          <span>Loading today's map</span>
        </div>
      </main>
    );
  }

  if (state.completed && showFinal) {
    return <ResultsScreen state={state} questions={questions} />;
  }

  return (
    <main className="game-shell">
      <nav className="top-nav" aria-label="Account">
        <BrandMark />
        <ClerkAuthControls />
      </nav>

      <section className="game-layout" aria-label="Historcle daily game">
        <aside className="score-rail" aria-label="Daily score">
          <div className="score-total">
            <span>Total score</span>
            <strong>{totalScore.toLocaleString()}</strong>
            <small>/ {MAX_TOTAL_SCORE.toLocaleString()}</small>
          </div>
          <div className="rail-stat">
            <CalendarDays aria-hidden="true" size={18} />
            <span>Daily #{state.puzzleNumber}</span>
          </div>
          <div className="rail-stat">
            <LocateFixed aria-hidden="true" size={18} />
            <span>{completedAnswers.length}/5 locked</span>
          </div>
          <div className="progress-dots" aria-label={`Question ${questionNumber} of 5`}>
            {questions.map((question, index) => (
              <span
                key={question.id}
                className={[
                  index === state.currentQuestionIndex ? "active" : "",
                  state.confirmedAnswers[index] ? "complete" : "",
                ].join(" ")}
              />
            ))}
          </div>
        </aside>

        <section className="map-stage" aria-label="Location picker">
          <WorldMap
            answer={{
              latitude: currentQuestion.latitude,
              longitude: currentQuestion.longitude,
            }}
            answerLabel={currentQuestion.answerLabel}
            selectedGuess={currentGuess}
            revealed={Boolean(currentAnswer)}
            disabled={Boolean(currentAnswer)}
            onSelect={handleSelect}
          />
        </section>

        <aside className="question-panel" aria-labelledby="question-title">
          <div className="question-meta">
            <span>Question {questionNumber}/5</span>
            <span>{currentQuestion.category}</span>
            <span>{currentQuestion.year}</span>
          </div>
          <h1 id="question-title">{currentQuestion.prompt}</h1>

          {!currentAnswer ? (
            <div className="guess-panel">
              <div className="guess-readout">
                <MapPin aria-hidden="true" size={18} />
                <span>
                  {currentGuess
                    ? `${currentGuess.latitude.toFixed(2)}, ${currentGuess.longitude.toFixed(2)}`
                    : "Place a pin on the map"}
                </span>
              </div>
              <button
                type="button"
                className="primary-action"
                disabled={!currentGuess}
                onClick={handleConfirm}
              >
                <CheckCircle2 aria-hidden="true" size={19} />
                Confirm location
              </button>
            </div>
          ) : (
            <div className="reveal-panel" aria-live="polite">
              <div className="answer-kicker">Correct location</div>
              <h2>{currentQuestion.answerLabel}</h2>
              <div className="reveal-stats">
                <div>
                  <span>Distance</span>
                  <strong>{formatMiles(currentAnswer.distanceMiles)}</strong>
                </div>
                <div>
                  <span>Points</span>
                  <strong>{currentAnswer.score.toLocaleString()}/1,000</strong>
                </div>
              </div>
              <p>{currentQuestion.explanation}</p>
              <button type="button" className="primary-action" onClick={handleNext}>
                {state.completed ? "See results" : "Next question"}
                <ArrowRight aria-hidden="true" size={19} />
              </button>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
