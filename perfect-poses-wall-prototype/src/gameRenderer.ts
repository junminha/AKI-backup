import { buildSkeleton, type Point, type Skeleton } from './game/geometry'
import { linearApproachScale } from './game/projection'
import type { GamePhase, JointPose, PoseChallenge } from './game/types'

export type RenderFrame = {
  phase: GamePhase
  progress: number
  pose: JointPose
  challenge: PoseChallenge
  fit: number
  passed: boolean | null
  reducedMotion: boolean
}

const TAU = Math.PI * 2
const WALL_DESKTOP_WIDTH = 0.72
const WALL_DESKTOP_HEIGHT = 0.73
const WALL_PORTRAIT_WIDTH = 0.94
const WALL_PORTRAIT_HEIGHT = 0.78
const WALL_DESKTOP_ASPECT = (1920 * WALL_DESKTOP_WIDTH) / (1008 * WALL_DESKTOP_HEIGHT)

function getAvatarScale(width: number, height: number) {
  const available = Math.min(height * 0.64 / 370, width * 0.56 / 330)
  return Math.max(.68, Math.min(1.2, available))
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(rect.width * ratio))
  const height = Math.max(1, Math.round(rect.height * ratio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  return { ctx, width: rect.width, height: rect.height }
}

function line(ctx: CanvasRenderingContext2D, a: Point, b: Point, width: number, color: string | CanvasGradient | CanvasPattern) {
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  ctx.stroke()
}

function drawRoom(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, reduced: boolean) {
  const horizon = height * 0.57
  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, '#071018')
  bg.addColorStop(0.58, '#12212b')
  bg.addColorStop(1, '#061016')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.strokeStyle = 'rgba(79, 224, 195, .09)'
  ctx.lineWidth = 1
  for (let i = -9; i <= 9; i += 1) {
    ctx.beginPath()
    ctx.moveTo(width / 2, horizon)
    ctx.lineTo(width / 2 + i * width * 0.13, height)
    ctx.stroke()
  }
  for (let y = horizon + 24; y < height; y += Math.max(18, (y - horizon) * 0.22)) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  ctx.restore()

  const pulse = reduced ? 0.38 : 0.32 + Math.sin(time * 0.0014) * 0.06
  const glow = ctx.createRadialGradient(width / 2, height * 0.45, 0, width / 2, height * 0.45, width * 0.46)
  glow.addColorStop(0, `rgba(50, 213, 184, ${pulse * 0.16})`)
  glow.addColorStop(1, 'rgba(50, 213, 184, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = 'rgba(255,255,255,.035)'
  for (let x = 26; x < width; x += 64) ctx.fillRect(x, 0, 1, horizon)
}

function strokeSilhouette(
  ctx: CanvasRenderingContext2D,
  skeleton: Skeleton,
  widths: { limb: number; body: number; head: number },
  color: string,
) {
  const { limb, body, head } = widths
  line(ctx, skeleton.leftShoulder, skeleton.leftElbow, limb, color)
  line(ctx, skeleton.leftElbow, skeleton.leftHand, limb, color)
  line(ctx, skeleton.rightShoulder, skeleton.rightElbow, limb, color)
  line(ctx, skeleton.rightElbow, skeleton.rightHand, limb, color)
  line(ctx, skeleton.leftHip, skeleton.leftKnee, limb + 4, color)
  line(ctx, skeleton.leftKnee, skeleton.leftFoot, limb + 4, color)
  line(ctx, skeleton.rightHip, skeleton.rightKnee, limb + 4, color)
  line(ctx, skeleton.rightKnee, skeleton.rightFoot, limb + 4, color)
  line(ctx, skeleton.head, skeleton.neck, limb * 0.72, color)
  line(ctx, skeleton.neck, skeleton.root, body, color)
  ctx.beginPath()
  ctx.arc(skeleton.head.x, skeleton.head.y, head, 0, TAU)
  ctx.fillStyle = color
  ctx.fill()
  line(ctx, skeleton.leftFoot, { x: skeleton.leftFoot.x - 13, y: skeleton.leftFoot.y + 2 }, limb * 0.75, color)
  line(ctx, skeleton.rightFoot, { x: skeleton.rightFoot.x + 13, y: skeleton.rightFoot.y + 2 }, limb * 0.75, color)
}

let wallLayer: HTMLCanvasElement | null = null

function getWallLayer(width: number, height: number) {
  wallLayer ??= document.createElement('canvas')
  const pixelWidth = Math.max(1, Math.ceil(width))
  const pixelHeight = Math.max(1, Math.ceil(height))
  if (wallLayer.width !== pixelWidth || wallLayer.height !== pixelHeight) {
    wallLayer.width = pixelWidth
    wallLayer.height = pixelHeight
  }
  const layerContext = wallLayer.getContext('2d')!
  layerContext.setTransform(1, 0, 0, 1, 0, 0)
  layerContext.clearRect(0, 0, pixelWidth, pixelHeight)
  return { layer: wallLayer, layerContext }
}

function drawWallSurface(
  wall: CanvasRenderingContext2D,
  x: number,
  y: number,
  wallW: number,
  wallH: number,
  avatarScale: number,
  skeleton: Skeleton,
  ready: boolean,
  approach: number,
) {
  const slab = wall.createLinearGradient(x, y, x + wallW, y + wallH)
  slab.addColorStop(0, '#d7d5c9')
  slab.addColorStop(0.48, '#f0eee5')
  slab.addColorStop(1, '#b9bab3')
  wall.fillStyle = slab
  wall.fillRect(x, y, wallW, wallH)

  wall.save()
  wall.beginPath()
  wall.rect(x, y, wallW, wallH)
  wall.clip()
  wall.strokeStyle = 'rgba(21, 36, 43, .11)'
  wall.lineWidth = Math.max(1, avatarScale * 1.7)
  const panel = 90 * avatarScale
  for (let px = x; px <= x + wallW; px += panel) {
    wall.beginPath(); wall.moveTo(px, y); wall.lineTo(px, y + wallH); wall.stroke()
  }
  for (let py = y; py <= y + wallH; py += panel) {
    wall.beginPath(); wall.moveTo(x, py); wall.lineTo(x + wallW, py); wall.stroke()
  }
  wall.restore()

  wall.save()
  wall.scale(avatarScale, avatarScale)
  wall.shadowBlur = 16
  wall.shadowColor = 'rgba(0,0,0,.55)'
  strokeSilhouette(wall, skeleton, { limb: 58, body: 118, head: 50 }, '#77756f')
  wall.shadowBlur = 0
  strokeSilhouette(wall, skeleton, { limb: 51, body: 106, head: 45 }, ready ? '#40d9ba' : '#ff735f')
  wall.globalCompositeOperation = 'destination-out'
  strokeSilhouette(wall, skeleton, { limb: 43, body: 92, head: 38 }, '#000')
  wall.globalCompositeOperation = 'source-over'
  wall.restore()

  wall.strokeStyle = approach > 0.84 ? 'rgba(36,48,50,.82)' : 'rgba(74,87,91,.58)'
  wall.lineWidth = Math.max(2, 3 * avatarScale)
  wall.strokeRect(x, y, wallW, wallH)
  wall.fillStyle = ready ? '#40d9ba' : '#ff735f'
  wall.fillRect(x + 17 * avatarScale, y + 17 * avatarScale, 52 * avatarScale, 8 * avatarScale)
}

export function renderWallPreview(canvas: HTMLCanvasElement, challenge: PoseChallenge, fit: number) {
  const { ctx, width, height } = setupCanvas(canvas)
  const padding = 5
  const wallW = Math.min(width - padding * 2, (height - padding * 2) * WALL_DESKTOP_ASPECT)
  const wallH = wallW / WALL_DESKTOP_ASPECT
  const scaleFromGame = wallH / (1008 * WALL_DESKTOP_HEIGHT)
  const avatarScale = 1.2 * scaleFromGame
  const rootFromTop = wallH * 0.596

  ctx.save()
  ctx.translate(width / 2, (height - wallH) / 2 + rootFromTop)
  ctx.shadowBlur = 8
  ctx.shadowColor = 'rgba(0,0,0,.7)'
  drawWallSurface(
    ctx,
    -wallW / 2,
    -rootFromTop,
    wallW,
    wallH,
    avatarScale,
    buildSkeleton(challenge.pose),
    fit >= challenge.threshold,
    1,
  )
  ctx.restore()
}

function drawWall(ctx: CanvasRenderingContext2D, width: number, height: number, frame: RenderFrame) {
  const active = frame.phase === 'approaching' || frame.phase === 'impact' || frame.phase === 'result'
  const rawProgress = frame.phase === 'menu' ? 0.34 : active ? Math.max(0, frame.progress) : 0.04
  const approach = Math.min(1, rawProgress)
  const pass = frame.passed ? Math.min(1, Math.max(0, rawProgress - 1)) : 0
  const passEase = 1 - Math.pow(1 - pass, 3)
  const burst = 1 + passEase * 1.05
  const avatarScale = getAvatarScale(width, height)
  const perspective = linearApproachScale(approach)
  const worldScale = perspective * burst
  const portrait = width / height < 0.8
  const targetWidth = portrait ? WALL_PORTRAIT_WIDTH : WALL_DESKTOP_WIDTH
  const targetHeight = portrait ? WALL_PORTRAIT_HEIGHT : WALL_DESKTOP_HEIGHT
  // Keep a solid slab margin around even the widest pose cutout.
  const wallW = Math.max(width * targetWidth, 430 * avatarScale)
  const wallH = Math.max(height * targetHeight, 500 * avatarScale)
  const centerX = frame.phase === 'menu' ? width * 0.72 : width / 2
  const rootY = height * (0.49 + approach * 0.1)
  const x = -wallW / 2
  const y = -height * 0.07 - wallH / 2
  const shake = frame.phase === 'impact' && frame.passed === false && !frame.reducedMotion ? Math.sin(performance.now() * 0.08) * 5 : 0
  const opacity = pass < 0.9 ? 1 : Math.max(0, 1 - (pass - 0.9) / 0.1)
  const { layer, layerContext: wall } = getWallLayer(width, height)

  wall.save()
  wall.translate(centerX + shake, rootY)
  wall.scale(worldScale, worldScale)
  const skeleton = buildSkeleton(frame.challenge.pose)
  drawWallSurface(wall, x, y, wallW, wallH, avatarScale, skeleton, frame.fit >= frame.challenge.threshold, approach)
  wall.restore()

  ctx.save()
  ctx.globalAlpha = opacity
  ctx.shadowBlur = pass > 0 ? 70 * (1 - pass) : 35 + approach * 24
  ctx.shadowColor = 'rgba(0,0,0,.75)'
  ctx.drawImage(layer, 0, 0, width, height)
  ctx.restore()
}

function drawLimb(ctx: CanvasRenderingContext2D, a: Point, b: Point, width: number, dark = false) {
  line(ctx, a, b, width + 6, 'rgba(3, 9, 13, .72)')
  const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
  gradient.addColorStop(0, dark ? '#213947' : '#3de1bf')
  gradient.addColorStop(0.62, dark ? '#162a36' : '#24a98f')
  gradient.addColorStop(1, dark ? '#0c1c27' : '#147d70')
  line(ctx, a, b, width, gradient)
  line(ctx, a, b, Math.max(2, width * 0.16), 'rgba(255,255,255,.14)')
}

function drawHand(ctx: CanvasRenderingContext2D, point: Point, angle: number) {
  ctx.save()
  ctx.translate(point.x, point.y)
  ctx.rotate(-angle)
  ctx.fillStyle = '#d88768'
  ctx.strokeStyle = '#071018'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(-12, -15, 24, 29, 9)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#f2a17f'
  ctx.beginPath(); ctx.ellipse(-3, -3, 7, 10, -.4, 0, TAU); ctx.fill()
  ctx.restore()
}

function drawShoe(ctx: CanvasRenderingContext2D, foot: Point, side: -1 | 1) {
  ctx.save()
  ctx.translate(foot.x, foot.y)
  ctx.scale(side, 1)
  ctx.fillStyle = '#070e14'
  ctx.strokeStyle = '#3de1bf'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(-13, -8); ctx.lineTo(11, -10); ctx.quadraticCurveTo(31, -7, 31, 4)
  ctx.quadraticCurveTo(15, 12, -18, 8); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,.45)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(2, -5); ctx.lineTo(17, -2); ctx.stroke()
  ctx.restore()
}

function drawTorso(ctx: CanvasRenderingContext2D, s: Skeleton) {
  const left = s.leftShoulder, right = s.rightShoulder, lh = s.leftHip, rh = s.rightHip
  line(ctx, s.head, s.neck, 24, '#061017')
  line(ctx, s.head, s.neck, 16, '#d88768')
  ctx.strokeStyle = '#061017'
  ctx.lineWidth = 7
  const jacket = new Path2D()
  jacket.moveTo(left.x - 10, left.y - 5)
  jacket.quadraticCurveTo(s.neck.x, s.neck.y + 7, right.x + 10, right.y - 5)
  jacket.lineTo(rh.x + 14, rh.y + 8)
  jacket.quadraticCurveTo(s.root.x, s.root.y + 18, lh.x - 14, lh.y + 8)
  jacket.closePath()
  const grad = ctx.createLinearGradient(left.x, left.y, right.x, rh.y)
  grad.addColorStop(0, '#44e0be')
  grad.addColorStop(.52, '#249f8a')
  grad.addColorStop(1, '#126a63')
  ctx.fillStyle = grad; ctx.fill(jacket); ctx.stroke(jacket)
  ctx.fillStyle = '#f3ede1'
  ctx.beginPath(); ctx.moveTo(s.neck.x - 18, s.neck.y + 6); ctx.lineTo(s.neck.x, s.neck.y + 32); ctx.lineTo(s.neck.x + 18, s.neck.y + 6); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(3,15,20,.62)'; ctx.lineWidth = 3
  line(ctx, s.neck, { x: s.root.x, y: s.root.y + 8 }, 3, 'rgba(3,15,20,.62)')
  ctx.fillStyle = '#f3ede1'; ctx.fillRect(s.root.x - 2, s.root.y - 38, 4, 8)
  ctx.strokeStyle = 'rgba(2,14,19,.45)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(lh.x - 7, lh.y - 30); ctx.lineTo(lh.x + 9, lh.y - 36); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(rh.x + 7, rh.y - 30); ctx.lineTo(rh.x - 9, rh.y - 36); ctx.stroke()
}

function drawHead(ctx: CanvasRenderingContext2D, s: Skeleton, headTilt: number) {
  ctx.save()
  ctx.translate(s.head.x, s.head.y)
  ctx.rotate(headTilt)
  ctx.fillStyle = '#c9785e'; ctx.strokeStyle = '#061017'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.ellipse(-27, 1, 7, 11, 0, 0, TAU); ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(27, 1, 7, 11, 0, 0, TAU); ctx.fill(); ctx.stroke()
  const skin = ctx.createLinearGradient(-20, -20, 22, 24)
  skin.addColorStop(0, '#f4ae8e'); skin.addColorStop(1, '#c97559')
  ctx.fillStyle = skin
  ctx.beginPath(); ctx.ellipse(0, 0, 28, 34, 0, 0, TAU); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#101c28'
  ctx.beginPath()
  ctx.moveTo(-28, -5); ctx.quadraticCurveTo(-31, -34, -4, -40)
  ctx.quadraticCurveTo(25, -37, 30, -9); ctx.quadraticCurveTo(16, -15, 8, -28)
  ctx.quadraticCurveTo(0, -16, -28, -5); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.strokeStyle = '#10202a'; ctx.lineWidth = 3; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-17, -4); ctx.quadraticCurveTo(-11, -8, -5, -4); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(6, -4); ctx.quadraticCurveTo(12, -8, 18, -3); ctx.stroke()
  ctx.fillStyle = '#08131b'
  ctx.beginPath(); ctx.ellipse(-11, 2, 3.2, 4.5, 0, 0, TAU); ctx.fill()
  ctx.beginPath(); ctx.ellipse(12, 2, 3.2, 4.5, 0, 0, TAU); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(-10, .5, 1.1, 0, TAU); ctx.fill()
  ctx.beginPath(); ctx.arc(13, .5, 1.1, 0, TAU); ctx.fill()
  ctx.strokeStyle = 'rgba(120,55,44,.55)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(1, 4); ctx.lineTo(-1, 11); ctx.lineTo(3, 12); ctx.stroke()
  ctx.strokeStyle = '#7a3d3e'; ctx.lineWidth = 2.4
  ctx.beginPath(); ctx.arc(1, 15, 8, .12, Math.PI - .12); ctx.stroke()
  ctx.restore()
}

function drawAvatar(ctx: CanvasRenderingContext2D, width: number, height: number, frame: RenderFrame, time: number) {
  const scale = getAvatarScale(width, height)
  const bob = frame.reducedMotion ? 0 : Math.sin(time * 0.004) * 1.4
  const s = buildSkeleton(frame.pose)
  const glowColor = frame.passed === false ? 'rgba(255,115,95,.42)' : frame.fit >= frame.challenge.threshold ? 'rgba(61,225,191,.42)' : 'rgba(61,225,191,.16)'

  ctx.save()
  const rootY = height * 0.59
  ctx.translate(frame.phase === 'menu' ? width * 0.72 : width / 2, rootY + bob)
  ctx.scale(scale, scale)
  ctx.shadowBlur = 35; ctx.shadowColor = glowColor
  ctx.fillStyle = glowColor
  ctx.beginPath(); ctx.ellipse(0, 15, 112, 212, 0, 0, TAU); ctx.fill()
  ctx.shadowBlur = 0

  drawLimb(ctx, s.leftHip, s.leftKnee, 32, true)
  drawLimb(ctx, s.leftKnee, s.leftFoot, 28, true)
  drawLimb(ctx, s.rightHip, s.rightKnee, 32, true)
  drawLimb(ctx, s.rightKnee, s.rightFoot, 28, true)
  drawShoe(ctx, s.leftFoot, -1); drawShoe(ctx, s.rightFoot, 1)
  drawLimb(ctx, s.leftShoulder, s.leftElbow, 27)
  drawLimb(ctx, s.leftElbow, s.leftHand, 23)
  drawLimb(ctx, s.rightShoulder, s.rightElbow, 27)
  drawLimb(ctx, s.rightElbow, s.rightHand, 23)
  drawHand(ctx, s.leftHand, frame.pose.leftForearm)
  drawHand(ctx, s.rightHand, frame.pose.rightForearm)
  drawTorso(ctx, s)
  drawHead(ctx, s, frame.pose.headTilt)
  ctx.restore()
}

export function renderGame(canvas: HTMLCanvasElement, frame: RenderFrame, time: number) {
  const { ctx, width, height } = setupCanvas(canvas)
  drawRoom(ctx, width, height, time, frame.reducedMotion)
  const wallBehindAvatar = frame.phase === 'menu' || frame.phase === 'calibrating' || frame.phase === 'countdown' || frame.phase === 'approaching'
  if (wallBehindAvatar) {
    drawWall(ctx, width, height, frame)
    drawAvatar(ctx, width, height, frame, time)
  } else {
    drawAvatar(ctx, width, height, frame, time)
    drawWall(ctx, width, height, frame)
  }
  if (frame.phase === 'impact') {
    ctx.fillStyle = frame.passed ? 'rgba(61,225,191,.14)' : 'rgba(255,115,95,.22)'
    ctx.fillRect(0, 0, width, height)
  }
  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * .22, width / 2, height / 2, width * .72)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,.62)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, width, height)
}
