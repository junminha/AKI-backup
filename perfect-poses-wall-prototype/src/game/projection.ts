export function linearApproachScale(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress))
  return 0.34 + clamped * 0.66
}
