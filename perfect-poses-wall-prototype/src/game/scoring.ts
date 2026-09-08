import type { JointPose, LivePose } from './types'

export function angleDistance(a: number, b: number) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
}

function relativeAngle(angle: number, reference: number) {
  return Math.atan2(Math.sin(angle - reference), Math.cos(angle - reference))
}

export function calculateFitScore(live: LivePose, target: JointPose) {
  const comparisons: [number, number, number][] = [
    [relativeAngle(live.leftUpperArm, live.bodyLean), relativeAngle(target.leftUpperArm, target.bodyLean), 1.15],
    [relativeAngle(live.leftForearm, live.leftUpperArm), relativeAngle(target.leftForearm, target.leftUpperArm), 1.22],
    [relativeAngle(live.rightUpperArm, live.bodyLean), relativeAngle(target.rightUpperArm, target.bodyLean), 1.15],
    [relativeAngle(live.rightForearm, live.rightUpperArm), relativeAngle(target.rightForearm, target.rightUpperArm), 1.22],
    [relativeAngle(live.leftUpperLeg, live.bodyLean), relativeAngle(target.leftUpperLeg, target.bodyLean), 0.82],
    [relativeAngle(live.leftLowerLeg, live.leftUpperLeg), relativeAngle(target.leftLowerLeg, target.leftUpperLeg), 0.92],
    [relativeAngle(live.rightUpperLeg, live.bodyLean), relativeAngle(target.rightUpperLeg, target.bodyLean), 0.82],
    [relativeAngle(live.rightLowerLeg, live.rightUpperLeg), relativeAngle(target.rightLowerLeg, target.rightUpperLeg), 0.92],
  ]
  const joints = comparisons.reduce((sum, [actual, expected, tolerance]) => {
    return sum + Math.max(0, 1 - angleDistance(actual, expected) / tolerance)
  }, 0) / comparisons.length
  const head = Math.max(0, 1 - angleDistance(
    relativeAngle(live.headTilt, live.bodyLean),
    relativeAngle(target.headTilt, target.bodyLean),
  ) / 0.7)
  const confidence = Math.min(1, Math.max(0.68, live.confidence))
  return Math.round((joints * 0.94 + head * 0.06) * confidence * 100)
}

export function averageRecentScores(samples: { time: number; score: number }[], now: number, windowMs = 520) {
  const recent = samples.filter((sample) => now - sample.time <= windowMs)
  if (recent.length === 0) return 0
  return Math.round(recent.reduce((sum, sample) => sum + sample.score, 0) / recent.length)
}

export function roundPoints(fit: number, combo: number) {
  const qualityBonus = fit >= 95 ? 350 : fit >= 85 ? 180 : fit >= 75 ? 80 : 0
  return fit * 10 + qualityBonus + Math.max(0, combo - 1) * 120
}
