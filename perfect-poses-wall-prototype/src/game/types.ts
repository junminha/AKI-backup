export interface JointPose {
  bodyLean: number
  headTilt: number
  hipLift: number
  leftUpperArm: number
  leftForearm: number
  rightUpperArm: number
  rightForearm: number
  leftUpperLeg: number
  leftLowerLeg: number
  rightUpperLeg: number
  rightLowerLeg: number
}

/** The joints the wall is scored against. */
export const SCORED_JOINTS = [
  'leftUpperArm',
  'leftForearm',
  'rightUpperArm',
  'rightForearm',
  'leftUpperLeg',
  'leftLowerLeg',
  'rightUpperLeg',
  'rightLowerLeg',
] as const

export type ScoredJoint = (typeof SCORED_JOINTS)[number]

export type TrackedJoint = ScoredJoint | 'headTilt'

/**
 * Which joints the camera can actually see. A webcam on a desk usually cuts
 * off the legs, and MediaPipe still reports guessed coordinates for them, so
 * the game only scores and only draws the joints marked here.
 */
export type TrackedParts = Record<TrackedJoint, boolean>

export interface LivePose extends JointPose {
  confidence: number
  tracked: TrackedParts
}

export interface PoseChallenge {
  id: string
  label: string
  cue: string
  pose: JointPose
  durationMs: number
  threshold: number
}

export type GameMode = 'camera' | 'demo'

export type GamePhase =
  | 'menu'
  | 'calibrating'
  | 'countdown'
  | 'approaching'
  | 'impact'
  | 'result'
  | 'game-over'

export type CameraStatus = 'idle' | 'loading' | 'searching' | 'ready' | 'error'

export interface GameStats {
  round: number
  score: number
  lives: number
  combo: number
  lastFit: number
  passed: boolean | null
}

export interface GameHud {
  progress: number
  fit: number
  countdown: number
  cameraReady: boolean
  distance: number
  judged: number
}

export interface GameRecord {
  id: string
  name: string
  score: number
  cleared: number
  createdAt: number
}
