import type { JointPose, LivePose, PoseChallenge } from './types'

export const neutralPose: JointPose = {
  bodyLean: 0,
  headTilt: 0,
  hipLift: 0,
  leftUpperArm: 0.08,
  leftForearm: 0.08,
  rightUpperArm: -0.08,
  rightForearm: -0.08,
  leftUpperLeg: 0.05,
  leftLowerLeg: 0.02,
  rightUpperLeg: -0.05,
  rightLowerLeg: -0.02,
}

export const poseChallenges: PoseChallenge[] = [
  {
    id: 'victory-v', label: '빅토리 V', cue: '두 팔을 대각선 위로 쭉 뻗으세요', durationMs: 4200, threshold: 68,
    pose: { ...neutralPose, leftUpperArm: 2.36, leftForearm: 2.48, rightUpperArm: -2.36, rightForearm: -2.48 },
  },
  {
    id: 'letter-t', label: '알파벳 T', cue: '두 팔을 어깨 높이로 펼치세요', durationMs: 3800, threshold: 70,
    pose: { ...neutralPose, leftUpperArm: 1.57, leftForearm: 1.57, rightUpperArm: -1.57, rightForearm: -1.57 },
  },
  {
    id: 'left-signal', label: '왼쪽 신호', cue: '왼팔은 위로, 오른팔은 옆으로 뻗으세요', durationMs: 3400, threshold: 71,
    pose: { ...neutralPose, leftUpperArm: 2.92, leftForearm: 3.02, rightUpperArm: -1.57, rightForearm: -1.57 },
  },
  {
    id: 'goal-post', label: '골 포스트', cue: '팔꿈치를 굽혀 양손을 위로 세우세요', durationMs: 3000, threshold: 72,
    pose: { ...neutralPose, leftUpperArm: 1.55, leftForearm: 3.02, rightUpperArm: -1.55, rightForearm: -3.02 },
  },
  {
    id: 'wide-star', label: '와이드 스타', cue: '팔과 다리를 넓게 벌리세요', durationMs: 2700, threshold: 73,
    pose: { ...neutralPose, leftUpperArm: 1.9, leftForearm: 1.95, rightUpperArm: -1.9, rightForearm: -1.95, leftUpperLeg: 0.38, leftLowerLeg: 0.38, rightUpperLeg: -0.38, rightLowerLeg: -0.38 },
  },
  {
    id: 'lean-left', label: '왼쪽 기울기', cue: '몸을 왼쪽으로 기울이고 팔을 뻗으세요', durationMs: 2400, threshold: 74,
    pose: { ...neutralPose, bodyLean: -0.2, headTilt: 0.16, leftUpperArm: 1.35, leftForearm: 1.35, rightUpperArm: -2.35, rightForearm: -2.45 },
  },
  {
    id: 'low-guard', label: '로우 가드', cue: '무릎을 굽히고 두 팔을 양옆으로 뻗으세요', durationMs: 2100, threshold: 74,
    pose: { ...neutralPose, leftUpperArm: 1.44, leftForearm: 1.62, rightUpperArm: -1.44, rightForearm: -1.62, leftUpperLeg: 0.38, leftLowerLeg: -0.24, rightUpperLeg: -0.38, rightLowerLeg: 0.24 },
  },
  {
    id: 'final-crown', label: '파이널 크라운', cue: '양팔을 머리 위로 모아 마지막 벽을 통과하세요', durationMs: 1800, threshold: 76,
    pose: { ...neutralPose, leftUpperArm: 2.86, leftForearm: 2.68, rightUpperArm: -2.86, rightForearm: -2.68, leftUpperLeg: 0.18, rightUpperLeg: -0.18 },
  },
]

export function createDemoPose(target: JointPose, time: number): LivePose {
  const sway = Math.sin(time * 0.0016) * 0.025
  return {
    ...target,
    bodyLean: target.bodyLean + sway,
    headTilt: target.headTilt - sway * 0.7,
    leftForearm: target.leftForearm + sway,
    rightForearm: target.rightForearm - sway,
    confidence: 0.98,
  }
}
