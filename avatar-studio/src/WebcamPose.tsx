import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { CameraRotate, CheckCircle, WarningCircle, X } from '@phosphor-icons/react'
import { encodeRankingPhoto } from './rankingPhoto'
import type { LivePose } from './types'

type TrackerStatus = 'loading' | 'ready' | 'searching' | 'error'

interface WebcamPoseProps {
  enabled: boolean
  faceCaptureEnabled: boolean
  captureRequest: number
  onClose: () => void
  onPose: (pose: LivePose | null) => void
  onFaceFrame: (frame: HTMLCanvasElement | null) => void
  onCapture: (photo: string) => void
}

interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

const majorLandmarks = [7, 8, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 31, 32]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function mirror(point: NormalizedLandmark) {
  return { x: 1 - point.x, y: point.y }
}

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

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function palmDirection(wrist: NormalizedLandmark, index: NormalizedLandmark, pinky: NormalizedLandmark) {
  const palm = { ...index, x: (index.x + pinky.x) / 2, y: (index.y + pinky.y) / 2 }
  return angleFromRight(wrist, palm)
}

function handSpread(wrist: NormalizedLandmark, index: NormalizedLandmark, pinky: NormalizedLandmark) {
  const palmLength = Math.max(distance(wrist, index), 0.001)
  return clamp(distance(index, pinky) / palmLength, 0.28, 1.15)
}

function lerp(previous: number, next: number, amount = 0.38) {
  return previous + (next - previous) * amount
}

function smoothPose(previous: LivePose | null, next: LivePose): LivePose {
  if (!previous) return next
  return {
    bodyLean: lerp(previous.bodyLean, next.bodyLean),
    headTilt: lerp(previous.headTilt, next.headTilt),
    neckLean: lerp(previous.neckLean, next.neckLean),
    hipLift: lerp(previous.hipLift, next.hipLift, 0.28),
    leftUpperArm: lerp(previous.leftUpperArm, next.leftUpperArm),
    leftForearm: lerp(previous.leftForearm, next.leftForearm),
    leftHand: lerp(previous.leftHand, next.leftHand),
    leftHandSpread: lerp(previous.leftHandSpread, next.leftHandSpread),
    leftArmFront: lerp(previous.leftArmFront, next.leftArmFront, 0.24),
    leftArmDepth: lerp(previous.leftArmDepth, next.leftArmDepth, 0.24),
    rightUpperArm: lerp(previous.rightUpperArm, next.rightUpperArm),
    rightForearm: lerp(previous.rightForearm, next.rightForearm),
    rightHand: lerp(previous.rightHand, next.rightHand),
    rightHandSpread: lerp(previous.rightHandSpread, next.rightHandSpread),
    rightArmFront: lerp(previous.rightArmFront, next.rightArmFront, 0.24),
    rightArmDepth: lerp(previous.rightArmDepth, next.rightArmDepth, 0.24),
    leftUpperLeg: lerp(previous.leftUpperLeg, next.leftUpperLeg, 0.3),
    leftLowerLeg: lerp(previous.leftLowerLeg, next.leftLowerLeg, 0.3),
    leftFoot: lerp(previous.leftFoot, next.leftFoot, 0.3),
    rightUpperLeg: lerp(previous.rightUpperLeg, next.rightUpperLeg, 0.3),
    rightLowerLeg: lerp(previous.rightLowerLeg, next.rightLowerLeg, 0.3),
    rightFoot: lerp(previous.rightFoot, next.rightFoot, 0.3),
    confidence: next.confidence,
  }
}

function getFaceBox(video: HTMLVideoElement, landmarks: NormalizedLandmark[]) {
  const nose = landmarks[0]
  const leftEar = landmarks[7]
  const rightEar = landmarks[8]
  const leftShoulder = landmarks[11]
  const rightShoulder = landmarks[12]
  if (!nose || !leftEar || !rightEar || !leftShoulder || !rightShoulder) return null

  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight
  if (!videoWidth || !videoHeight) return null

  const earWidth = Math.hypot(
    (leftEar.x - rightEar.x) * videoWidth,
    (leftEar.y - rightEar.y) * videoHeight,
  )
  const shoulderWidth = Math.hypot(
    (leftShoulder.x - rightShoulder.x) * videoWidth,
    (leftShoulder.y - rightShoulder.y) * videoHeight,
  )
  const width = clamp(Math.max(earWidth * 1.72, shoulderWidth * .42), videoWidth * .15, videoWidth * .4)
  const height = width * 1.2
  const earCenterX = (leftEar.x + rightEar.x) * .5 * videoWidth
  const centerX = earCenterX * .72 + nose.x * videoWidth * .28
  // Keep the crop biased toward the forehead so the neck does not fill the avatar face.
  const centerY = nose.y * videoHeight - height * .16

  return {
    x: clamp(centerX - width * .5, 0, Math.max(0, videoWidth - width)),
    y: clamp(centerY - height * .5, 0, Math.max(0, videoHeight - height)),
    width,
    height,
  }
}

function smoothFaceBox(previous: FaceBox | null, next: FaceBox): FaceBox {
  if (!previous) return next
  return {
    x: lerp(previous.x, next.x, .24),
    y: lerp(previous.y, next.y, .24),
    width: lerp(previous.width, next.width, .2),
    height: lerp(previous.height, next.height, .2),
  }
}

function drawFaceFrame(video: HTMLVideoElement, box: FaceBox, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.translate(canvas.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height)
  ctx.restore()
  return true
}

function toLivePose(landmarks: NormalizedLandmark[], baselineHip: number, baselineFootY: number) {
  const leftShoulder = mirror(landmarks[11])
  const rightShoulder = mirror(landmarks[12])
  const nose = mirror(landmarks[0])
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2
  const hipY = (landmarks[23].y + landmarks[24].y) / 2
  const supportFootY = Math.max(landmarks[27].y, landmarks[28].y)
  const hipRise = baselineHip - hipY
  const footRise = baselineFootY - supportFootY
  const feetVisible = Math.min(landmarks[27].visibility ?? 0, landmarks[28].visibility ?? 0) > .55
  // A hip-only offset is commonly caused by crouching, leaning, or camera framing.
  // Release the avatar from the floor only when both the hips and supporting foot rise.
  const confirmedJump = feetVisible && hipRise > .035 && footRise > .035
  const torsoDepth = (landmarks[11].z + landmarks[12].z + landmarks[23].z + landmarks[24].z) / 4
  const shoulderMinX = Math.min(leftShoulder.x, rightShoulder.x)
  const shoulderMaxX = Math.max(leftShoulder.x, rightShoulder.x)
  const armLayer = (elbowIndex: number, wristIndex: number) => {
    const wrist = mirror(landmarks[wristIndex])
    const depth = (landmarks[elbowIndex].z * 0.35 + landmarks[wristIndex].z * 0.65) - torsoDepth
    const crossingTorso = wrist.x > shoulderMinX - 0.03
      && wrist.x < shoulderMaxX + 0.03
      && wrist.y > Math.min(leftShoulder.y, rightShoulder.y) - 0.07
      && wrist.y < hipY + 0.08
    return {
      depth,
      front: crossingTorso ? 1 : depth < -0.035 ? 0.82 : 0.08,
    }
  }
  const leftLayer = armLayer(13, 15)
  const rightLayer = armLayer(14, 16)
  const confidence = majorLandmarks.reduce((sum, index) => sum + (landmarks[index].visibility ?? 0), 0) / majorLandmarks.length

  return {
    bodyLean: clamp(Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x), -0.3, 0.3),
    headTilt: clamp(angleFromRight(landmarks[7], landmarks[8]), -0.42, 0.42),
    neckLean: clamp((nose.x - shoulderMidX) * 1.8, -0.34, 0.34),
    hipLift: confirmedJump ? clamp(Math.min(hipRise, footRise) * 3.6, 0, .25) : 0,
    leftUpperArm: angleFromDown(landmarks[11], landmarks[13]),
    leftForearm: angleFromDown(landmarks[13], landmarks[15]),
    leftHand: palmDirection(landmarks[15], landmarks[19], landmarks[17]),
    leftHandSpread: handSpread(landmarks[15], landmarks[19], landmarks[17]),
    leftArmFront: leftLayer.front,
    leftArmDepth: leftLayer.depth,
    rightUpperArm: angleFromDown(landmarks[12], landmarks[14]),
    rightForearm: angleFromDown(landmarks[14], landmarks[16]),
    rightHand: palmDirection(landmarks[16], landmarks[20], landmarks[18]),
    rightHandSpread: handSpread(landmarks[16], landmarks[20], landmarks[18]),
    rightArmFront: rightLayer.front,
    rightArmDepth: rightLayer.depth,
    leftUpperLeg: angleFromDown(landmarks[23], landmarks[25]),
    leftLowerLeg: angleFromDown(landmarks[25], landmarks[27]),
    leftFoot: angleFromRight(landmarks[27], landmarks[31]),
    rightUpperLeg: angleFromDown(landmarks[24], landmarks[26]),
    rightLowerLeg: angleFromDown(landmarks[26], landmarks[28]),
    rightFoot: angleFromRight(landmarks[28], landmarks[32]),
    confidence,
  }
}

export function WebcamPose({ enabled, faceCaptureEnabled, captureRequest, onClose, onPose, onFaceFrame, onCapture }: WebcamPoseProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const faceCaptureEnabledRef = useRef(faceCaptureEnabled)
  const onFaceFrameRef = useRef(onFaceFrame)
  const [status, setStatus] = useState<TrackerStatus>('loading')

  useEffect(() => {
    faceCaptureEnabledRef.current = faceCaptureEnabled
    if (!faceCaptureEnabled) onFaceFrameRef.current(null)
  }, [faceCaptureEnabled])

  useEffect(() => {
    onFaceFrameRef.current = onFaceFrame
  }, [onFaceFrame])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let frame = 0
    let stream: MediaStream | null = null
    let landmarker: PoseLandmarker | null = null
    let lastVideoTime = -1
    let nextDetectionAt = 0
    let hadPose = false
    let hadFaceFrame = false
    let baselineHip: number | null = null
    let baselineFootY: number | null = null
    let baselineSamples = 0
    let smoothedPose: LivePose | null = null
    let smoothedFaceBox: FaceBox | null = null
    const faceCanvas = document.createElement('canvas')
    faceCanvas.width = 180
    faceCanvas.height = 216

    const start = async () => {
      setStatus('loading')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 960 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        const assetBase = import.meta.env.BASE_URL
        const vision = await FilesetResolver.forVisionTasks(`${assetBase}wasm`)
        const options = {
          baseOptions: {
            modelAssetPath: `${assetBase}models/pose_landmarker_lite.task`,
            delegate: 'GPU' as const,
          },
          runningMode: 'VIDEO' as const,
          numPoses: 1,
          minPoseDetectionConfidence: 0.55,
          minPosePresenceConfidence: 0.55,
          minTrackingConfidence: 0.5,
        }
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, options)
        } catch {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            ...options,
            baseOptions: { ...options.baseOptions, delegate: 'CPU' },
          })
        }
        if (cancelled) {
          landmarker.close()
          return
        }
        setStatus('searching')

        const detect = (time: number) => {
          if (cancelled || !landmarker || !videoRef.current) return
          const currentVideo = videoRef.current
          if (currentVideo.readyState >= 2 && currentVideo.currentTime !== lastVideoTime && time >= nextDetectionAt) {
            lastVideoTime = currentVideo.currentTime
            nextDetectionAt = time + 50
            const result = landmarker.detectForVideo(currentVideo, time)
            const landmarks = result.landmarks[0]
            if (landmarks) {
              if (faceCaptureEnabledRef.current) {
                const nextFaceBox = getFaceBox(currentVideo, landmarks)
                if (nextFaceBox) {
                  smoothedFaceBox = smoothFaceBox(smoothedFaceBox, nextFaceBox)
                  if (drawFaceFrame(currentVideo, smoothedFaceBox, faceCanvas)) {
                    onFaceFrameRef.current(faceCanvas)
                    hadFaceFrame = true
                  }
                }
              } else if (hadFaceFrame) {
                hadFaceFrame = false
                smoothedFaceBox = null
                onFaceFrameRef.current(null)
              }
              const hipY = (landmarks[23].y + landmarks[24].y) / 2
              const supportFootY = Math.max(landmarks[27].y, landmarks[28].y)
              if (baselineHip === null || baselineFootY === null) {
                baselineHip = hipY
                baselineFootY = supportFootY
                baselineSamples = 1
              } else if (baselineSamples < 18) {
                // Calibrate briefly, then lock the standing height so a held sit does not drift upward.
                if (Math.abs(hipY - baselineHip) < .08) baselineHip = lerp(baselineHip, hipY, .12)
                if (Math.abs(supportFootY - baselineFootY) < .08) baselineFootY = lerp(baselineFootY, supportFootY, .12)
                baselineSamples += 1
              }
              const next = toLivePose(landmarks, baselineHip, baselineFootY)
              if (next.confidence > 0.42) {
                smoothedPose = smoothPose(smoothedPose, next)
                onPose(smoothedPose)
                if (!hadPose) {
                  hadPose = true
                  setStatus('ready')
                }
              }
            } else if (hadPose) {
              hadPose = false
              smoothedPose = null
              onPose(null)
              setStatus('searching')
            }
            if (!landmarks && hadFaceFrame) {
              hadFaceFrame = false
              smoothedFaceBox = null
              onFaceFrameRef.current(null)
            }
          }
          frame = requestAnimationFrame(detect)
        }
        frame = requestAnimationFrame(detect)
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    void start()
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
      landmarker?.close()
      onPose(null)
      onFaceFrameRef.current(null)
    }
  }, [enabled, onPose])

  useEffect(() => {
    if (captureRequest === 0) return
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      onCapture('')
      return
    }
    const canvas = document.createElement('canvas')
    const sourceRatio = video.videoWidth / video.videoHeight
    const targetRatio = 4 / 3
    let sourceWidth = video.videoWidth
    let sourceHeight = video.videoHeight
    let sourceX = 0
    let sourceY = 0
    if (sourceRatio > targetRatio) {
      sourceWidth = video.videoHeight * targetRatio
      sourceX = (video.videoWidth - sourceWidth) / 2
    } else {
      sourceHeight = video.videoWidth / targetRatio
      sourceY = (video.videoHeight - sourceHeight) / 2
    }
    const scale = Math.min(960 / sourceWidth, 720 / sourceHeight, 1)
    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      onCapture('')
      return
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)
    onCapture(encodeRankingPhoto(canvas, .9))
  }, [captureRequest, onCapture])

  const label = status === 'loading'
    ? '포즈 모델 준비 중'
    : status === 'ready'
      ? '동작을 따라가는 중'
      : status === 'searching'
        ? '전신이 보이게 서주세요'
        : '카메라를 사용할 수 없어요'

  return (
    <div className={`webcam-preview ${status}`} aria-live="polite">
      <video ref={videoRef} muted playsInline aria-label="웹캠 동작 추적 영상" />
      <div className="webcam-shade" />
      <div className="webcam-status">
        {status === 'ready' ? <CheckCircle weight="fill" /> : status === 'error' ? <WarningCircle weight="fill" /> : <CameraRotate />}
        <span>{label}</span>
      </div>
      <button type="button" onClick={onClose} aria-label="웹캠 추적 닫기"><X weight="bold" /></button>
    </div>
  )
}
