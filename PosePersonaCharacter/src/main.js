import "@fontsource-variable/noto-sans-kr";
import "@phosphor-icons/web/regular";
import "./styles.css";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const angleBetween = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const pointFrom = (point, angle, length) => ({
  x: point.x + Math.cos(angle) * length,
  y: point.y + Math.sin(angle) * length,
});

const avatarCanvas = $("#avatar-canvas");
const avatarContext = avatarCanvas.getContext("2d");
const cameraVideo = $("#camera-video");
const poseOverlay = $("#pose-overlay");
const poseContext = poseOverlay.getContext("2d");
const cameraButton = $("#camera-button");
const cameraSelect = $("#camera-select");
const cameraFrame = $("#camera-frame");
const cameraState = $("#camera-state");
const modelStatus = $("#model-status");
const modelStatusIndicator = $("#model-status-indicator");
const stageMode = $("#stage-mode");
const trackingMessage = $("#tracking-message");
const stageLoading = $("#stage-loading");
const qualityValue = $("#quality-value");
const inferenceValue = $("#inference-value");
const fpsValue = $("#fps-value");
const demoButton = $("#demo-button");
const calibrateButton = $("#calibrate-button");
const snapshotButton = $("#snapshot-button");
const themeToggle = $("#theme-toggle");
const toast = $("#toast");

const IMAGE_WIDTH = 1024;
const IMAGE_HEIGHT = 1536;
const DETECTION_INTERVAL = 66;
const STORAGE_KEY = "kinetic-avatar-profile-v1";
const GROUPS = ["head", "torso", "pelvis", "leftArm", "rightArm", "hands", "leftLeg", "rightLeg", "feet"];
const GROUP_LABELS = {
  all: "전체",
  head: "머리",
  torso: "몸통",
  pelvis: "골반",
  leftArm: "왼팔",
  rightArm: "오른팔",
  hands: "손",
  leftLeg: "왼다리",
  rightLeg: "오른다리",
  feet: "발",
};

const REST = {
  neck: { x: 512, y: 242 },
  head: { x: 512, y: 130 },
  shoulderCenter: { x: 512, y: 334 },
  shoulderL: { x: 343, y: 334 },
  shoulderR: { x: 690, y: 334 },
  elbowL: { x: 235, y: 500 },
  elbowR: { x: 789, y: 500 },
  wristL: { x: 130, y: 687 },
  wristR: { x: 894, y: 687 },
  handL: { x: 82, y: 785 },
  handR: { x: 942, y: 785 },
  root: { x: 512, y: 688 },
  hipL: { x: 418, y: 728 },
  hipR: { x: 606, y: 728 },
  kneeL: { x: 377, y: 1022 },
  kneeR: { x: 647, y: 1022 },
  ankleL: { x: 334, y: 1344 },
  ankleR: { x: 690, y: 1344 },
  toeL: { x: 315, y: 1470 },
  toeR: { x: 709, y: 1470 },
};

const polygonMirror = (points) => points.map(([x, y]) => [IMAGE_WIDTH - x, y]);

const PARTS = [
  {
    name: "leftThigh", group: "leftLeg", anchor: "hipL", end: "kneeL", z: 10,
    points: [[340, 668], [470, 675], [455, 1020], [325, 1040]],
  },
  {
    name: "rightThigh", group: "rightLeg", anchor: "hipR", end: "kneeR", z: 10,
    points: polygonMirror([[340, 668], [470, 675], [455, 1020], [325, 1040]]),
  },
  {
    name: "leftShin", group: "leftLeg", anchor: "kneeL", end: "ankleL", z: 11,
    points: [[310, 960], [440, 960], [430, 1362], [282, 1362]],
  },
  {
    name: "rightShin", group: "rightLeg", anchor: "kneeR", end: "ankleR", z: 11,
    points: polygonMirror([[310, 960], [440, 960], [430, 1362], [282, 1362]]),
  },
  {
    name: "leftFoot", group: "feet", anchor: "ankleL", end: "toeL", z: 12,
    points: [[238, 1290], [425, 1290], [438, 1524], [226, 1524]],
  },
  {
    name: "rightFoot", group: "feet", anchor: "ankleR", end: "toeR", z: 12,
    points: polygonMirror([[238, 1290], [425, 1290], [438, 1524], [226, 1524]]),
  },
  {
    name: "pelvis", group: "pelvis", anchor: "root", angleSource: 0, z: 20,
    points: [[355, 548], [669, 548], [665, 790], [359, 790]],
  },
  {
    name: "torso", group: "torso", anchor: "root", end: "shoulderCenter", z: 30,
    points: [[400, 235], [624, 235], [660, 300], [650, 566], [620, 676], [404, 676], [374, 566], [364, 300]],
  },
  {
    name: "leftUpperArm", group: "leftArm", anchor: "shoulderL", end: "elbowL", z: 40,
    points: [[250, 248], [370, 248], [360, 350], [330, 410], [288, 496], [192, 520], [198, 394]],
  },
  {
    name: "rightUpperArm", group: "rightArm", anchor: "shoulderR", end: "elbowR", z: 40,
    points: polygonMirror([[250, 248], [370, 248], [360, 350], [330, 410], [288, 496], [192, 520], [198, 394]]),
  },
  {
    name: "leftForearm", group: "leftArm", anchor: "elbowL", end: "wristL", z: 41,
    points: [[196, 450], [298, 456], [298, 522], [226, 635], [174, 697], [96, 685], [112, 594]],
  },
  {
    name: "rightForearm", group: "rightArm", anchor: "elbowR", end: "wristR", z: 41,
    points: polygonMirror([[196, 450], [298, 456], [298, 522], [226, 635], [174, 697], [96, 685], [112, 594]]),
  },
  {
    name: "leftHand", group: "hands", anchor: "wristL", end: "handL", z: 42,
    points: [[43, 645], [171, 648], [187, 695], [169, 872], [20, 878], [13, 724]],
  },
  {
    name: "rightHand", group: "hands", anchor: "wristR", end: "handR", z: 42,
    points: polygonMirror([[43, 645], [171, 648], [187, 695], [169, 872], [20, 878], [13, 724]]),
  },
  {
    name: "head", group: "head", anchor: "neck", end: "head", z: 50,
    points: [[385, 12], [639, 12], [651, 261], [373, 261]],
  },
];

const RENDER_PARTS = [...PARTS].sort((a, b) => a.z - b.z);
const JOINT_SPRITES = [
  { name: "neckJoint", key: "neck", cx: 512, cy: 242, rx: 54, ry: 48, group: "head", angleKey: "head", fixedRotation: true, segments: ["torso", "head"] },
  { name: "leftShoulderJoint", key: "shoulderL", cx: 343, cy: 334, rx: 61, ry: 61, group: "leftArm", angleKey: "upperL", fixedRotation: true, segments: ["torso", "leftUpperArm"] },
  { name: "rightShoulderJoint", key: "shoulderR", cx: 690, cy: 334, rx: 61, ry: 61, group: "rightArm", angleKey: "upperR", fixedRotation: true, segments: ["torso", "rightUpperArm"] },
  { name: "leftElbowJoint", key: "elbowL", cx: 235, cy: 500, rx: 58, ry: 58, group: "leftArm", angleKey: "lowerL", segments: ["leftUpperArm", "leftForearm"] },
  { name: "rightElbowJoint", key: "elbowR", cx: 789, cy: 500, rx: 58, ry: 58, group: "rightArm", angleKey: "lowerR", segments: ["rightUpperArm", "rightForearm"] },
  { name: "leftWristJoint", key: "wristL", cx: 130, cy: 687, rx: 44, ry: 44, group: "hands", angleKey: "handL", segments: ["leftForearm", "leftHand"] },
  { name: "rightWristJoint", key: "wristR", cx: 894, cy: 687, rx: 44, ry: 44, group: "hands", angleKey: "handR", segments: ["rightForearm", "rightHand"] },
  { name: "leftHipJoint", key: "hipL", cx: 418, cy: 728, rx: 52, ry: 52, group: "leftLeg", angleKey: "thighL", fixedRotation: true, segments: ["pelvis", "leftThigh"] },
  { name: "rightHipJoint", key: "hipR", cx: 606, cy: 728, rx: 52, ry: 52, group: "rightLeg", angleKey: "thighR", fixedRotation: true, segments: ["pelvis", "rightThigh"] },
  { name: "leftKneeJoint", key: "kneeL", cx: 377, cy: 1022, rx: 61, ry: 61, group: "leftLeg", angleKey: "shinL", segments: ["leftThigh", "leftShin"] },
  { name: "rightKneeJoint", key: "kneeR", cx: 647, cy: 1022, rx: 61, ry: 61, group: "rightLeg", angleKey: "shinR", segments: ["rightThigh", "rightShin"] },
  { name: "leftAnkleJoint", key: "ankleL", cx: 334, cy: 1344, rx: 47, ry: 47, group: "feet", angleKey: "footL", segments: ["leftShin", "leftFoot"] },
  { name: "rightAnkleJoint", key: "ankleR", cx: 690, cy: 1344, rx: 47, ry: 47, group: "feet", angleKey: "footR", segments: ["rightShin", "rightFoot"] },
];
const JOINT_UNDERLAYS = JOINT_SPRITES.map(({ key, rx, group }) => ({ key, radius: rx * 0.78, group }));
const JOINT_ASSET_ROOT = "/assets/rig-v4/joints";
const DEFAULT_AVATAR = "original";
const AVATARS = {
  original: {
    label: "오리지널",
    master: "/assets/character-rig-master-v3-transparent.png",
    joints: JOINT_ASSET_ROOT,
  },
  "retro-toy": {
    label: "레트로 토이",
    master: "/assets/avatars/retro-toy/master.png",
    joints: "/assets/avatars/retro-toy/joints",
  },
  "joseon-guardian": {
    label: "천문 수호자",
    master: "/assets/avatars/joseon-guardian/master.png",
    joints: "/assets/avatars/joseon-guardian/joints",
  },
  "deep-sea": {
    label: "심해 탐사대",
    master: "/assets/avatars/deep-sea/master.png",
    joints: "/assets/avatars/deep-sea/joints",
  },
  "forest-guardian": {
    label: "숲의 수호자",
    master: "/assets/avatars/forest-guardian/master.png",
    joints: "/assets/avatars/forest-guardian/joints",
  },
};
const JOINT_SLEEVES = [
  { start: "neck", end: "head", length: 42, width: 46, group: "head" },
  { start: "shoulderL", end: "elbowL", length: 52, width: 58, group: "leftArm" },
  { start: "shoulderR", end: "elbowR", length: 52, width: 58, group: "rightArm" },
  { start: "elbowL", end: "wristL", length: 66, width: 46, group: "leftArm" },
  { start: "elbowR", end: "wristR", length: 66, width: 46, group: "rightArm" },
  { start: "wristL", end: "handL", length: 40, width: 32, group: "hands" },
  { start: "wristR", end: "handR", length: 40, width: 32, group: "hands" },
  { start: "hipL", end: "kneeL", length: 58, width: 62, group: "leftLeg" },
  { start: "hipR", end: "kneeR", length: 58, width: 62, group: "rightLeg" },
  { start: "kneeL", end: "ankleL", length: 70, width: 54, group: "leftLeg" },
  { start: "kneeR", end: "ankleR", length: 70, width: 54, group: "rightLeg" },
  { start: "ankleL", end: "toeL", length: 42, width: 42, group: "feet" },
  { start: "ankleR", end: "toeR", length: 42, width: 42, group: "feet" },
];

const originalAngles = Object.fromEntries(
  Object.entries({
    torso: [REST.root, REST.shoulderCenter],
    shoulderLine: [REST.shoulderL, REST.shoulderR],
    hipLine: [REST.hipL, REST.hipR],
    upperL: [REST.shoulderL, REST.elbowL],
    upperR: [REST.shoulderR, REST.elbowR],
    lowerL: [REST.elbowL, REST.wristL],
    lowerR: [REST.elbowR, REST.wristR],
    handL: [REST.wristL, REST.handL],
    handR: [REST.wristR, REST.handR],
    thighL: [REST.hipL, REST.kneeL],
    thighR: [REST.hipR, REST.kneeR],
    shinL: [REST.kneeL, REST.ankleL],
    shinR: [REST.kneeR, REST.ankleR],
    footL: [REST.ankleL, REST.toeL],
    footR: [REST.ankleR, REST.toeR],
    head: [REST.neck, REST.head],
  }).map(([key, [a, b]]) => [key, angleBetween(a, b)]),
);

const TRACKED_SEGMENTS = {
  upperL: { startIndex: 11, endIndex: 13, sourceStart: "shoulderL", sourceEnd: "elbowL" },
  upperR: { startIndex: 12, endIndex: 14, sourceStart: "shoulderR", sourceEnd: "elbowR" },
  lowerL: { startIndex: 13, endIndex: 15, sourceStart: "elbowL", sourceEnd: "wristL" },
  lowerR: { startIndex: 14, endIndex: 16, sourceStart: "elbowR", sourceEnd: "wristR" },
  handL: { startIndex: 15, endIndex: 19, sourceStart: "wristL", sourceEnd: "handL" },
  handR: { startIndex: 16, endIndex: 20, sourceStart: "wristR", sourceEnd: "handR" },
  thighL: { startIndex: 23, endIndex: 25, sourceStart: "hipL", sourceEnd: "kneeL" },
  thighR: { startIndex: 24, endIndex: 26, sourceStart: "hipR", sourceEnd: "kneeR" },
  shinL: { startIndex: 25, endIndex: 27, sourceStart: "kneeL", sourceEnd: "ankleL" },
  shinR: { startIndex: 26, endIndex: 28, sourceStart: "kneeR", sourceEnd: "ankleR" },
  footL: { startIndex: 27, endIndex: 31, sourceStart: "ankleL", sourceEnd: "toeL" },
  footR: { startIndex: 28, endIndex: 32, sourceStart: "ankleR", sourceEnd: "toeR" },
};

// Each articulated image reaches past both joint points. The joint sprites are
// drawn last, so these overlaps stay hidden while preventing background seams.
const SEGMENT_OVERLAP = {
  leftUpperArm: 18,
  rightUpperArm: 18,
  leftForearm: 16,
  rightForearm: 16,
  leftHand: 11,
  rightHand: 11,
  leftThigh: 20,
  rightThigh: 20,
  leftShin: 18,
  rightShin: 18,
  leftFoot: 12,
  rightFoot: 12,
  head: 8,
};

// Extra destination-space masks prevent corners from the source crop (and
// pixels belonging to a neighboring body part) from escaping at deep bends.
const SEGMENT_CLIP_RADII = {
  leftUpperArm: [56, 50],
  rightUpperArm: [56, 50],
  leftForearm: [50, 42],
  rightForearm: [50, 42],
  leftThigh: [54, 54],
  rightThigh: [54, 54],
  leftShin: [55, 46],
  rightShin: [55, 46],
};

const state = {
  avatarReady: false,
  activeAvatar: DEFAULT_AVATAR,
  avatarLoadId: 0,
  modelReady: false,
  cameraStream: null,
  workerBusy: false,
  cameraActive: false,
  demoActive: true,
  lastDetectionAt: 0,
  landmarks: null,
  connections: [],
  calibrationRoot: null,
  canvasSize: { width: 900, height: 1100, dpr: 1 },
  activeGroup: "all",
  smoothing: 72,
  motion: 100,
  mirror: true,
  showSkeleton: true,
  filteredAngles: { ...originalAngles, head: originalAngles.torso },
  filteredLengths: Object.fromEntries(Object.keys(TRACKED_SEGMENTS).map((key) => [key, 1])),
  filteredRoot: null,
  settings: Object.fromEntries(GROUPS.map((group) => [group, { hue: 0, saturation: 100, brightness: 100, opacity: 100 }])),
  textures: {},
  partCanvases: new Map(),
  jointCanvases: new Map(),
};

const controls = {
  hue: $("#hue-control"),
  saturation: $("#saturation-control"),
  brightness: $("#brightness-control"),
  opacity: $("#opacity-control"),
  smoothing: $("#smoothing-control"),
  motion: $("#motion-control"),
};

const outputs = {
  hue: $("#hue-output"),
  saturation: $("#saturation-output"),
  brightness: $("#brightness-output"),
  opacity: $("#opacity-output"),
  smoothing: $("#smoothing-output"),
  motion: $("#motion-output"),
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2300);
}

function tracePartMask(context, part) {
  context.beginPath();
  context.moveTo(part.points[0][0], part.points[0][1]);
  part.points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
  context.closePath();
  part.ellipses?.forEach(({ cx, cy, rx, ry }) => {
    context.moveTo(cx + rx, cy);
    context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  });
}

function makePartCanvas(part, image) {
  const xs = part.points.map(([x]) => x);
  const ys = part.points.map(([, y]) => y);
  part.ellipses?.forEach(({ cx, cy, rx, ry }) => {
    xs.push(cx - rx, cx + rx);
    ys.push(cy - ry, cy + ry);
  });
  const minX = Math.max(0, Math.floor(Math.min(...xs) - 3));
  const minY = Math.max(0, Math.floor(Math.min(...ys) - 3));
  const maxX = Math.min(IMAGE_WIDTH, Math.ceil(Math.max(...xs) + 3));
  const maxY = Math.min(IMAGE_HEIGHT, Math.ceil(Math.max(...ys) + 3));
  const canvas = document.createElement("canvas");
  canvas.width = maxX - minX;
  canvas.height = maxY - minY;
  const context = canvas.getContext("2d");
  context.translate(-minX, -minY);
  tracePartMask(context, part);
  context.clip();
  context.drawImage(image, 0, 0);
  return { canvas, minX, minY };
}

function makeJointCanvas(joint, image) {
  const padding = 3;
  const minX = Math.max(0, Math.floor(joint.cx - joint.rx - padding));
  const minY = Math.max(0, Math.floor(joint.cy - joint.ry - padding));
  const maxX = Math.min(IMAGE_WIDTH, Math.ceil(joint.cx + joint.rx + padding));
  const maxY = Math.min(IMAGE_HEIGHT, Math.ceil(joint.cy + joint.ry + padding));
  const canvas = document.createElement("canvas");
  canvas.width = maxX - minX;
  canvas.height = maxY - minY;
  const context = canvas.getContext("2d");
  context.translate(-minX, -minY);
  context.beginPath();
  context.ellipse(joint.cx, joint.cy, joint.rx, joint.ry, 0, 0, Math.PI * 2);
  context.clip();
  context.drawImage(image, 0, 0);
  return { canvas, minX, minY };
}

async function loadJointSprite(joint, assetRoot, fallbackImage) {
  const padding = 3;
  const minX = Math.max(0, Math.floor(joint.cx - joint.rx - padding));
  const minY = Math.max(0, Math.floor(joint.cy - joint.ry - padding));
  const image = new Image();
  image.src = `${assetRoot}/${joint.name}.png`;
  try {
    await image.decode();
    return { canvas: image, minX, minY };
  } catch {
    // Keep the rig usable if a deploy accidentally omits one exported sprite.
    return makeJointCanvas(joint, fallbackImage);
  }
}

async function loadAvatar(avatarKey, { silent = false } = {}) {
  const avatar = AVATARS[avatarKey];
  if (!avatar) return;

  const loadId = ++state.avatarLoadId;
  const hadAvatar = state.avatarReady;
  stageLoading.hidden = false;
  stageLoading.querySelector("span").textContent = `${avatar.label} 파츠를 준비하는 중`;

  try {
    const nextImage = new Image();
    nextImage.src = avatar.master;
    await nextImage.decode();

    const nextPartCanvases = new Map(
      PARTS.map((part) => [part.name, makePartCanvas(part, nextImage)]),
    );
    const jointEntries = await Promise.all(JOINT_SPRITES.map(async (joint) => [
      joint.name,
      await loadJointSprite(joint, avatar.joints, nextImage),
    ]));

    if (loadId !== state.avatarLoadId) return;
    state.partCanvases = nextPartCanvases;
    state.jointCanvases = new Map(jointEntries);
    state.activeAvatar = avatarKey;
    state.avatarReady = true;
    stageLoading.hidden = true;
    $("#active-avatar-name").textContent = avatar.label;
    $$(".avatar-choice").forEach((button) => {
      const selected = button.dataset.avatar === avatarKey;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    if (!silent) showToast(`${avatar.label} 아바타를 적용했습니다.`);
  } catch {
    if (loadId !== state.avatarLoadId) return;
    state.avatarReady = hadAvatar;
    stageLoading.hidden = hadAvatar;
    stageLoading.querySelector("span").textContent = "캐릭터 이미지를 불러오지 못했습니다.";
    showToast(`${avatar.label} 아바타를 불러오지 못했습니다.`);
  }
}

function resizeCanvases() {
  const stageRect = $("#avatar-stage").getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.canvasSize = { width: stageRect.width, height: stageRect.height, dpr };
  avatarCanvas.width = Math.max(1, Math.round(stageRect.width * dpr));
  avatarCanvas.height = Math.max(1, Math.round(stageRect.height * dpr));
  avatarContext.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cameraRect = cameraFrame.getBoundingClientRect();
  poseOverlay.width = Math.max(1, Math.round(cameraRect.width * dpr));
  poseOverlay.height = Math.max(1, Math.round(cameraRect.height * dpr));
  poseContext.setTransform(dpr, 0, 0, dpr, 0, 0);
}

new ResizeObserver(resizeCanvases).observe($("#avatar-stage"));
new ResizeObserver(resizeCanvases).observe(cameraFrame);

function vectorLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function blendAngle(current, target, amount) {
  return current + angleDelta(current, target) * amount;
}

function applyMotionGain(key, angle) {
  const neutral = originalAngles[key] ?? originalAngles.torso;
  return neutral + angleDelta(neutral, angle) * (state.motion / 100);
}

function mappedLandmark(landmark) {
  return {
    ...landmark,
    x: state.mirror ? 1 - landmark.x : landmark.x,
  };
}

function confidence(landmark) {
  return Math.min(landmark?.visibility ?? 1, landmark?.presence ?? 1);
}

function reliableAngle(landmarks, startIndex, endIndex, fallback) {
  const start = landmarks[startIndex];
  const end = landmarks[endIndex];
  if (!start || !end || Math.min(confidence(start), confidence(end)) < 0.38) return fallback;
  return angleBetween(start, end);
}

function poseLengthScales(points) {
  const cameraAspect = cameraVideo.videoWidth && cameraVideo.videoHeight
    ? cameraVideo.videoWidth / cameraVideo.videoHeight
    : 16 / 9;
  const poseDistance = (a, b) => Math.hypot((b.x - a.x) * cameraAspect, b.y - a.y);
  const shoulderCenter = midpoint(points[11], points[12]);
  const hipCenter = midpoint(points[23], points[24]);
  const trackedBodySize = Math.max(
    0.08,
    (poseDistance(points[11], points[12]) + poseDistance(shoulderCenter, hipCenter)) / 2,
  );
  const restBodySize = (
    vectorLength(REST.shoulderL, REST.shoulderR)
    + vectorLength(REST.shoulderCenter, REST.root)
  ) / 2;

  return Object.fromEntries(Object.entries(TRACKED_SEGMENTS).map(([key, segment]) => {
    const start = points[segment.startIndex];
    const end = points[segment.endIndex];
    if (!start || !end || Math.min(confidence(start), confidence(end)) < 0.45) return [key, 1];
    const trackedRatio = poseDistance(start, end) / trackedBodySize;
    const restRatio = vectorLength(REST[segment.sourceStart], REST[segment.sourceEnd]) / restBodySize;
    return [key, clamp(trackedRatio / restRatio, 0.78, 1.28)];
  }));
}

function poseAngles(landmarks) {
  const points = landmarks.map(mappedLandmark);
  const shoulderCenter = midpoint(points[11], points[12]);
  const hipCenter = midpoint(points[23], points[24]);
  const headCenter = midpoint(points[7], points[8]);
  const angles = {
    torso: angleBetween(hipCenter, shoulderCenter),
    shoulderLine: reliableAngle(points, 11, 12, originalAngles.shoulderLine),
    hipLine: reliableAngle(points, 23, 24, originalAngles.hipLine),
    upperL: reliableAngle(points, 11, 13, state.filteredAngles.upperL),
    upperR: reliableAngle(points, 12, 14, state.filteredAngles.upperR),
    lowerL: reliableAngle(points, 13, 15, state.filteredAngles.lowerL),
    lowerR: reliableAngle(points, 14, 16, state.filteredAngles.lowerR),
    handL: reliableAngle(points, 15, 19, state.filteredAngles.handL),
    handR: reliableAngle(points, 16, 20, state.filteredAngles.handR),
    thighL: reliableAngle(points, 23, 25, state.filteredAngles.thighL),
    thighR: reliableAngle(points, 24, 26, state.filteredAngles.thighR),
    shinL: reliableAngle(points, 25, 27, state.filteredAngles.shinL),
    shinR: reliableAngle(points, 26, 28, state.filteredAngles.shinR),
    footL: reliableAngle(points, 27, 31, state.filteredAngles.footL),
    footR: reliableAngle(points, 28, 32, state.filteredAngles.footR),
    head: angleBetween(shoulderCenter, headCenter),
  };

  return { angles, lengths: poseLengthScales(points), root: hipCenter, points };
}

function demoAngles(time) {
  const wave = Math.sin(time * 0.0014);
  const sway = Math.sin(time * 0.0008);
  return {
    torso: originalAngles.torso + sway * 0.035,
    shoulderLine: originalAngles.shoulderLine + sway * 0.03,
    hipLine: originalAngles.hipLine - sway * 0.025,
    upperL: originalAngles.upperL - wave * 0.4,
    upperR: originalAngles.upperR + Math.sin(time * 0.0011) * 0.12,
    lowerL: originalAngles.lowerL - wave * 0.26,
    lowerR: originalAngles.lowerR + Math.sin(time * 0.0011) * 0.08,
    handL: originalAngles.handL - wave * 0.18,
    handR: originalAngles.handR,
    thighL: originalAngles.thighL + sway * 0.04,
    thighR: originalAngles.thighR + sway * 0.04,
    shinL: originalAngles.shinL,
    shinR: originalAngles.shinR,
    footL: originalAngles.footL,
    footR: originalAngles.footR,
    head: originalAngles.torso - sway * 0.09,
  };
}

const RIG_TEST_POSES = {
  tpose: {
    angles: { upperL: Math.PI, upperR: 0, lowerL: Math.PI, lowerR: 0, handL: Math.PI, handR: 0 },
    lengths: {},
  },
  folded: {
    angles: { upperL: 2.55, upperR: 0.59, lowerL: -1.88, lowerR: -1.26, handL: -1.6, handR: -1.54 },
    lengths: { upperL: 1.18, upperR: 1.18, lowerL: 0.84, lowerR: 0.84 },
  },
  crouch: {
    angles: { thighL: 2.18, thighR: 0.96, shinL: 1.02, shinR: 2.12, footL: 0.12, footR: Math.PI - 0.12 },
    lengths: { thighL: 0.86, thighR: 0.86, shinL: 1.2, shinR: 1.2 },
  },
  stretch: {
    angles: { upperL: -2.72, upperR: -0.42, lowerL: -2.94, lowerR: -0.2, thighL: 1.82, thighR: 1.32 },
    lengths: { upperL: 1.28, upperR: 1.28, lowerL: 1.25, lowerR: 1.25, thighL: 1.18, thighR: 1.18 },
  },
  maxbend: {
    angles: {
      torso: originalAngles.torso + 0.12,
      head: -2.1,
      shoulderLine: 0.08,
      hipLine: -0.06,
      upperL: 2.68,
      upperR: 0.46,
      lowerL: -0.42,
      lowerR: -2.72,
      handL: 1.12,
      handR: 2.02,
      thighL: 2.36,
      thighR: 0.78,
      shinL: 0.28,
      shinR: 2.86,
      footL: 2.05,
      footR: 1.09,
    },
    lengths: {
      upperL: 0.92,
      upperR: 0.92,
      lowerL: 0.9,
      lowerR: 0.9,
      thighL: 0.9,
      thighR: 0.9,
      shinL: 0.9,
      shinR: 0.9,
    },
  },
  rightangle: {
    angles: {
      shoulderLine: 0,
      hipLine: 0,
      upperL: Math.PI,
      upperR: 0,
      lowerL: Math.PI / 2,
      lowerR: Math.PI / 2,
      handL: Math.PI / 2,
      handR: Math.PI / 2,
      thighL: Math.PI / 2,
      thighR: Math.PI / 2,
      shinL: Math.PI,
      shinR: 0,
      footL: Math.PI / 2,
      footR: Math.PI / 2,
    },
    lengths: {},
  },
};

function requestedRigTestPose() {
  const name = new URLSearchParams(window.location.search).get("rigPose");
  const preset = RIG_TEST_POSES[name];
  if (!preset) return null;
  return {
    angles: { ...originalAngles, ...preset.angles },
    lengths: { ...Object.fromEntries(Object.keys(TRACKED_SEGMENTS).map((key) => [key, 1])), ...preset.lengths },
  };
}

function fitRigToStage(rig, width, height) {
  const pointKeys = [
    "root", "shoulderCenter", "shoulderL", "shoulderR", "elbowL", "elbowR",
    "wristL", "wristR", "handL", "handR", "hipL", "hipR", "kneeL", "kneeR",
    "ankleL", "ankleR", "toeL", "toeR", "neck", "head",
  ];
  const points = pointKeys.map((key) => rig[key]);
  const margin = 128 * rig.scale;
  const minX = Math.min(...points.map((point) => point.x)) - margin;
  const maxX = Math.max(...points.map((point) => point.x)) + margin;
  const minY = Math.min(...points.map((point) => point.y)) - margin;
  const maxY = Math.max(...points.map((point) => point.y)) + margin;
  const padding = 18;
  const fit = Math.min(
    1,
    (width - padding * 2) / Math.max(1, maxX - minX),
    (height - padding * 2) / Math.max(1, maxY - minY),
  );
  const boundsCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

  pointKeys.forEach((key) => {
    rig[key] = {
      x: boundsCenter.x + (rig[key].x - boundsCenter.x) * fit,
      y: boundsCenter.y + (rig[key].y - boundsCenter.y) * fit,
    };
  });
  rig.scale *= fit;

  const fittedMargin = margin * fit;
  const fittedMinX = boundsCenter.x + (minX + margin - boundsCenter.x) * fit - fittedMargin;
  const fittedMaxX = boundsCenter.x + (maxX - margin - boundsCenter.x) * fit + fittedMargin;
  const fittedMinY = boundsCenter.y + (minY + margin - boundsCenter.y) * fit - fittedMargin;
  const fittedMaxY = boundsCenter.y + (maxY - margin - boundsCenter.y) * fit + fittedMargin;
  const offsetX = fittedMinX < padding
    ? padding - fittedMinX
    : fittedMaxX > width - padding ? width - padding - fittedMaxX : 0;
  const offsetY = fittedMinY < padding
    ? padding - fittedMinY
    : fittedMaxY > height - padding ? height - padding - fittedMaxY : 0;
  if (offsetX || offsetY) {
    pointKeys.forEach((key) => {
      rig[key].x += offsetX;
      rig[key].y += offsetY;
    });
  }
}

function buildRig(angles, poseRoot = null, lengthScales = {}) {
  const { width, height } = state.canvasSize;
  // A horizontal T-pose is wider than the neutral source canvas. Reserve that
  // extra width and move the root upward so hands and feet stay on the stage.
  const scale = Math.min(width / 1420, height / IMAGE_HEIGHT) * 0.94;
  const scaledLength = (key, start, end) => (
    vectorLength(REST[start], REST[end]) * scale * clamp(lengthScales[key] ?? 1, 0.78, 1.28)
  );
  let root = { x: width / 2, y: height * 0.49 };

  if (poseRoot) {
    if (!state.calibrationRoot) state.calibrationRoot = { ...poseRoot };
    const wanted = {
      x: root.x + (poseRoot.x - state.calibrationRoot.x) * width * 0.46,
      y: root.y + (poseRoot.y - state.calibrationRoot.y) * height * 0.28,
    };
    state.filteredRoot ??= wanted;
    state.filteredRoot.x += (wanted.x - state.filteredRoot.x) * 0.12;
    state.filteredRoot.y += (wanted.y - state.filteredRoot.y) * 0.12;
    root = { ...state.filteredRoot };
  } else {
    state.filteredRoot = null;
  }

  const shoulderCenter = pointFrom(root, angles.torso, vectorLength(REST.root, REST.shoulderCenter) * scale);
  const shoulderHalf = vectorLength(REST.shoulderL, REST.shoulderR) * scale / 2;
  const hipHalf = vectorLength(REST.hipL, REST.hipR) * scale / 2;
  const shoulderL = pointFrom(shoulderCenter, angles.shoulderLine + Math.PI, shoulderHalf);
  const shoulderR = pointFrom(shoulderCenter, angles.shoulderLine, shoulderHalf);
  const hipL = pointFrom(root, angles.hipLine + Math.PI, hipHalf);
  const hipR = pointFrom(root, angles.hipLine, hipHalf);
  const elbowL = pointFrom(shoulderL, angles.upperL, scaledLength("upperL", "shoulderL", "elbowL"));
  const elbowR = pointFrom(shoulderR, angles.upperR, scaledLength("upperR", "shoulderR", "elbowR"));
  const wristL = pointFrom(elbowL, angles.lowerL, scaledLength("lowerL", "elbowL", "wristL"));
  const wristR = pointFrom(elbowR, angles.lowerR, scaledLength("lowerR", "elbowR", "wristR"));
  const handL = pointFrom(wristL, angles.handL, scaledLength("handL", "wristL", "handL"));
  const handR = pointFrom(wristR, angles.handR, scaledLength("handR", "wristR", "handR"));
  const kneeL = pointFrom(hipL, angles.thighL, scaledLength("thighL", "hipL", "kneeL"));
  const kneeR = pointFrom(hipR, angles.thighR, scaledLength("thighR", "hipR", "kneeR"));
  const ankleL = pointFrom(kneeL, angles.shinL, scaledLength("shinL", "kneeL", "ankleL"));
  const ankleR = pointFrom(kneeR, angles.shinR, scaledLength("shinR", "kneeR", "ankleR"));
  const toeL = pointFrom(ankleL, angles.footL, scaledLength("footL", "ankleL", "toeL"));
  const toeR = pointFrom(ankleR, angles.footR, scaledLength("footR", "ankleR", "toeR"));
  const neck = pointFrom(shoulderCenter, angles.torso, vectorLength(REST.neck, REST.shoulderCenter) * scale);
  const head = pointFrom(neck, angles.head, vectorLength(REST.neck, REST.head) * scale);

  const rig = {
    scale,
    root,
    shoulderCenter,
    shoulderL,
    shoulderR,
    elbowL,
    elbowR,
    wristL,
    wristR,
    handL,
    handR,
    hipL,
    hipR,
    kneeL,
    kneeR,
    ankleL,
    ankleR,
    toeL,
    toeR,
    neck,
    head,
    angles,
    lengthScales,
  };
  fitRigToStage(rig, width, height);
  return rig;
}

function makeTextureCanvas(partData, texture) {
  const { canvas } = partData;
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext("2d");
  const ratio = Math.max(output.width / texture.width, output.height / texture.height);
  const width = texture.width * ratio;
  const height = texture.height * ratio;
  context.drawImage(texture, (output.width - width) / 2, (output.height - height) / 2, width, height);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(canvas, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 0.38;
  context.drawImage(canvas, 0, 0);
  return output;
}

function clipTaperedSegment(context, start, end, startRadius, endRadius) {
  const angle = angleBetween(start, end);
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  context.beginPath();
  context.moveTo(start.x + normal.x * startRadius, start.y + normal.y * startRadius);
  context.lineTo(end.x + normal.x * endRadius, end.y + normal.y * endRadius);
  context.lineTo(end.x - normal.x * endRadius, end.y - normal.y * endRadius);
  context.lineTo(start.x - normal.x * startRadius, start.y - normal.y * startRadius);
  context.closePath();
  context.clip();
}

function drawPartBetweenJoints(part, data, drawable, rig, setting) {
  const sourceStart = REST[part.anchor];
  const sourceEnd = REST[part.end];
  const targetStart = rig[part.anchor];
  const targetEnd = rig[part.end];
  const sourceDx = sourceEnd.x - sourceStart.x;
  const sourceDy = sourceEnd.y - sourceStart.y;
  const targetDx = targetEnd.x - targetStart.x;
  const targetDy = targetEnd.y - targetStart.y;
  const sourceLength = Math.hypot(sourceDx, sourceDy);
  const targetLength = Math.hypot(targetDx, targetDy);
  if (sourceLength < 1 || targetLength < 1) return;

  const sourceUnit = { x: sourceDx / sourceLength, y: sourceDy / sourceLength };
  const sourceNormal = { x: -sourceUnit.y, y: sourceUnit.x };
  const targetUnit = { x: targetDx / targetLength, y: targetDy / targetLength };
  const targetNormal = { x: -targetUnit.y, y: targetUnit.x };
  const overlap = (SEGMENT_OVERLAP[part.name] ?? 0) * rig.scale;
  const alongScale = (targetLength + overlap * 2) / sourceLength;
  const acrossScale = rig.scale;
  const extendedStart = {
    x: targetStart.x - targetUnit.x * overlap,
    y: targetStart.y - targetUnit.y * overlap,
  };
  const extendedEnd = {
    x: targetEnd.x + targetUnit.x * overlap,
    y: targetEnd.y + targetUnit.y * overlap,
  };

  // Affine map from the source bone basis to the current pair of joint points.
  const a = targetUnit.x * alongScale * sourceUnit.x
    + targetNormal.x * acrossScale * sourceNormal.x;
  const b = targetUnit.y * alongScale * sourceUnit.x
    + targetNormal.y * acrossScale * sourceNormal.x;
  const c = targetUnit.x * alongScale * sourceUnit.y
    + targetNormal.x * acrossScale * sourceNormal.y;
  const d = targetUnit.y * alongScale * sourceUnit.y
    + targetNormal.y * acrossScale * sourceNormal.y;
  const e = extendedStart.x - a * sourceStart.x - c * sourceStart.y;
  const f = extendedStart.y - b * sourceStart.x - d * sourceStart.y;

  avatarContext.save();
  const clipRadii = SEGMENT_CLIP_RADII[part.name];
  if (clipRadii) {
    clipTaperedSegment(
      avatarContext,
      extendedStart,
      extendedEnd,
      clipRadii[0] * rig.scale,
      clipRadii[1] * rig.scale,
    );
  }
  avatarContext.transform(a, b, c, d, e, f);
  avatarContext.globalAlpha = setting.opacity / 100;
  avatarContext.filter = `hue-rotate(${setting.hue}deg) saturate(${setting.saturation}%) brightness(${setting.brightness}%)`;
  avatarContext.drawImage(drawable, data.minX, data.minY);
  avatarContext.restore();
}

function drawPart(part, rig) {
  const data = state.partCanvases.get(part.name);
  if (!data) return;
  const setting = state.settings[part.group];
  const targetAnchor = rig[part.anchor];
  const sourceAnchor = REST[part.anchor];
  const sourceAngle = part.angleSource ?? angleBetween(REST[part.anchor], REST[part.end]);
  let targetAngle;

  if (part.name === "torso") targetAngle = rig.angles.torso;
  else if (part.name === "pelvis") targetAngle = rig.angles.hipLine;
  else if (part.name === "head") targetAngle = rig.angles.head;
  else targetAngle = angleBetween(rig[part.anchor], rig[part.end]);

  const texture = state.textures[part.group];
  if (texture && !data.textureCanvases?.has(texture)) {
    data.textureCanvases ??= new Map();
    data.textureCanvases.set(texture, makeTextureCanvas(data, texture));
  }
  const drawable = texture ? data.textureCanvases.get(texture) : data.canvas;

  if (part.end && Object.hasOwn(SEGMENT_OVERLAP, part.name)) {
    drawPartBetweenJoints(part, data, drawable, rig, setting);
    return;
  }

  avatarContext.save();
  avatarContext.translate(targetAnchor.x, targetAnchor.y);
  avatarContext.rotate(targetAngle - sourceAngle);
  avatarContext.scale(rig.scale, rig.scale);
  avatarContext.globalAlpha = setting.opacity / 100;
  avatarContext.filter = `hue-rotate(${setting.hue}deg) saturate(${setting.saturation}%) brightness(${setting.brightness}%)`;
  avatarContext.drawImage(drawable, -(sourceAnchor.x - data.minX), -(sourceAnchor.y - data.minY));
  avatarContext.restore();
}

function drawJointSprite(joint, rig) {
  const data = state.jointCanvases.get(joint.name);
  if (!data) return;
  const setting = state.settings[joint.group];
  const texture = state.textures[joint.group];
  if (texture && !data.textureCanvases?.has(texture)) {
    data.textureCanvases ??= new Map();
    data.textureCanvases.set(texture, makeTextureCanvas(data, texture));
  }
  const drawable = texture ? data.textureCanvases.get(texture) : data.canvas;
  const target = rig[joint.key];
  const sourceAngle = joint.angleKey === "head"
    ? angleBetween(REST.neck, REST.head)
    : originalAngles[joint.angleKey];
  const targetAngle = joint.fixedRotation ? sourceAngle : rig.angles[joint.angleKey];

  avatarContext.save();
  avatarContext.translate(target.x, target.y);
  avatarContext.rotate(targetAngle - sourceAngle);
  avatarContext.scale(rig.scale, rig.scale);
  avatarContext.globalAlpha = setting.opacity / 100;
  avatarContext.filter = `hue-rotate(${setting.hue}deg) saturate(${setting.saturation}%) brightness(${setting.brightness}%)`;
  avatarContext.drawImage(
    drawable,
    -(joint.cx - data.minX),
    -(joint.cy - data.minY),
  );
  avatarContext.restore();
}

function drawJointUnderlays(rig) {
  JOINT_SLEEVES.forEach(({ start, end, length, width, group }) => {
    const from = rig[start];
    const to = rig[end];
    const angle = angleBetween(from, to);
    const sleeveEnd = pointFrom(from, angle, length * rig.scale);
    const setting = state.settings[group];

    avatarContext.save();
    avatarContext.globalAlpha = setting.opacity / 100;
    avatarContext.filter = `hue-rotate(${setting.hue}deg) saturate(${setting.saturation}%) brightness(${setting.brightness}%)`;
    avatarContext.lineCap = "round";
    avatarContext.strokeStyle = "#090d0d";
    avatarContext.lineWidth = width * rig.scale;
    avatarContext.beginPath();
    avatarContext.moveTo(from.x, from.y);
    avatarContext.lineTo(sleeveEnd.x, sleeveEnd.y);
    avatarContext.stroke();
    avatarContext.strokeStyle = "#263130";
    avatarContext.lineWidth = width * rig.scale * 0.52;
    avatarContext.stroke();
    avatarContext.restore();
  });

  JOINT_UNDERLAYS.forEach(({ key, radius, group }) => {
    const point = rig[key];
    const setting = state.settings[group];
    const scaledRadius = radius * rig.scale;
    const gradient = avatarContext.createRadialGradient(
      point.x - scaledRadius * 0.22,
      point.y - scaledRadius * 0.24,
      scaledRadius * 0.08,
      point.x,
      point.y,
      scaledRadius,
    );
    gradient.addColorStop(0, "#52605f");
    gradient.addColorStop(0.46, "#202a2a");
    gradient.addColorStop(0.78, "#101616");
    gradient.addColorStop(1, "#070a0a");

    avatarContext.save();
    avatarContext.globalAlpha = setting.opacity / 100;
    avatarContext.filter = `hue-rotate(${setting.hue}deg) saturate(${setting.saturation}%) brightness(${setting.brightness}%)`;
    avatarContext.fillStyle = gradient;
    avatarContext.strokeStyle = "rgba(126, 229, 222, 0.32)";
    avatarContext.lineWidth = Math.max(1, rig.scale * 3);
    avatarContext.beginPath();
    avatarContext.arc(point.x, point.y, scaledRadius, 0, Math.PI * 2);
    avatarContext.fill();
    avatarContext.stroke();
    avatarContext.restore();
  });
}

function renderAvatar(time) {
  const { width, height } = state.canvasSize;
  avatarContext.clearRect(0, 0, width, height);
  if (!state.avatarReady) return;

  let angles = originalAngles;
  let poseRoot = null;
  let lengthScales = {};
  const testPose = requestedRigTestPose();

  if (testPose) {
    angles = testPose.angles;
    lengthScales = testPose.lengths;
  } else if (state.cameraActive && state.landmarks) {
    const pose = poseAngles(state.landmarks);
    const blend = clamp((100 - state.smoothing) / 100, 0.05, 0.65);
    Object.entries(pose.angles).forEach(([key, value]) => {
      const gained = applyMotionGain(key, value);
      state.filteredAngles[key] = blendAngle(state.filteredAngles[key] ?? gained, gained, blend);
    });
    Object.entries(pose.lengths).forEach(([key, value]) => {
      const gained = 1 + (value - 1) * (state.motion / 100);
      state.filteredLengths[key] += (gained - state.filteredLengths[key]) * blend;
    });
    angles = state.filteredAngles;
    lengthScales = state.filteredLengths;
    poseRoot = pose.root;
  } else if (state.demoActive) {
    angles = demoAngles(time);
  }

  const rig = buildRig(angles, poseRoot, lengthScales);
  drawJointUnderlays(rig);
  RENDER_PARTS.forEach((part) => drawPart(part, rig));
  JOINT_SPRITES.forEach((joint) => drawJointSprite(joint, rig));
}

function drawPoseOverlay(landmarks) {
  const rect = cameraFrame.getBoundingClientRect();
  poseContext.clearRect(0, 0, rect.width, rect.height);
  if (!state.showSkeleton || !landmarks) return;

  poseContext.lineWidth = 2;
  poseContext.strokeStyle = "rgba(121, 214, 202, .8)";
  poseContext.fillStyle = "rgba(241, 245, 243, .95)";

  state.connections.forEach((connection) => {
    const start = landmarks[connection.start];
    const end = landmarks[connection.end];
    if (!start || !end || Math.min(confidence(start), confidence(end)) < 0.35) return;
    poseContext.beginPath();
    poseContext.moveTo(start.x * rect.width, start.y * rect.height);
    poseContext.lineTo(end.x * rect.width, end.y * rect.height);
    poseContext.stroke();
  });

  [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach((index) => {
    const point = landmarks[index];
    if (!point || confidence(point) < 0.35) return;
    poseContext.beginPath();
    poseContext.arc(point.x * rect.width, point.y * rect.height, 3, 0, Math.PI * 2);
    poseContext.fill();
  });
}

let frameCounter = 0;
let frameWindowStarted = performance.now();

async function requestPoseFrame(time) {
  if (!state.cameraActive || !state.modelReady || state.workerBusy || cameraVideo.readyState < 2) return;
  if (time - state.lastDetectionAt < DETECTION_INTERVAL) return;
  state.lastDetectionAt = time;
  state.workerBusy = true;

  try {
    const bitmap = await createImageBitmap(cameraVideo, {
      resizeWidth: 640,
      resizeHeight: 360,
      resizeQuality: "low",
    });
    poseWorker.postMessage({ type: "DETECT", bitmap, timestampMs: time }, [bitmap]);
  } catch (error) {
    state.workerBusy = false;
    console.error(error);
  }
}

function animationLoop(time) {
  renderAvatar(time);
  requestPoseFrame(time);
  frameCounter += 1;
  if (time - frameWindowStarted >= 1000) {
    fpsValue.textContent = String(Math.round(frameCounter * 1000 / (time - frameWindowStarted)));
    frameCounter = 0;
    frameWindowStarted = time;
  }
  requestAnimationFrame(animationLoop);
}

const poseWorker = new Worker(new URL("./pose-worker.js", import.meta.url), { type: "module" });
poseWorker.postMessage({
  type: "INIT",
  wasmRoot: new URL("/mediapipe/wasm", window.location.origin).href,
  modelUrl: new URL("/models/pose_landmarker_lite.task", window.location.origin).href,
});

poseWorker.addEventListener("message", (event) => {
  if (event.data.type === "READY") {
    state.modelReady = true;
    state.connections = event.data.connections ?? [];
    modelStatus.textContent = "모션 엔진 준비 완료";
    modelStatusIndicator.dataset.state = "ready";
    return;
  }

  if (event.data.type === "RESULT") {
    state.workerBusy = false;
    state.landmarks = event.data.landmarks;
    inferenceValue.textContent = `${Math.round(event.data.inferenceMs)} ms`;
    drawPoseOverlay(state.landmarks);

    if (state.landmarks) {
      const keyIndices = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
      const quality = keyIndices.reduce((sum, index) => sum + confidence(state.landmarks[index]), 0) / keyIndices.length;
      qualityValue.textContent = quality > 0.78 ? "좋음" : quality > 0.55 ? "보통" : "낮음";
      trackingMessage.textContent = quality > 0.55 ? "전신 관절을 안정적으로 추적하는 중" : "몸 전체가 카메라에 보이도록 이동하세요";
    } else {
      qualityValue.textContent = "대기";
      trackingMessage.textContent = "몸 전체가 보이도록 카메라 앞에 서세요";
    }
    return;
  }

  if (event.data.type === "ERROR") {
    state.workerBusy = false;
    modelStatus.textContent = event.data.message;
    modelStatusIndicator.dataset.state = "error";
    if (event.data.fatal) state.modelReady = false;
  }
});

poseWorker.addEventListener("error", () => {
  state.workerBusy = false;
  state.modelReady = false;
  modelStatus.textContent = "모션 엔진을 시작하지 못했습니다";
  modelStatusIndicator.dataset.state = "error";
});

async function populateCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
  cameraSelect.replaceChildren(new Option("기본 카메라", ""));
  devices.forEach((device, index) => cameraSelect.add(new Option(device.label || `카메라 ${index + 1}`, device.deviceId)));
  cameraSelect.disabled = devices.length < 2;
}

function stopCamera() {
  state.cameraStream?.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
  state.cameraActive = false;
  state.landmarks = null;
  state.calibrationRoot = null;
  state.filteredRoot = null;
  Object.keys(state.filteredLengths).forEach((key) => { state.filteredLengths[key] = 1; });
  state.workerBusy = false;
  cameraVideo.srcObject = null;
  cameraFrame.dataset.active = "false";
  cameraState.dataset.state = "";
  cameraState.textContent = "연결 안 됨";
  cameraButton.querySelector("span").textContent = "카메라 시작";
  cameraButton.querySelector("i").className = "ph ph-video-camera";
  calibrateButton.disabled = true;
  stageMode.dataset.state = "";
  stageMode.textContent = state.demoActive ? "데모 모션" : "대기";
  trackingMessage.textContent = state.demoActive ? "카메라 없이 움직임을 미리 보는 중" : "카메라를 연결하면 모션 추적을 시작합니다";
  qualityValue.textContent = state.demoActive ? "데모" : "대기";
  drawPoseOverlay(null);
}

async function startCamera(deviceId = cameraSelect.value) {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("이 브라우저는 카메라 연결을 지원하지 않습니다.");
    return;
  }

  cameraButton.disabled = true;
  cameraButton.querySelector("span").textContent = "연결 중";

  try {
    stopCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: deviceId ? undefined : "user",
      },
    });
    state.cameraStream = stream;
    state.cameraActive = true;
    state.demoActive = false;
    cameraVideo.srcObject = stream;
    await cameraVideo.play();
    cameraFrame.dataset.active = "true";
    cameraState.dataset.state = "active";
    cameraState.textContent = "연결됨";
    cameraButton.querySelector("span").textContent = "카메라 종료";
    cameraButton.querySelector("i").className = "ph ph-video-camera-slash";
    calibrateButton.disabled = false;
    demoButton.setAttribute("aria-pressed", "false");
    demoButton.innerHTML = '<i class="ph ph-person-simple-run" aria-hidden="true"></i>데모 시작';
    stageMode.dataset.state = "live";
    stageMode.textContent = "실시간 추적";
    trackingMessage.textContent = "몸 전체가 보이도록 카메라 앞에 서세요";
    await populateCameras();
  } catch (error) {
    stopCamera();
    const denied = error?.name === "NotAllowedError";
    showToast(denied ? "카메라 권한이 필요합니다. 브라우저 설정에서 허용하세요." : "카메라를 연결하지 못했습니다.");
  } finally {
    cameraButton.disabled = false;
  }
}

cameraButton.addEventListener("click", () => state.cameraActive ? stopCamera() : startCamera());
cameraSelect.addEventListener("change", () => {
  if (state.cameraActive) startCamera(cameraSelect.value);
});

demoButton.addEventListener("click", () => {
  if (state.cameraActive) stopCamera();
  state.demoActive = !state.demoActive;
  demoButton.setAttribute("aria-pressed", String(state.demoActive));
  demoButton.innerHTML = state.demoActive
    ? '<i class="ph ph-person-simple-run" aria-hidden="true"></i>데모 멈춤'
    : '<i class="ph ph-person-simple-run" aria-hidden="true"></i>데모 시작';
  stageMode.textContent = state.demoActive ? "데모 모션" : "대기";
  trackingMessage.textContent = state.demoActive ? "카메라 없이 움직임을 미리 보는 중" : "카메라를 연결하면 모션 추적을 시작합니다";
  qualityValue.textContent = state.demoActive ? "데모" : "대기";
});

calibrateButton.addEventListener("click", () => {
  if (!state.landmarks) {
    showToast("먼저 카메라 안에서 전신을 인식시켜 주세요.");
    return;
  }
  const points = state.landmarks.map(mappedLandmark);
  state.calibrationRoot = midpoint(points[23], points[24]);
  state.filteredRoot = null;
  showToast("현재 위치를 캐릭터 중심으로 맞췄습니다.");
});

snapshotButton.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = `kinetic-avatar-${Date.now()}.png`;
  link.href = avatarCanvas.toDataURL("image/png");
  link.click();
  showToast("투명 배경 PNG를 저장했습니다.");
});

function selectedGroups() {
  return state.activeGroup === "all" ? GROUPS : [state.activeGroup];
}

function updateControlDisplay() {
  const sample = state.settings[selectedGroups()[0]];
  ["hue", "saturation", "brightness", "opacity"].forEach((key) => {
    controls[key].value = sample[key];
    outputs[key].value = `${sample[key]}${key === "hue" ? "°" : "%"}`;
  });
  $("#active-part-name").textContent = GROUP_LABELS[state.activeGroup];
  $("#part-image-button").disabled = state.activeGroup === "all";
  $("#clear-part-image").disabled = state.activeGroup === "all" || !state.textures[state.activeGroup];
}

$$('.part-chip').forEach((button) => button.addEventListener("click", () => {
  $$('.part-chip').forEach((item) => item.classList.toggle("is-selected", item === button));
  state.activeGroup = button.dataset.part;
  updateControlDisplay();
}));

["hue", "saturation", "brightness", "opacity"].forEach((key) => {
  controls[key].addEventListener("input", () => {
    const value = Number(controls[key].value);
    selectedGroups().forEach((group) => { state.settings[group][key] = value; });
    outputs[key].value = `${value}${key === "hue" ? "°" : "%"}`;
    $$('.preset').forEach((button) => button.classList.remove("is-selected"));
  });
});

controls.smoothing.addEventListener("input", () => {
  state.smoothing = Number(controls.smoothing.value);
  outputs.smoothing.value = `${state.smoothing}%`;
});

controls.motion.addEventListener("input", () => {
  state.motion = Number(controls.motion.value);
  outputs.motion.value = `${state.motion}%`;
});

const PRESETS = {
  original: { hue: 0, saturation: 100, brightness: 100 },
  arctic: { hue: 28, saturation: 78, brightness: 116 },
  ember: { hue: 305, saturation: 126, brightness: 108 },
  mono: { hue: 0, saturation: 0, brightness: 112 },
};

$$('.avatar-choice').forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.avatar === state.activeAvatar || button.disabled) return;
  $$(".avatar-choice").forEach((item) => { item.disabled = true; });
  loadAvatar(button.dataset.avatar).finally(() => {
    $$(".avatar-choice").forEach((item) => { item.disabled = false; });
  });
}));

$$('.preset').forEach((button) => button.addEventListener("click", () => {
  const preset = PRESETS[button.dataset.preset];
  GROUPS.forEach((group) => Object.assign(state.settings[group], preset, { opacity: 100 }));
  $$('.preset').forEach((item) => item.classList.toggle("is-selected", item === button));
  updateControlDisplay();
}));

$("#part-image-button").addEventListener("click", () => $("#part-image-input").click());
$("#part-image-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file || state.activeGroup === "all") return;
  const targetGroup = state.activeGroup;
  const objectUrl = URL.createObjectURL(file);
  const texture = new Image();
  texture.addEventListener("load", () => {
    if (state.textures[targetGroup]?.objectUrl) URL.revokeObjectURL(state.textures[targetGroup].objectUrl);
    texture.objectUrl = objectUrl;
    state.textures[targetGroup] = texture;
    updateControlDisplay();
    showToast(`${GROUP_LABELS[targetGroup]}에 이미지를 적용했습니다.`);
  });
  texture.addEventListener("error", () => {
    URL.revokeObjectURL(objectUrl);
    showToast("이미지 파일을 읽지 못했습니다.");
  });
  texture.src = objectUrl;
  event.target.value = "";
});

$("#clear-part-image").addEventListener("click", () => {
  const texture = state.textures[state.activeGroup];
  if (texture?.objectUrl) URL.revokeObjectURL(texture.objectUrl);
  delete state.textures[state.activeGroup];
  updateControlDisplay();
  showToast("선택 부위의 추가 이미지를 해제했습니다.");
});

function resetProfile() {
  GROUPS.forEach((group) => Object.assign(state.settings[group], { hue: 0, saturation: 100, brightness: 100, opacity: 100 }));
  Object.values(state.textures).forEach((texture) => texture.objectUrl && URL.revokeObjectURL(texture.objectUrl));
  state.textures = {};
  state.smoothing = 72;
  state.motion = 100;
  controls.smoothing.value = "72";
  controls.motion.value = "100";
  outputs.smoothing.value = "72%";
  outputs.motion.value = "100%";
  $$('.preset').forEach((button) => button.classList.toggle("is-selected", button.dataset.preset === "original"));
  loadAvatar(DEFAULT_AVATAR, { silent: true });
  updateControlDisplay();
}

$("#reset-button").addEventListener("click", () => {
  resetProfile();
  localStorage.removeItem(STORAGE_KEY);
  showToast("캐릭터 설정을 초기화했습니다.");
});

$("#save-profile").addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    settings: state.settings,
    smoothing: state.smoothing,
    motion: state.motion,
    mirror: state.mirror,
    showSkeleton: state.showSkeleton,
    activeAvatar: state.activeAvatar,
  }));
  showToast("색상과 모션 설정을 이 브라우저에 저장했습니다.");
});

function restoreProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    GROUPS.forEach((group) => {
      if (saved.settings?.[group]) Object.assign(state.settings[group], saved.settings[group]);
    });
    state.smoothing = saved.smoothing ?? state.smoothing;
    state.motion = saved.motion ?? state.motion;
    state.mirror = saved.mirror ?? state.mirror;
    state.showSkeleton = saved.showSkeleton ?? state.showSkeleton;
    if (AVATARS[saved.activeAvatar]) state.activeAvatar = saved.activeAvatar;
    controls.smoothing.value = String(state.smoothing);
    controls.motion.value = String(state.motion);
    outputs.smoothing.value = `${state.smoothing}%`;
    outputs.motion.value = `${state.motion}%`;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function applyMirrorState() {
  [cameraVideo, poseOverlay].forEach((element) => element.classList.toggle("is-mirrored", state.mirror));
  $("#mirror-toggle").checked = state.mirror;
}

$("#mirror-toggle").addEventListener("change", (event) => {
  state.mirror = event.target.checked;
  state.calibrationRoot = null;
  applyMirrorState();
});

$("#skeleton-toggle").addEventListener("change", (event) => {
  state.showSkeleton = event.target.checked;
  drawPoseOverlay(state.landmarks);
});

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("kinetic-avatar-theme", theme);
  themeToggle.querySelector("i").className = theme === "dark" ? "ph ph-sun" : "ph ph-moon";
  themeToggle.setAttribute("aria-label", theme === "dark" ? "밝은 테마로 변경" : "어두운 테마로 변경");
}

themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

const savedTheme = localStorage.getItem("kinetic-avatar-theme");
setTheme(savedTheme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
restoreProfile();
loadAvatar(state.activeAvatar, { silent: true });
applyMirrorState();
$("#skeleton-toggle").checked = state.showSkeleton;
updateControlDisplay();
resizeCanvases();
requestAnimationFrame(animationLoop);

window.addEventListener("beforeunload", () => {
  stopCamera();
  poseWorker.terminate();
  Object.values(state.textures).forEach((texture) => texture.objectUrl && URL.revokeObjectURL(texture.objectUrl));
}, { once: true });
