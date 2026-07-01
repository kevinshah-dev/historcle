import type { ConfirmedAnswer, GeoPoint } from "@/types/historcle";

export const MAX_SCORE_PER_QUESTION = 1000;
export const MAX_TOTAL_SCORE = 5000;
export const FULL_CREDIT_RADIUS_MILES = 50;
export const ZERO_SCORE_DISTANCE_MILES = 5000;
const EARTH_RADIUS_MILES = 3958.7613;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function clampLongitude(longitude: number): number {
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function clampLatitude(latitude: number): number {
  return Math.max(-90, Math.min(90, latitude));
}

export function normalizePoint(point: GeoPoint): GeoPoint {
  return {
    latitude: Number(clampLatitude(point.latitude).toFixed(6)),
    longitude: Number(clampLongitude(point.longitude).toFixed(6)),
  };
}

export function getDistanceMiles(from: GeoPoint, to: GeoPoint): number {
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return EARTH_RADIUS_MILES * centralAngle;
}

export function getQuestionScore(distanceMiles: number): number {
  if (distanceMiles <= FULL_CREDIT_RADIUS_MILES) {
    return MAX_SCORE_PER_QUESTION;
  }

  if (distanceMiles >= ZERO_SCORE_DISTANCE_MILES) {
    return 0;
  }

  const distanceRatio =
    (distanceMiles - FULL_CREDIT_RADIUS_MILES) /
    (ZERO_SCORE_DISTANCE_MILES - FULL_CREDIT_RADIUS_MILES);

  return Math.round(MAX_SCORE_PER_QUESTION * (1 - distanceRatio) ** 1.5);
}

export function formatMiles(distanceMiles: number): string {
  return `${Math.round(distanceMiles).toLocaleString()} mi`;
}

export function getTotalScore(answers: Array<ConfirmedAnswer | null>): number {
  return answers.reduce((sum, answer) => sum + (answer?.score ?? 0), 0);
}

export function getAverageDistance(answers: ConfirmedAnswer[]): number {
  if (answers.length === 0) {
    return 0;
  }

  return answers.reduce((sum, answer) => sum + answer.distanceMiles, 0) / answers.length;
}

export function getPerformanceLabel(score: number): string {
  if (score >= 4600) return "World-Class Historian";
  if (score >= 3900) return "Sharp Cartographer";
  if (score >= 3000) return "Close Enough";
  if (score >= 2000) return "Archive Scout";
  return "Globe Apprentice";
}

export function getShareBand(score: number): string {
  if (score >= 900) return "🟩";
  if (score >= 700) return "🟨";
  if (score >= 450) return "🟧";
  return "🟥";
}
