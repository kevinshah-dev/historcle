export type HistorcleDifficulty = "easy" | "medium" | "hard";

export type HistorcleQuestion = {
  id: string;
  prompt: string;
  answerLabel: string;
  latitude: number;
  longitude: number;
  year: string;
  category: string;
  difficulty: HistorcleDifficulty;
  explanation: string;
};

export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type ConfirmedAnswer = {
  questionId: string;
  guess: GeoPoint;
  distanceMiles: number;
  score: number;
};

export type StoredHistorcleGame = {
  date: string;
  puzzleNumber: number;
  questionIds: string[];
  currentQuestionIndex: number;
  draftGuesses: Array<GeoPoint | null>;
  confirmedAnswers: Array<ConfirmedAnswer | null>;
  completed: boolean;
  completedAt?: string;
};
