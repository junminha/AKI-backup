/* ═══════════════════════════════════════════════════════════
   MediaPipe Bench
   Eight MediaPipe Tasks Vision models over one live camera.
   Every model is a "channel": toggling it on loads it once, draws a
   coloured trace on the video, and streams its numbers to the readout.
   ═══════════════════════════════════════════════════════════ */

import {
  FilesetResolver,
  FaceDetector,
  FaceLandmarker,
  HandLandmarker,
  GestureRecognizer,
  PoseLandmarker,
  ObjectDetector,
  ImageSegmenter,
  ImageClassifier,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_ROOT = "https://storage.googleapis.com/mediapipe-models";

/* ── skeleton topologies (kept local so a library rename cannot break drawing) ── */

const HAND_CONN = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const POSE_CONN = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32],
  [27, 31], [28, 32],
];

/* ── canvas plumbing ──────────────────────────────────────────────────────── */

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const g = overlay.getContext("2d");

/** Offscreen buffer the segmenter paints into, reused every frame. */
const maskCanvas = document.createElement("canvas");
const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
let maskImage = null;
let maskReady = false;

const state = {
  mirror: true,
  live: false,
  stream: null,
  vision: null,
  visionPromise: null,
  backend: "GPU",
  lastVideoTime: -1,
  fps: 0,
  inferMs: 0,
};

/** Normalised x, already flipped when the mirror is on. */
const nx = (x) => (state.mirror ? 1 - x : x) * overlay.width;
const ny = (y) => y * overlay.height;
/** Pixel x in source-image space, flipped when the mirror is on. */
const px = (x) => (state.mirror ? overlay.width - x : x);

/** Stroke scale so line weight stays constant on screen at any capture size. */
let S = 1;

function dot(x, y, r, color) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

function link(pts, conns, color, w) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = "round";
  g.beginPath();
  for (const c of conns) {
    const a = pts[c[0] ?? c.start];
    const b = pts[c[1] ?? c.end];
    if (!a || !b) continue;
    g.moveTo(nx(a.x), ny(a.y));
    g.lineTo(nx(b.x), ny(b.y));
  }
  g.stroke();
}

/** Bracket-cornered box plus a tag. Boxes are in source-pixel space. */
function box(x, y, w, h, color, label) {
  const x0 = state.mirror ? px(x + w) : x;
  const arm = Math.min(w, h) * 0.22;

  g.strokeStyle = color;
  g.lineWidth = 2 * S;
  g.beginPath();
  g.moveTo(x0, y + arm); g.lineTo(x0, y); g.lineTo(x0 + arm, y);
  g.moveTo(x0 + w - arm, y); g.lineTo(x0 + w, y); g.lineTo(x0 + w, y + arm);
  g.moveTo(x0 + w, y + h - arm); g.lineTo(x0 + w, y + h); g.lineTo(x0 + w - arm, y + h);
  g.moveTo(x0 + arm, y + h); g.lineTo(x0, y + h); g.lineTo(x0, y + h - arm);
  g.stroke();

  if (!label) return;
  const fs = Math.max(11, 13 * S);
  g.font = `500 ${fs}px "IBM Plex Mono", monospace`;
  const tw = g.measureText(label).width;
  const ty = y - fs * 1.5 < 0 ? y + h + 4 * S : y - fs * 1.5 - 4 * S;
  g.fillStyle = color;
  g.fillRect(x0, ty, tw + fs * 0.9, fs * 1.5);
  g.fillStyle = "#0E1114";
  g.textBaseline = "middle";
  g.fillText(label, x0 + fs * 0.45, ty + fs * 0.8);
}

/* ── channels ─────────────────────────────────────────────────────────────── */

const pct = (v) => `${(v * 100).toFixed(1)}%`;

const channels = [
  {
    id: "face-detect",
    name: "얼굴 검출",
    api: "FaceDetector",
    detail: "BlazeFace short-range · 눈코입 6점",
    color: "#E8442F",
    async make(v) {
      return FaceDetector.createFromOptions(v, {
        baseOptions: { modelAssetPath: `${MODEL_ROOT}/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`, delegate: state.backend },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });
    },
    run: (inst, ts) => inst.detectForVideo(video, ts),
    draw(r, color) {
      for (const d of r.detections ?? []) {
        const b = d.boundingBox;
        box(b.originX, b.originY, b.width, b.height, color, `face ${pct(d.categories?.[0]?.score ?? 0)}`);
        for (const k of d.keypoints ?? []) dot(nx(k.x), ny(k.y), 3 * S, color);
      }
    },
    read(r) {
      const ds = r.detections ?? [];
      if (!ds.length) return { meta: "0", rows: [] };
      return {
        meta: `${ds.length}개`,
        rows: ds.map((d, i) => ({
          k: `얼굴 ${i + 1} · ${Math.round(d.boundingBox.width)}×${Math.round(d.boundingBox.height)}px`,
          v: pct(d.categories?.[0]?.score ?? 0),
          p: d.categories?.[0]?.score ?? 0,
        })),
      };
    },
  },

  {
    id: "face-mesh",
    name: "얼굴 메시",
    api: "FaceLandmarker",
    detail: "478 랜드마크 · 52 블렌드셰이프",
    color: "#00C2A8",
    async make(v) {
      return FaceLandmarker.createFromOptions(v, {
        baseOptions: { modelAssetPath: `${MODEL_ROOT}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: state.backend },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: true,
      });
    },
    run: (inst, ts) => inst.detectForVideo(video, ts),
    draw(r, color) {
      const tess = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
      const oval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
      const lips = FaceLandmarker.FACE_LANDMARKS_LIPS;
      const irisL = FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS;
      const irisR = FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS;
      for (const lm of r.faceLandmarks ?? []) {
        if (tess) { g.globalAlpha = 0.22; link(lm, tess, color, 0.7 * S); g.globalAlpha = 1; }
        if (oval) link(lm, oval, color, 1.6 * S);
        if (lips) link(lm, lips, color, 1.6 * S);
        if (irisL) link(lm, irisL, color, 1.6 * S);
        if (irisR) link(lm, irisR, color, 1.6 * S);
      }
    },
    read(r) {
      const faces = r.faceLandmarks ?? [];
      if (!faces.length) return { meta: "0", rows: [] };
      const bs = r.faceBlendshapes?.[0]?.categories ?? [];
      const top = bs
        .filter((c) => c.categoryName !== "_neutral")
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      return {
        meta: `${faces.length}명 · ${faces[0].length}점`,
        rows: top.map((c) => ({ k: c.categoryName, v: pct(c.score), p: c.score })),
      };
    },
  },

  {
    id: "hands",
    name: "손 랜드마크",
    api: "HandLandmarker",
    detail: "손당 21점 · 좌우 판별",
    color: "#FFB000",
    async make(v) {
      return HandLandmarker.createFromOptions(v, {
        baseOptions: { modelAssetPath: `${MODEL_ROOT}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: state.backend },
        runningMode: "VIDEO",
        numHands: 2,
      });
    },
    run: (inst, ts) => inst.detectForVideo(video, ts),
    draw(r, color) {
      for (const lm of r.landmarks ?? []) {
        link(lm, HAND_CONN, color, 3 * S);
        for (const p of lm) dot(nx(p.x), ny(p.y), 3.4 * S, "#0E1114");
        for (const p of lm) dot(nx(p.x), ny(p.y), 2.2 * S, color);
      }
    },
    read(r) {
      const hands = r.landmarks ?? [];
      if (!hands.length) return { meta: "0", rows: [] };
      return {
        meta: `${hands.length}개`,
        rows: hands.map((lm, i) => {
          const h = r.handedness?.[i]?.[0];
          const side = h?.categoryName === "Left" ? "왼손" : h?.categoryName === "Right" ? "오른손" : "손";
          const tip = lm[8];
          return {
            k: `${side} · 검지끝 x${tip.x.toFixed(2)} y${tip.y.toFixed(2)}`,
            v: pct(h?.score ?? 0),
            p: h?.score ?? 0,
          };
        }),
      };
    },
  },

  {
    id: "gesture",
    name: "제스처 인식",
    api: "GestureRecognizer",
    detail: "따봉, 브이, 주먹 등 7종",
    color: "#C64BE8",
    async make(v) {
      return GestureRecognizer.createFromOptions(v, {
        baseOptions: { modelAssetPath: `${MODEL_ROOT}/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task`, delegate: state.backend },
        runningMode: "VIDEO",
        numHands: 2,
      });
    },
    run: (inst, ts) => inst.recognizeForVideo(video, ts),
    draw(r, color) {
      (r.landmarks ?? []).forEach((lm, i) => {
        const name = r.gestures?.[i]?.[0]?.categoryName;
        if (!name || name === "None") return;
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const p of lm) {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        }
        const pad = 0.03;
        const x = (minX - pad) * overlay.width;
        const y = (minY - pad) * overlay.height;
        const w = (maxX - minX + pad * 2) * overlay.width;
        const h = (maxY - minY + pad * 2) * overlay.height;
        box(x, y, w, h, color, name);
      });
    },
    read(r) {
      const gs = r.gestures ?? [];
      if (!gs.length) return { meta: "0", rows: [] };
      return {
        meta: `${gs.length}개`,
        rows: gs.map((cats, i) => {
          const c = cats[0];
          const h = r.handedness?.[i]?.[0]?.categoryName;
          const side = h === "Left" ? "왼손" : h === "Right" ? "오른손" : "손";
          return { k: `${side} · ${c?.categoryName ?? "None"}`, v: pct(c?.score ?? 0), p: c?.score ?? 0 };
        }),
      };
    },
  },

  {
    id: "pose",
    name: "전신 포즈",
    api: "PoseLandmarker",
    detail: "33점 스켈레톤 · lite 모델",
    color: "#2D7DFF",
    async make(v) {
      return PoseLandmarker.createFromOptions(v, {
        baseOptions: { modelAssetPath: `${MODEL_ROOT}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`, delegate: state.backend },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    },
    run: (inst, ts) => inst.detectForVideo(video, ts),
    draw(r, color) {
      for (const lm of r.landmarks ?? []) {
        link(lm, POSE_CONN, color, 3.4 * S);
        for (const p of lm) {
          if ((p.visibility ?? 1) < 0.5) continue;
          dot(nx(p.x), ny(p.y), 4 * S, "#0E1114");
          dot(nx(p.x), ny(p.y), 2.6 * S, color);
        }
      }
    },
    read(r) {
      const poses = r.landmarks ?? [];
      if (!poses.length) return { meta: "0", rows: [] };
      const lm = poses[0];
      const named = [["코", 0], ["왼어깨", 11], ["오른어깨", 12], ["왼손목", 15], ["오른손목", 16]];
      return {
        meta: `${lm.length}점`,
        rows: named.map(([k, i]) => ({
          k: `${k} · x${lm[i].x.toFixed(2)} y${lm[i].y.toFixed(2)}`,
          v: pct(lm[i].visibility ?? 0),
          p: lm[i].visibility ?? 0,
        })),
      };
    },
  },

  {
    id: "objects",
    name: "사물 검출",
    api: "ObjectDetector",
    detail: "EfficientDet-Lite0 · COCO 80종",
    color: "#7BD836",
    async make(v) {
      return ObjectDetector.createFromOptions(v, {
        baseOptions: { modelAssetPath: `${MODEL_ROOT}/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`, delegate: state.backend },
        runningMode: "VIDEO",
        scoreThreshold: 0.4,
        maxResults: 6,
      });
    },
    run: (inst, ts) => inst.detectForVideo(video, ts),
    draw(r, color) {
      for (const d of r.detections ?? []) {
        const b = d.boundingBox;
        const c = d.categories?.[0];
        box(b.originX, b.originY, b.width, b.height, color, `${c?.categoryName ?? "?"} ${pct(c?.score ?? 0)}`);
      }
    },
    read(r) {
      const ds = r.detections ?? [];
      if (!ds.length) return { meta: "0", rows: [] };
      return {
        meta: `${ds.length}개`,
        rows: ds.map((d) => ({
          k: d.categories?.[0]?.categoryName ?? "?",
          v: pct(d.categories?.[0]?.score ?? 0),
          p: d.categories?.[0]?.score ?? 0,
        })),
      };
    },
  },

  {
    id: "segment",
    name: "인물 분리",
    api: "ImageSegmenter",
    detail: "SelfieSegmenter · 픽셀 단위 마스크",
    color: "#FF5FA2",
    async make(v) {
      return ImageSegmenter.createFromOptions(v, {
        baseOptions: { modelAssetPath: `${MODEL_ROOT}/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite`, delegate: state.backend },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    },
    run(inst, ts) {
      let coverage = 0;
      inst.segmentForVideo(video, ts, (res) => {
        const m = res.categoryMask;
        if (!m) return;
        const w = m.width, h = m.height;
        const src = m.getAsUint8Array();
        // The mask arrives at capture resolution, so reuse one buffer rather
        // than allocating a few megabytes per frame.
        if (maskCanvas.width !== w || maskCanvas.height !== h || !maskImage) {
          maskCanvas.width = w;
          maskCanvas.height = h;
          maskImage = maskCtx.createImageData(w, h);
        }
        const img = maskImage;
        const out = img.data;
        let fg = 0;
        // Selfie segmenter: category 0 is background, 1 is person.
        for (let i = 0, j = 0; i < src.length; i++, j += 4) {
          if (src[i] === 0) {
            out[j] = 255; out[j + 1] = 95; out[j + 2] = 162; out[j + 3] = 110;
          } else {
            out[j + 3] = 0;
            fg++;
          }
        }
        maskCtx.putImageData(img, 0, 0);
        maskReady = true;
        coverage = src.length ? fg / src.length : 0;
        res.close();
      });
      return { coverage };
    },
    draw() {
      if (!maskReady) return;
      g.drawImage(maskCanvas, 0, 0, overlay.width, overlay.height);
    },
    read(r) {
      return {
        meta: maskReady ? `${maskCanvas.width}×${maskCanvas.height}` : "대기",
        rows: [
          { k: "인물 픽셀 비율", v: pct(r.coverage ?? 0), p: r.coverage ?? 0 },
          { k: "배경 픽셀 비율", v: pct(1 - (r.coverage ?? 0)), p: 1 - (r.coverage ?? 0) },
        ],
      };
    },
  },

  {
    id: "classify",
    name: "장면 분류",
    api: "ImageClassifier",
    detail: "EfficientNet-Lite0 · ImageNet 1000종",
    color: "#5B6B7F",
    async make(v) {
      return ImageClassifier.createFromOptions(v, {
        baseOptions: { modelAssetPath: `${MODEL_ROOT}/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite`, delegate: state.backend },
        runningMode: "VIDEO",
        maxResults: 4,
      });
    },
    run: (inst, ts) => inst.classifyForVideo(video, ts),
    draw() { /* numbers only, nothing to trace on the frame */ },
    read(r) {
      const cats = r.classifications?.[0]?.categories ?? [];
      if (!cats.length) return { meta: "0", rows: [] };
      return {
        meta: "상위 4",
        rows: cats.map((c) => ({ k: c.categoryName ?? c.displayName ?? "?", v: pct(c.score), p: c.score })),
      };
    },
  },
];

/** Runtime state per channel: off | loading | on | error. */
const rt = new Map(channels.map((c) => [c.id, { status: "off", inst: null, result: null }]));

/* ── rack ─────────────────────────────────────────────────────────────────── */

const rack = document.getElementById("rack");
const readout = document.getElementById("readout");
const readoutEmpty = document.getElementById("readout-empty");
const readCount = document.getElementById("read-count");

for (const [i, c] of channels.entries()) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "strip";
  b.dataset.state = "off";
  b.dataset.id = c.id;
  b.style.setProperty("--ch", c.color);
  b.setAttribute("aria-pressed", "false");
  b.innerHTML = `
    <span class="strip-body">
      <span class="strip-name">${c.name}</span>
      <span class="strip-api">${c.api}</span>
      <span class="strip-detail">${c.detail}</span>
      <span class="strip-progress"></span>
      <span class="strip-status"></span>
    </span>
    <span class="strip-key">${i + 1}</span>`;
  b.addEventListener("click", () => toggle(c.id));
  rack.appendChild(b);
}

const stripOf = (id) => rack.querySelector(`.strip[data-id="${id}"]`);

function setStrip(id, status, msg = "") {
  const el = stripOf(id);
  el.dataset.state = status;
  el.setAttribute("aria-pressed", String(status === "on"));
  el.querySelector(".strip-status").textContent = msg;
}

async function toggle(id) {
  const s = rt.get(id);
  const c = channels.find((x) => x.id === id);

  if (s.status === "loading") return;

  if (s.status === "on") {
    s.status = "off";
    s.result = null;
    if (id === "segment") maskReady = false;
    setStrip(id, "off");
    syncCounts();
    return;
  }

  if (s.inst) {
    s.status = "on";
    setStrip(id, "on");
    syncCounts();
    return;
  }

  s.status = "loading";
  setStrip(id, "loading", "모델 내려받는 중");
  try {
    const vision = await getVision();
    try {
      s.inst = await c.make(vision);
    } catch (gpuErr) {
      // Some drivers reject the WebGL delegate. Drop to CPU once, for every channel.
      if (state.backend !== "CPU") {
        state.backend = "CPU";
        document.getElementById("s-backend").textContent = "CPU";
        s.inst = await c.make(vision);
      } else {
        throw gpuErr;
      }
    }
    s.status = "on";
    setStrip(id, "on");
  } catch (err) {
    s.status = "error";
    s.inst = null;
    setStrip(id, "error", `불러오기 실패: ${short(err)}. 네트워크를 확인하고 다시 누르세요.`);
  }
  syncCounts();
}

const short = (e) => String(e?.message ?? e).split("\n")[0].slice(0, 90);

function syncCounts() {
  const n = channels.filter((c) => rt.get(c.id).status === "on").length;
  document.getElementById("s-active").textContent = `${n} / ${channels.length}`;
  readCount.textContent = `${n}개 채널`;
  readoutEmpty.hidden = n > 0;
  if (n === 0) readout.textContent = "";
}

document.getElementById("btn-alloff").addEventListener("click", () => {
  for (const c of channels) {
    const s = rt.get(c.id);
    if (s.status === "on") {
      s.status = "off";
      s.result = null;
      setStrip(c.id, "off");
    }
  }
  maskReady = false;
  syncCounts();
});

/* ── MediaPipe runtime, loaded once and shared ────────────────────────────── */

function getVision() {
  if (!state.visionPromise) {
    state.visionPromise = FilesetResolver.forVisionTasks(WASM_ROOT).then((v) => {
      state.vision = v;
      return v;
    }).catch((e) => {
      state.visionPromise = null;
      throw e;
    });
  }
  return state.visionPromise;
}

/* ── camera ───────────────────────────────────────────────────────────────── */

const viewport = document.getElementById("viewport");
const btnCamera = document.getElementById("btn-camera");
const btnSnap = document.getElementById("btn-snap");
const btnMirror = document.getElementById("btn-mirror");
const vpError = document.getElementById("vp-error");
const vpErrorTitle = document.getElementById("vp-error-title");
const vpErrorBody = document.getElementById("vp-error-body");

const CAM_ERRORS = {
  NotAllowedError: ["카메라 권한이 거부되었습니다", "주소창의 카메라 아이콘에서 이 사이트를 허용으로 바꾼 뒤 다시 시도하세요."],
  NotFoundError: ["연결된 카메라가 없습니다", "웹캠을 연결하고 다시 시도하세요."],
  NotReadableError: ["다른 앱이 카메라를 쓰고 있습니다", "Zoom, Teams 같은 앱을 닫고 다시 시도하세요."],
  OverconstrainedError: ["요청한 해상도를 지원하지 않습니다", "다른 카메라를 선택하거나 기본 해상도로 다시 시도하세요."],
  NotSupportedError: ["보안 컨텍스트가 아닙니다", "http://localhost 또는 https 주소로 열어야 카메라가 열립니다. file:// 로 연 페이지에서는 동작하지 않습니다."],
  SecurityError: ["보안 컨텍스트가 아닙니다", "http://localhost 또는 https 주소로 열어야 카메라가 열립니다. file:// 로 연 페이지에서는 동작하지 않습니다."],
};

async function startCamera() {
  if (state.live) return;
  vpError.hidden = true;

  if (!navigator.mediaDevices?.getUserMedia) {
    showCamError("이 브라우저에서는 카메라를 열 수 없습니다", "http://localhost 또는 https 주소에서 최신 Chrome이나 Edge로 열어 주세요. file:// 로 연 페이지는 카메라를 쓸 수 없습니다.");
    return;
  }

  btnCamera.disabled = true;
  btnCamera.textContent = "여는 중";
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = state.stream;
    await video.play();
    state.live = true;
    viewport.dataset.live = "true";
    btnCamera.textContent = "카메라 끄기";
    btnSnap.disabled = false;
  } catch (err) {
    const [t, b] = CAM_ERRORS[err?.name] ?? ["카메라를 열지 못했습니다", short(err)];
    showCamError(t, b);
    btnCamera.textContent = "카메라 켜기";
  } finally {
    btnCamera.disabled = false;
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  video.srcObject = null;
  state.live = false;
  state.lastVideoTime = -1;
  viewport.dataset.live = "false";
  btnCamera.textContent = "카메라 켜기";
  btnSnap.disabled = true;
  g.clearRect(0, 0, overlay.width, overlay.height);
  maskReady = false;
}

function showCamError(title, body) {
  vpErrorTitle.textContent = title;
  vpErrorBody.textContent = body;
  vpError.hidden = false;
  // The idle panel is only hidden by the live state, so without this the two
  // panels sit side by side inside the viewport.
  document.getElementById("vp-idle").hidden = true;
}

btnCamera.addEventListener("click", () => (state.live ? stopCamera() : startCamera()));
for (const el of document.querySelectorAll("[data-camera-start]")) {
  el.addEventListener("click", startCamera);
}

btnMirror.addEventListener("click", () => setMirror(!state.mirror));
function setMirror(on) {
  state.mirror = on;
  btnMirror.setAttribute("aria-pressed", String(on));
  viewport.dataset.mirror = String(on);
}
setMirror(true);

btnSnap.addEventListener("click", () => {
  if (!state.live || !overlay.width) return;
  const out = document.createElement("canvas");
  out.width = overlay.width;
  out.height = overlay.height;
  const o = out.getContext("2d");
  if (state.mirror) { o.translate(out.width, 0); o.scale(-1, 1); }
  o.drawImage(video, 0, 0, out.width, out.height);
  o.drawImage(overlay, 0, 0);
  const a = document.createElement("a");
  a.download = `mediapipe-bench-${Date.now()}.png`;
  a.href = out.toDataURL("image/png");
  a.click();
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key >= "1" && e.key <= String(channels.length)) {
    toggle(channels[Number(e.key) - 1].id);
  } else if (e.key === "m" || e.key === "M") {
    setMirror(!state.mirror);
  }
});

/* ── render loop ──────────────────────────────────────────────────────────── */

const sFps = document.getElementById("s-fps");
const sRes = document.getElementById("s-res");
const sMs = document.getElementById("s-ms");
document.getElementById("s-backend").textContent = state.backend;

let lastReadoutPaint = 0;
let lastFrameAt = performance.now();

function frame() {
  requestAnimationFrame(frame);
  if (!state.live || video.readyState < 2 || !video.videoWidth) return;

  if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    S = overlay.width / 640;
    sRes.textContent = `${overlay.width}×${overlay.height}`;
  }

  const now = performance.now();
  const dt = now - lastFrameAt;
  lastFrameAt = now;
  state.fps += ((1000 / Math.max(dt, 1)) - state.fps) * 0.1;

  // MediaPipe wants a strictly increasing timestamp, and a new frame each call.
  const fresh = video.currentTime !== state.lastVideoTime;
  if (fresh) state.lastVideoTime = video.currentTime;

  const ts = Math.round(now);
  let spent = 0;

  if (fresh) {
    for (const c of channels) {
      const s = rt.get(c.id);
      if (s.status !== "on") continue;
      const t0 = performance.now();
      try {
        s.result = c.run(s.inst, ts);
      } catch (err) {
        s.status = "error";
        s.result = null;
        setStrip(c.id, "error", `추론 중단: ${short(err)}`);
        syncCounts();
        continue;
      }
      spent += performance.now() - t0;
    }
    state.inferMs += (spent - state.inferMs) * 0.15;
  }

  g.clearRect(0, 0, overlay.width, overlay.height);
  for (const c of channels) {
    const s = rt.get(c.id);
    if (s.status !== "on" || !s.result) continue;
    g.save();
    try { c.draw(s.result, c.color); } catch { /* one bad frame must not stop the loop */ }
    g.restore();
  }

  sFps.textContent = state.fps.toFixed(1);
  sMs.textContent = `${state.inferMs.toFixed(1)} ms`;

  if (now - lastReadoutPaint > 120) {
    lastReadoutPaint = now;
    paintReadout();
  }
}

/* ── readout ──────────────────────────────────────────────────────────────── */

const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));

function paintReadout() {
  const active = channels.filter((c) => rt.get(c.id).status === "on");
  if (!active.length) return;

  const html = active.map((c) => {
    const s = rt.get(c.id);
    let out = { meta: "", rows: [] };
    if (s.result) {
      try { out = c.read(s.result); } catch { out = { meta: "", rows: [] }; }
    }
    // An empty channel shows no count. A bare "0" beside the title reads as data.
    const body = out.rows.length
      ? `<div class="rows">${out.rows.map((r) => `
          <div class="row"><span class="row-k">${esc(r.k)}</span><span class="row-v">${esc(r.v)}</span></div>
          <div class="bar" style="--p:${((r.p ?? 0) * 100).toFixed(1)}%"></div>`).join("")}</div>`
      : `<p class="card-none">${s.result ? "검출 없음" : "첫 프레임 대기 중"}</p>`;
    const meta = out.rows.length ? esc(out.meta) : "";
    return `<article class="card" style="--ch:${c.color}">
        <div class="card-head"><h3 class="card-title">${esc(c.name)}</h3><span class="card-meta">${meta}</span></div>
        ${body}
      </article>`;
  }).join("");

  readout.innerHTML = html;
}

syncCounts();
requestAnimationFrame(frame);

// Handle for the browser console: inspect live results, force a redraw, or
// drive a channel with fabricated input while checking the overlay maths.
window.bench = { channels, rt, state, overlay, ctx: g };
