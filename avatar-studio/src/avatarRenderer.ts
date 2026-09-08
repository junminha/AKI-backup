import type { AvatarOptions, LivePose, RobotPose } from './types'

type Ctx = CanvasRenderingContext2D

const FLOOR_HORIZON_RATIO = 0.72
const GROUND_LINE_RATIO = 0.8

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
}

function drawBackground(ctx: Ctx, width: number, height: number, scene: AvatarOptions['scene'], t: number) {
  const gradients: Record<AvatarOptions['scene'], [string, string, string]> = {
    studio: ['#dce8e3', '#b7d4c8', '#f4d591'],
    sunset: ['#6670a4', '#ef8c72', '#f6d59a'],
    day: ['#7fc6df', '#cce7d4', '#f7e5a9'],
    cyber: ['#17243b', '#31526b', '#d26475'],
  }
  const [top, middle, bottom] = gradients[scene]
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, top)
  sky.addColorStop(0.62, middle)
  sky.addColorStop(1, bottom)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.globalAlpha = scene === 'cyber' ? 0.34 : 0.2
  ctx.fillStyle = scene === 'cyber' ? '#80e0ce' : '#fff9e8'
  const orbX = width * (scene === 'sunset' ? 0.74 : 0.2)
  const orbY = height * 0.23
  ctx.beginPath()
  ctx.arc(orbX, orbY, 65 + Math.sin(t * 0.0007) * 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = scene === 'cyber' ? 0.45 : 0.26
  ctx.fillStyle = scene === 'cyber' ? '#07111e' : '#5d796e'
  for (let i = 0; i < 7; i++) {
    const h = 42 + ((i * 31) % 120)
    ctx.fillRect(i * (width / 6) - 24, height - h - 40, width / 7 + 22, h)
  }
  ctx.restore()

  const floorHorizon = height * FLOOR_HORIZON_RATIO
  const floor = ctx.createLinearGradient(0, floorHorizon, 0, height)
  floor.addColorStop(0, scene === 'cyber' ? 'rgba(7,17,30,.5)' : 'rgba(75,95,86,.12)')
  floor.addColorStop(1, scene === 'cyber' ? '#0b1523' : 'rgba(240,242,224,.76)')
  ctx.fillStyle = floor
  ctx.fillRect(0, floorHorizon, width, height - floorHorizon)

  ctx.save()
  ctx.strokeStyle = scene === 'cyber' ? 'rgba(128,224,206,.16)' : 'rgba(45,69,60,.09)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, floorHorizon + .5)
  ctx.lineTo(width, floorHorizon + .5)
  ctx.stroke()
  if (scene !== 'cyber') {
    for (const ratio of [0.82, 0.91]) {
      ctx.globalAlpha = ratio === 0.82 ? .7 : .42
      ctx.beginPath()
      ctx.moveTo(0, height * ratio)
      ctx.lineTo(width, height * ratio)
      ctx.stroke()
    }
  }
  ctx.restore()

  if (scene === 'cyber') {
    ctx.save()
    ctx.strokeStyle = 'rgba(128,224,206,.2)'
    ctx.lineWidth = 1
    for (let x = -width; x < width * 2; x += 42) {
      ctx.beginPath()
      ctx.moveTo(width / 2, floorHorizon)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = height * 0.76; y < height; y += 26) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    ctx.restore()
  }
}

function drawRobot(ctx: Ctx, x: number, y: number, t: number, pose?: RobotPose | null) {
  const bob = 0
  const leftUpperArm = pose?.leftUpperArm ?? 0.25
  const leftForearm = pose?.leftForearm ?? 0.25
  const rightUpperArm = pose?.rightUpperArm ?? -0.25
  const rightForearm = pose?.rightForearm ?? -0.25
  const leftUpperLeg = pose?.leftUpperLeg ?? 0.04
  const leftLowerLeg = pose?.leftLowerLeg ?? 0.04
  const rightUpperLeg = pose?.rightUpperLeg ?? -0.04
  const rightLowerLeg = pose?.rightLowerLeg ?? -0.04
  const bodyLean = pose?.bodyLean ?? 0
  const robotGroundY = 104
  const rootY = groundedRootShift({
    legL: leftUpperLeg,
    lowerLegL: leftLowerLeg,
    legR: rightUpperLeg,
    lowerLegR: rightLowerLeg,
  }, 22, 23, bodyLean)
  ctx.save()
  ctx.translate(x, y + bob + rootY)

  ctx.save()
  ctx.globalAlpha = .15
  ctx.fillStyle = '#17352b'
  ctx.beginPath()
  ctx.ellipse(0, robotGroundY - rootY, 29, 6.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.rotate(bodyLean)

  const leftFoot = articulatedLimb(ctx, -13, 55, 22, 23, 8, leftUpperLeg - bodyLean, leftLowerLeg - bodyLean, '#9db5ac')
  const rightFoot = articulatedLimb(ctx, 13, 55, 22, 23, 8, rightUpperLeg - bodyLean, rightLowerLeg - bodyLean, '#9db5ac')
  ctx.fillStyle = '#273832'
  ctx.beginPath()
  ctx.ellipse(leftFoot.x, leftFoot.y + 2, 10, 4, 0, 0, Math.PI * 2)
  ctx.ellipse(rightFoot.x, rightFoot.y + 2, 10, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#273832'
  ctx.fillStyle = '#b7cbc3'
  ctx.lineWidth = 4
  roundedRect(ctx, -25, -7, 50, 64, 15)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#087f5b'
  ctx.beginPath()
  ctx.arc(0, 16, 8, 0, Math.PI * 2)
  ctx.fill()

  const leftHand = articulatedLimb(ctx, -25, 5, 27, 25, 7, leftUpperArm - bodyLean, leftForearm - bodyLean, '#a9c1b8')
  const rightHand = articulatedLimb(ctx, 25, 5, 27, 25, 7, rightUpperArm - bodyLean, rightForearm - bodyLean, '#a9c1b8')
  ctx.fillStyle = '#d7e3de'
  ctx.strokeStyle = '#273832'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(leftHand.x, leftHand.y, 6, 0, Math.PI * 2)
  ctx.arc(rightHand.x, rightHand.y, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#d7e3de'
  ctx.lineWidth = 4
  roundedRect(ctx, -31, -62, 62, 51, 15)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#087f5b'
  roundedRect(ctx, -20, -49, 40, 22, 8)
  ctx.fill()
  ctx.fillStyle = '#eaf5f1'
  ctx.beginPath()
  ctx.arc(-9, -38, 4, 0, Math.PI * 2)
  ctx.arc(9, -38, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#273832'
  ctx.beginPath()
  ctx.moveTo(0, -62)
  ctx.lineTo(0, -76)
  ctx.lineTo(10, -82)
  ctx.stroke()
  ctx.restore()
}

function motionPose(motion: AvatarOptions['motion'], t: number) {
  const beat = t * 0.004
  const base = {
    bob: 0,
    body: 0,
    head: 0,
    neck: 0,
    armL: -0.04,
    forearmL: -0.04,
    handL: Math.PI / 2 - 0.04,
    handSpreadL: 0.56,
    armFrontL: 0.08,
    armDepthL: 0,
    armR: 0.04,
    forearmR: 0.04,
    handR: Math.PI / 2 + 0.04,
    handSpreadR: 0.56,
    armFrontR: 0.08,
    armDepthR: 0,
    legL: -0.025,
    lowerLegL: -0.025,
    footL: Math.PI,
    legR: 0.025,
    lowerLegR: 0.025,
    footR: 0,
  }
  if (motion === 'wave') {
    return {
      ...base,
      armR: -2.25,
      forearmR: -2.8 + Math.sin(beat * 2) * 0.32,
      handR: -1.3 + Math.sin(beat * 2) * 0.35,
      handSpreadR: 0.9,
      armFrontR: 0.9,
      armDepthR: -0.1,
    }
  }
  if (motion === 'dance') {
    return {
      ...base,
      body: Math.sin(beat) * 0.11,
      head: -Math.sin(beat) * 0.08,
      armL: -0.72 + Math.sin(beat) * 0.52,
      forearmL: -0.25 + Math.sin(beat) * 0.45,
      handL: Math.PI / 2 + Math.sin(beat) * 0.45,
      armFrontL: 0.82,
      armDepthL: -0.07,
      armR: 0.72 + Math.sin(beat) * 0.52,
      forearmR: 0.25 + Math.sin(beat) * 0.45,
      handR: Math.PI / 2 + Math.sin(beat) * 0.45,
      armFrontR: 0.82,
      armDepthR: -0.06,
      legL: Math.sin(beat) * 0.18,
      lowerLegL: Math.sin(beat) * 0.11,
      legR: -Math.sin(beat) * 0.18,
      lowerLegR: -Math.sin(beat) * 0.11,
    }
  }
  if (motion === 'jump') {
    return {
      ...base,
      bob: -Math.abs(Math.sin(beat * 1.4)) * 34,
      armL: -1.05,
      forearmL: -1.35,
      handL: -0.25,
      armR: 1.05,
      forearmR: 1.35,
      handR: Math.PI + 0.25,
      legL: -0.14,
      lowerLegL: -0.36,
      legR: 0.14,
      lowerLegR: 0.36,
    }
  }
  if (motion === 'sit') {
    return {
      ...base,
      bob: 0,
      body: 0,
      head: 0,
      armL: -0.18,
      forearmL: -0.78,
      handL: 0.18,
      armFrontL: 0.86,
      armDepthL: -0.07,
      armR: 0.18,
      forearmR: 0.78,
      handR: Math.PI - 0.18,
      armFrontR: 0.86,
      armDepthR: -0.06,
      legL: 1.05,
      lowerLegL: -0.36,
      legR: -1.05,
      lowerLegR: 0.36,
    }
  }
  if (motion === 'run') {
    const stride = Math.sin(beat * 2.2)
    const leftLift = Math.max(0, -stride)
    const rightLift = Math.max(0, stride)
    return {
      ...base,
      bob: -Math.abs(Math.sin(beat * 2.2)) * 6,
      body: stride * .045,
      head: -stride * .035,
      armL: stride * .66,
      forearmL: stride * .42,
      handL: Math.PI / 2 + stride * .3,
      armFrontL: stride < 0 ? .88 : .18,
      armDepthL: stride < 0 ? -.1 : .06,
      armR: stride * .66,
      forearmR: stride * .42,
      handR: Math.PI / 2 + stride * .3,
      armFrontR: stride > 0 ? .88 : .18,
      armDepthR: stride > 0 ? -.1 : .06,
      legL: stride * .68,
      lowerLegL: -stride * .14 - leftLift * .82,
      legR: -stride * .68,
      lowerLegR: stride * .14 + rightLift * .82,
    }
  }
  if (motion === 'cross') {
    return {
      ...base,
      armL: -0.44,
      forearmL: -1.4,
      handL: 0.05,
      handSpreadL: 0.45,
      armFrontL: 1,
      armDepthL: -0.1,
      armR: 0.44,
      forearmR: 1.4,
      handR: Math.PI - 0.05,
      handSpreadR: 0.45,
      armFrontR: 1,
      armDepthR: -0.07,
    }
  }
  return base
}

function groundedRootShift(
  pose: { legL: number; lowerLegL: number; legR: number; lowerLegR: number },
  upperLeg: number,
  lowerLeg: number,
  angleCorrection: number,
) {
  const footEndY = (upperAngle: number, lowerAngle: number) => (
    Math.cos(upperAngle - angleCorrection) * upperLeg
    + Math.cos(lowerAngle - angleCorrection) * lowerLeg
  )
  const leftFootY = footEndY(pose.legL, pose.lowerLegL)
  const rightFootY = footEndY(pose.legR, pose.lowerLegR)
  const supportFootY = Math.max(leftFootY, rightFootY)
  return Math.min(105, Math.max(0, upperLeg + lowerLeg - supportFootY))
}

function limb(ctx: Ctx, x: number, y: number, length: number, width: number, angle: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, length)
  ctx.stroke()
  ctx.restore()
}

function articulatedLimb(
  ctx: Ctx,
  x: number,
  y: number,
  upperLength: number,
  lowerLength: number,
  width: number,
  upperAngle: number,
  lowerAngle: number,
  color: string,
  lowerWidth = width,
  outlineColor = 'rgba(25, 45, 38, .14)',
) {
  const elbowX = x - Math.sin(upperAngle) * upperLength
  const elbowY = y + Math.cos(upperAngle) * upperLength
  const endX = elbowX - Math.sin(lowerAngle) * lowerLength
  const endY = elbowY + Math.cos(lowerAngle) * lowerLength
  const normal = (fromX: number, fromY: number, toX: number, toY: number) => {
    const distance = Math.hypot(toX - fromX, toY - fromY) || 1
    return { x: -(toY - fromY) / distance, y: (toX - fromX) / distance }
  }
  const upperNormal = normal(x, y, elbowX, elbowY)
  const lowerNormal = normal(elbowX, elbowY, endX, endY)
  const normalSumLength = Math.hypot(upperNormal.x + lowerNormal.x, upperNormal.y + lowerNormal.y)
  const joinNormal = normalSumLength > .2
    ? { x: (upperNormal.x + lowerNormal.x) / normalSumLength, y: (upperNormal.y + lowerNormal.y) / normalSumLength }
    : upperNormal
  const joinHalfWidth = (width + lowerWidth) / 4
  const joinAlignment = Math.max(.55, Math.abs(joinNormal.x * upperNormal.x + joinNormal.y * upperNormal.y))
  const joinOffset = Math.min(joinHalfWidth / joinAlignment, joinHalfWidth * 1.45)
  const upperHalfWidth = width / 2
  const lowerHalfWidth = lowerWidth / 2

  ctx.beginPath()
  ctx.moveTo(x + upperNormal.x * upperHalfWidth, y + upperNormal.y * upperHalfWidth)
  ctx.lineTo(elbowX + joinNormal.x * joinOffset, elbowY + joinNormal.y * joinOffset)
  ctx.lineTo(endX + lowerNormal.x * lowerHalfWidth, endY + lowerNormal.y * lowerHalfWidth)
  ctx.lineTo(endX - lowerNormal.x * lowerHalfWidth, endY - lowerNormal.y * lowerHalfWidth)
  ctx.lineTo(elbowX - joinNormal.x * joinOffset, elbowY - joinNormal.y * joinOffset)
  ctx.lineTo(x - upperNormal.x * upperHalfWidth, y - upperNormal.y * upperHalfWidth)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  if (outlineColor !== 'transparent') {
    ctx.strokeStyle = outlineColor
    ctx.lineWidth = 1.25
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
  return { jointX: elbowX, jointY: elbowY, x: endX, y: endY }
}

function drawHair(ctx: Ctx, style: AvatarOptions['hairStyle'], color: string) {
  if (style === 'none') return
  ctx.save()
  ctx.fillStyle = color
  if (style === 'crop') {
    ctx.beginPath()
    ctx.moveTo(-27, -3)
    ctx.bezierCurveTo(-28, -22, -17, -35, 0, -36)
    ctx.bezierCurveTo(18, -36, 28, -22, 27, -3)
    ctx.quadraticCurveTo(18, -11, 9, -8)
    ctx.quadraticCurveTo(1, -14, -7, -9)
    ctx.quadraticCurveTo(-17, -13, -27, -3)
    ctx.closePath()
    ctx.fill()
  } else if (style === 'wave') {
    ctx.beginPath()
    ctx.moveTo(-28, -2)
    ctx.bezierCurveTo(-29, -23, -17, -37, 0, -38)
    ctx.bezierCurveTo(19, -38, 30, -23, 28, -2)
    ctx.bezierCurveTo(23, -8, 18, -4, 14, -10)
    ctx.bezierCurveTo(10, -14, 5, -7, 0, -12)
    ctx.bezierCurveTo(-5, -16, -10, -8, -15, -11)
    ctx.bezierCurveTo(-21, -14, -24, -6, -28, -2)
    ctx.closePath()
    ctx.fill()
  } else if (style === 'bob') {
    ctx.beginPath()
    ctx.moveTo(-29, 2)
    ctx.bezierCurveTo(-30, -22, -18, -37, 0, -38)
    ctx.bezierCurveTo(19, -38, 31, -22, 29, 2)
    ctx.quadraticCurveTo(18, -9, 3, -11)
    ctx.quadraticCurveTo(-10, -14, -29, 2)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-29, -5)
    ctx.quadraticCurveTo(-32, 15, -27, 30)
    ctx.quadraticCurveTo(-23, 36, -18, 30)
    ctx.quadraticCurveTo(-19, 11, -17, 1)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(29, -5)
    ctx.quadraticCurveTo(32, 15, 27, 30)
    ctx.quadraticCurveTo(23, 36, 18, 30)
    ctx.quadraticCurveTo(19, 11, 17, 1)
    ctx.closePath()
    ctx.fill()
  } else if (style === 'spike') {
    ctx.beginPath()
    ctx.moveTo(-28, -2)
    ctx.quadraticCurveTo(-29, -15, -25, -27)
    ctx.lineTo(-18, -22)
    ctx.lineTo(-14, -36)
    ctx.lineTo(-6, -27)
    ctx.lineTo(1, -40)
    ctx.lineTo(8, -27)
    ctx.lineTo(18, -35)
    ctx.lineTo(19, -22)
    ctx.lineTo(27, -27)
    ctx.quadraticCurveTo(30, -14, 28, -2)
    ctx.quadraticCurveTo(17, -11, 7, -8)
    ctx.quadraticCurveTo(-4, -14, -12, -9)
    ctx.quadraticCurveTo(-20, -12, -28, -2)
    ctx.closePath()
    ctx.fill()
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, .13)'
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-18, -28)
  ctx.bezierCurveTo(-10, -34, -1, -35, 7, -32)
  ctx.stroke()
  ctx.restore()
}

function drawHand(ctx: Ctx, x: number, y: number, angle: number, color: string, spread: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(25, 45, 38, .14)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.ellipse(0, 0, 8 + spread * 2.4, 6.3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(-1.5, 5.5, 3.6, 5, 0.55, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawArticulatedArm(
  ctx: Ctx,
  shoulderX: number,
  shoulderY: number,
  upperAngle: number,
  lowerAngle: number,
  handAngle: number,
  handSpread: number,
  angleCorrection: number,
  skin: string,
  upperLength: number,
  lowerLength: number,
  upperWidth: number,
  lowerWidth: number,
  mechanical = false,
  accent = 'rgba(25, 45, 38, .14)',
  sleeveStyle: AvatarOptions['sleeveStyle'] = 'none',
  shirt = skin,
  clothingAccent = shirt,
) {
  const correctedUpperAngle = upperAngle - angleCorrection
  const shoulderInset = 6
  const armStartX = shoulderX - Math.sin(correctedUpperAngle) * shoulderInset
  const armStartY = shoulderY + Math.cos(correctedUpperAngle) * shoulderInset
  const hand = articulatedLimb(
    ctx,
    armStartX,
    armStartY,
    upperLength,
    lowerLength,
    upperWidth,
    correctedUpperAngle,
    lowerAngle - angleCorrection,
    skin,
    lowerWidth,
    accent,
  )
  if (sleeveStyle === 'short') {
    limb(ctx, armStartX, armStartY, upperLength * .36, upperWidth + 3, correctedUpperAngle, shirt)
    ctx.save()
    ctx.translate(armStartX, armStartY)
    ctx.rotate(correctedUpperAngle)
    ctx.globalAlpha = .58
    ctx.strokeStyle = clothingAccent
    ctx.lineWidth = 2
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(-(upperWidth + 3) * .48, upperLength * .34)
    ctx.lineTo((upperWidth + 3) * .48, upperLength * .34)
    ctx.stroke()
    ctx.restore()
  } else if (sleeveStyle === 'long') {
    limb(ctx, armStartX, armStartY, upperLength, upperWidth + 2, correctedUpperAngle, shirt)
    limb(ctx, hand.jointX, hand.jointY, Math.max(8, lowerLength - 8), lowerWidth + 2, lowerAngle - angleCorrection, shirt)
    ctx.save()
    ctx.translate(armStartX, armStartY)
    ctx.rotate(correctedUpperAngle)
    ctx.globalAlpha = .24
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo((upperWidth + 2) * .25, 8)
    ctx.lineTo((upperWidth + 2) * .25, upperLength - 6)
    ctx.stroke()
    ctx.restore()
    ctx.save()
    ctx.translate(hand.jointX, hand.jointY)
    ctx.rotate(lowerAngle - angleCorrection)
    ctx.globalAlpha = .62
    ctx.strokeStyle = clothingAccent
    ctx.lineWidth = 2.2
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(-(lowerWidth + 2) * .48, Math.max(7, lowerLength - 10))
    ctx.lineTo((lowerWidth + 2) * .48, Math.max(7, lowerLength - 10))
    ctx.stroke()
    ctx.restore()
  }
  if (mechanical) {
    ctx.save()
    ctx.translate(hand.x, hand.y)
    ctx.rotate(handAngle - angleCorrection)
    ctx.fillStyle = skin
    ctx.strokeStyle = clothingAccent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-5, 5)
    ctx.lineTo(-8, 10)
    ctx.moveTo(5, 5)
    ctx.lineTo(8, 10)
    ctx.stroke()
    ctx.restore()
  } else {
    drawHand(ctx, hand.x, hand.y, handAngle - angleCorrection, skin, handSpread)
  }
  return hand
}

function drawArm(
  ctx: Ctx,
  shoulderX: number,
  upperAngle: number,
  lowerAngle: number,
  handAngle: number,
  handSpread: number,
  angleCorrection: number,
  skin: string,
) {
  drawArticulatedArm(ctx, shoulderX, -103, upperAngle, lowerAngle, handAngle, handSpread, angleCorrection, skin, 50, 53, 14, 12)
}

function drawFoot(ctx: Ctx, x: number, y: number, angle: number, color = '#2d3935', mechanical = false, style: AvatarOptions['shoeStyle'] = 'sneakers') {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(238, 248, 244, .24)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  if (style === 'boots') roundedRect(ctx, -7, -14, 31, 23, mechanical ? 5 : 8)
  else if (style === 'flats') ctx.ellipse(7, 1, 19, 6.5, 0, 0, Math.PI * 2)
  else if (mechanical) roundedRect(ctx, -9, -7, 31, 14, 6)
  else ctx.ellipse(8, 0, 21, 8.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  if (style === 'sneakers') {
    ctx.strokeStyle = 'rgba(255,255,255,.5)'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(-5, 4)
    ctx.lineTo(24, 4)
    ctx.moveTo(1, -4)
    ctx.lineTo(8, 1)
    ctx.moveTo(6, -5)
    ctx.lineTo(13, 0)
    ctx.moveTo(11, -5)
    ctx.lineTo(18, -1)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(17,35,30,.25)'
    ctx.beginPath()
    ctx.arc(18, 0, 7, -1.5, 1.25)
    ctx.stroke()
  } else if (style === 'boots') {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'
    ctx.beginPath()
    ctx.moveTo(-5, -9)
    ctx.lineTo(7, -9)
    ctx.moveTo(-5, 4)
    ctx.lineTo(23, 4)
    ctx.moveTo(5, -8)
    ctx.lineTo(5, 1)
    ctx.stroke()
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,.38)'
    ctx.beginPath()
    ctx.ellipse(3, -1, 8, 3.2, -.08, Math.PI, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

interface AvatarGeometry {
  shoulderX: number
  shoulderY: number
  torsoShoulder: number
  waist: number
  hip: number
  headRx: number
  headRy: number
  headY: number
  neckTop: number
  hipX: number
  upperLeg: number
  lowerLeg: number
  thighWidth: number
  calfWidth: number
  upperArm: number
  lowerArm: number
  upperArmWidth: number
  forearmWidth: number
}

const avatarGeometry: Record<AvatarOptions['concept'], AvatarGeometry> = {
  classic: { shoulderX: 45, shoulderY: -103, torsoShoulder: 49, waist: 35, hip: 38, headRx: 28, headRy: 34, headY: -152, neckTop: -121, hipX: 21, upperLeg: 69, lowerLeg: 67, thighWidth: 20, calfWidth: 16, upperArm: 50, lowerArm: 53, upperArmWidth: 14, forearmWidth: 12 },
  woman: { shoulderX: 42, shoulderY: -105, torsoShoulder: 44, waist: 27, hip: 42, headRx: 29, headRy: 35, headY: -156, neckTop: -124, hipX: 22, upperLeg: 76, lowerLeg: 70, thighWidth: 18, calfWidth: 14, upperArm: 57, lowerArm: 58, upperArmWidth: 13, forearmWidth: 10 },
  robot: { shoulderX: 46, shoulderY: -96, torsoShoulder: 48, waist: 38, hip: 40, headRx: 31, headRy: 30, headY: -146, neckTop: -117, hipX: 22, upperLeg: 64, lowerLeg: 62, thighWidth: 18, calfWidth: 14, upperArm: 48, lowerArm: 50, upperArmWidth: 13, forearmWidth: 11 },
  athlete: { shoulderX: 52, shoulderY: -108, torsoShoulder: 56, waist: 36, hip: 40, headRx: 27, headRy: 32, headY: -155, neckTop: -125, hipX: 23, upperLeg: 72, lowerLeg: 68, thighWidth: 23, calfWidth: 17, upperArm: 54, lowerArm: 54, upperArmWidth: 17, forearmWidth: 13 },
  explorer: { shoulderX: 48, shoulderY: -88, torsoShoulder: 54, waist: 44, hip: 48, headRx: 30, headRy: 33, headY: -137, neckTop: -109, hipX: 24, upperLeg: 55, lowerLeg: 52, thighWidth: 23, calfWidth: 18, upperArm: 43, lowerArm: 45, upperArmWidth: 17, forearmWidth: 14 },
  alien: { shoulderX: 34, shoulderY: -88, torsoShoulder: 36, waist: 25, hip: 30, headRx: 34, headRy: 42, headY: -144, neckTop: -105, hipX: 15, upperLeg: 82, lowerLeg: 78, thighWidth: 12, calfWidth: 9, upperArm: 63, lowerArm: 67, upperArmWidth: 9, forearmWidth: 7 },
}

function drawBottomGarment(ctx: Ctx, options: AvatarOptions, geometry: AvatarGeometry) {
  ctx.save()
  ctx.fillStyle = options.trousers
  if (options.bottomStyle === 'skirt') {
    ctx.beginPath()
    ctx.moveTo(-geometry.hip + 4, -16)
    ctx.lineTo(-geometry.hip - 7, 28)
    ctx.quadraticCurveTo(0, 36, geometry.hip + 7, 28)
    ctx.lineTo(geometry.hip - 4, -16)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,.38)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(-geometry.hip + 8, -11)
    ctx.quadraticCurveTo(0, -7, geometry.hip - 8, -11)
    ctx.moveTo(-geometry.hip + 3, 25)
    ctx.quadraticCurveTo(0, 32, geometry.hip - 3, 25)
    ctx.moveTo(-geometry.hip * .42, -6)
    ctx.lineTo(-geometry.hip * .25, 27)
    ctx.moveTo(geometry.hip * .42, -6)
    ctx.lineTo(geometry.hip * .25, 27)
    ctx.stroke()
  } else {
    roundedRect(ctx, -geometry.hip, -11, geometry.hip * 2, options.bottomStyle === 'shorts' ? 25 : 19, 8)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,.34)'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(-geometry.hip + 5, -7)
    ctx.lineTo(geometry.hip - 5, -7)
    ctx.moveTo(0, -6)
    ctx.lineTo(0, options.bottomStyle === 'shorts' ? 11 : 6)
    ctx.moveTo(-geometry.hip + 8, -2)
    ctx.quadraticCurveTo(-geometry.hip * .35, 6, -7, 4)
    ctx.moveTo(geometry.hip - 8, -2)
    ctx.quadraticCurveTo(geometry.hip * .35, 6, 7, 4)
    if (options.bottomStyle === 'shorts') {
      ctx.moveTo(-geometry.hip + 3, 10)
      ctx.lineTo(-4, 10)
      ctx.moveTo(geometry.hip - 3, 10)
      ctx.lineTo(4, 10)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function drawTorso(ctx: Ctx, options: AvatarOptions, geometry: AvatarGeometry) {
  const top = geometry.shoulderY
  drawBottomGarment(ctx, options, geometry)
  if (options.concept === 'robot') {
    ctx.fillStyle = options.shirt
    ctx.strokeStyle = options.hair
    ctx.lineWidth = 4
    roundedRect(ctx, -geometry.torsoShoulder, top, geometry.torsoShoulder * 2, -top, 17)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = options.skin
    roundedRect(ctx, -29, top + 17, 58, Math.max(40, -top - 45), 12)
    ctx.fill()
    ctx.fillStyle = options.accent
    ctx.beginPath()
    ctx.arc(0, top * .54, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = options.accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-17, -22)
    ctx.lineTo(17, -22)
    ctx.moveTo(-22, top + 26)
    ctx.lineTo(-22, -35)
    ctx.moveTo(22, top + 26)
    ctx.lineTo(22, -35)
    ctx.stroke()
    ctx.save()
    ctx.globalAlpha = .48
    ctx.strokeStyle = options.hair
    ctx.lineWidth = 1.4
    for (let y = top + 27; y < top + 55; y += 8) {
      ctx.beginPath()
      ctx.moveTo(-40, y)
      ctx.lineTo(-32, y)
      ctx.moveTo(32, y)
      ctx.lineTo(40, y)
      ctx.stroke()
    }
    ctx.restore()
    if (options.outfitStyle === 'tee') {
      ctx.save()
      ctx.globalAlpha = .55
      ctx.strokeStyle = options.accent
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-25, top + 12)
      ctx.lineTo(25, top + 12)
      ctx.stroke()
      ctx.restore()
    } else if (options.outfitStyle === 'jacket') {
      ctx.save()
      ctx.globalAlpha = .7
      ctx.fillStyle = options.accent
      ctx.beginPath()
      ctx.moveTo(-geometry.torsoShoulder + 6, top + 8)
      ctx.lineTo(-6, top + 34)
      ctx.lineTo(-18, top + 44)
      ctx.lineTo(-34, top + 17)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(geometry.torsoShoulder - 6, top + 8)
      ctx.lineTo(6, top + 34)
      ctx.lineTo(18, top + 44)
      ctx.lineTo(34, top + 17)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      ctx.strokeStyle = options.hair
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, top + 18)
      ctx.lineTo(0, -8)
      ctx.stroke()
    } else if (options.outfitStyle === 'overalls') {
      ctx.strokeStyle = options.hair
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(-30, top + 11)
      ctx.lineTo(-15, -48)
      ctx.moveTo(30, top + 11)
      ctx.lineTo(15, -48)
      ctx.stroke()
      ctx.fillStyle = options.hair
      roundedRect(ctx, -23, -53, 46, 31, 6)
      ctx.fill()
      ctx.strokeStyle = options.accent
      ctx.lineWidth = 1.5
      roundedRect(ctx, -14, -43, 28, 12, 3)
      ctx.stroke()
    } else {
      ctx.save()
      ctx.globalAlpha = .84
      ctx.fillStyle = options.accent
      ctx.beginPath()
      ctx.moveTo(-24, top + 23)
      ctx.lineTo(24, top + 23)
      ctx.lineTo(31, -2)
      ctx.lineTo(0, 12)
      ctx.lineTo(-31, -2)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = options.hair
      roundedRect(ctx, -30, -25, 60, 7, 3)
      ctx.fill()
    }
  } else {
    ctx.fillStyle = options.shirt
    ctx.beginPath()
    ctx.moveTo(-geometry.torsoShoulder, top)
    ctx.quadraticCurveTo(-geometry.torsoShoulder - 2, top + 15, -geometry.torsoShoulder + 5, top + 31)
    ctx.quadraticCurveTo(-geometry.waist - 4, top * .42, -geometry.hip, -6)
    ctx.quadraticCurveTo(0, 5, geometry.hip, -6)
    ctx.quadraticCurveTo(geometry.waist + 4, top * .42, geometry.torsoShoulder - 5, top + 31)
    ctx.quadraticCurveTo(geometry.torsoShoulder + 2, top + 15, geometry.torsoShoulder, top)
    ctx.quadraticCurveTo(0, top - 11, -geometry.torsoShoulder, top)
    ctx.closePath()
    ctx.fill()

    ctx.save()
    ctx.globalAlpha = .18
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(-geometry.torsoShoulder + 4, top + 4)
    ctx.quadraticCurveTo(-geometry.waist + 6, top + 40, -geometry.hip + 7, -8)
    ctx.lineTo(-geometry.hip + 16, -7)
    ctx.quadraticCurveTo(-geometry.waist + 18, top + 40, -geometry.torsoShoulder + 17, top + 9)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    ctx.strokeStyle = 'rgba(255,255,255,.34)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(-geometry.hip + 6, -10)
    ctx.quadraticCurveTo(0, -6, geometry.hip - 6, -10)
    ctx.stroke()

    if (options.outfitStyle === 'tee') {
      ctx.strokeStyle = options.accent
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.arc(0, top + 1, 14, .12, Math.PI - .12)
      ctx.stroke()
      ctx.save()
      ctx.globalAlpha = .42
      ctx.fillStyle = options.accent
      roundedRect(ctx, geometry.waist * .18, top + 35, Math.min(18, geometry.waist * .5), 16, 4)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(geometry.waist * .22, top + 40)
      ctx.lineTo(geometry.waist * .62, top + 40)
      ctx.stroke()
      ctx.restore()
    } else if (options.outfitStyle === 'jacket') {
      ctx.save()
      ctx.globalAlpha = .72
      ctx.fillStyle = options.accent
      ctx.beginPath()
      ctx.moveTo(-geometry.torsoShoulder + 10, top + 7)
      ctx.lineTo(-5, top + 35)
      ctx.lineTo(-18, top + 45)
      ctx.lineTo(-31, top + 15)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(geometry.torsoShoulder - 10, top + 7)
      ctx.lineTo(5, top + 35)
      ctx.lineTo(18, top + 45)
      ctx.lineTo(31, top + 15)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      ctx.strokeStyle = options.accent
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.moveTo(0, top + 9)
      ctx.lineTo(0, -10)
      ctx.moveTo(-geometry.waist + 5, -33)
      ctx.lineTo(-10, -29)
      ctx.moveTo(geometry.waist - 5, -33)
      ctx.lineTo(10, -29)
      ctx.stroke()
      ctx.fillStyle = options.accent
      for (let y = top + 47; y < -14; y += 12) {
        roundedRect(ctx, -1.5, y, 3, 4, 1)
        ctx.fill()
      }
    } else if (options.outfitStyle === 'overalls') {
      ctx.strokeStyle = options.trousers
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(-geometry.torsoShoulder + 11, top + 6)
      ctx.lineTo(-18, -53)
      ctx.moveTo(geometry.torsoShoulder - 11, top + 6)
      ctx.lineTo(18, -53)
      ctx.stroke()
      ctx.fillStyle = options.trousers
      roundedRect(ctx, -23, -58, 46, 43, 7)
      ctx.fill()
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,.42)'
      ctx.lineWidth = 1.2
      ctx.setLineDash([3, 3])
      roundedRect(ctx, -19, -54, 38, 35, 5)
      ctx.stroke()
      ctx.setLineDash([])
      roundedRect(ctx, -12, -45, 24, 14, 4)
      ctx.stroke()
      ctx.restore()
      ctx.fillStyle = options.accent
      ctx.beginPath()
      ctx.arc(-15, -50, 3, 0, Math.PI * 2)
      ctx.arc(15, -50, 3, 0, Math.PI * 2)
      ctx.fill()
    } else if (options.outfitStyle === 'tunic') {
      ctx.fillStyle = options.trousers
      roundedRect(ctx, -geometry.waist, -29, geometry.waist * 2, 8, 4)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-9, top + 3)
      ctx.lineTo(0, top + 16)
      ctx.lineTo(9, top + 3)
      ctx.stroke()
    }

    if (options.concept === 'athlete' && options.outfitStyle === 'tee') {
      ctx.strokeStyle = 'rgba(255,255,255,.52)'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(-geometry.torsoShoulder + 9, top + 13)
      ctx.lineTo(-geometry.waist + 4, -14)
      ctx.moveTo(geometry.torsoShoulder - 9, top + 13)
      ctx.lineTo(geometry.waist - 4, -14)
      ctx.stroke()
    } else if (options.concept === 'explorer') {
      ctx.strokeStyle = options.trousers
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(-25, top + 6)
      ctx.lineTo(26, -15)
      ctx.stroke()
      ctx.fillStyle = options.trousers
      roundedRect(ctx, 12, top * .48, 21, 19, 5)
      ctx.fill()
    } else if (options.concept === 'alien') {
      ctx.fillStyle = options.accent
      roundedRect(ctx, -10, top * .52 - 8, 20, 16, 6)
      ctx.fill()
      ctx.fillStyle = options.hair
      roundedRect(ctx, -4, top * .52 - 3, 8, 6, 2)
      ctx.fill()
    }
  }

}

function drawRobotHead(ctx: Ctx, options: AvatarOptions, liveFace?: HTMLCanvasElement | null) {
  const halfWidth = options.faceShape === 'round' ? 30 : options.faceShape === 'angular' ? 33 : 29
  const halfHeight = options.faceShape === 'round' ? 29 : options.faceShape === 'oval' ? 33 : 29
  ctx.fillStyle = options.skin
  ctx.strokeStyle = options.hair
  ctx.lineWidth = 4
  roundedRect(ctx, -halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2, options.faceShape === 'angular' ? 8 : 14)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = options.hair
  roundedRect(ctx, -22, -17, 44, 27, options.faceShape === 'angular' ? 4 : 8)
  ctx.fill()
  if (liveFace) {
    ctx.save()
    roundedRect(ctx, -22, -17, 44, 27, options.faceShape === 'angular' ? 4 : 8)
    ctx.clip()
    ctx.drawImage(liveFace, 0, 38, liveFace.width, 110, -22, -17, 44, 27)
    ctx.fillStyle = 'rgba(34, 77, 67, .12)'
    ctx.fillRect(-22, -17, 44, 27)
    ctx.restore()
  } else {
    ctx.fillStyle = options.accent
    ctx.strokeStyle = options.accent
    ctx.lineWidth = 2
    ctx.beginPath()
    if (options.eyeStyle === 'happy') {
      ctx.arc(-9, -2, 5, Math.PI * 1.08, Math.PI * 1.92)
      ctx.moveTo(14, -2)
      ctx.arc(9, -2, 5, Math.PI * 1.08, Math.PI * 1.92)
      ctx.stroke()
    } else if (options.eyeStyle === 'sparkle') {
      ctx.moveTo(-9, -10)
      ctx.lineTo(-5, -4)
      ctx.lineTo(-9, 2)
      ctx.lineTo(-13, -4)
      ctx.closePath()
      ctx.arc(9, -4, 4, 0, Math.PI * 2)
      ctx.fill()
    } else if (options.eyeStyle === 'focused') {
      roundedRect(ctx, -15, -7, 11, 6, 3)
      ctx.fill()
      roundedRect(ctx, 4, -7, 11, 6, 3)
      ctx.fill()
    } else {
      ctx.arc(-9, -4, 4, 0, Math.PI * 2)
      ctx.arc(9, -4, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    if (options.mouthStyle === 'smile') ctx.arc(0, 12, 7, .15, Math.PI - .15)
    else if (options.mouthStyle === 'open') ctx.ellipse(0, 13, 5, 7, 0, 0, Math.PI * 2)
    else {
      ctx.moveTo(-7, 14)
      ctx.lineTo(7, 14)
    }
    if (options.mouthStyle === 'open') ctx.fill()
    else ctx.stroke()
  }

  ctx.fillStyle = options.hair
  if (options.hairStyle === 'crop') {
    roundedRect(ctx, -20, -35, 40, 8, 4)
    ctx.fill()
  } else if (options.hairStyle === 'wave') {
    for (let x = -16; x <= 16; x += 8) {
      ctx.beginPath()
      ctx.arc(x, -30, 6, Math.PI, Math.PI * 2)
      ctx.fill()
    }
  } else if (options.hairStyle === 'bob') {
    roundedRect(ctx, -37, -18, 8, 32, 4)
    ctx.fill()
    roundedRect(ctx, 29, -18, 8, 32, 4)
    ctx.fill()
  } else if (options.hairStyle === 'spike') {
    ctx.beginPath()
    ctx.moveTo(-20, -28)
    ctx.lineTo(-14, -40)
    ctx.lineTo(-5, -31)
    ctx.lineTo(2, -44)
    ctx.lineTo(9, -31)
    ctx.lineTo(18, -40)
    ctx.lineTo(21, -28)
    ctx.closePath()
    ctx.fill()
  }

  if (options.accessory === 'headphones') {
    ctx.strokeStyle = options.accent
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(0, -13, halfWidth + 6, Math.PI, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = options.accent
    roundedRect(ctx, -halfWidth - 7, -12, 8, 22, 4)
    ctx.fill()
    roundedRect(ctx, halfWidth - 1, -12, 8, 22, 4)
    ctx.fill()
  } else if (options.accessory === 'glasses') {
    ctx.strokeStyle = options.accent
    ctx.lineWidth = 2
    roundedRect(ctx, -19, -12, 17, 16, 5)
    ctx.stroke()
    roundedRect(ctx, 2, -12, 17, 16, 5)
    ctx.stroke()
  }
}

function traceHumanFace(ctx: Ctx, options: AvatarOptions, geometry: AvatarGeometry) {
  ctx.beginPath()
  if (options.faceShape === 'angular') {
    ctx.moveTo(-geometry.headRx, -10)
    ctx.quadraticCurveTo(-geometry.headRx + 2, -geometry.headRy, 0, -geometry.headRy)
    ctx.quadraticCurveTo(geometry.headRx - 2, -geometry.headRy, geometry.headRx, -10)
    ctx.lineTo(geometry.headRx - 4, 18)
    ctx.lineTo(0, geometry.headRy)
    ctx.lineTo(-geometry.headRx + 4, 18)
    ctx.closePath()
  } else {
    const roundScale = options.faceShape === 'round' ? 1.08 : 1
    ctx.ellipse(0, 0, geometry.headRx * roundScale, geometry.headRy * (options.faceShape === 'round' ? .94 : 1), 0, 0, Math.PI * 2)
  }
}

function drawHumanHeadAccessory(ctx: Ctx, options: AvatarOptions, geometry: AvatarGeometry, eyeX: number, eyeY: number, eyeRx: number, eyeRy: number) {
  if (options.accessory === 'glasses') {
    ctx.strokeStyle = options.accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(-eyeX, eyeY, eyeRx + 6, eyeRy + 4, 0, 0, Math.PI * 2)
    ctx.ellipse(eyeX, eyeY, eyeRx + 6, eyeRy + 4, 0, 0, Math.PI * 2)
    ctx.moveTo(-3, eyeY)
    ctx.lineTo(3, eyeY)
    ctx.stroke()
  } else if (options.accessory === 'headphones') {
    ctx.strokeStyle = options.accent
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(0, -8, geometry.headRx + 5, Math.PI, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = options.accent
    roundedRect(ctx, -geometry.headRx - 7, -8, 8, 21, 4)
    ctx.fill()
    roundedRect(ctx, geometry.headRx - 1, -8, 8, 21, 4)
    ctx.fill()
  }
}

function drawHumanHead(ctx: Ctx, options: AvatarOptions, geometry: AvatarGeometry, liveFace?: HTMLCanvasElement | null) {
  if (options.concept === 'alien') {
    ctx.fillStyle = options.skin
    ctx.beginPath()
    ctx.moveTo(-geometry.headRx + 2, -6)
    ctx.lineTo(-geometry.headRx - 12, -15)
    ctx.quadraticCurveTo(-geometry.headRx - 8, 3, -geometry.headRx + 1, 8)
    ctx.moveTo(geometry.headRx - 2, -6)
    ctx.lineTo(geometry.headRx + 12, -15)
    ctx.quadraticCurveTo(geometry.headRx + 8, 3, geometry.headRx - 1, 8)
    ctx.fill()
  } else {
    ctx.fillStyle = options.skin
    ctx.beginPath()
    ctx.arc(-geometry.headRx + 1, 1, 5.5, 0, Math.PI * 2)
    ctx.arc(geometry.headRx - 1, 1, 5.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = options.skin
  traceHumanFace(ctx, options, geometry)
  ctx.fill()
  if (liveFace) {
    ctx.save()
    traceHumanFace(ctx, options, geometry)
    ctx.clip()
    const roundScale = options.faceShape === 'round' ? 1.08 : 1
    const faceWidth = geometry.headRx * roundScale * 2
    const faceHeight = geometry.headRy * (options.faceShape === 'round' ? .94 : 1) * 2
    ctx.drawImage(liveFace, -faceWidth * .5, -faceHeight * .5, faceWidth, faceHeight)
    ctx.restore()
  }
  ctx.save()
  const hairScale = options.concept === 'alien' ? .92 : 1
  ctx.scale((geometry.headRx / 28) * hairScale, (geometry.headRy / 34) * hairScale)
  drawHair(ctx, options.hairStyle, options.hair)
  ctx.restore()

  if (options.concept === 'explorer') {
    ctx.fillStyle = options.trousers
    ctx.beginPath()
    ctx.ellipse(0, -24, 30, 6, 0, Math.PI, Math.PI * 2)
    ctx.fill()
    roundedRect(ctx, -21, -35, 42, 13, 6)
    ctx.fill()
  }

  const eyeX = options.concept === 'alien' ? 11 : 9.5
  const eyeY = options.concept === 'alien' ? -4 : -3
  const eyeRx = options.concept === 'alien' ? 5 : 2.4
  const eyeRy = options.concept === 'alien' ? 8 : 3.8
  if (liveFace) {
    if (options.concept === 'athlete') {
      ctx.strokeStyle = options.shirt
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(-24, -12)
      ctx.quadraticCurveTo(0, -7, 24, -12)
      ctx.stroke()
    }
    drawHumanHeadAccessory(ctx, options, geometry, eyeX, eyeY, eyeRx, eyeRy)
    return
  }
  ctx.fillStyle = '#26342f'
  ctx.strokeStyle = '#26342f'
  ctx.lineWidth = 2
  ctx.beginPath()
  if (options.eyeStyle === 'happy') {
    ctx.arc(-eyeX, eyeY + 1, eyeRx + 2, Math.PI * 1.08, Math.PI * 1.92)
    ctx.moveTo(eyeX + eyeRx + 2, eyeY + 1)
    ctx.arc(eyeX, eyeY + 1, eyeRx + 2, Math.PI * 1.08, Math.PI * 1.92)
    ctx.stroke()
  } else if (options.eyeStyle === 'focused') {
    ctx.moveTo(-eyeX - 4, eyeY - 4)
    ctx.lineTo(-eyeX + 3, eyeY - 1)
    ctx.moveTo(eyeX + 4, eyeY - 4)
    ctx.lineTo(eyeX - 3, eyeY - 1)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(-eyeX, eyeY + 2, eyeRx, eyeRy * .75, -.18, 0, Math.PI * 2)
    ctx.ellipse(eyeX, eyeY + 2, eyeRx, eyeRy * .75, .18, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.ellipse(-eyeX, eyeY, eyeRx, eyeRy, -.12, 0, Math.PI * 2)
    ctx.ellipse(eyeX, eyeY, eyeRx, eyeRy, .12, 0, Math.PI * 2)
    ctx.fill()
    if (options.eyeStyle === 'sparkle') {
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(-eyeX - eyeRx * .2, eyeY - eyeRy * .25, Math.max(1, eyeRx * .33), 0, Math.PI * 2)
      ctx.arc(eyeX - eyeRx * .2, eyeY - eyeRy * .25, Math.max(1, eyeRx * .33), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  if (options.concept === 'woman') {
    ctx.strokeStyle = '#26342f'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(-12, -6)
    ctx.lineTo(-15, -8)
    ctx.moveTo(12, -6)
    ctx.lineTo(15, -8)
    ctx.stroke()
  } else if (options.concept === 'athlete') {
    ctx.strokeStyle = options.shirt
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-24, -12)
    ctx.quadraticCurveTo(0, -7, 24, -12)
    ctx.stroke()
  }

  if (options.concept !== 'alien') {
    ctx.strokeStyle = 'rgba(92, 57, 47, .42)'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(-1.5, 5, 2, 5.5)
    ctx.stroke()
  }
  ctx.strokeStyle = options.concept === 'alien' ? options.hair : '#7b3f42'
  ctx.lineWidth = 2.1
  ctx.lineCap = 'round'
  ctx.beginPath()
  const mouthY = options.concept === 'alien' ? 13 : 11
  if (options.mouthStyle === 'smile') ctx.arc(0, mouthY, options.concept === 'alien' ? 6 : 8, .15, Math.PI - .15)
  else if (options.mouthStyle === 'open') ctx.ellipse(0, mouthY + 2, 5, 7, 0, 0, Math.PI * 2)
  else {
    ctx.moveTo(-7, mouthY + 3)
    ctx.lineTo(7, mouthY + 3)
  }
  if (options.mouthStyle === 'open') {
    ctx.fillStyle = '#7b3f42'
    ctx.fill()
  } else ctx.stroke()

  drawHumanHeadAccessory(ctx, options, geometry, eyeX, eyeY, eyeRx, eyeRy)
}

function drawJointAvatar(ctx: Ctx, x: number, y: number, options: AvatarOptions, t: number, livePose?: LivePose | null, liveFace?: HTMLCanvasElement | null) {
  const scripted = motionPose(options.motion, t)
  const isLive = Boolean(livePose && livePose.confidence > 0.42)
  const pose = isLive && livePose ? {
    bob: -livePose.hipLift * 220,
    body: livePose.bodyLean,
    head: livePose.headTilt,
    neck: livePose.neckLean,
    armL: livePose.leftUpperArm,
    forearmL: livePose.leftForearm,
    handL: livePose.leftHand,
    handSpreadL: livePose.leftHandSpread,
    armFrontL: livePose.leftArmFront,
    armDepthL: livePose.leftArmDepth,
    armR: livePose.rightUpperArm,
    forearmR: livePose.rightForearm,
    handR: livePose.rightHand,
    handSpreadR: livePose.rightHandSpread,
    armFrontR: livePose.rightArmFront,
    armDepthR: livePose.rightArmDepth,
    legL: livePose.leftUpperLeg,
    lowerLegL: livePose.leftLowerLeg,
    footL: livePose.leftFoot,
    legR: livePose.rightUpperLeg,
    lowerLegR: livePose.rightLowerLeg,
    footR: livePose.rightFoot,
  } : scripted
  const baseGeometry = avatarGeometry[options.concept]
  const buildScale = options.bodyBuild === 'slim' ? .88 : options.bodyBuild === 'broad' ? 1.12 : 1
  const limbWidthScale = options.bodyBuild === 'slim' ? .86 : options.bodyBuild === 'broad' ? 1.14 : 1
  const geometry: AvatarGeometry = {
    ...baseGeometry,
    shoulderX: baseGeometry.shoulderX * buildScale,
    torsoShoulder: baseGeometry.torsoShoulder * buildScale,
    waist: baseGeometry.waist * (options.bodyBuild === 'slim' ? .9 : options.bodyBuild === 'broad' ? 1.1 : 1),
    hip: baseGeometry.hip * (options.bodyBuild === 'slim' ? .94 : options.bodyBuild === 'broad' ? 1.07 : 1),
    hipX: baseGeometry.hipX * (options.bodyBuild === 'slim' ? .92 : options.bodyBuild === 'broad' ? 1.06 : 1),
    thighWidth: baseGeometry.thighWidth * limbWidthScale,
    calfWidth: baseGeometry.calfWidth * limbWidthScale,
    upperArmWidth: baseGeometry.upperArmWidth * limbWidthScale,
    forearmWidth: baseGeometry.forearmWidth * limbWidthScale,
  }
  const angleCorrection = isLive ? pose.body : 0
  const mechanical = options.concept === 'robot'
  const legColor = options.bottomStyle === 'pants' || mechanical ? options.trousers : options.skin
  const limbOutline = 'transparent'
  const groundY = geometry.upperLeg + geometry.lowerLeg + 14
  const plantedShift = groundedRootShift(pose, geometry.upperLeg, geometry.lowerLeg, angleCorrection)
  const airborneShift = isLive ? Math.min(0, pose.bob) : pose.bob
  const rootY = plantedShift + airborneShift

  ctx.save()
  ctx.translate(x, y + rootY)

  ctx.save()
  const airborne = Math.max(0, -airborneShift)
  ctx.globalAlpha = Math.max(.07, .15 - airborne * .002)
  ctx.fillStyle = '#17352b'
  ctx.beginPath()
  ctx.ellipse(
    0,
    groundY - rootY + 2,
    ((options.concept === 'explorer' ? 63 : 55) + airborne * .14) * buildScale,
    9 + airborne * .035,
    0,
    0,
    Math.PI * 2,
  )
  ctx.fill()
  ctx.restore()

  const contactFootX = (hipX: number, upperAngle: number, lowerAngle: number) => {
    const localX = hipX
      - Math.sin(upperAngle - angleCorrection) * geometry.upperLeg
      - Math.sin(lowerAngle - angleCorrection) * geometry.lowerLeg
    const localY = Math.cos(upperAngle - angleCorrection) * geometry.upperLeg
      + Math.cos(lowerAngle - angleCorrection) * geometry.lowerLeg
    return Math.cos(pose.body) * localX - Math.sin(pose.body) * localY
  }
  const contactAlpha = Math.max(0, 1 - airborne / 28)
  if (contactAlpha > 0) {
    ctx.save()
    ctx.globalAlpha = .2 * contactAlpha
    ctx.fillStyle = '#142d26'
    ctx.beginPath()
    ctx.ellipse(contactFootX(-geometry.hipX, pose.legL, pose.lowerLegL), groundY - rootY - 3, 17, 4, 0, 0, Math.PI * 2)
    ctx.ellipse(contactFootX(geometry.hipX, pose.legR, pose.lowerLegR), groundY - rootY - 3, 17, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.rotate(pose.body)

  const leftFoot = articulatedLimb(ctx, -geometry.hipX, 0, geometry.upperLeg, geometry.lowerLeg, geometry.thighWidth, pose.legL - angleCorrection, pose.lowerLegL - angleCorrection, legColor, geometry.calfWidth, limbOutline)
  const rightFoot = articulatedLimb(ctx, geometry.hipX, 0, geometry.upperLeg, geometry.lowerLeg, geometry.thighWidth, pose.legR - angleCorrection, pose.lowerLegR - angleCorrection, legColor, geometry.calfWidth, limbOutline)
  if (options.bottomStyle === 'shorts') {
    limb(ctx, -geometry.hipX, 0, geometry.upperLeg * .36, geometry.thighWidth + 3, pose.legL - angleCorrection, options.trousers)
    limb(ctx, geometry.hipX, 0, geometry.upperLeg * .36, geometry.thighWidth + 3, pose.legR - angleCorrection, options.trousers)
    const drawShortCuff = (hipX: number, angle: number) => {
      ctx.save()
      ctx.translate(hipX, 0)
      ctx.rotate(angle)
      ctx.globalAlpha = .52
      ctx.strokeStyle = options.accent
      ctx.lineWidth = 2
      ctx.lineCap = 'butt'
      ctx.beginPath()
      ctx.moveTo(-(geometry.thighWidth + 3) * .46, geometry.upperLeg * .34)
      ctx.lineTo((geometry.thighWidth + 3) * .46, geometry.upperLeg * .34)
      ctx.stroke()
      ctx.restore()
    }
    drawShortCuff(-geometry.hipX, pose.legL - angleCorrection)
    drawShortCuff(geometry.hipX, pose.legR - angleCorrection)
  } else if (options.bottomStyle === 'pants') {
    ctx.save()
    ctx.globalAlpha = .2
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.2
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(-geometry.hipX, 7)
    ctx.lineTo(leftFoot.jointX, leftFoot.jointY)
    ctx.lineTo(leftFoot.x, leftFoot.y - 8)
    ctx.moveTo(geometry.hipX, 7)
    ctx.lineTo(rightFoot.jointX, rightFoot.jointY)
    ctx.lineTo(rightFoot.x, rightFoot.y - 8)
    ctx.stroke()
    ctx.restore()
  }
  drawFoot(ctx, leftFoot.x, leftFoot.y, pose.footL - angleCorrection, options.shoes, mechanical, options.shoeStyle)
  drawFoot(ctx, rightFoot.x, rightFoot.y, pose.footR - angleCorrection, options.shoes, mechanical, options.shoeStyle)

  const arms = [
    { shoulderX: -geometry.shoulderX, upper: pose.armL, lower: pose.forearmL, hand: pose.handL, spread: pose.handSpreadL, front: pose.armFrontL > .46, depth: pose.armDepthL },
    { shoulderX: geometry.shoulderX, upper: pose.armR, lower: pose.forearmR, hand: pose.handR, spread: pose.handSpreadR, front: pose.armFrontR > .46, depth: pose.armDepthR },
  ]
  const paintArm = (arm: typeof arms[number]) => {
    drawArticulatedArm(
      ctx,
      arm.shoulderX,
      geometry.shoulderY,
      arm.upper,
      arm.lower,
      arm.hand,
      arm.spread,
      angleCorrection,
      options.skin,
      geometry.upperArm,
      geometry.lowerArm,
      geometry.upperArmWidth,
      geometry.forearmWidth,
      mechanical,
      limbOutline,
      options.sleeveStyle,
      options.shirt,
      options.accent,
    )
  }
  arms.filter((arm) => !arm.front).sort((a, b) => b.depth - a.depth).forEach(paintArm)

  const headX = pose.neck * 24
  ctx.strokeStyle = mechanical ? options.hair : options.skin
  ctx.lineWidth = mechanical ? 12 : options.concept === 'alien' ? 10 : 14
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, geometry.shoulderY - 4)
  ctx.lineTo(headX * .55, geometry.neckTop)
  ctx.stroke()

  drawTorso(ctx, options, geometry)

  if (options.accessory === 'scarf') {
    ctx.fillStyle = options.accent
    ctx.beginPath()
    ctx.moveTo(-31, geometry.shoulderY - 1)
    ctx.quadraticCurveTo(0, geometry.shoulderY + 19, 31, geometry.shoulderY - 1)
    ctx.lineTo(20, geometry.shoulderY + 29)
    ctx.lineTo(-4, geometry.shoulderY + 14)
    ctx.closePath()
    ctx.fill()
  }

  ctx.save()
  ctx.translate(headX, geometry.headY)
  ctx.rotate(pose.head - angleCorrection)
  if (mechanical) drawRobotHead(ctx, options, liveFace)
  else drawHumanHead(ctx, options, geometry, liveFace)
  ctx.restore()

  arms.filter((arm) => arm.front).sort((a, b) => b.depth - a.depth).forEach(paintArm)
  ctx.restore()
}

function drawAvatar(ctx: Ctx, x: number, y: number, options: AvatarOptions, t: number, livePose?: LivePose | null) {
  const scripted = motionPose(options.motion, t)
  const isLive = Boolean(livePose && livePose.confidence > 0.42)
  const pose = isLive && livePose ? {
    bob: -livePose.hipLift * 220,
    body: livePose.bodyLean,
    head: livePose.headTilt,
    neck: livePose.neckLean,
    armL: livePose.leftUpperArm,
    forearmL: livePose.leftForearm,
    handL: livePose.leftHand,
    handSpreadL: livePose.leftHandSpread,
    armFrontL: livePose.leftArmFront,
    armDepthL: livePose.leftArmDepth,
    armR: livePose.rightUpperArm,
    forearmR: livePose.rightForearm,
    handR: livePose.rightHand,
    handSpreadR: livePose.rightHandSpread,
    armFrontR: livePose.rightArmFront,
    armDepthR: livePose.rightArmDepth,
    legL: livePose.leftUpperLeg,
    lowerLegL: livePose.leftLowerLeg,
    footL: livePose.leftFoot,
    legR: livePose.rightUpperLeg,
    lowerLegR: livePose.rightLowerLeg,
    footR: livePose.rightFoot,
  } : scripted
  const angleCorrection = isLive ? pose.body : 0
  const plantedShift = groundedRootShift(pose, 69, 67, angleCorrection)
  const airborneShift = isLive ? Math.min(0, pose.bob) : pose.bob
  const rootY = plantedShift + airborneShift
  ctx.save()
  ctx.translate(x, y + rootY)
  ctx.rotate(pose.body)

  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = '#17352b'
  ctx.beginPath()
  ctx.ellipse(0, 151 - rootY, 59, 11, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const leftFoot = articulatedLimb(ctx, -21, 0, 69, 67, 20, pose.legL - angleCorrection, pose.lowerLegL - angleCorrection, options.trousers, 16)
  const rightFoot = articulatedLimb(ctx, 21, 0, 69, 67, 20, pose.legR - angleCorrection, pose.lowerLegR - angleCorrection, options.trousers, 16)
  drawFoot(ctx, leftFoot.x, leftFoot.y, pose.footL - angleCorrection)
  drawFoot(ctx, rightFoot.x, rightFoot.y, pose.footR - angleCorrection)

  const arms = [
    {
      side: 'left',
      shoulderX: -45,
      upper: pose.armL,
      lower: pose.forearmL,
      hand: pose.handL,
      spread: pose.handSpreadL,
      front: pose.armFrontL > 0.46,
      depth: pose.armDepthL,
    },
    {
      side: 'right',
      shoulderX: 45,
      upper: pose.armR,
      lower: pose.forearmR,
      hand: pose.handR,
      spread: pose.handSpreadR,
      front: pose.armFrontR > 0.46,
      depth: pose.armDepthR,
    },
  ]
  const paintArm = (arm: typeof arms[number]) => drawArm(
    ctx,
    arm.shoulderX,
    arm.upper,
    arm.lower,
    arm.hand,
    arm.spread,
    angleCorrection,
    options.skin,
  )
  arms.filter((arm) => !arm.front).sort((a, b) => b.depth - a.depth).forEach(paintArm)

  const headX = pose.neck * 24
  ctx.strokeStyle = options.skin
  ctx.lineWidth = 15
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -108)
  ctx.lineTo(headX * 0.55, -121)
  ctx.stroke()

  ctx.fillStyle = options.shirt
  ctx.beginPath()
  ctx.moveTo(-49, -103)
  ctx.quadraticCurveTo(-51, -89, -45, -72)
  ctx.quadraticCurveTo(-41, -39, -35, -6)
  ctx.quadraticCurveTo(0, 5, 35, -6)
  ctx.quadraticCurveTo(41, -39, 45, -72)
  ctx.quadraticCurveTo(51, -89, 49, -103)
  ctx.quadraticCurveTo(0, -114, -49, -103)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.16)'
  roundedRect(ctx, -32, -91, 64, 9, 5)
  ctx.fill()

  ctx.fillStyle = options.trousers
  roundedRect(ctx, -38, -11, 76, 19, 8)
  ctx.fill()

  ctx.save()
  ctx.translate(headX, -152)
  ctx.rotate(pose.head - angleCorrection)
  ctx.fillStyle = options.skin
  ctx.beginPath()
  ctx.arc(-27, 1, 5.5, 0, Math.PI * 2)
  ctx.arc(27, 1, 5.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, 0, 28, 34, 0, 0, Math.PI * 2)
  ctx.fill()
  drawHair(ctx, options.hairStyle, options.hair)

  ctx.fillStyle = '#26342f'
  ctx.beginPath()
  ctx.ellipse(-9.5, -3, 2.4, 3.8, 0, 0, Math.PI * 2)
  ctx.ellipse(9.5, -3, 2.4, 3.8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(92, 57, 47, .42)'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(-1.5, 5, 2, 5.5)
  ctx.stroke()
  ctx.strokeStyle = '#7b3f42'
  ctx.lineWidth = 2.1
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(0, 11, 8, 0.15, Math.PI - 0.15)
  ctx.stroke()
  ctx.restore()

  arms.filter((arm) => arm.front).sort((a, b) => b.depth - a.depth).forEach(paintArm)
  ctx.restore()
}

export function renderAvatar(canvas: HTMLCanvasElement, options: AvatarOptions, time = 0, livePose?: LivePose | null, robotPose?: RobotPose | null, liveFace?: HTMLCanvasElement | null) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  const width = Math.max(320, rect.width)
  const height = Math.max(420, rect.height)
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  drawBackground(ctx, width, height, options.scene, time)
  const scale = Math.min(width / 520, height / 520)
  const geometry = avatarGeometry[options.concept]
  const avatarGroundY = geometry.upperLeg + geometry.lowerLeg + 14
  const groundLine = height * GROUND_LINE_RATIO
  const avatarOriginY = groundLine - avatarGroundY * scale
  const robotGroundY = 104
  const robotOriginY = avatarGroundY - robotGroundY
  ctx.save()
  ctx.translate(width / 2, avatarOriginY)
  ctx.scale(scale, scale)
  drawJointAvatar(ctx, 0, 0, options, time, livePose, liveFace)
  const robotSide = robotPose ? (options.robot === 'left' ? 'left' : 'right') : options.robot
  if (robotSide === 'left') drawRobot(ctx, -170, robotOriginY, time, robotPose)
  if (robotSide === 'right') drawRobot(ctx, 170, robotOriginY, time, robotPose)
  ctx.restore()
}
