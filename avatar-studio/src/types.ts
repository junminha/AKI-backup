export type Scene = 'studio' | 'sunset' | 'day' | 'cyber'
export type MotionName = 'idle' | 'wave' | 'dance' | 'jump' | 'sit' | 'run' | 'cross'
export type HairStyle = 'none' | 'crop' | 'wave' | 'bob' | 'spike'
export type RobotSide = 'none' | 'left' | 'right'
export type AvatarConcept = 'classic' | 'woman' | 'robot' | 'athlete' | 'explorer' | 'alien'
export type BodyBuild = 'slim' | 'balanced' | 'broad'
export type FaceShape = 'round' | 'oval' | 'angular'
export type EyeStyle = 'round' | 'happy' | 'sparkle' | 'focused'
export type MouthStyle = 'smile' | 'neutral' | 'open'
export type OutfitStyle = 'tee' | 'jacket' | 'overalls' | 'tunic'
export type SleeveStyle = 'none' | 'short' | 'long'
export type BottomStyle = 'pants' | 'shorts' | 'skirt'
export type ShoeStyle = 'sneakers' | 'boots' | 'flats'
export type AccessoryStyle = 'none' | 'glasses' | 'headphones' | 'scarf'

export interface AvatarOptions {
  concept: AvatarConcept
  skin: string
  hair: string
  shirt: string
  trousers: string
  accent: string
  shoes: string
  hairStyle: HairStyle
  bodyBuild: BodyBuild
  faceShape: FaceShape
  eyeStyle: EyeStyle
  mouthStyle: MouthStyle
  outfitStyle: OutfitStyle
  sleeveStyle: SleeveStyle
  bottomStyle: BottomStyle
  shoeStyle: ShoeStyle
  accessory: AccessoryStyle
  scene: Scene
  motion: MotionName
  robot: RobotSide
}

export interface AnalysisResult {
  faceFound: boolean
  skin: string
  hair: string
  shirt: string
}

export interface LivePose {
  bodyLean: number
  headTilt: number
  neckLean: number
  hipLift: number
  leftUpperArm: number
  leftForearm: number
  leftHand: number
  leftHandSpread: number
  leftArmFront: number
  leftArmDepth: number
  rightUpperArm: number
  rightForearm: number
  rightHand: number
  rightHandSpread: number
  rightArmFront: number
  rightArmDepth: number
  leftUpperLeg: number
  leftLowerLeg: number
  leftFoot: number
  rightUpperLeg: number
  rightLowerLeg: number
  rightFoot: number
  confidence: number
}

export interface RobotPose {
  bodyLean: number
  leftUpperArm: number
  leftForearm: number
  rightUpperArm: number
  rightForearm: number
  leftUpperLeg: number
  leftLowerLeg: number
  rightUpperLeg: number
  rightLowerLeg: number
}

export interface LeaderboardEntry {
  id: string
  name: string
  score: number
  photo: string
  poseLabel: string
  createdAt: number
}
