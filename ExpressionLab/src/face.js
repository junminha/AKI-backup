// 브라우저 안에서 끝내는 표정 계측 모듈.
// MediaPipe FaceLandmarker가 내놓는 478개 랜드마크와 52개 블렌드셰이프를
// FACS(Facial Action Coding System) 기반 지표로 압축한다.
// OpenRouter에는 이 압축 결과만 보내므로 토큰 사용량이 크게 줄어든다.

// ── FACS Action Unit ↔ ARKit 블렌드셰이프 매핑 ──────────────────────────
// 각 AU는 여러 블렌드셰이프의 최댓값 또는 평균으로 추정한다.
const ACTION_UNITS = [
  { code: "AU1", name: "안쪽 눈썹 올림", shapes: ["browInnerUp"], reduce: "max" },
  { code: "AU2", name: "바깥 눈썹 올림", shapes: ["browOuterUpLeft", "browOuterUpRight"], reduce: "mean" },
  { code: "AU4", name: "눈썹 내림·모음", shapes: ["browDownLeft", "browDownRight"], reduce: "mean" },
  { code: "AU5", name: "윗눈꺼풀 올림", shapes: ["eyeWideLeft", "eyeWideRight"], reduce: "mean" },
  { code: "AU6", name: "볼 올림(눈웃음)", shapes: ["cheekSquintLeft", "cheekSquintRight"], reduce: "mean" },
  { code: "AU7", name: "눈꺼풀 조임", shapes: ["eyeSquintLeft", "eyeSquintRight"], reduce: "mean" },
  { code: "AU9", name: "코 찡그림", shapes: ["noseSneerLeft", "noseSneerRight"], reduce: "mean" },
  { code: "AU10", name: "윗입술 올림", shapes: ["mouthUpperUpLeft", "mouthUpperUpRight"], reduce: "mean" },
  { code: "AU12", name: "입꼬리 당김(미소)", shapes: ["mouthSmileLeft", "mouthSmileRight"], reduce: "mean" },
  { code: "AU14", name: "보조개 조임", shapes: ["mouthDimpleLeft", "mouthDimpleRight"], reduce: "mean" },
  { code: "AU15", name: "입꼬리 내림", shapes: ["mouthFrownLeft", "mouthFrownRight"], reduce: "mean" },
  { code: "AU17", name: "턱 올림", shapes: ["mouthShrugLower"], reduce: "max" },
  { code: "AU18", name: "입술 오므림", shapes: ["mouthPucker", "mouthFunnel"], reduce: "max" },
  { code: "AU20", name: "입술 늘림", shapes: ["mouthStretchLeft", "mouthStretchRight"], reduce: "mean" },
  { code: "AU23", name: "입술 조임", shapes: ["mouthPressLeft", "mouthPressRight"], reduce: "mean" },
  { code: "AU26", name: "턱 벌림", shapes: ["jawOpen"], reduce: "max" },
  { code: "AU28", name: "입술 말아넣음", shapes: ["mouthRollUpper", "mouthRollLower"], reduce: "mean" },
  { code: "AU45", name: "눈 감음·깜빡임", shapes: ["eyeBlinkLeft", "eyeBlinkRight"], reduce: "mean" },
];

// 좌우 쌍으로 비대칭을 계산할 블렌드셰이프.
const SYMMETRY_PAIRS = [
  ["mouthSmileLeft", "mouthSmileRight"],
  ["mouthFrownLeft", "mouthFrownRight"],
  ["browDownLeft", "browDownRight"],
  ["browOuterUpLeft", "browOuterUpRight"],
  ["eyeSquintLeft", "eyeSquintRight"],
  ["cheekSquintLeft", "cheekSquintRight"],
];

// 눈·입 종횡비 계산에 쓰는 랜드마크 인덱스 (MediaPipe 468 토폴로지).
const LM = {
  leftEye: { top: 159, bottom: 145, inner: 133, outer: 33 },
  rightEye: { top: 386, bottom: 374, inner: 362, outer: 263 },
  mouth: { top: 13, bottom: 14, left: 61, right: 291 },
  face: { left: 234, right: 454, top: 10, bottom: 152 },
  browLeft: 105,
  browRight: 334,
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function scoreMap(blendshapes) {
  const map = new Map();
  for (const category of blendshapes?.categories ?? []) {
    map.set(category.categoryName, category.score);
  }
  return map;
}

function reduceShapes(scores, names, reduce) {
  const values = names.map((name) => scores.get(name) ?? 0);
  if (!values.length) return 0;
  return reduce === "max"
    ? Math.max(...values)
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

// 4x4 변환 행렬(column-major)에서 머리 방향(yaw/pitch/roll)을 도(degree)로 뽑는다.
function headPose(matrix) {
  const m = matrix?.data;
  if (!m || m.length < 16) return null;

  const r00 = m[0];
  const r10 = m[1];
  const r02 = m[8];
  const r12 = m[9];
  const r22 = m[10];
  const toDegree = (radian) => Math.round((radian * 180) / Math.PI);

  return {
    yaw: toDegree(Math.atan2(r02, r22)),
    pitch: toDegree(Math.asin(Math.max(-1, Math.min(1, -r12)))),
    roll: toDegree(Math.atan2(r10, r00)),
  };
}

// 눈 종횡비(EAR): 값이 작을수록 눈을 감은 상태.
function eyeAspectRatio(points, eye) {
  const height = distance(points[eye.top], points[eye.bottom]);
  const width = distance(points[eye.inner], points[eye.outer]);
  return width ? height / width : 0;
}

function geometry(points) {
  if (!points?.length) return null;

  const faceWidth = distance(points[LM.face.left], points[LM.face.right]) || 1;
  const faceHeight = distance(points[LM.face.top], points[LM.face.bottom]) || 1;
  const mouthWidth = distance(points[LM.mouth.left], points[LM.mouth.right]);
  const mouthHeight = distance(points[LM.mouth.top], points[LM.mouth.bottom]);

  // 입꼬리가 눈높이에 비해 어디 놓였는지 → 미소·찡그림의 기하학적 근거
  const eyeLine = (points[LM.leftEye.outer].y + points[LM.rightEye.outer].y) / 2;
  const cornerLine = (points[LM.mouth.left].y + points[LM.mouth.right].y) / 2;

  return {
    // 눈 열림 정도 (0에 가까우면 감은 눈)
    ear: [
      round(eyeAspectRatio(points, LM.leftEye), 3),
      round(eyeAspectRatio(points, LM.rightEye), 3),
    ],
    // 입 벌림 비율
    mar: round(mouthHeight / (mouthWidth || 1), 3),
    // 얼굴 폭 대비 입 너비 → 옆으로 늘어난 입
    mouthWidthRatio: round(mouthWidth / faceWidth, 3),
    // 입꼬리 높이차 → 한쪽만 올라간 비대칭 미소
    cornerTilt: round((points[LM.mouth.left].y - points[LM.mouth.right].y) / faceHeight, 3),
    // 눈-입 수직 거리 비율
    eyeMouthGap: round((cornerLine - eyeLine) / faceHeight, 3),
    // 눈썹과 눈 사이 거리 → 눈썹 올림/내림의 절대 근거
    browEyeGap: [
      round(distance(points[LM.browLeft], points[LM.leftEye.top]) / faceHeight, 3),
      round(distance(points[LM.browRight], points[LM.rightEye.top]) / faceHeight, 3),
    ],
  };
}

/**
 * 한 프레임에서 계측 원본을 뽑는다. 시간 평균을 내기 위해 여러 장을 모은다.
 */
export function readFrame(result) {
  const points = result?.faceLandmarks?.[0];
  const shapes = result?.faceBlendshapes?.[0];
  if (!points || !shapes) return null;

  const scores = scoreMap(shapes);
  const units = {};
  for (const unit of ACTION_UNITS) {
    units[unit.code] = clamp01(reduceShapes(scores, unit.shapes, unit.reduce));
  }

  const asymmetry = SYMMETRY_PAIRS.reduce(
    (sum, [left, right]) => sum + Math.abs((scores.get(left) ?? 0) - (scores.get(right) ?? 0)),
    0,
  ) / SYMMETRY_PAIRS.length;

  return {
    units,
    asymmetry: clamp01(asymmetry),
    geometry: geometry(points),
    head: headPose(result?.facialTransformationMatrixes?.[0]),
  };
}

/**
 * 얼굴이 계측 가능한 상태인지 판단한다. (랜드마크 존재 + 정면성)
 */
export function faceQuality(frame) {
  if (!frame?.geometry) return { ok: false, reason: "얼굴을 찾지 못했어요" };

  const head = frame.head;
  if (head && (Math.abs(head.yaw) > 38 || Math.abs(head.pitch) > 32)) {
    return { ok: false, reason: "조금 더 정면을 봐 주세요" };
  }

  return { ok: true, reason: "계측 가능" };
}

/**
 * 표정 강도(0~1). AU45(깜빡임)는 표정이 아니므로 제외한다.
 */
function expressionIntensity(units) {
  const values = Object.entries(units)
    .filter(([code]) => code !== "AU45")
    .map(([, value]) => value);
  if (!values.length) return 0;

  const peak = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return clamp01(peak * 0.6 + mean * 1.6);
}

/**
 * 로컬에서 계산하는 정서가(valence)·각성도(arousal) 추정치.
 * OpenRouter에 정답으로 주는 값이 아니라 참고 좌표로 함께 보낸다.
 */
function affect(units) {
  const positive = units.AU6 * 0.9 + units.AU12 * 1.0;
  const negative = units.AU4 * 0.8 + units.AU15 * 0.9 + units.AU9 * 0.6 + units.AU23 * 0.4;
  const activation =
    units.AU5 * 0.8 + units.AU26 * 0.7 + units.AU2 * 0.5 + units.AU20 * 0.5 + units.AU12 * 0.4;

  return {
    valence: round(Math.max(-1, Math.min(1, positive - negative))),
    arousal: round(clamp01(activation)),
  };
}

/**
 * 진짜 미소(Duchenne) 여부: AU6(볼 올림)이 AU12(입꼬리)와 함께 나타나야 한다.
 */
function duchenne(units) {
  if (units.AU12 < 0.25) return "해당 없음";
  if (units.AU6 >= 0.3) return "AU6 동반 (Duchenne 미소 특징)";
  return "AU6 미약 (의도적 미소 가능성)";
}

/**
 * 여러 프레임을 하나의 계측 리포트로 합친다.
 * active 이하 필드가 OpenRouter로 가는 페이로드이고, allUnits는 화면 표시 전용이다.
 */
export function summarize(frames) {
  const usable = frames.filter(Boolean);
  if (!usable.length) return null;

  const codes = ACTION_UNITS.map((unit) => unit.code);
  const units = {};
  const variability = {};

  for (const code of codes) {
    const series = usable.map((frame) => frame.units[code] ?? 0);
    const mean = series.reduce((sum, value) => sum + value, 0) / series.length;
    const spread = Math.sqrt(
      series.reduce((sum, value) => sum + (value - mean) ** 2, 0) / series.length,
    );
    units[code] = round(mean);
    variability[code] = spread;
  }

  const last = usable[usable.length - 1];
  const meanOf = (pick) =>
    round(usable.reduce((sum, frame) => sum + pick(frame), 0) / usable.length);

  // 활성화된 AU만 추린다. 0에 가까운 값은 OpenRouter에 보낼 이유가 없다.
  const active = ACTION_UNITS.filter(
    (unit) => units[unit.code] >= 0.12 && unit.code !== "AU45",
  )
    .map((unit) => ({ code: unit.code, name: unit.name, value: units[unit.code] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const motion =
    Object.entries(variability)
      .filter(([code]) => code !== "AU45")
      .reduce((sum, [, value]) => sum + value, 0) / (codes.length - 1);

  return {
    active,
    intensity: round(expressionIntensity(units)),
    asymmetry: meanOf((frame) => frame.asymmetry),
    stability: round(1 - Math.min(1, motion * 6)),
    blink: units.AU45,
    duchenne: duchenne(units),
    ...affect(units),
    head: last.head,
    geometry: last.geometry,
    frames: usable.length,
    allUnits: ACTION_UNITS.map((unit) => ({
      code: unit.code,
      name: unit.name,
      value: units[unit.code],
    })),
  };
}

/**
 * 캐시 키. AU 값을 0.1 단위로 양자화해 사실상 같은 표정을 같은 키로 묶는다.
 * 같은 표정을 다시 분석하면 OpenRouter를 부르지 않고 이전 판독을 재사용한다.
 */
export function signature(report) {
  if (!report) return "";
  const bucket = (value) => Math.round(value * 10);
  const units = report.allUnits.map((unit) => `${unit.code}:${bucket(unit.value)}`).join(",");
  const head = report.head
    ? `h${Math.round(report.head.yaw / 12)},${Math.round(report.head.pitch / 12)}`
    : "h0,0";
  return `${units}|${head}|i${bucket(report.intensity)}`;
}

/**
 * OpenRouter로 보낼 페이로드만 골라낸다. allUnits 같은 화면 전용 필드는 제외한다.
 */
export function toPayload(report) {
  if (!report) return null;
  const { allUnits, ...payload } = report;
  void allUnits;
  return payload;
}

export { ACTION_UNITS };
