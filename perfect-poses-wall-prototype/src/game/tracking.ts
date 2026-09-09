import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { LivePose, TrackedJoint, TrackedParts } from './types'

/** The two landmarks each joint angle is measured from. */
export const JOINT_LANDMARKS: Record<TrackedJoint, readonly [number, number]> = {
  headTilt: [7, 8],
  leftUpperArm: [11, 13],
  leftForearm: [13, 15],
  rightUpperArm: [12, 14],
  rightForearm: [14, 16],
  leftUpperLeg: [23, 25],
  leftLowerLeg: [25, 27],
  rightUpperLeg: [24, 26],
  rightLowerLeg: [26, 28],
}

export const TRACK_KEYS = Object.keys(JOINT_LANDMARKS) as TrackedJoint[]
export const LEG_KEYS: TrackedJoint[] = ['leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg']

const CORE_LANDMARKS = [11, 12, 23, 24]
const VISIBILITY_MIN = 0.5
// MediaPipe keeps guessing coordinates for body parts that left the frame, so
// a joint also has to sit inside the picture to count as seen.
const FRAME_EDGE = 0.015
const HOLD_MAX = 6
const HOLD_ON = 5
const HOLD_OFF = 2

export const MIN_JUDGED_JOINTS = 2
export const MIN_CONFIDENCE = 0.4

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export const lerp = (previous: number, next: number, amount = 0.34) => previous + (next - previous) * amount

const mirror = (point: NormalizedLandmark) => ({ x: 1 - point.x, y: point.y })

function angleFromDown(a: NormalizedLandmark, b: NormalizedLandmark) {
  const start = mirror(a)
  const end = mirror(b)
  return Math.atan2(-(end.x - start.x), end.y - start.y)
}

function angleFromRight(a: NormalizedLandmark, b: NormalizedLandmark) {
  const start = mirror(a)
  const end = mirror(b)
  return Math.atan2(end.y - start.y, end.x - start.x)
}

export function isReadable(point: NormalizedLandmark) {
  return (point.visibility ?? 0) >= VISIBILITY_MIN
    && point.x >= -FRAME_EDGE && point.x <= 1 + FRAME_EDGE
    && point.y >= -FRAME_EDGE && point.y <= 1 + FRAME_EDGE
}

export type HoldState = { score: number; on: boolean }
export type Holds = Map<TrackedJoint, HoldState>

/**
 * A joint has to stay readable for a few frames before it counts, and stay
 * unreadable for a few before it drops. Without that, a hand hovering at the
 * edge of frame flickers the score.
 */
export function readTracking(holds: Holds, landmarks: NormalizedLandmark[]): TrackedParts {
  const tracked = {} as TrackedParts
  for (const key of TRACK_KEYS) {
    const [from, to] = JOINT_LANDMARKS[key]
    const readable = isReadable(landmarks[from]) && isReadable(landmarks[to])
    let hold = holds.get(key)
    if (!hold) {
      hold = { score: readable ? HOLD_MAX : 0, on: readable }
      holds.set(key, hold)
    }
    hold.score = clamp(hold.score + (readable ? 1 : -1), 0, HOLD_MAX)
    if (!hold.on && hold.score >= HOLD_ON) hold.on = true
    else if (hold.on && hold.score <= HOLD_OFF) hold.on = false
    tracked[key] = hold.on
  }
  return tracked
}

/** Confidence over the joints actually in play, plus the torso that anchors them. */
export function trackingConfidence(landmarks: NormalizedLandmark[], tracked: TrackedParts) {
  const indices = new Set(CORE_LANDMARKS)
  for (const key of TRACK_KEYS) {
    if (!tracked[key]) continue
    const [from, to] = JOINT_LANDMARKS[key]
    indices.add(from)
    indices.add(to)
  }
  let sum = 0
  for (const index of indices) sum += landmarks[index].visibility ?? 0
  return sum / indices.size
}

export function countJudgedJoints(tracked: TrackedParts) {
  return TRACK_KEYS.reduce((count, key) => (key !== 'headTilt' && tracked[key] ? count + 1 : count), 0)
}

export function isUsable(pose: LivePose) {
  return countJudgedJoints(pose.tracked) >= MIN_JUDGED_JOINTS && pose.confidence > MIN_CONFIDENCE
}

export function toLivePose(
  landmarks: NormalizedLandmark[],
  tracked: TrackedParts,
  baselineHip: number,
  baselineFootY: number,
): LivePose {
  const leftShoulder = mirror(landmarks[11])
  const rightShoulder = mirror(landmarks[12])
  const hipY = (landmarks[23].y + landmarks[24].y) / 2
  const supportFootY = Math.max(landmarks[27].y, landmarks[28].y)
  const feetVisible = isReadable(landmarks[27]) && isReadable(landmarks[28])
  const hipRise = baselineHip - hipY
  const footRise = baselineFootY - supportFootY

  return {
    bodyLean: clamp(Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x), -0.32, 0.32),
    headTilt: clamp(angleFromRight(landmarks[7], landmarks[8]), -0.45, 0.45),
    hipLift: feetVisible && hipRise > 0.035 && footRise > 0.035 ? clamp(Math.min(hipRise, footRise) * 3.4, 0, 0.24) : 0,
    leftUpperArm: angleFromDown(landmarks[11], landmarks[13]),
    leftForearm: angleFromDown(landmarks[13], landmarks[15]),
    rightUpperArm: angleFromDown(landmarks[12], landmarks[14]),
    rightForearm: angleFromDown(landmarks[14], landmarks[16]),
    leftUpperLeg: angleFromDown(landmarks[23], landmarks[25]),
    leftLowerLeg: angleFromDown(landmarks[25], landmarks[27]),
    rightUpperLeg: angleFromDown(landmarks[24], landmarks[26]),
    rightLowerLeg: angleFromDown(landmarks[26], landmarks[28]),
    confidence: trackingConfidence(landmarks, tracked),
    tracked,
  }
}

/**
 * Angles wrap, so blend along the short way round: without this an arm near
 * ±180° sweeps all the way through the body. Fast movement gets a bigger step
 * so tracking keeps up; a held pose gets a smaller one so the meter sits still.
 */
export function smoothAngle(previous: number, next: number, base: number) {
  const delta = Math.atan2(Math.sin(next - previous), Math.cos(next - previous))
  return previous + delta * Math.min(0.9, base + Math.abs(delta) * 0.7)
}

export function smoothPose(previous: LivePose | null, next: LivePose): LivePose {
  if (!previous) return next
  // A joint that just came back into frame starts fresh instead of easing out
  // of the guessed angle it held while it was hidden.
  const blend = (key: TrackedJoint, base: number) =>
    previous.tracked[key] && next.tracked[key] ? smoothAngle(previous[key], next[key], base) : next[key]

  return {
    bodyLean: smoothAngle(previous.bodyLean, next.bodyLean, 0.3),
    headTilt: blend('headTilt', 0.3),
    hipLift: lerp(previous.hipLift, next.hipLift, 0.25),
    leftUpperArm: blend('leftUpperArm', 0.34),
    leftForearm: blend('leftForearm', 0.34),
    rightUpperArm: blend('rightUpperArm', 0.34),
    rightForearm: blend('rightForearm', 0.34),
    leftUpperLeg: blend('leftUpperLeg', 0.3),
    leftLowerLeg: blend('leftLowerLeg', 0.3),
    rightUpperLeg: blend('rightUpperLeg', 0.3),
    rightLowerLeg: blend('rightLowerLeg', 0.3),
    confidence: next.confidence,
    tracked: next.tracked,
  }
}
