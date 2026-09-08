import type { JointPose } from './types'

export type Point = { x: number; y: number }

export type Skeleton = {
  root: Point
  chest: Point
  neck: Point
  head: Point
  leftShoulder: Point
  rightShoulder: Point
  leftHip: Point
  rightHip: Point
  leftElbow: Point
  rightElbow: Point
  leftHand: Point
  rightHand: Point
  leftKnee: Point
  rightKnee: Point
  leftFoot: Point
  rightFoot: Point
}

const segment = (start: Point, angle: number, length: number): Point => ({
  x: start.x - Math.sin(angle) * length,
  y: start.y + Math.cos(angle) * length,
})

const rotate = (point: Point, angle: number): Point => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
})

export function buildSkeleton(pose: JointPose): Skeleton {
  const root = { x: 0, y: 0 }
  const chest = rotate({ x: 0, y: -72 }, pose.bodyLean)
  const neck = rotate({ x: 0, y: -140 }, pose.bodyLean)
  const head = rotate({ x: 0, y: -184 }, pose.bodyLean)
  const leftShoulder = rotate({ x: -45, y: -116 }, pose.bodyLean)
  const rightShoulder = rotate({ x: 45, y: -116 }, pose.bodyLean)
  const leftHip = rotate({ x: -25, y: -4 }, pose.bodyLean)
  const rightHip = rotate({ x: 25, y: -4 }, pose.bodyLean)
  const leftElbow = segment(leftShoulder, pose.leftUpperArm, 76)
  const rightElbow = segment(rightShoulder, pose.rightUpperArm, 76)
  const leftHand = segment(leftElbow, pose.leftForearm, 70)
  const rightHand = segment(rightElbow, pose.rightForearm, 70)
  const leftKnee = segment(leftHip, pose.leftUpperLeg, 89)
  const rightKnee = segment(rightHip, pose.rightUpperLeg, 89)
  const leftFoot = segment(leftKnee, pose.leftLowerLeg, 86)
  const rightFoot = segment(rightKnee, pose.rightLowerLeg, 86)

  return {
    root,
    chest,
    neck,
    head,
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftElbow,
    rightElbow,
    leftHand,
    rightHand,
    leftKnee,
    rightKnee,
    leftFoot,
    rightFoot,
  }
}

export function interpolatePose(a: JointPose, b: JointPose, amount: number): JointPose {
  const t = Math.max(0, Math.min(1, amount))
  const next = {} as JointPose
  for (const key of Object.keys(a) as (keyof JointPose)[]) {
    next[key] = a[key] + (b[key] - a[key]) * t
  }
  return next
}
