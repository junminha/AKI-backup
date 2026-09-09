import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { Camera, CheckCircle, WarningCircle } from '@phosphor-icons/react'
import {
  LEG_KEYS,
  isUsable,
  lerp,
  readTracking,
  smoothPose,
  toLivePose,
  type Holds,
} from './game/tracking'
import type { CameraStatus, LivePose } from './game/types'

interface WebcamPoseProps {
  enabled: boolean
  status: CameraStatus
  onStatus: (status: CameraStatus) => void
  onPose: (pose: LivePose | null) => void
}

const DETECT_INTERVAL_MS = 33

export function WebcamPose({ enabled, status, onStatus, onPose }: WebcamPoseProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onStatusRef = useRef(onStatus)
  const onPoseRef = useRef(onPose)
  const [legsSeen, setLegsSeen] = useState(true)
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
    let legsReported = true
    const holds: Holds = new Map()

    const start = async () => {
      onStatusRef.current('loading')
      try {
        let requestTimedOut = false
        let timeoutId = 0
        const mediaRequest = navigator.mediaDevices.getUserMedia({
          // 4:3 rather than 16:9: the taller frame fits more of the player in,
          // and a bigger picture gives the model more to read.
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
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
          // Loose gates keep a partly framed body tracked; the per-joint checks
          // in tracking.ts decide what is trustworthy enough to score.
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
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
            nextDetectionAt = time + DETECT_INTERVAL_MS
            const landmarks = landmarker.detectForVideo(videoNode, time).landmarks[0]
            if (landmarks) {
              const tracked = readTracking(holds, landmarks)
              const hipY = (landmarks[23].y + landmarks[24].y) / 2
              const footY = Math.max(landmarks[27].y, landmarks[28].y)
              if (baselineHip === null || baselineFootY === null) {
                baselineHip = hipY; baselineFootY = footY
              } else if (baselineSamples < 18) {
                baselineHip = lerp(baselineHip, hipY, 0.12)
                baselineFootY = lerp(baselineFootY, footY, 0.12)
                baselineSamples += 1
              }
              const nextPose = toLivePose(landmarks, tracked, baselineHip, baselineFootY)
              if (isUsable(nextPose)) {
                smoothedPose = smoothPose(smoothedPose, nextPose)
                onPoseRef.current(smoothedPose)
                onStatusRef.current('ready')
                const legs = LEG_KEYS.some((key) => tracked[key])
                if (legs !== legsReported) {
                  legsReported = legs
                  setLegsSeen(legs)
                }
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
      ? legsSeen ? '전신 추적 중' : '상체 추적 중'
      : status === 'searching'
        ? '몸이 보이게 서주세요'
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
