import { describe, expect, it } from 'vitest'
import { neutralPose } from './poses'
import { angleDistance, averageRecentScores, calculateFitScore, roundPoints } from './scoring'

describe('pose scoring', () => {
  it('scores an exact pose at full confidence as 100', () => {
    expect(calculateFitScore({ ...neutralPose, confidence: 1 }, neutralPose)).toBe(100)
  })

  it('handles wrapped angles', () => {
    expect(angleDistance(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
  })

  it('scores only relative joint angles when the whole body rotates', () => {
    const rotation = 0.28
    const rotatedPose = {
      ...neutralPose,
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
      confidence: 1,
    }

    expect(calculateFitScore(rotatedPose, neutralPose)).toBe(100)
  })

  it('ignores measured lift and screen height', () => {
    expect(calculateFitScore({ ...neutralPose, hipLift: 0.24, confidence: 1 }, neutralPose)).toBe(100)
  })

  it('averages only the impact window', () => {
    const samples = [{ time: 100, score: 10 }, { time: 700, score: 80 }, { time: 900, score: 100 }]
    expect(averageRecentScores(samples, 1000, 500)).toBe(90)
  })

  it('rewards high quality and combo', () => {
    expect(roundPoints(96, 3)).toBeGreaterThan(roundPoints(80, 1))
  })
})
