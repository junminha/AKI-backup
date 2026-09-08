import { useEffect, useRef } from 'react'
import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { Camera, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import type { CameraStatus, LivePose } from './game/types'

interface WebcamPoseProps {
  enabled: boolean
  status: CameraStatus
  onStatus: (status: CameraStatus) => void
  onPose: (pose: LivePose | null) => void
}

const majorLandmarks = [7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32]
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const mirror = (point: NormalizedLandmark) => ({ x: 1 - point.x, y: point.y })
const lerp = (previous: number, next: number, amount = 0.34) => previous + (next - previous) * amount

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

function toLivePose(landmarks: NormalizedLandmark[], baselineHip: number, baselineFootY: number): LivePose {
  const leftShoulder = mirror(landmarks[11])
  const rightShoulder = mirror(landmarks[12])
  const hipY = (landmarks[23].y + landmarks[24].y) / 2
  const supportFootY = Math.max(landmarks[27].y, landmarks[28].y)
  const feetVisible = Math.min(landmarks[27].visibility ?? 0, landmarks[28].visibility ?? 0) > 0.5
  const hipRise = baselineHip - hipY
  const footRise = baselineFootY - supportFootY
  const confidence = majorLandmarks.reduce((sum, index) => sum + (landmarks[index].visibility ?? 0), 0) / majorLandmarks.length

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
    confidence,
  }
}

function smoothPose(previous: LivePose | null, next: LivePose): LivePose {
  if (!previous) return next
  return {
    bodyLean: lerp(previous.bodyLean, next.bodyLean, 0.3),
    headTilt: lerp(previous.headTilt, next.headTilt, 0.3),
    hipLift: lerp(previous.hipLift, next.hipLift, 0.25),
    leftUpperArm: lerp(previous.leftUpperArm, next.leftUpperArm),
    leftForearm: lerp(previous.leftForearm, next.leftForearm),
    rightUpperArm: lerp(previous.rightUpperArm, next.rightUpperArm),
    rightForearm: lerp(previous.rightForearm, next.rightForearm),
    leftUpperLeg: lerp(previous.leftUpperLeg, next.leftUpperLeg, 0.28),
    leftLowerLeg: lerp(previous.leftLowerLeg, next.leftLowerLeg, 0.28),
    rightUpperLeg: lerp(previous.rightUpperLeg, next.rightUpperLeg, 0.28),
    rightLowerLeg: lerp(previous.rightLowerLeg, next.rightLowerLeg, 0.28),
    confidence: next.confidence,
  }
}

export function WebcamPose({ enabled, status, onStatus, onPose }: WebcamPoseProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onStatusRef = useRef(onStatus)
  const onPoseRef = useRef(onPose)
  useEffect(() => { onStatusRef.current = onStatus }, [onStatus])
  useEffect(() => { onPoseRef.current = onPose }, [onPose])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let animationFrame = 0
    let stream: MediaStream | null = null
    let landmarker: PoseLandmarker | null = null
    let lastVideoTime = -1
    let nextDetectionAt = 0
    let baselineHip: number | null = null
    let baselineFootY: number | null = null
    let baselineSamples = 0
    let smoothedPose: LivePose | null = null

    const start = async () => {
      onStatusRef.current('loading')
      try {
        let requestTimedOut = false
        let timeoutId = 0
        const mediaRequest = navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
          audio: false,
        })
        mediaRequest.then((lateStream) => {
          if (requestTimedOut || cancelled) lateStream.getTracks().forEach((track) => track.stop())
        }).catch(() => undefined)
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            requestTimedOut = true
            reject(new Error('Camera request timed out'))
          }, 8000)
        })
        stream = await Promise.race([mediaRequest, timeout])
        window.clearTimeout(timeoutId)
        if (cancelled) return stream.getTracks().forEach((track) => track.stop())
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        const assetBase = import.meta.env.BASE_URL
        const fileset = await FilesetResolver.forVisionTasks(`${assetBase}wasm`)
        const options = {
          baseOptions: { modelAssetPath: `${assetBase}models/pose_landmarker_lite.task`, delegate: 'GPU' as const },
          runningMode: 'VIDEO' as const,
          numPoses: 1,
          minPoseDetectionConfidence: 0.55,
          minPosePresenceConfidence: 0.55,
          minTrackingConfidence: 0.5,
        }
        try {
          landmarker = await PoseLandmarker.createFromOptions(fileset, options)
        } catch {
          landmarker = await PoseLandmarker.createFromOptions(fileset, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } })
        }
        if (cancelled) return landmarker.close()
        onStatusRef.current('searching')

        const detect = (time: number) => {
          if (cancelled || !landmarker || !videoRef.current) return
          const videoNode = videoRef.current
          if (videoNode.readyState >= 2 && videoNode.currentTime !== lastVideoTime && time >= nextDetectionAt) {
            lastVideoTime = videoNode.currentTime
            nextDetectionAt = time + 50
            const landmarks = landmarker.detectForVideo(videoNode, time).landmarks[0]
            if (landmarks) {
              const hipY = (landmarks[23].y + landmarks[24].y) / 2
              const footY = Math.max(landmarks[27].y, landmarks[28].y)
              if (baselineHip === null || baselineFootY === null) {
                baselineHip = hipY; baselineFootY = footY
              } else if (baselineSamples < 18) {
                baselineHip = lerp(baselineHip, hipY, 0.12)
                baselineFootY = lerp(baselineFootY, footY, 0.12)
                baselineSamples += 1
              }
              const nextPose = toLivePose(landmarks, baselineHip, baselineFootY)
              if (nextPose.confidence > 0.42) {
                smoothedPose = smoothPose(smoothedPose, nextPose)
                onPoseRef.current(smoothedPose)
                onStatusRef.current('ready')
              } else {
                onPoseRef.current(null); onStatusRef.current('searching')
              }
            } else {
              smoothedPose = null; onPoseRef.current(null); onStatusRef.current('searching')
            }
          }
          animationFrame = requestAnimationFrame(detect)
        }
        animationFrame = requestAnimationFrame(detect)
      } catch {
        if (!cancelled) { onPoseRef.current(null); onStatusRef.current('error') }
      }
    }

    void start()
    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrame)
      stream?.getTracks().forEach((track) => track.stop())
      landmarker?.close()
      onPoseRef.current(null)
      onStatusRef.current('idle')
    }
  }, [enabled])

  const copy = status === 'loading'
    ? '포즈 모델 준비 중'
    : status === 'ready'
      ? '전신 추적 중'
      : status === 'searching'
        ? '전신이 보이게 서주세요'
        : '카메라를 확인해 주세요'

  return (
    <aside className={`camera-preview ${status}`} aria-live="polite">
      <video ref={videoRef} muted playsInline aria-label="실시간 카메라 화면" />
      <div className="camera-preview-shade" />
      <div className="camera-preview-status">
        {status === 'ready' ? <CheckCircle weight="fill" /> : status === 'error' ? <WarningCircle weight="fill" /> : <Camera weight="duotone" />}
        <span>{copy}</span>
      </div>
    </aside>
  )
}
