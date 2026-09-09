import { JOINT_CHAIN, judgedJoints, relativeAngle } from './scoring'
import { SCORED_JOINTS } from './types'
import type { JointPose, LivePose, PoseChallenge, TrackedJoint, TrackedParts } from './types'

const PASS_THRESHOLD = 65
// Every wall closes in at the same speed; the pose itself is the difficulty.
const APPROACH_MS = 3000

export const allTracked: TrackedParts = {
  headTilt: true,
  leftUpperArm: true,
  leftForearm: true,
  rightUpperArm: true,
  rightForearm: true,
  leftUpperLeg: true,
  leftLowerLeg: true,
  rightUpperLeg: true,
  rightLowerLeg: true,
}

export const noneTracked: TrackedParts = {
  headTilt: false,
  leftUpperArm: false,
  leftForearm: false,
  rightUpperArm: false,
  rightForearm: false,
  leftUpperLeg: false,
  leftLowerLeg: false,
  rightUpperLeg: false,
  rightLowerLeg: false,
}

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
    id: 'victory-v', label: '빅토리 V', cue: '두 팔을 대각선 위로 쭉 뻗으세요', durationMs: APPROACH_MS, threshold: PASS_THRESHOLD,
    pose: { ...neutralPose, leftUpperArm: 2.36, leftForearm: 2.48, rightUpperArm: -2.36, rightForearm: -2.48 },
  },
  {
    id: 'letter-t', label: '알파벳 T', cue: '두 팔을 어깨 높이로 펼치세요', durationMs: APPROACH_MS, threshold: PASS_THRESHOLD,
    pose: { ...neutralPose, leftUpperArm: 1.57, leftForearm: 1.57, rightUpperArm: -1.57, rightForearm: -1.57 },
  },
  {
    id: 'left-signal', label: '왼쪽 신호', cue: '왼팔은 위로, 오른팔은 옆으로 뻗으세요', durationMs: APPROACH_MS, threshold: PASS_THRESHOLD,
    pose: { ...neutralPose, leftUpperArm: 2.92, leftForearm: 3.02, rightUpperArm: -1.57, rightForearm: -1.57 },
  },
  {
    id: 'goal-post', label: '골 포스트', cue: '팔꿈치를 굽혀 양손을 위로 세우세요', durationMs: APPROACH_MS, threshold: PASS_THRESHOLD,
    pose: { ...neutralPose, leftUpperArm: 1.55, leftForearm: 3.02, rightUpperArm: -1.55, rightForearm: -3.02 },
  },
  {
    id: 'wide-star', label: '와이드 스타', cue: '팔과 다리를 넓게 벌리세요', durationMs: APPROACH_MS, threshold: PASS_THRESHOLD,
    pose: { ...neutralPose, leftUpperArm: 1.9, leftForearm: 1.95, rightUpperArm: -1.9, rightForearm: -1.95, leftUpperLeg: 0.38, leftLowerLeg: 0.38, rightUpperLeg: -0.38, rightLowerLeg: -0.38 },
  },
  {
    id: 'lean-left', label: '왼쪽 기울기', cue: '몸을 왼쪽으로 기울이고 팔을 뻗으세요', durationMs: APPROACH_MS, threshold: PASS_THRESHOLD,
    pose: { ...neutralPose, bodyLean: -0.2, headTilt: 0.16, leftUpperArm: 1.35, leftForearm: 1.35, rightUpperArm: -2.35, rightForearm: -2.45 },
  },
  {
    id: 'low-guard', label: '로우 가드', cue: '무릎을 굽히고 두 팔을 양옆으로 뻗으세요', durationMs: APPROACH_MS, threshold: PASS_THRESHOLD,
    pose: { ...neutralPose, leftUpperArm: 1.44, leftForearm: 1.62, rightUpperArm: -1.44, rightForearm: -1.62, leftUpperLeg: 0.38, leftLowerLeg: -0.24, rightUpperLeg: -0.38, rightLowerLeg: 0.24 },
  },
  {
    id: 'final-crown', label: '파이널 크라운', cue: '양팔을 머리 위로 모아 마지막 벽을 통과하세요', durationMs: APPROACH_MS, threshold: PASS_THRESHOLD,
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
    tracked: allTracked,
  }
}

/** Parents before children, so a placed joint can hang off a placed parent. */
const PLACEMENT_ORDER: TrackedJoint[] = [
  'headTilt',
  'leftUpperArm',
  'rightUpperArm',
  'leftUpperLeg',
  'rightUpperLeg',
  'leftForearm',
  'rightForearm',
  'leftLowerLeg',
  'rightLowerLeg',
]

/**
 * The pose to draw. Joints the camera cannot see are placed at the wall's own
 * angle, so the avatar never appears to clip an edge the score is ignoring:
 * what you see clearing the hole is exactly what was judged.
 */
export function poseForDisplay(live: LivePose, target: JointPose): JointPose {
  const shown: JointPose = {
    bodyLean: live.bodyLean,
    headTilt: live.headTilt,
    hipLift: live.hipLift,
    leftUpperArm: live.leftUpperArm,
    leftForearm: live.leftForearm,
    rightUpperArm: live.rightUpperArm,
    rightForearm: live.rightForearm,
    leftUpperLeg: live.leftUpperLeg,
    leftLowerLeg: live.leftLowerLeg,
    rightUpperLeg: live.rightUpperLeg,
    rightLowerLeg: live.rightLowerLeg,
  }

  // Nothing is being judged, so there is nothing to stay consistent with.
  if (judgedJoints(live).length === 0) return shown

  for (const joint of PLACEMENT_ORDER) {
    if (live.tracked[joint]) continue
    const { parent } = JOINT_CHAIN[joint]
    shown[joint] = shown[parent] + relativeAngle(target[joint], target[parent])
  }
  return shown
}

export function countJudged(live: LivePose) {
  return SCORED_JOINTS.reduce((count, joint) => count + (live.tracked[joint] ? 1 : 0), 0)
}
