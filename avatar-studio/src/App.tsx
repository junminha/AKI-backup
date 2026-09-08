import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowCounterClockwise,
  ArrowDown,
  Armchair,
  Camera,
  Check,
  DownloadSimple,
  FloppyDisk,
  GameController,
  HandWaving,
  ImageSquare,
  MagicWand,
  PersonSimpleRun,
  Play,
  Robot,
  Shuffle,
  Sparkle,
  UploadSimple,
  VideoCamera,
  VideoCameraSlash,
  Trophy,
  Timer,
  X,
} from '@phosphor-icons/react'
import { renderAvatar } from './avatarRenderer'
import { calculateSyncScore, challengePoses, type ChallengePose } from './challengePoses'
import { encodeRankingPhoto } from './rankingPhoto'
import type { AccessoryStyle, AnalysisResult, AvatarConcept, AvatarOptions, BodyBuild, BottomStyle, EyeStyle, FaceShape, HairStyle, LeaderboardEntry, LivePose, MotionName, MouthStyle, OutfitStyle, RobotSide, Scene, ShoeStyle, SleeveStyle } from './types'

const WebcamPose = lazy(() => import('./WebcamPose').then((module) => ({ default: module.WebcamPose })))
const leaderboardKey = 'morph-pose-leaderboard'
const challengeDurationSeconds = 5

type StudioMode = 'customize' | 'challenge' | 'ranking'
type ChallengePhase = 'idle' | 'waiting' | 'preparing' | 'running' | 'result'
type CustomizeTab = 'type' | 'face' | 'outfit' | 'move'
type RankingPhotoSource = 'webcam' | 'avatar'
type Choice<T extends string> = { id: T; label: string }

function loadLeaderboard() {
  try {
    const stored = window.localStorage.getItem(leaderboardKey)
    return stored ? JSON.parse(stored) as LeaderboardEntry[] : []
  } catch {
    return []
  }
}

function captureAvatarForRanking(source: HTMLCanvasElement | null) {
  if (!source || source.width === 0 || source.height === 0) return ''
  const maxWidth = 1200
  const maxHeight = 1200
  const scale = Math.min(maxWidth / source.width, maxHeight / source.height, 1)
  const snapshot = document.createElement('canvas')
  snapshot.width = Math.max(1, Math.round(source.width * scale))
  snapshot.height = Math.max(1, Math.round(source.height * scale))
  const ctx = snapshot.getContext('2d')
  if (!ctx) return ''
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, snapshot.width, snapshot.height)
  return encodeRankingPhoto(snapshot, .9)
}

const initialOptions: AvatarOptions = {
  concept: 'classic',
  skin: '#c98f6b',
  hair: '#352b29',
  shirt: '#2d7f68',
  trousers: '#34433e',
  accent: '#f0b45a',
  shoes: '#2d3935',
  hairStyle: 'wave',
  bodyBuild: 'balanced',
  faceShape: 'oval',
  eyeStyle: 'round',
  mouthStyle: 'smile',
  outfitStyle: 'tee',
  sleeveStyle: 'short',
  bottomStyle: 'pants',
  shoeStyle: 'sneakers',
  accessory: 'none',
  scene: 'studio',
  motion: 'idle',
  robot: 'right',
}

const avatarConcepts: {
  id: AvatarConcept
  label: string
  detail: string
  preset: Pick<AvatarOptions, 'skin' | 'hair' | 'shirt' | 'trousers' | 'accent' | 'shoes' | 'bodyBuild' | 'faceShape' | 'eyeStyle' | 'mouthStyle' | 'outfitStyle' | 'sleeveStyle' | 'bottomStyle' | 'shoeStyle' | 'accessory'>
}[] = [
  { id: 'classic', label: '기본형', detail: '편안한 데일리', preset: { skin: '#c98f6b', hair: '#352b29', shirt: '#2d7f68', trousers: '#34433e', accent: '#f0b45a', shoes: '#2d3935', bodyBuild: 'balanced', faceShape: 'oval', eyeStyle: 'round', mouthStyle: 'smile', outfitStyle: 'tee', sleeveStyle: 'short', bottomStyle: 'pants', shoeStyle: 'sneakers', accessory: 'none' } },
  { id: 'woman', label: '여성형', detail: '부드러운 실루엣', preset: { skin: '#d9a17e', hair: '#624638', shirt: '#c46056', trousers: '#34433e', accent: '#f0c4a6', shoes: '#7b3f42', bodyBuild: 'slim', faceShape: 'oval', eyeStyle: 'sparkle', mouthStyle: 'smile', outfitStyle: 'tunic', sleeveStyle: 'none', bottomStyle: 'skirt', shoeStyle: 'flats', accessory: 'none' } },
  { id: 'robot', label: '로봇형', detail: '기계 프레임', preset: { skin: '#d7e3de', hair: '#43514b', shirt: '#35679a', trousers: '#34433e', accent: '#71d6b2', shoes: '#43514b', bodyBuild: 'broad', faceShape: 'angular', eyeStyle: 'focused', mouthStyle: 'neutral', outfitStyle: 'jacket', sleeveStyle: 'long', bottomStyle: 'pants', shoeStyle: 'boots', accessory: 'headphones' } },
  { id: 'athlete', label: '스포츠형', detail: '탄탄한 체형', preset: { skin: '#b97755', hair: '#2b2524', shirt: '#e1aa47', trousers: '#34433e', accent: '#ef7f6d', shoes: '#26342f', bodyBuild: 'broad', faceShape: 'angular', eyeStyle: 'focused', mouthStyle: 'neutral', outfitStyle: 'tee', sleeveStyle: 'none', bottomStyle: 'shorts', shoeStyle: 'sneakers', accessory: 'none' } },
  { id: 'explorer', label: '탐험가형', detail: '장비와 스카프', preset: { skin: '#d9a17e', hair: '#aa6a3f', shirt: '#2d7f68', trousers: '#5a4938', accent: '#c56f4c', shoes: '#49392f', bodyBuild: 'broad', faceShape: 'round', eyeStyle: 'happy', mouthStyle: 'smile', outfitStyle: 'jacket', sleeveStyle: 'long', bottomStyle: 'shorts', shoeStyle: 'boots', accessory: 'scarf' } },
  { id: 'alien', label: '외계인형', detail: '낯선 별의 친구', preset: { skin: '#8bc9ad', hair: '#315d58', shirt: '#6b5b8c', trousers: '#34433e', accent: '#bda4e6', shoes: '#735a90', bodyBuild: 'slim', faceShape: 'round', eyeStyle: 'sparkle', mouthStyle: 'neutral', outfitStyle: 'tunic', sleeveStyle: 'none', bottomStyle: 'shorts', shoeStyle: 'flats', accessory: 'none' } },
]

const bodyBuilds: Choice<BodyBuild>[] = [{ id: 'slim', label: '슬림' }, { id: 'balanced', label: '기본' }, { id: 'broad', label: '튼튼' }]
const faceShapes: Choice<FaceShape>[] = [{ id: 'round', label: '둥근형' }, { id: 'oval', label: '타원형' }, { id: 'angular', label: '각진형' }]
const eyeStyles: Choice<EyeStyle>[] = [{ id: 'round', label: '동그란 눈' }, { id: 'happy', label: '웃는 눈' }, { id: 'sparkle', label: '반짝이는 눈' }, { id: 'focused', label: '집중한 눈' }]
const mouthStyles: Choice<MouthStyle>[] = [{ id: 'smile', label: '미소' }, { id: 'neutral', label: '담담' }, { id: 'open', label: '활짝' }]
const outfitStyles: Choice<OutfitStyle>[] = [{ id: 'tee', label: '티셔츠' }, { id: 'jacket', label: '재킷' }, { id: 'overalls', label: '멜빵' }, { id: 'tunic', label: '튜닉' }]
const sleeveStyles: Choice<SleeveStyle>[] = [{ id: 'none', label: '민소매' }, { id: 'short', label: '반소매' }, { id: 'long', label: '긴소매' }]
const bottomStyles: Choice<BottomStyle>[] = [{ id: 'pants', label: '바지' }, { id: 'shorts', label: '반바지' }, { id: 'skirt', label: '스커트' }]
const shoeStyles: Choice<ShoeStyle>[] = [{ id: 'sneakers', label: '운동화' }, { id: 'boots', label: '부츠' }, { id: 'flats', label: '단화' }]
const accessories: Choice<AccessoryStyle>[] = [{ id: 'none', label: '없음' }, { id: 'glasses', label: '안경' }, { id: 'headphones', label: '헤드폰' }, { id: 'scarf', label: '스카프' }]

const scenes: { id: Scene; label: string; colors: [string, string] }[] = [
  { id: 'studio', label: '온실', colors: ['#dce8e3', '#f4d591'] },
  { id: 'sunset', label: '노을', colors: ['#6670a4', '#ef8c72'] },
  { id: 'day', label: '한낮', colors: ['#7fc6df', '#cce7d4'] },
  { id: 'cyber', label: '사이버', colors: ['#17243b', '#d26475'] },
]

const hairStyles: { id: HairStyle; label: string }[] = [
  { id: 'none', label: '없음' },
  { id: 'crop', label: '쇼트' },
  { id: 'wave', label: '웨이브' },
  { id: 'bob', label: '보브' },
  { id: 'spike', label: '스파이크' },
]

const motions: { id: MotionName; label: string; detail: string }[] = [
  { id: 'idle', label: '정자세', detail: '편안하게 서 있기' },
  { id: 'wave', label: '인사', detail: '손 흔들어 인사하기' },
  { id: 'dance', label: '춤', detail: '리듬에 맞춰 움직이기' },
  { id: 'jump', label: '점프', detail: '가볍게 뛰어오르기' },
  { id: 'sit', label: '앉기', detail: '편안하게 앉아 쉬기' },
  { id: 'run', label: '달리기', detail: '팔과 다리를 힘차게 움직이기' },
  { id: 'cross', label: '팔짱', detail: '두 팔을 몸 앞에서 교차하기' },
]

const swatches = {
  skin: ['#f1c7a5', '#d9a17e', '#b97755', '#82543e', '#51352f'],
  hair: ['#2b2524', '#624638', '#aa6a3f', '#d1ae73', '#55606b'],
  shirt: ['#2d7f68', '#35679a', '#c46056', '#e1aa47', '#6b5b8c'],
  accent: ['#f0b45a', '#ef7f6d', '#71d6b2', '#bda4e6', '#f0c4a6'],
  shoes: ['#26342f', '#49392f', '#7b3f42', '#43514b', '#735a90'],
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

function sampleRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const sx = clamp(Math.floor(x), 0, ctx.canvas.width - 1)
  const sy = clamp(Math.floor(y), 0, ctx.canvas.height - 1)
  const sw = clamp(Math.floor(w), 1, ctx.canvas.width - sx)
  const sh = clamp(Math.floor(h), 1, ctx.canvas.height - sy)
  const data = ctx.getImageData(sx, sy, sw, sh).data
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let i = 0; i < data.length; i += 32) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
    if (brightness < 12 || brightness > 248 || data[i + 3] < 180) continue
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    count++
  }
  if (!count) return '#92715f'
  return toHex(r / count, g / count, b / count)
}

async function analyzePhoto(src: string): Promise<AnalysisResult> {
  const image = new Image()
  image.src = src
  await image.decode()
  const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('사진을 분석할 수 없습니다.')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  let face = {
    x: canvas.width * 0.29,
    y: canvas.height * 0.12,
    width: canvas.width * 0.42,
    height: canvas.height * 0.42,
  }
  let faceFound = false

  type DetectorResult = { boundingBox: DOMRectReadOnly }
  type DetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
    detect: (source: CanvasImageSource) => Promise<DetectorResult[]>
  }
  const Detector = (window as unknown as { FaceDetector?: DetectorConstructor }).FaceDetector
  if (Detector) {
    try {
      const results = await new Detector({ fastMode: true, maxDetectedFaces: 1 }).detect(canvas)
      if (results[0]) {
        const box = results[0].boundingBox
        face = { x: box.x, y: box.y, width: box.width, height: box.height }
        faceFound = true
      }
    } catch {
      faceFound = false
    }
  }

  const hair = sampleRegion(ctx, face.x + face.width * 0.18, face.y, face.width * 0.64, face.height * 0.22)
  const skin = sampleRegion(ctx, face.x + face.width * 0.27, face.y + face.height * 0.42, face.width * 0.46, face.height * 0.28)
  const shirtY = clamp(face.y + face.height * 1.28, 0, canvas.height * 0.82)
  const shirt = sampleRegion(ctx, face.x + face.width * 0.05, shirtY, face.width * 0.9, face.height * 0.34)
  return { faceFound, skin, hair, shirt }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const livePoseRef = useRef<LivePose | null>(null)
  const liveFaceRef = useRef<HTMLCanvasElement | null>(null)
  const captureNoticeTimerRef = useRef<number | null>(null)
  const [options, setOptions] = useState<AvatarOptions>(initialOptions)
  const [photo, setPhoto] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState<'empty' | 'reading' | 'done' | 'error'>('empty')
  const [faceFound, setFaceFound] = useState(false)
  const [tab, setTab] = useState<CustomizeTab>('type')
  const [dragging, setDragging] = useState(false)
  const [webcamEnabled, setWebcamEnabled] = useState(false)
  const [webcamFaceEnabled, setWebcamFaceEnabled] = useState(false)
  const [webcamFaceReady, setWebcamFaceReady] = useState(false)
  const [captureSaved, setCaptureSaved] = useState(false)
  const [studioMode, setStudioMode] = useState<StudioMode>('customize')
  const [currentChallenge, setCurrentChallenge] = useState<ChallengePose>(challengePoses[0])
  const currentChallengeRef = useRef<ChallengePose>(challengePoses[0])
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>('idle')
  const challengePhaseRef = useRef<ChallengePhase>('idle')
  const challengeDeadlineRef = useRef(0)
  const challengeScoreRef = useRef(0)
  const [prepareTimeLeft, setPrepareTimeLeft] = useState(3)
  const [timeLeft, setTimeLeft] = useState(challengeDurationSeconds)
  const [liveScore, setLiveScore] = useState(0)
  const [finalScore, setFinalScore] = useState(0)
  const [captureRequest, setCaptureRequest] = useState(0)
  const [resultWebcamPhoto, setResultWebcamPhoto] = useState('')
  const [resultAvatarPhoto, setResultAvatarPhoto] = useState('')
  const [rankingPhotoSource, setRankingPhotoSource] = useState<RankingPhotoSource>('webcam')
  const [playerName, setPlayerName] = useState('')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(loadLeaderboard)
  const [selectedRankingEntry, setSelectedRankingEntry] = useState<LeaderboardEntry | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!selectedRankingEntry) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedRankingEntry(null)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedRankingEntry])

  useEffect(() => () => {
    if (captureNoticeTimerRef.current !== null) window.clearTimeout(captureNoticeTimerRef.current)
  }, [])

  const beginPreparation = useCallback(() => {
    if (challengePhaseRef.current === 'preparing' || challengePhaseRef.current === 'running') return
    challengePhaseRef.current = 'preparing'
    challengeDeadlineRef.current = performance.now() + 3000
    challengeScoreRef.current = 0
    setChallengePhase('preparing')
    setPrepareTimeLeft(3)
    setTimeLeft(challengeDurationSeconds)
    setLiveScore(0)
  }, [])

  const handleLivePose = useCallback((pose: LivePose | null) => {
    livePoseRef.current = pose
    if (!pose) return
    if (challengePhaseRef.current === 'waiting') beginPreparation()
    if (challengePhaseRef.current === 'running') {
      challengeScoreRef.current = calculateSyncScore(pose, currentChallengeRef.current)
    }
  }, [beginPreparation])

  const handleCapture = useCallback((capturedPhoto: string) => {
    setResultWebcamPhoto(capturedPhoto)
    if (!capturedPhoto) setRankingPhotoSource('avatar')
  }, [])

  const handleFaceFrame = useCallback((frame: HTMLCanvasElement | null) => {
    liveFaceRef.current = frame
    setWebcamFaceReady(Boolean(frame))
  }, [])

  useEffect(() => {
    if (challengePhase !== 'preparing' && challengePhase !== 'running') return
    const tick = () => {
      const remaining = Math.max(0, challengeDeadlineRef.current - performance.now())
      if (challengePhase === 'preparing') {
        setPrepareTimeLeft(remaining / 1000)
        if (remaining <= 0) {
          challengePhaseRef.current = 'running'
          challengeDeadlineRef.current = performance.now() + challengeDurationSeconds * 1000
          challengeScoreRef.current = 0
          setChallengePhase('running')
          setTimeLeft(challengeDurationSeconds)
          setLiveScore(0)
        }
        return
      }
      setTimeLeft(remaining / 1000)
      setLiveScore(challengeScoreRef.current)
      if (remaining <= 0) {
        const score = challengeScoreRef.current
        const avatarPhoto = captureAvatarForRanking(canvasRef.current)
        challengePhaseRef.current = 'result'
        setChallengePhase('result')
        setFinalScore(score)
        setLiveScore(score)
        setResultAvatarPhoto(avatarPhoto)
        setCaptureRequest((current) => current + 1)
      }
    }
    tick()
    const timer = window.setInterval(tick, 80)
    return () => window.clearInterval(timer)
  }, [challengePhase])

  useEffect(() => {
    let frame = 0
    const draw = (time: number) => {
      const revealedPose = studioMode === 'challenge' && (challengePhase === 'running' || challengePhase === 'result') ? currentChallenge : null
      if (canvasRef.current) renderAvatar(canvasRef.current, options, reduceMotion ? 0 : time, livePoseRef.current, revealedPose, webcamFaceEnabled ? liveFaceRef.current : null)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    const redraw = () => {
      const revealedPose = studioMode === 'challenge' && (challengePhase === 'running' || challengePhase === 'result') ? currentChallenge : null
      if (canvasRef.current) renderAvatar(canvasRef.current, options, 0, livePoseRef.current, revealedPose, webcamFaceEnabled ? liveFaceRef.current : null)
    }
    window.addEventListener('resize', redraw)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', redraw)
    }
  }, [options, reduceMotion, studioMode, currentChallenge, challengePhase, webcamFaceEnabled])

  const update = <K extends keyof AvatarOptions>(key: K, value: AvatarOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  const selectConcept = (concept: typeof avatarConcepts[number]) => {
    setOptions((current) => ({ ...current, concept: concept.id, ...concept.preset }))
  }

  const loadFile = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setStatus('error')
      return
    }
    setStatus('reading')
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = async () => {
      const src = String(reader.result)
      setPhoto(src)
      try {
        const result = await analyzePhoto(src)
        setOptions((current) => ({ ...current, skin: result.skin, hair: result.hair, shirt: result.shirt }))
        setFaceFound(result.faceFound)
        setStatus('done')
      } catch {
        setStatus('error')
      }
    }
    reader.onerror = () => setStatus('error')
    reader.readAsDataURL(file)
  }

  const randomize = () => {
    const pick = <T,>(values: T[]) => values[Math.floor(Math.random() * values.length)]
    const concept = pick(avatarConcepts)
    setOptions((current) => ({
      ...current,
      concept: concept.id,
      hair: pick(swatches.hair),
      shirt: pick(swatches.shirt),
      trousers: pick(swatches.hair),
      accent: pick(swatches.accent),
      shoes: pick(swatches.shoes),
      hairStyle: pick(hairStyles).id,
      bodyBuild: pick(bodyBuilds).id,
      faceShape: pick(faceShapes).id,
      eyeStyle: pick(eyeStyles).id,
      mouthStyle: pick(mouthStyles).id,
      outfitStyle: pick(outfitStyles).id,
      sleeveStyle: pick(sleeveStyles).id,
      bottomStyle: pick(bottomStyles).id,
      shoeStyle: pick(shoeStyles).id,
      accessory: pick(accessories).id,
      scene: pick(scenes).id,
      robot: pick<RobotSide>(['none', 'left', 'right']),
    }))
  }

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const now = new Date()
    const twoDigits = (value: number) => String(value).padStart(2, '0')
    const timestamp = `${now.getFullYear()}${twoDigits(now.getMonth() + 1)}${twoDigits(now.getDate())}-${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}${twoDigits(now.getSeconds())}`
    const link = document.createElement('a')
    link.download = `pose-quiz-aik-${timestamp}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    setCaptureSaved(true)
    if (captureNoticeTimerRef.current !== null) window.clearTimeout(captureNoticeTimerRef.current)
    captureNoticeTimerRef.current = window.setTimeout(() => {
      setCaptureSaved(false)
      captureNoticeTimerRef.current = null
    }, 1600)
  }

  const selectMode = (mode: StudioMode) => {
    setSelectedRankingEntry(null)
    setStudioMode(mode)
    if (mode !== 'challenge' && (challengePhaseRef.current === 'waiting' || challengePhaseRef.current === 'preparing' || challengePhaseRef.current === 'running')) {
      challengePhaseRef.current = 'idle'
      setChallengePhase('idle')
    }
  }

  const startChallenge = () => {
    const candidates = challengePoses.filter((pose) => pose.id !== currentChallengeRef.current.id)
    const nextPose = candidates[Math.floor(Math.random() * candidates.length)] ?? challengePoses[0]
    currentChallengeRef.current = nextPose
    setCurrentChallenge(nextPose)
    setStudioMode('challenge')
    setResultWebcamPhoto('')
    setResultAvatarPhoto('')
    setRankingPhotoSource('webcam')
    setPlayerName('')
    setFinalScore(0)
    setLiveScore(0)
    setPrepareTimeLeft(3)
    setTimeLeft(challengeDurationSeconds)
    setWebcamEnabled(true)
    if (livePoseRef.current) {
      beginPreparation()
    } else {
      challengePhaseRef.current = 'waiting'
      setChallengePhase('waiting')
    }
  }

  const stopWebcam = () => {
    setWebcamEnabled(false)
    setWebcamFaceEnabled(false)
    setWebcamFaceReady(false)
    livePoseRef.current = null
    liveFaceRef.current = null
    if (challengePhaseRef.current === 'waiting' || challengePhaseRef.current === 'preparing' || challengePhaseRef.current === 'running') {
      challengePhaseRef.current = 'idle'
      setChallengePhase('idle')
    }
  }

  const toggleWebcamFace = () => {
    const next = !webcamFaceEnabled
    setWebcamFaceEnabled(next)
    if (next) {
      setWebcamEnabled(true)
    } else {
      setWebcamFaceReady(false)
      liveFaceRef.current = null
    }
  }

  const saveResult = () => {
    const name = playerName.trim()
    const selectedPhoto = rankingPhotoSource === 'webcam' ? resultWebcamPhoto : resultAvatarPhoto
    if (!name || !selectedPhoto || challengePhase !== 'result') return
    const entry: LeaderboardEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.slice(0, 16),
      score: finalScore,
      photo: selectedPhoto,
      poseLabel: currentChallenge.label,
      createdAt: Date.now(),
    }
    const next = [...leaderboard, entry]
      .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)
      .slice(0, 30)
    setLeaderboard(next)
    try {
      window.localStorage.setItem(leaderboardKey, JSON.stringify(next))
    } catch {
      // The score remains visible for this session when storage is unavailable.
    }
    challengePhaseRef.current = 'idle'
    setChallengePhase('idle')
    setStudioMode('ranking')
  }

  const reset = () => {
    setOptions(initialOptions)
    setPhoto(null)
    setFileName('')
    setStatus('empty')
    setFaceFound(false)
    setWebcamEnabled(false)
    setWebcamFaceEnabled(false)
    setWebcamFaceReady(false)
    setStudioMode('customize')
    challengePhaseRef.current = 'idle'
    setChallengePhase('idle')
    setPrepareTimeLeft(3)
    setTimeLeft(challengeDurationSeconds)
    setLiveScore(0)
    setFinalScore(0)
    setResultWebcamPhoto('')
    setResultAvatarPhoto('')
    setRankingPhotoSource('webcam')
    setPlayerName('')
    livePoseRef.current = null
    liveFaceRef.current = null
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#studio" aria-label="문제맞추기AIK 홈">
          <span className="brand-mark"><Sparkle weight="fill" /></span>
          <span>문제맞추기AIK</span>
        </a>
        <nav className="mode-nav" aria-label="스튜디오 메뉴">
          <button type="button" className={studioMode === 'customize' ? 'active' : ''} onClick={() => selectMode('customize')}>꾸미기</button>
          <button type="button" className={studioMode === 'challenge' ? 'active' : ''} onClick={() => selectMode('challenge')}>문제 맞추기</button>
          <button type="button" className={studioMode === 'ranking' ? 'active' : ''} onClick={() => selectMode('ranking')}>순위</button>
        </nav>
        {studioMode !== 'ranking' ? (
          <button className="icon-button" type="button" onClick={reset} title="처음부터 다시 만들기">
            <ArrowCounterClockwise />
            <span>초기화</span>
          </button>
        ) : <span aria-hidden="true" />}
      </header>

      <main id="studio" className={`workspace ${studioMode === 'ranking' ? 'ranking-workspace' : ''}`}>
        {studioMode === 'ranking' ? (
          <section className="hall-of-fame" aria-labelledby="hall-title">
            <header className="hall-header">
              <div>
                <p className="hall-eyebrow"><Trophy weight="fill" /> AIK POSE ARCHIVE</p>
                <h1 id="hall-title">명예의 전당</h1>
                <p>가장 정확하게 로봇과 호흡을 맞춘 순간들입니다. 기록을 누르면 도전 사진을 크게 볼 수 있어요.</p>
              </div>
              <div className="hall-actions">
                <span><b>{leaderboard.length}</b>개의 기록</span>
                <button className="primary-game-button hall-start" type="button" onClick={startChallenge}><Play weight="fill" /> 새 기록 도전</button>
              </div>
            </header>

            {leaderboard.length === 0 ? (
              <div className="hall-empty">
                <span><Trophy weight="duotone" /></span>
                <strong>아직 전시된 기록이 없습니다</strong>
                <p>문제 맞추기에서 첫 포즈 기록을 남겨보세요.</p>
                <button className="primary-game-button hall-start" type="button" onClick={startChallenge}><Play weight="fill" /> 첫 기록 만들기</button>
              </div>
            ) : (
              <div className="hall-content">
                <div className="hall-gallery" aria-label="포즈 기록 갤러리">
                  {leaderboard.map((entry, index) => (
                    <motion.button
                      className={`hall-card rank-${index + 1}`}
                      type="button"
                      key={entry.id}
                      onClick={() => entry.photo && setSelectedRankingEntry(entry)}
                      disabled={!entry.photo}
                      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduceMotion ? 0 : Math.min(index * .045, .3) }}
                      aria-label={`${index + 1}위 ${entry.name}, ${entry.score}점 사진 크게 보기`}
                    >
                      <span className="hall-card-photo">
                        {entry.photo ? <img src={entry.photo} alt="" /> : <Robot weight="duotone" />}
                      </span>
                      <span className="hall-card-shade" />
                      <span className="hall-rank"><i>{index + 1}</i><small>RANK</small></span>
                      <span className="hall-card-copy">
                        <span><strong>{entry.name}</strong><small>{entry.poseLabel} · {new Date(entry.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</small></span>
                        <b>{entry.score}<em>%</em></b>
                      </span>
                    </motion.button>
                  ))}
                </div>

                <aside className="hall-list-panel" aria-label="전체 순위 목록">
                  <div className="hall-list-head">
                    <span>LEADERBOARD</span>
                    <strong>전체 순위</strong>
                  </div>
                  <div className="hall-list">
                    {leaderboard.map((entry, index) => (
                      <button
                        className="hall-list-row"
                        type="button"
                        key={entry.id}
                        onClick={() => entry.photo && setSelectedRankingEntry(entry)}
                        disabled={!entry.photo}
                        aria-label={`${index + 1}위 ${entry.name}, ${entry.score}점 사진 크게 보기`}
                      >
                        <span className="hall-list-rank">{index + 1}</span>
                        <span className="hall-list-photo">{entry.photo ? <img src={entry.photo} alt="" /> : <Robot />}</span>
                        <span className="hall-list-person"><strong>{entry.name}</strong><small>{entry.poseLabel}</small></span>
                        <b>{entry.score}<em>%</em></b>
                      </button>
                    ))}
                  </div>
                </aside>
              </div>
            )}
          </section>
        ) : (
        <>
        <section className="intro-panel" aria-labelledby="main-title">
          <div>
            <p className="eyebrow">나를 닮은 작은 세계</p>
            <h1 id="main-title">사진 한 장,<br />움직이는 나.</h1>
            <p className="intro-copy">모습을 읽고, 색을 고르고, 움직임을 더해 나만의 아바타를 완성하세요.</p>
          </div>

          {studioMode === 'challenge' ? (
            <div className={`challenge-left-clock ${challengePhase}`} aria-live="polite">
              <div className="challenge-left-clock-head">
                <Timer weight="duotone" />
                <span>CHALLENGE CLOCK</span>
              </div>
              <strong>{challengeDurationSeconds}<em>초</em></strong>
              <p>한 포즈에 주어진 제한시간</p>
              <div className="challenge-left-status">
                {challengePhase === 'preparing' ? `준비 ${Math.max(1, Math.ceil(prepareTimeLeft))}초` : challengePhase === 'running' ? `남은 시간 ${timeLeft.toFixed(1)}초` : challengePhase === 'result' ? '기록 저장 준비' : '도전 시작 후 카운트'}
              </div>
              <div className="challenge-left-rule" />
              <small>3초 준비가 끝나면 목표 포즈가 공개됩니다.</small>
            </div>
          ) : (
            <>
          <div
            className={`upload-box ${dragging ? 'is-dragging' : ''} ${photo ? 'has-photo' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void loadFile(event.dataTransfer.files[0])
            }}
          >
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={(event) => void loadFile(event.target.files?.[0])}
            />
            {photo ? (
              <>
                <img src={photo} alt="업로드한 원본 사진" />
                <button className="replace-photo" type="button" onClick={() => inputRef.current?.click()}>
                  <ImageSquare /> 사진 바꾸기
                </button>
              </>
            ) : (
              <button className="upload-trigger" type="button" onClick={() => inputRef.current?.click()}>
                <span className="upload-icon"><UploadSimple /></span>
                <strong>사진을 놓아주세요</strong>
                <span>또는 눌러서 파일 선택</span>
              </button>
            )}
          </div>

          <div className={`analysis-line ${status}`} aria-live="polite">
            {status === 'empty' && <><span className="status-knot" /> JPG, PNG, WEBP</>}
            {status === 'reading' && <><span className="status-knot" /> 사진의 색과 얼굴을 읽는 중</>}
            {status === 'done' && <><Check weight="bold" /> {faceFound ? '얼굴을 찾아 특징을 반영했어요' : '사진의 색을 아바타에 반영했어요'}</>}
            {status === 'error' && <>이미지 파일을 다시 선택해주세요</>}
          </div>
          {fileName && <p className="file-name" title={fileName}>{fileName}</p>}
            </>
          )}
        </section>

        <section className="stage-panel" aria-label="아바타 미리보기">
          <div className="stage-head">
            <div>
              <span>LIVE STAGE</span>
              <strong>
                {studioMode === 'challenge'
                  ? challengePhase === 'running'
                    ? `${currentChallenge.label} / ${timeLeft.toFixed(1)}초`
                    : challengePhase === 'result'
                      ? `${currentChallenge.label} / ${finalScore}%`
                      : challengePhase === 'preparing'
                        ? `목표 공개까지 ${Math.max(1, Math.ceil(prepareTimeLeft))}초`
                        : '도전 준비'
                  : webcamEnabled ? '웹캠 동작 연결 중' : `${motions.find((item) => item.id === options.motion)?.label} 동작 중`}
              </strong>
            </div>
            <div className="stage-actions">
              <button className={`capture-action ${captureSaved ? 'saved' : ''}`} type="button" onClick={download}>
                {captureSaved ? <Check weight="bold" /> : <Camera weight="duotone" />}
                <span>{captureSaved ? '저장됨' : '화면 캡처'}</span>
              </button>
              <button
                className={`webcam-action ${webcamEnabled ? 'active' : ''}`}
                type="button"
                onClick={() => webcamEnabled ? stopWebcam() : setWebcamEnabled(true)}
                aria-pressed={webcamEnabled}
              >
                {webcamEnabled ? <VideoCameraSlash /> : <VideoCamera />}
                <span>{webcamEnabled ? '추적 끄기' : '웹캠 연결'}</span>
              </button>
              <button className="round-action" type="button" onClick={randomize} title="스타일 섞기">
                <Shuffle />
              </button>
            </div>
          </div>
          <div className="canvas-wrap">
            <canvas ref={canvasRef} aria-label="현재 설정으로 움직이는 아바타" />
            <AnimatePresence>
              {studioMode === 'challenge' && challengePhase === 'preparing' && (
                <motion.div
                  className="challenge-countdown-overlay"
                  initial={reduceMotion ? false : { opacity: 0, scale: 1.08 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduceMotion ? {} : { opacity: 0, scale: .94 }}
                  aria-live="assertive"
                >
                  <span>READY</span>
                  <strong key={Math.ceil(prepareTimeLeft)}>{Math.max(1, Math.ceil(prepareTimeLeft))}</strong>
                  <div className="countdown-limit"><Timer weight="duotone" /><b>제한시간 {challengeDurationSeconds}초</b></div>
                  <p>3초 후 목표 포즈가 공개됩니다</p>
                </motion.div>
              )}
            </AnimatePresence>
            {webcamEnabled && (
              <Suspense fallback={<div className="webcam-preview loading"><div className="webcam-status"><VideoCamera /><span>추적 엔진 불러오는 중</span></div></div>}>
                <WebcamPose
                  enabled={webcamEnabled}
                  faceCaptureEnabled={webcamFaceEnabled}
                  captureRequest={captureRequest}
                  onClose={stopWebcam}
                  onPose={handleLivePose}
                  onFaceFrame={handleFaceFrame}
                  onCapture={handleCapture}
                />
              </Suspense>
            )}
            <div className="stage-corner top-left" />
            <div className="stage-corner top-right" />
            <div className="stage-corner bottom-left" />
            <div className="stage-corner bottom-right" />
          </div>
          <div className="scene-strip" aria-label="배경 선택">
            {scenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                className={options.scene === scene.id ? 'active' : ''}
                onClick={() => update('scene', scene.id)}
                aria-pressed={options.scene === scene.id}
              >
                <span className="scene-swatch" style={{ background: `linear-gradient(145deg, ${scene.colors[0]}, ${scene.colors[1]})` }} />
                <span>{scene.label}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className={`control-panel mode-${studioMode}`} aria-label="아바타 편집 도구">
          {studioMode === 'customize' ? (
          <>
          <div className="control-title">
            <div>
              <p>내 아바타</p>
              <h2>어떤 모습일까요?</h2>
            </div>
            <MagicWand weight="duotone" />
          </div>

          <div className="tabs" role="tablist" aria-label="편집 종류">
            <button type="button" className={tab === 'type' ? 'active' : ''} onClick={() => setTab('type')} role="tab" aria-selected={tab === 'type'}>타입</button>
            <button type="button" className={tab === 'face' ? 'active' : ''} onClick={() => setTab('face')} role="tab" aria-selected={tab === 'face'}>얼굴</button>
            <button type="button" className={tab === 'outfit' ? 'active' : ''} onClick={() => setTab('outfit')} role="tab" aria-selected={tab === 'outfit'}>의상</button>
            <button type="button" className={tab === 'move' ? 'active' : ''} onClick={() => setTab('move')} role="tab" aria-selected={tab === 'move'}>움직임</button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {tab === 'type' ? (
              <motion.div key="type" className="tab-content" initial={reduceMotion ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? {} : { opacity: 0, x: -10 }}>
                <fieldset>
                  <legend>아바타 타입</legend>
                  <div className="concept-grid">
                    {avatarConcepts.map((concept) => (
                      <button
                        key={concept.id}
                        type="button"
                        className={options.concept === concept.id ? 'active' : ''}
                        onClick={() => selectConcept(concept)}
                        aria-pressed={options.concept === concept.id}
                      >
                        <span className={`concept-glyph ${concept.id}`} aria-hidden="true"><i /></span>
                        <span><strong>{concept.label}</strong><small>{concept.detail}</small></span>
                        {options.concept === concept.id && <Check weight="bold" />}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <ChoiceField label="체형" options={bodyBuilds} value={options.bodyBuild} onChange={(value) => update('bodyBuild', value)} />

                <fieldset>
                  <legend>로봇 친구</legend>
                  <div className="segmented">
                    {(['none', 'left', 'right'] as RobotSide[]).map((side) => (
                      <button key={side} type="button" className={options.robot === side ? 'active' : ''} onClick={() => update('robot', side)}>
                        {side === 'none' ? '없음' : side === 'left' ? '왼쪽' : '오른쪽'}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </motion.div>
            ) : tab === 'face' ? (
              <motion.div key="face" className="tab-content" initial={reduceMotion ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? {} : { opacity: 0, x: -10 }}>

                <button
                  className={`webcam-face-toggle ${webcamFaceEnabled ? 'active' : ''} ${webcamFaceReady ? 'ready' : ''}`}
                  type="button"
                  onClick={toggleWebcamFace}
                  aria-pressed={webcamFaceEnabled}
                >
                  <span className="webcam-face-icon"><VideoCamera weight={webcamFaceEnabled ? 'fill' : 'duotone'} /></span>
                  <span>
                    <strong>{webcamFaceReady ? '내 얼굴 적용 중' : webcamFaceEnabled ? '얼굴 찾는 중' : '내 얼굴 입히기'}</strong>
                    <small>{webcamFaceReady ? '머리카락과 액세서리는 그대로 유지돼요' : webcamFaceEnabled ? '카메라를 정면으로 바라봐 주세요' : '웹캠 얼굴을 아바타에 실시간으로 표시'}</small>
                  </span>
                  {webcamFaceReady ? <Check weight="bold" /> : null}
                </button>

                <fieldset>
                  <legend>{options.concept === 'robot' ? '헤드 프레임' : '헤어 스타일'}</legend>
                  <div className="style-grid">
                    {hairStyles.map((style) => (
                      <button key={style.id} type="button" className={options.hairStyle === style.id ? 'active' : ''} onClick={() => update('hairStyle', style.id)} aria-pressed={options.hairStyle === style.id}>
                        <span className={`hair-glyph ${style.id}`} />
                        {style.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <ChoiceField label="얼굴형" options={faceShapes} value={options.faceShape} onChange={(value) => update('faceShape', value)} />
                <ChoiceField label="눈 모양" options={eyeStyles} value={options.eyeStyle} onChange={(value) => update('eyeStyle', value)} columns={2} />
                <ChoiceField label="입 모양" options={mouthStyles} value={options.mouthStyle} onChange={(value) => update('mouthStyle', value)} />
                <ChoiceField label="액세서리" options={accessories} value={options.accessory} onChange={(value) => update('accessory', value)} columns={2} />
                <ColorField label={options.concept === 'robot' ? '외장색' : '피부색'} values={swatches.skin} value={options.skin} onChange={(value) => update('skin', value)} />
                <ColorField label={options.concept === 'robot' ? '프레임색' : '머리색'} values={swatches.hair} value={options.hair} onChange={(value) => update('hair', value)} />
              </motion.div>
            ) : tab === 'outfit' ? (
              <motion.div key="outfit" className="tab-content" initial={reduceMotion ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? {} : { opacity: 0, x: -10 }}>
                <ChoiceField label="상의 형태" options={outfitStyles} value={options.outfitStyle} onChange={(value) => update('outfitStyle', value)} columns={2} />
                <ChoiceField label="소매 길이" options={sleeveStyles} value={options.sleeveStyle} onChange={(value) => update('sleeveStyle', value)} />
                <ChoiceField label="하의 형태" options={bottomStyles} value={options.bottomStyle} onChange={(value) => update('bottomStyle', value)} />
                <ChoiceField label="신발 형태" options={shoeStyles} value={options.shoeStyle} onChange={(value) => update('shoeStyle', value)} />
                <ColorField label={options.concept === 'robot' ? '패널색' : '상의색'} values={swatches.shirt} value={options.shirt} onChange={(value) => update('shirt', value)} />
                <ColorField label="하의색" values={swatches.hair} value={options.trousers} onChange={(value) => update('trousers', value)} />
                <ColorField label="포인트색" values={swatches.accent} value={options.accent} onChange={(value) => update('accent', value)} />
                <ColorField label="신발색" values={swatches.shoes} value={options.shoes} onChange={(value) => update('shoes', value)} />
              </motion.div>
            ) : (
              <motion.div key="move" className="tab-content motion-list" initial={reduceMotion ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? {} : { opacity: 0, x: -10 }}>
                {webcamEnabled && (
                  <p className="live-hint"><VideoCamera weight="fill" /> 지금은 웹캠 동작이 우선 적용됩니다</p>
                )}
                {motions.map((item) => (
                  <button key={item.id} type="button" className={options.motion === item.id ? 'active' : ''} onClick={() => update('motion', item.id)}>
                    <span className="motion-icon">
                      {item.id === 'idle' ? <Sparkle /> : item.id === 'wave' ? <HandWaving /> : item.id === 'sit' ? <Armchair /> : <PersonSimpleRun />}
                    </span>
                    <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    {options.motion === item.id && <Check weight="bold" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <button className="download-button" type="button" onClick={download}>
            <DownloadSimple weight="bold" /> 이미지로 저장
            <ArrowDown weight="bold" />
          </button>
          <p className="save-note"><Robot /> 현재 장면을 PNG로 저장합니다</p>
          </>
          ) : studioMode === 'challenge' ? (
          <>
            <div className="control-title">
              <div>
                <p>포즈 챌린지</p>
                <h2>로봇처럼 움직여요</h2>
              </div>
              <GameController weight="duotone" />
            </div>

            <div className={`challenge-target ${challengePhase === 'running' || challengePhase === 'result' ? 'revealed' : 'concealed'}`}>
              {challengePhase === 'running' || challengePhase === 'result' ? (
                <div>
                  <span>이번 문제</span>
                  <h3>{currentChallenge.label}</h3>
                  <p>{currentChallenge.cue}</p>
                </div>
              ) : (
                <div>
                  <span>{challengePhase === 'preparing' ? '준비 카운트다운' : '랜덤 포즈'}</span>
                  <h3>{challengePhase === 'preparing' ? Math.max(1, Math.ceil(prepareTimeLeft)) : '???'}</h3>
                  <p>{challengePhase === 'waiting' ? '전신이 인식되면 3초 준비가 시작됩니다.' : challengePhase === 'preparing' ? '끝나는 순간 목표 동작을 공개합니다.' : '도전 시작 후 3초 뒤 공개됩니다.'}</p>
                </div>
              )}
              <Robot weight="duotone" />
            </div>

            <div className={`challenge-score ${challengePhase}`} aria-live="polite">
              <div className="score-number">
                <strong>{challengePhase === 'result' ? finalScore : liveScore}</strong>
                <span>%</span>
              </div>
              <div className="challenge-clock">
                <Timer weight="duotone" />
                <span>{challengePhase === 'preparing' ? `준비 ${Math.max(1, Math.ceil(prepareTimeLeft))}초` : challengePhase === 'running' ? `${timeLeft.toFixed(1)}초` : `제한 시간 ${challengeDurationSeconds}초`}</span>
              </div>
            </div>

            {challengePhase === 'idle' && (
              <div className="challenge-actions">
                <p>{challengePoses.length}개 포즈 중 하나가 무작위로 나옵니다. 전신 인식 후 3초를 세고 목표 동작을 공개해요.</p>
                <button className="primary-game-button" type="button" onClick={startChallenge}><Play weight="fill" /> 도전 시작</button>
              </div>
            )}

            {challengePhase === 'waiting' && (
              <div className="challenge-waiting">
                <VideoCamera weight="duotone" />
                <strong>전신을 찾고 있어요</strong>
                <p>카메라에서 조금 물러나 어깨부터 발목까지 보여주세요.</p>
              </div>
            )}

            {challengePhase === 'preparing' && (
              <div className="challenge-preparing" aria-live="assertive">
                <strong>자세를 편하게 하고 준비하세요</strong>
                <p>아직 목표 동작은 비밀이에요. 화면 중앙의 숫자를 확인하세요.</p>
              </div>
            )}

            {challengePhase === 'running' && (
              <div className="challenge-running">
                <strong>로봇 포즈를 그대로 따라하세요</strong>
                <p>시간이 끝나는 순간의 자세로 점수가 결정됩니다.</p>
              </div>
            )}

            {challengePhase === 'result' && (
              <div className="result-form">
                <div className="result-photo-picker">
                  <span>순위에 저장할 화면</span>
                  <div role="group" aria-label="순위 사진 종류">
                    <button type="button" className={rankingPhotoSource === 'webcam' ? 'active' : ''} aria-pressed={rankingPhotoSource === 'webcam'} onClick={() => setRankingPhotoSource('webcam')}>
                      <VideoCamera weight="duotone" /> 캠 화면
                    </button>
                    <button type="button" className={rankingPhotoSource === 'avatar' ? 'active' : ''} aria-pressed={rankingPhotoSource === 'avatar'} onClick={() => setRankingPhotoSource('avatar')}>
                      <Robot weight="duotone" /> 캐릭터 화면
                    </button>
                  </div>
                </div>
                <div className={`result-photo ${rankingPhotoSource}`}>
                  {rankingPhotoSource === 'webcam'
                    ? resultWebcamPhoto
                      ? <img src={resultWebcamPhoto} alt="도전 종료 순간의 캠 화면" />
                      : <span><VideoCamera /> 캠 화면 저장 중</span>
                    : resultAvatarPhoto
                      ? <img src={resultAvatarPhoto} alt="도전 종료 순간의 캐릭터 화면" />
                      : <span><Robot /> 캐릭터 화면 저장 중</span>}
                  <strong>{finalScore}%</strong>
                </div>
                <label htmlFor="player-name">순위에 표시할 이름</label>
                <input id="player-name" value={playerName} maxLength={16} onChange={(event) => setPlayerName(event.target.value)} placeholder="이름을 입력하세요" autoComplete="nickname" />
                <button className="primary-game-button" type="button" onClick={saveResult} disabled={!playerName.trim() || !(rankingPhotoSource === 'webcam' ? resultWebcamPhoto : resultAvatarPhoto)}><FloppyDisk weight="bold" /> 순위에 저장</button>
                <button className="secondary-game-button" type="button" onClick={startChallenge}>다시 도전</button>
              </div>
            )}
          </>
          ) : (
          <>
            <div className="control-title">
              <div>
                <p>명예의 전당</p>
                <h2>포즈 싱크 순위</h2>
              </div>
              <Trophy weight="duotone" />
            </div>

            <div className="ranking-list">
              {leaderboard.length === 0 ? (
                <div className="ranking-empty">
                  <Trophy weight="duotone" />
                  <strong>첫 기록을 만들어보세요</strong>
                  <p>문제 맞추기에서 포즈를 따라하면 여기에 순위가 저장됩니다.</p>
                </div>
              ) : leaderboard.map((entry, index) => (
                <article className="ranking-row" key={entry.id}>
                  <span className="rank-number">{index + 1}</span>
                  <div className="rank-photo">
                    {entry.photo ? <img src={entry.photo} alt={`${entry.name}의 도전 사진`} /> : <Robot />}
                  </div>
                  <div className="rank-person">
                    <strong>{entry.name}</strong>
                    <small>{entry.poseLabel}</small>
                  </div>
                  <strong className="rank-score">{entry.score}%</strong>
                </article>
              ))}
            </div>
            <button className="primary-game-button ranking-start" type="button" onClick={startChallenge}><Play weight="fill" /> 새 기록 도전</button>
          </>
          )}
        </aside>
        </>
        )}
      </main>

      <AnimatePresence>
        {selectedRankingEntry?.photo && (
          <motion.div
            className="ranking-photo-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedRankingEntry(null)
            }}
          >
            <motion.div
              className="ranking-photo-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedRankingEntry.name}의 도전 기록`}
              initial={reduceMotion ? false : { opacity: 0, y: 20, scale: .97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? {} : { opacity: 0, y: 12, scale: .98 }}
            >
              <button className="ranking-photo-close" type="button" onClick={() => setSelectedRankingEntry(null)} aria-label="사진 닫기"><X weight="bold" /></button>
              <img src={selectedRankingEntry.photo} alt={`${selectedRankingEntry.name}의 도전 사진 크게 보기`} />
              <div className="ranking-photo-caption">
                <span><small>{selectedRankingEntry.poseLabel}</small><strong>{selectedRankingEntry.name}</strong></span>
                <b>{selectedRankingEntry.score}<em>%</em></b>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ChoiceField<T extends string>({ label, options, value, onChange, columns = 3 }: { label: string; options: Choice<T>[]; value: T; onChange: (value: T) => void; columns?: number }) {
  return (
    <fieldset className="choice-field">
      <legend>{label}</legend>
      <div className="choice-grid" style={{ '--choice-columns': columns } as React.CSSProperties}>
        {options.map((option) => (
          <button key={option.id} type="button" className={value === option.id ? 'active' : ''} onClick={() => onChange(option.id)} aria-pressed={value === option.id}>
            {option.label}
            {value === option.id && <Check weight="bold" />}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function ColorField({ label, values, value, onChange }: { label: string; values: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <fieldset className="color-field">
      <legend>{label}</legend>
      <div className="swatches">
        {values.map((color) => (
          <button key={color} type="button" className={value.toLowerCase() === color.toLowerCase() ? 'active' : ''} style={{ '--swatch': color } as React.CSSProperties} onClick={() => onChange(color)} aria-label={`${label} ${color}`} aria-pressed={value.toLowerCase() === color.toLowerCase()}>
            {value.toLowerCase() === color.toLowerCase() && <Check weight="bold" />}
          </button>
        ))}
        {!values.includes(value.toLowerCase()) && <span className="sampled-color" style={{ '--swatch': value } as React.CSSProperties} title="사진에서 가져온 색"><Sparkle weight="fill" /></span>}
      </div>
    </fieldset>
  )
}

export default App
