import { describe, expect, it } from 'vitest'
import { allTracked, neutralPose, noneTracked, poseChallenges, poseForDisplay } from './poses'
import { angleDistance, averageRecentScores, calculateFitScore, judgedJoints, roundPoints } from './scoring'
import type { LivePose, TrackedParts } from './types'

const upperBodyOnly: TrackedParts = {
  ...allTracked,
  leftUpperLeg: false,
  leftLowerLeg: false,
  rightUpperLeg: false,
  rightLowerLeg: false,
}

const live = (overrides: Partial<LivePose> = {}): LivePose => ({
  ...neutralPose,
  confidence: 1,
  tracked: allTracked,
  ...overrides,
})

describe('pose scoring', () => {
  it('scores an exact pose at full confidence as 100', () => {
    expect(calculateFitScore(live(), neutralPose)).toBe(100)
  })

  it('handles wrapped angles', () => {
    expect(angleDistance(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
  })

  it('scores only relative joint angles when the whole body rotates', () => {
    const rotation = 0.28
    const rotatedPose = live({
      bodyLean: neutralPose.bodyLean + rotation,
      headTilt: neutralPose.headTilt + rotation,
      leftUpperArm: neutralPose.leftUpperArm + rotation,
      leftForearm: neutralPose.leftForearm + rotation,
      rightUpperArm: neutralPose.rightUpperArm + rotation,
      rightForearm: neutralPose.rightForearm + rotation,
      leftUpperLeg: neutralPose.leftUpperLeg + rotation,
      leftLowerLeg: neutralPose.leftLowerLeg + rotation,
      rightUpperLeg: neutralPose.rightUpperLeg + rotation,
      rightLowerLeg: neutralPose.rightLowerLeg + rotation,
    })

    expect(calculateFitScore(rotatedPose, neutralPose)).toBe(100)
  })

  it('ignores measured lift and screen height', () => {
    expect(calculateFitScore(live({ hipLift: 0.24 }), neutralPose)).toBe(100)
  })

  it('averages only the impact window', () => {
    const samples = [{ time: 100, score: 10 }, { time: 700, score: 80 }, { time: 900, score: 100 }]
    expect(averageRecentScores(samples, 1000, 500)).toBe(90)
  })

  it('rewards high quality and combo', () => {
    expect(roundPoints(96, 3)).toBeGreaterThan(roundPoints(80, 1))
  })
})

describe('joints the camera cannot see', () => {
  const target = poseChallenges.find((challenge) => challenge.id === 'letter-t')!.pose

  it('does not score legs that are out of frame', () => {
    const armsMatched = live({
      tracked: upperBodyOnly,
      leftUpperArm: target.leftUpperArm,
      leftForearm: target.leftForearm,
      rightUpperArm: target.rightUpperArm,
      rightForearm: target.rightForearm,
      // Guessed leg angles, nowhere near the wall.
      leftUpperLeg: 1.4,
      leftLowerLeg: -1.1,
      rightUpperLeg: -1.4,
      rightLowerLeg: 1.1,
    })

    expect(judgedJoints(armsMatched)).toHaveLength(4)
    expect(calculateFitScore(armsMatched, target)).toBe(100)
  })

  it('clears the pass threshold on a webcam that only frames the upper body', () => {
    // A leg-blind read used to top out at 68 because every hidden landmark
    // dragged the confidence multiplier down.
    const cropped = live({
      confidence: 0.63,
      tracked: upperBodyOnly,
      leftUpperArm: target.leftUpperArm + 0.12,
      leftForearm: target.leftForearm + 0.12,
      rightUpperArm: target.rightUpperArm - 0.12,
      rightForearm: target.rightForearm - 0.12,
      leftUpperLeg: 1.4,
      rightLowerLeg: 1.1,
    })

    expect(calculateFitScore(cropped, target)).toBeGreaterThanOrEqual(
      poseChallenges[0].threshold,
    )
  })

  it('scores nothing when no joint is visible', () => {
    expect(calculateFitScore(live({ tracked: noneTracked }), target)).toBe(0)
  })

  it('draws hidden joints at the wall angle so the avatar matches the verdict', () => {
    const cropped = live({ tracked: upperBodyOnly, leftUpperLeg: 1.4, rightUpperLeg: -1.4 })
    const shown = poseForDisplay(cropped, target)

    expect(shown.leftUpperLeg).toBeCloseTo(target.leftUpperLeg)
    expect(shown.rightLowerLeg).toBeCloseTo(target.rightLowerLeg)
    expect(shown.leftUpperArm).toBeCloseTo(cropped.leftUpperArm)
  })

  it('leaves the avatar alone when tracking is lost entirely', () => {
    const lost = live({ tracked: noneTracked, leftUpperLeg: 1.4 })
    expect(poseForDisplay(lost, target).leftUpperLeg).toBeCloseTo(1.4)
  })
})
