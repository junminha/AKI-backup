import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowCounterClockwise,
  Camera,
  Check,
  Crown,
  Heart,
  Play,
  SpeakerHigh,
  SpeakerSlash,
  Trophy,
  UserFocus,
  X,
} from '@phosphor-icons/react'
import { countJudged, createDemoPose, neutralPose, noneTracked, poseForDisplay, poseChallenges } from './game/poses'
import { averageRecentScores, calculateFitScore, roundPoints } from './game/scoring'
import type { CameraStatus, GameHud, GameMode, GamePhase, GameRecord, GameStats, LivePose, PoseChallenge } from './game/types'
import { renderGame, renderWallPreview } from './gameRenderer'

const emptyStats: GameStats = { round: 0, score: 0, lives: 3, combo: 0, lastFit: 0, passed: null }
const emptyHud: GameHud = { progress: 0, fit: 0, countdown: 3, cameraReady: false, distance: 12, judged: 0 }
const lostPose: LivePose = { ...neutralPose, confidence: 0.2, tracked: noneTracked }
const RECORD_KEY = 'perfect-poses-records-v1'
const WALLS_PER_RUN = 3
const WebcamPose = lazy(() => import('./WebcamPose').then((module) => ({ default: module.WebcamPose })))

function pickRunChallenges(): PoseChallenge[] {
  const pool = poseChallenges.map((challenge, index) => ({ challenge, index }))
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  // Keep the picked walls in pool order so a run reads the same way twice.
  return pool.slice(0, WALLS_PER_RUN).sort((a, b) => a.index - b.index).map((item) => item.challenge)
}

function PoseBlueprint({ challenge, fit }: { challenge: PoseChallenge; fit: number }) {
  const previewRef = useRef<HTMLCanvasElement>(null)
  const ready = fit >= challenge.threshold

  useEffect(() => {
    if (previewRef.current) renderWallPreview(previewRef.current, challenge, fit)
  }, [challenge, fit])

  return (
    <aside className={`wall-preview ${ready ? 'ready' : ''}`} aria-label={`현재 벽 포즈: ${challenge.label}`}>
      <div className="wall-preview-heading">
        <span>TARGET WALL</span>
        <i>{ready ? 'READY' : 'MATCH POSE'}</i>
      </div>
      <canvas ref={previewRef} role="img" aria-label={`${challenge.label} 실제 벽 미리보기`} />
      <div className="wall-preview-caption"><strong>{challenge.label}</strong><small>{ready ? '통과 준비 완료' : `통과 기준 ${challenge.threshold}%`}</small></div>
    </aside>
  )
}

function readRecords(): GameRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECORD_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(0, 5) : []
  } catch {
    return []
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = Boolean(useReducedMotion())
  const [phase, setPhase] = useState<GamePhase>('menu')
  const [mode, setMode] = useState<GameMode>('demo')
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [stats, setStats] = useState<GameStats>(emptyStats)
  const [hud, setHud] = useState<GameHud>(emptyHud)
  const [playerName, setPlayerName] = useState('PLAYER 01')
  const [records, setRecords] = useState<GameRecord[]>(readRecords)
  const [soundOn, setSoundOn] = useState(true)
  const [runChallenges, setRunChallenges] = useState<PoseChallenge[]>(pickRunChallenges)

  const phaseRef = useRef<GamePhase>('menu')
  const modeRef = useRef<GameMode>('demo')
  const cameraStatusRef = useRef<CameraStatus>('idle')
  const phaseStartRef = useRef(performance.now())
  const lastFrameRef = useRef(performance.now())
  const statsRef = useRef<GameStats>({ ...emptyStats })
  const livePoseRef = useRef<LivePose | null>(null)
  const calibrationSinceRef = useRef(0)
  const samplesRef = useRef<{ time: number; score: number }[]>([])
  const evaluatedRef = useRef(false)
  const savedRef = useRef(false)
  const playerNameRef = useRef(playerName)
  const audioRef = useRef<AudioContext | null>(null)
  const runChallengesRef = useRef(runChallenges)

  useEffect(() => { playerNameRef.current = playerName }, [playerName])

  const enterPhase = useCallback((next: GamePhase, now = performance.now()) => {
    phaseRef.current = next
    phaseStartRef.current = now
    setPhase(next)
  }, [])

  const tone = useCallback((frequency: number, duration = 0.08) => {
    if (!soundOn) return
    try {
      const audio = audioRef.current ?? new AudioContext()
      audioRef.current = audio
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.055, audio.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start(); oscillator.stop(audio.currentTime + duration)
    } catch { /* Audio is optional. */ }
  }, [soundOn])

  const startGame = useCallback((nextMode: GameMode) => {
    const nextStats = { ...emptyStats }
    const nextChallenges = pickRunChallenges()
    runChallengesRef.current = nextChallenges
    setRunChallenges(nextChallenges)
    modeRef.current = nextMode
    statsRef.current = nextStats
    setMode(nextMode)
    setStats(nextStats)
    setHud({ ...emptyHud })
    setCameraStatus('idle')
    cameraStatusRef.current = 'idle'
    setCameraEnabled(nextMode === 'camera')
    livePoseRef.current = null
    calibrationSinceRef.current = 0
    samplesRef.current = []
    evaluatedRef.current = false
    savedRef.current = false
    enterPhase(nextMode === 'camera' ? 'calibrating' : 'countdown')
    tone(520, 0.1)
  }, [enterPhase, tone])

  const exitToMenu = useCallback(() => {
    const nextStats = { ...emptyStats }
    setCameraEnabled(false)
    setMode('demo')
    modeRef.current = 'demo'
    livePoseRef.current = null
    statsRef.current = nextStats
    setStats(nextStats)
    enterPhase('menu')
    setHud({ ...emptyHud })
  }, [enterPhase])

  const handleCameraStatus = useCallback((next: CameraStatus) => {
    cameraStatusRef.current = next
    setCameraStatus(next)
  }, [])

  const handlePose = useCallback((pose: LivePose | null) => {
    livePoseRef.current = pose
  }, [])

  useEffect(() => {
    let frameId = 0
    let lastUiUpdate = 0
    const run = (now: number) => {
      const canvas = canvasRef.current
      const currentPhase = phaseRef.current
      const currentStats = statsRef.current
      const runWalls = runChallengesRef.current
      const challenge = runWalls[currentStats.round] ?? runWalls[0]
      const cameraReady = modeRef.current === 'demo' || (cameraStatusRef.current === 'ready' && livePoseRef.current !== null)
      const targetPose = currentPhase === 'menu' ? runWalls[0].pose : challenge.pose
      const currentPose = currentPhase === 'menu'
        ? createDemoPose(runWalls[0].pose, now)
        : modeRef.current === 'demo'
        ? createDemoPose(challenge.pose, now)
        : (livePoseRef.current ?? lostPose)
      // Score the joints the camera can see; draw the rest at the wall's own
      // angle so the avatar and the verdict never disagree.
      const fit = calculateFitScore(currentPose, targetPose)
      const shownPose = poseForDisplay(currentPose, targetPose)
      const judged = countJudged(currentPose)
      const elapsed = now - phaseStartRef.current
      const delta = Math.min(50, now - lastFrameRef.current)
      lastFrameRef.current = now
      let progress = 0
      let countdown = 3

      if (currentPhase === 'calibrating') {
        if (cameraReady) {
          if (!calibrationSinceRef.current) calibrationSinceRef.current = now
          if (now - calibrationSinceRef.current > 1100) {
            calibrationSinceRef.current = 0
            enterPhase('countdown', now)
            tone(620, 0.08)
          }
        } else {
          calibrationSinceRef.current = 0
        }
      } else if (currentPhase === 'countdown') {
        countdown = Math.max(1, 3 - Math.floor(elapsed / 1000))
        if (elapsed >= 3000) {
          samplesRef.current = []
          evaluatedRef.current = false
          enterPhase('approaching', now)
          tone(820, 0.11)
        }
      } else if (currentPhase === 'approaching') {
        if (!cameraReady) phaseStartRef.current += delta
        progress = Math.min(1, (now - phaseStartRef.current) / challenge.durationMs)
        if (cameraReady) samplesRef.current.push({ time: now, score: fit })
        if (samplesRef.current.length > 160) samplesRef.current.splice(0, samplesRef.current.length - 160)
        if (progress >= 1 && !evaluatedRef.current) {
          evaluatedRef.current = true
          const finalFit = averageRecentScores(samplesRef.current, now)
          const passed = finalFit >= challenge.threshold
          const nextCombo = passed ? currentStats.combo + 1 : 0
          const nextStats: GameStats = {
            ...currentStats,
            score: currentStats.score + (passed ? roundPoints(finalFit, nextCombo) : 0),
            lives: currentStats.lives - (passed ? 0 : 1),
            combo: nextCombo,
            lastFit: finalFit,
            passed,
          }
          statsRef.current = nextStats
          setStats(nextStats)
          enterPhase('impact', now)
          tone(passed ? 980 : 165, passed ? 0.16 : 0.3)
        }
      } else if (currentPhase === 'impact') {
        progress = currentStats.passed ? 1 + Math.min(1, elapsed / 1380) : 1
        if (elapsed >= 1400) enterPhase('result', now)
      } else if (currentPhase === 'result') {
        progress = currentStats.passed ? 2 : 1
        if (elapsed >= 1450) {
          const finished = currentStats.lives <= 0 || currentStats.round >= runWalls.length - 1
          if (finished) {
            enterPhase('game-over', now)
          } else {
            const nextStats = { ...currentStats, round: currentStats.round + 1, passed: null }
            statsRef.current = nextStats
            setStats(nextStats)
            samplesRef.current = []
            evaluatedRef.current = false
            enterPhase('countdown', now)
            tone(620, 0.08)
          }
        }
      } else if (currentPhase === 'game-over' && !savedRef.current) {
        savedRef.current = true
        const nextRecord: GameRecord = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: playerNameRef.current.trim().slice(0, 16) || 'PLAYER',
          score: currentStats.score,
          cleared: currentStats.round + (currentStats.passed ? 1 : 0),
          createdAt: Date.now(),
        }
        setRecords((previous) => {
          const next = [...previous, nextRecord].sort((a, b) => b.score - a.score).slice(0, 5)
          localStorage.setItem(RECORD_KEY, JSON.stringify(next))
          return next
        })
      }

      if (canvas) {
        renderGame(canvas, {
          phase: currentPhase,
          progress,
          pose: shownPose,
          challenge,
          fit,
          passed: currentStats.passed,
          reducedMotion,
        }, now)
      }
      if (now - lastUiUpdate > 72) {
        lastUiUpdate = now
        setHud({ progress, fit, countdown, cameraReady, distance: Math.max(0, 12 * (1 - progress)), judged })
      }
      frameId = requestAnimationFrame(run)
    }
    frameId = requestAnimationFrame(run)
    return () => cancelAnimationFrame(frameId)
  }, [enterPhase, reducedMotion, tone])

  const challenge = runChallenges[stats.round] ?? runChallenges[0]
  const playing = phase !== 'menu' && phase !== 'game-over'
  const poseLost = mode === 'camera' && phase === 'approaching' && !hud.cameraReady
  const remainingWalls = Math.max(0, runChallenges.length - stats.round - 1)

  return (
    <main className={`game-shell phase-${phase}`}>
      <header className="topbar">
        <button className="brand" type="button" onClick={exitToMenu} aria-label="메인 메뉴로 이동">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>PERFECT POSES</strong><small>MOTION WALL CHALLENGE</small></span>
        </button>
        <div className="topbar-actions">
          <span className={`system-state ${cameraStatus === 'error' ? 'error' : ''}`}><i />{mode === 'camera' && playing ? cameraStatus === 'ready' ? 'BODY LOCKED' : cameraStatus === 'error' ? 'CAMERA ERROR' : 'CAMERA WAIT' : 'SYSTEM READY'}</span>
          <button className="icon-button" type="button" onClick={() => setSoundOn((value) => !value)} aria-label={soundOn ? '소리 끄기' : '소리 켜기'}>
            {soundOn ? <SpeakerHigh weight="duotone" /> : <SpeakerSlash weight="duotone" />}
          </button>
          {playing && <button className="exit-button" type="button" onClick={exitToMenu}><X /> 나가기</button>}
        </div>
      </header>

      <section className="arena" aria-label="포즈 게임 플레이 영역">
        <canvas ref={canvasRef} aria-label="캐릭터와 다가오는 포즈 벽" />

        {phase !== 'menu' && phase !== 'game-over' && (
          <>
            <div className="stage-card">
              <span>WALL {String(stats.round + 1).padStart(2, '0')} / {String(runChallenges.length).padStart(2, '0')}</span>
              <strong>{challenge.label}</strong>
              <small>{challenge.cue}</small>
            </div>
            <div className="score-rack">
              <div><span>SCORE</span><strong>{stats.score.toLocaleString()}</strong></div>
              <div><span>COMBO</span><strong>×{stats.combo}</strong></div>
              <div className="lives" aria-label={`남은 기회 ${stats.lives}개`}>
                {Array.from({ length: 3 }, (_, index) => <Heart key={index} weight={index < stats.lives ? 'fill' : 'regular'} />)}
              </div>
            </div>
            <PoseBlueprint challenge={challenge} fit={hud.fit} />
            <div className="fit-meter">
              <div><span>POSE FIT</span><strong>{Math.round(hud.fit)}<em>%</em></strong></div>
              <div className="fit-track"><i style={{ width: `${Math.min(100, hud.fit)}%` }} /></div>
              <small>통과 기준 {challenge.threshold}%{mode === 'camera' && hud.judged > 0 && hud.judged < 8 ? ` · 보이는 관절 ${hud.judged}개로 판정` : ''}</small>
            </div>
            <div className="distance-meter">
              <span>DISTANCE</span><strong>{hud.distance.toFixed(1)}<em>m</em></strong>
              <div><i style={{ width: `${Math.max(2, (1 - hud.progress) * 100)}%` }} /></div>
            </div>
          </>
        )}

        {cameraEnabled && (
          <Suspense fallback={<div className="camera-preview loading" aria-live="polite"><div className="camera-preview-status"><Camera weight="duotone" /><span>카메라 엔진 불러오는 중</span></div></div>}>
            <WebcamPose enabled status={cameraStatus} onStatus={handleCameraStatus} onPose={handlePose} />
          </Suspense>
        )}

        <AnimatePresence mode="wait">
          {phase === 'menu' && (
            <motion.section className="menu-panel" key="menu" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }}>
              <div className="eyebrow"><span>LIVE</span> CAMERA POSE ARCADE</div>
              <h1>다가오는 벽에<br /><b>몸을 맞춰라</b></h1>
              <p>벽은 일정한 속도로 다가옵니다. 오른쪽 타깃을 보고 포즈를 완성한 뒤, 정확도 기준을 넘겨 구멍으로 통과하세요.</p>
              <label className="name-field">
                <span>PLAYER NAME</span>
                <input value={playerName} maxLength={16} onChange={(event) => setPlayerName(event.target.value)} />
              </label>
              <div className="menu-actions">
                <button className="primary-button" type="button" onClick={() => startGame('camera')}><Camera weight="fill" /><span>카메라로 플레이<small>전신 추적 모드</small></span><Play weight="fill" /></button>
                <button className="secondary-button" type="button" onClick={() => startGame('demo')}><UserFocus weight="duotone" /> 데모 보기</button>
              </div>
              <div className="menu-specs" aria-label="게임 정보">
                <span><b>{runChallenges.length}</b> WALLS</span>
                <span><b>3</b> LIVES</span>
                <span><i /> ON-DEVICE TRACKING</span>
              </div>
              <div className="menu-note"><i /> 카메라와 2m 이상 거리를 두고 머리부터 발끝까지 보이게 서세요. 영상은 저장되지 않습니다.</div>
            </motion.section>
          )}

          {phase === 'calibrating' && (
            <motion.section className="center-panel calibration-panel" key="calibration" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <div className="scan-icon"><UserFocus weight="duotone" /></div>
              <span className="eyebrow">CAMERA CALIBRATION</span>
              <h2>{cameraStatus === 'error' ? '카메라를 열 수 없습니다' : cameraStatus === 'ready' ? '좋아요, 그대로 서세요' : '전신을 찾고 있습니다'}</h2>
              <p>{cameraStatus === 'error' ? '브라우저의 카메라 권한을 확인하거나 데모 모드로 체험하세요.' : '머리부터 발끝까지 화면 안에 들어오면 자동으로 시작합니다.'}</p>
              <button className={`${cameraStatus === 'error' ? 'primary-button' : 'secondary-button'} compact`} type="button" onClick={() => startGame('demo')}><Play weight="fill" /> 데모로 전환</button>
            </motion.section>
          )}

          {phase === 'countdown' && (
            <motion.div className="countdown" key="countdown" initial={{ opacity: 0, scale: 1.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .7 }}>
              <span>NEXT WALL</span><strong>{hud.countdown}</strong><small>{challenge.label}</small>
            </motion.div>
          )}

          {poseLost && (
            <motion.div className="pose-lost" key="pose-lost" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <UserFocus /> <span>포즈를 다시 찾는 동안 벽이 멈췄습니다</span>
            </motion.div>
          )}

          {phase === 'result' && (
            <motion.div className={`result-flash ${stats.passed ? 'pass' : 'fail'}`} key="result" initial={{ opacity: 0, scale: .76 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              {stats.passed ? <Check weight="bold" /> : <X weight="bold" />}
              <span>{stats.passed ? 'PERFECT FIT' : 'WALL HIT'}</span>
              <strong>{stats.lastFit}%</strong>
            </motion.div>
          )}

          {phase === 'game-over' && (
            <motion.section className="gameover-panel" key="gameover" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}>
              <div className="trophy"><Trophy weight="duotone" /></div>
              <span className="eyebrow">RUN COMPLETE</span>
              <h2>{stats.lives > 0 ? '모든 벽을 돌파했습니다' : '다시 도전할 시간입니다'}</h2>
              <strong className="final-score">{stats.score.toLocaleString()}<small>PTS</small></strong>
              <div className="final-stats"><span><b>{stats.round + (stats.passed ? 1 : 0)}</b> / {runChallenges.length} 통과</span><span><b>{stats.combo}</b> 마지막 콤보</span></div>
              <div className="records">
                <div><Crown weight="fill" /> TOP RUNS</div>
                {records.length === 0 ? <p>첫 기록을 저장하고 있습니다</p> : records.slice(0, 3).map((record, index) => <p key={record.id}><i>{index + 1}</i><span>{record.name}</span><b>{record.score.toLocaleString()}</b></p>)}
              </div>
              <div className="gameover-actions">
                <button className="primary-button compact" type="button" onClick={() => startGame(mode)}><ArrowCounterClockwise /> 다시 도전</button>
                <button className="secondary-button" type="button" onClick={exitToMenu}>메인 메뉴</button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {playing && (
          <div className="round-progress" role="status" aria-label={`총 ${runChallenges.length}개 중 ${stats.round + 1}번째, ${remainingWalls === 0 ? '마지막 벽' : `남은 벽 ${remainingWalls}개`}`}>
            <div className="round-progress-copy">
              <span>ROUND <b>{stats.round + 1}</b> / {runChallenges.length}</span>
              <strong>{remainingWalls === 0 ? '마지막 벽' : `남은 벽 ${remainingWalls}개`}</strong>
            </div>
            <div className="round-progress-track" aria-hidden="true">
              {runChallenges.map((item, index) => <i key={item.id} className={index < stats.round || (index === stats.round && stats.passed) ? 'done' : index === stats.round ? 'active' : ''} />)}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
