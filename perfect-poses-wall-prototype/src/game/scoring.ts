import { SCORED_JOINTS } from './types'
import type { JointPose, LivePose, ScoredJoint, TrackedJoint } from './types'

export function angleDistance(a: number, b: number) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
}

export function relativeAngle(angle: number, reference: number) {
  return Math.atan2(Math.sin(angle - reference), Math.cos(angle - reference))
}

/**
 * Every joint is measured against its parent, so the score reads the shape of
 * the pose rather than where the player happens to stand. The same table
 * places joints the camera cannot see, which keeps the avatar on screen and
 * the score talking about the same body.
 */
export const JOINT_CHAIN: Record<TrackedJoint, { parent: keyof JointPose; tolerance: number }> = {
  headTilt: { parent: 'bodyLean', tolerance: 0.7 },
  leftUpperArm: { parent: 'bodyLean', tolerance: 1.15 },
  leftForearm: { parent: 'leftUpperArm', tolerance: 1.22 },
  rightUpperArm: { parent: 'bodyLean', tolerance: 1.15 },
  rightForearm: { parent: 'rightUpperArm', tolerance: 1.22 },
  leftUpperLeg: { parent: 'bodyLean', tolerance: 0.82 },
  leftLowerLeg: { parent: 'leftUpperLeg', tolerance: 0.92 },
  rightUpperLeg: { parent: 'bodyLean', tolerance: 0.82 },
  rightLowerLeg: { parent: 'rightUpperLeg', tolerance: 0.92 },
}

function jointMatch(live: JointPose, target: JointPose, joint: TrackedJoint) {
  const { parent, tolerance } = JOINT_CHAIN[joint]
  const actual = relativeAngle(live[joint], live[parent])
  const expected = relativeAngle(target[joint], target[parent])
  return Math.max(0, 1 - angleDistance(actual, expected) / tolerance)
}

/** The joints on screen right now — the only ones the wall is judged on. */
export function judgedJoints(live: LivePose): ScoredJoint[] {
  return SCORED_JOINTS.filter((joint) => live.tracked[joint])
}

export function calculateFitScore(live: LivePose, target: JointPose) {
  const judged = judgedJoints(live)
  if (judged.length === 0) return 0

  const joints = judged.reduce((sum, joint) => sum + jointMatch(live, target, joint), 0) / judged.length
  const headWeight = live.tracked.headTilt ? 0.06 : 0
  const head = headWeight > 0 ? jointMatch(live, target, 'headTilt') : 0
  const shape = joints * (1 - headWeight) + head * headWeight

  // A clean read of half a body is not a worse read, so tracking quality only
  // trims the score once it is genuinely poor.
  const quality = Math.min(1, Math.max(0, (live.confidence - 0.35) / 0.4))
  return Math.round(shape * (0.82 + 0.18 * quality) * 100)
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
