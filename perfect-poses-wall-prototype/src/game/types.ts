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

export interface LivePose extends JointPose {
  confidence: number
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
}

export interface GameRecord {
  id: string
  name: string
  score: number
  cleared: number
  createdAt: number
}
