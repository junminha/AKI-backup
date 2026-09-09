import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { describe, expect, it } from 'vitest'
import { poseChallenges } from './poses'
import { calculateFitScore } from './scoring'
import { countJudgedJoints, isUsable, readTracking, toLivePose, type Holds } from './tracking'

const SEEN = 0.97
const GUESSED = 0.05

/**
 * A person standing in a T-pose, framed the way a webcam on a desk frames
 * them: head to hips inside the picture, legs below the bottom edge. The
 * coordinates are raw camera space, x growing to the right.
 */
function tPose({ legsInFrame }: { legsInFrame: boolean }): NormalizedLandmark[] {
  const kneeY = legsInFrame ? 0.72 : 1.24
  const ankleY = legsInFrame ? 0.94 : 1.62
  const legVisibility = legsInFrame ? SEEN : GUESSED
  const hipY = legsInFrame ? 0.5 : 0.85
  const shoulderY = legsInFrame ? 0.28 : 0.35
  const earY = legsInFrame ? 0.14 : 0.15

  const spec: Record<number, [number, number, number]> = {
    7: [0.54, earY, SEEN],
    8: [0.46, earY, SEEN],
    11: [0.56, shoulderY, SEEN],
    12: [0.44, shoulderY, SEEN],
    13: [0.76, shoulderY, SEEN],
    14: [0.24, shoulderY, SEEN],
    15: [0.96, shoulderY, SEEN],
    16: [0.04, shoulderY, SEEN],
    23: [0.545, hipY, SEEN],
    24: [0.455, hipY, SEEN],
    25: [0.55, kneeY, legVisibility],
    26: [0.45, kneeY, legVisibility],
    27: [0.55, ankleY, legVisibility],
    28: [0.45, ankleY, legVisibility],
  }

  const landmarks: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }))
  for (const [index, [x, y, visibility]] of Object.entries(spec)) {
    landmarks[Number(index)] = { x, y, z: 0, visibility }
  }
  return landmarks
}

function settle(landmarks: NormalizedLandmark[], frames = 8) {
  const holds: Holds = new Map()
  let tracked = readTracking(holds, landmarks)
  for (let i = 1; i < frames; i += 1) tracked = readTracking(holds, landmarks)
  return { holds, tracked }
}

const letterT = poseChallenges.find((challenge) => challenge.id === 'letter-t')!

describe('reading a partly framed body', () => {
  it('drops legs that sit below the bottom of the picture', () => {
    const { tracked } = settle(tPose({ legsInFrame: false }))

    expect(tracked.leftUpperArm).toBe(true)
    expect(tracked.rightForearm).toBe(true)
    expect(tracked.headTilt).toBe(true)
    expect(tracked.leftUpperLeg).toBe(false)
    expect(tracked.rightLowerLeg).toBe(false)
    expect(countJudgedJoints(tracked)).toBe(4)
  })

  it('keeps a leg-blind read usable and confident', () => {
    const landmarks = tPose({ legsInFrame: false })
    const { tracked } = settle(landmarks)
    const pose = toLivePose(landmarks, tracked, 0.85, 1.62)

    // Confidence used to average in the six guessed leg landmarks, which
    // pinned it near 0.63 and capped every score at 68.
    expect(pose.confidence).toBeGreaterThan(0.9)
    expect(isUsable(pose)).toBe(true)
  })

  it('clears the wall on arms alone when the legs are out of frame', () => {
    const landmarks = tPose({ legsInFrame: false })
    const { tracked } = settle(landmarks)
    const pose = toLivePose(landmarks, tracked, 0.85, 1.62)

    expect(calculateFitScore(pose, letterT.pose)).toBeGreaterThanOrEqual(letterT.threshold)
    expect(calculateFitScore(pose, letterT.pose)).toBe(100)
  })

  it('still judges legs when the whole body is in frame', () => {
    const landmarks = tPose({ legsInFrame: true })
    const { tracked } = settle(landmarks)

    expect(countJudgedJoints(tracked)).toBe(8)

    const bentKnees = landmarks.map((point, index) => (
      index === 25 ? { ...point, x: 0.78 } : index === 26 ? { ...point, x: 0.22 } : point
    ))
    const straight = toLivePose(landmarks, tracked, 0.5, 0.94)
    const bent = toLivePose(bentKnees, tracked, 0.5, 0.94)

    expect(calculateFitScore(bent, letterT.pose)).toBeLessThan(calculateFitScore(straight, letterT.pose))
  })

  it('holds a joint through a single bad frame', () => {
    const landmarks = tPose({ legsInFrame: true })
    const { holds } = settle(landmarks)

    const blink = landmarks.map((point, index) => (index === 15 ? { ...point, visibility: 0 } : point))
    expect(readTracking(holds, blink).leftForearm).toBe(true)

    for (let i = 0; i < 5; i += 1) readTracking(holds, blink)
    expect(readTracking(holds, blink).leftForearm).toBe(false)
  })
})
