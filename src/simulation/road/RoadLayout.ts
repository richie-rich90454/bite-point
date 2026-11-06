/** Shared simulation coordinates in metres. Renderers convert x-forward to Babylon z. */
export const PROVING_STRAIGHT = { startX: -300, endX: 6000, centerY: -110, halfWidth: 10 } as const;

export function isPavedSurface(x: number, y: number): boolean {
  const course = PROVING_STRAIGHT;
  const trainingLot = Math.abs(x) <= 95 && Math.abs(y) <= 95;
  const straight = x >= course.startX && x <= course.endX && Math.abs(y - course.centerY) <= course.halfWidth;
  const accessApron = x >= -70 && x <= -10 && y >= -111 && y <= -71;
  return trainingLot || straight || accessApron;
}
