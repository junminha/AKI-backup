import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  Camera,
  CheckCircle,
  Eye,
  FileImage,
  Gauge,
  ImageSquare,
  LockKey,
  Scan,
  ShieldCheck,
  Sparkle,
  UploadSimple,
  VideoCamera,
  WarningCircle,
  Waveform,
} from "@phosphor-icons/react";
import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { faceQuality, readFrame, summarize, toPayload } from "./face";
import {
  freezeCamera,
  getPrimaryCameraAction,
  isPrimaryCameraActionDisabled,
  resumeCamera,
} from "./cameraPlayback";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

const MAX_PHOTO_SIZE = 12 * 1024 * 1024;
const SAMPLE_WINDOW = 24; // 계측에 사용할 최근 프레임 수

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const percent = (value) => `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;

async function createLandmarker(vision, runningMode) {
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode,
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };

  try {
    return await FaceLandmarker.createFromOptions(vision, options);
  } catch {
    return FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
    });
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

// 판독용 캡처. 640px로 줄여 전송 크기를 줄인다.
function captureImage(source, mode) {
  const width = mode === "photo" ? source?.naturalWidth : source?.videoWidth;
  const height = mode === "photo" ? source?.naturalHeight : source?.videoHeight;
  if (!source || !width || !height) throw new Error("화면을 캡처하지 못했습니다.");

  const maxSide = 640;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

// 개발 전용 데모 데이터. `?demo=1`로 열면 OpenRouter 호출 없이 판독서 레이아웃을 확인할 수 있다.
// 프로덕션 빌드에서는 import.meta.env.DEV가 false라 아예 동작하지 않는다.
const DEMO = {
  result: {
    expression: "진정한 미소",
    summary: "AU6과 AU12가 함께 나타난 자발적인 미소입니다.",
    emotions: [
      { label: "기쁨", score: 0.94 },
      { label: "안정", score: 0.71 },
      { label: "호감", score: 0.58 },
      { label: "이완", score: 0.4 },
    ],
    evidence: [
      { code: "AU12", reading: "입꼬리가 강하게 올라가 미소 형태가 뚜렷합니다" },
      { code: "AU6", reading: "볼이 올라가 눈 주변이 수축된 눈웃음입니다" },
      { code: "AU7", reading: "눈꺼풀이 조여져 미소의 진정성을 보완합니다" },
      { code: "AU26", reading: "턱이 살짝 벌어져 이완된 상태를 보입니다" },
    ],
    signals: [
      "입 너비 비율이 넓고 입꼬리 기울기가 거의 평평합니다",
      "좌우 눈 종횡비 차이가 0.003으로 매우 대칭적입니다",
      "머리 각도가 정면에서 3도 이내로 안정적입니다",
    ],
    authenticity: "AU6 동반 · 낮은 비대칭 → Duchenne 미소 가능성 높음",
    confidence: 0.92,
    caution: "표정 신호일 뿐 속마음의 증거는 아닙니다",
    tokens: 1147,
  },
  report: {
    intensity: 0.61,
    valence: 0.94,
    arousal: 0.43,
    asymmetry: 0.07,
    stability: 0.88,
    frames: 21,
    duchenne: "AU6 동반 (Duchenne 미소 특징)",
    allUnits: [
      { code: "AU12", name: "입꼬리 당김(미소)", value: 0.78 },
      { code: "AU6", name: "볼 올림(눈웃음)", value: 0.52 },
      { code: "AU7", name: "눈꺼풀 조임", value: 0.34 },
      { code: "AU26", name: "턱 벌림", value: 0.21 },
      { code: "AU2", name: "바깥 눈썹 올림", value: 0.18 },
      { code: "AU1", name: "안쪽 눈썹 올림", value: 0.11 },
    ],
    head: { yaw: -3, pitch: 2, roll: 1 },
  },
};

export default function App() {
  const videoRef = useRef(null);
  const photoRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const visionRef = useRef(null);
  const videoLandmarkerRef = useRef(null);
  const imageLandmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const framesRef = useRef([]);
  const photoFrameRef = useRef(null);
  const photoLandmarksRef = useRef(null);
  const animationRef = useRef(0);
  const runRef = useRef(0);
  const sourceModeRef = useRef("camera");
  const photoUrlRef = useRef("");

  const [phase, setPhase] = useState("booting");
  const [sourceMode, setSourceMode] = useState("camera");
  const [photoUrl, setPhotoUrl] = useState("");
  const [countdown, setCountdown] = useState(null);
  const [faceReady, setFaceReady] = useState(false);
  const [hint, setHint] = useState("얼굴을 찾는 중");
  const [live, setLive] = useState(null);
  const [report, setReport] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // 얼굴 윤곽선만 얇게 그린다. 조밀한 메시는 계측 화면을 가린다.
  const drawFace = useCallback((landmarks, width, height) => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;

    const drawing = new DrawingUtils(context);
    const line = Math.max(1, Math.round(width / 640));

    drawing.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
      color: "rgba(143, 123, 255, 0.16)",
      lineWidth: line * 0.6,
    });
    for (const group of [
      FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
      FaceLandmarker.FACE_LANDMARKS_LIPS,
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
    ]) {
      drawing.drawConnectors(landmarks, group, { color: "#efece5", lineWidth: line * 1.4 });
    }
    for (const iris of [
      FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
    ]) {
      drawing.drawConnectors(landmarks, iris, { color: "#ffb020", lineWidth: line * 1.6 });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lastVideoTime = -1;
    let lastDetectionAt = 0;
    let lastMeterAt = 0;

    async function initialize() {
      setPhase("booting");

      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks(WASM_URL);
        if (cancelled) return;
        visionRef.current = vision;
      } catch (caught) {
        console.error(caught);
        setError("얼굴 계측 모델을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
        setPhase("error");
        return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught?.name === "NotAllowedError"
            ? "카메라 권한이 없어요. 사진을 올리거나 브라우저에서 카메라를 허용해 주세요."
            : "카메라를 열지 못했어요. 사진 업로드는 사용할 수 있습니다.",
        );
        setPhase("camera-error");
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      try {
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const landmarker = await createLandmarker(vision, "VIDEO");

        if (cancelled) {
          landmarker.close();
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        videoLandmarkerRef.current = landmarker;
        setPhase("ready");

        const detect = () => {
          const video = videoRef.current;
          const now = performance.now();

          if (
            video?.readyState >= 2 &&
            video.currentTime !== lastVideoTime &&
            now - lastDetectionAt > 45
          ) {
            const detection = landmarker.detectForVideo(video, now);
            const frame = readFrame(detection);
            const quality = faceQuality(frame);

            if (quality.ok) {
              framesRef.current = [...framesRef.current.slice(-(SAMPLE_WINDOW - 1)), frame];
            }

            if (sourceModeRef.current === "camera") {
              setFaceReady(quality.ok);
              setHint(quality.reason);

              // 실시간 AU 막대는 전부 로컬 계산이라 API 비용이 0이다.
              // 매 프레임 새 객체를 만들면 화면 전체가 다시 그려지므로 5fps로 낮춘다.
              if (now - lastMeterAt > 200) {
                setLive(quality.ok ? summarize([frame]) : null);
                lastMeterAt = now;
              }

              drawFace(
                quality.ok ? detection.faceLandmarks?.[0] : null,
                video.videoWidth,
                video.videoHeight,
              );
            }

            lastVideoTime = video.currentTime;
            lastDetectionAt = now;
          }

          animationRef.current = requestAnimationFrame(detect);
        };

        detect();
      } catch (caught) {
        console.error(caught);
        stream.getTracks().forEach((track) => track.stop());
        setError("카메라용 계측 모델을 시작하지 못했습니다. 사진 업로드는 시도할 수 있습니다.");
        setPhase("camera-error");
      }
    }

    initialize();

    return () => {
      cancelled = true;
      runRef.current += 1;
      cancelAnimationFrame(animationRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      videoLandmarkerRef.current?.close();
      imageLandmarkerRef.current?.close();
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, [drawFace]);

  // 개발 중 판독서 레이아웃을 확인하기 위한 데모 주입.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!new URLSearchParams(window.location.search).has("demo")) return;
    setResult(DEMO.result);
    setReport(DEMO.report);
    setPhase("done");
  }, []);

  const clearResult = () => {
    setCountdown(null);
    setResult(null);
    setReport(null);
    setError("");
  };

  const analyzeReport = async (measured, runId) => {
    setReport(measured);

    try {
      setPhase("analyzing");
      const mode = sourceModeRef.current;
      const body = {
        report: toPayload(measured),
        image: captureImage(mode === "photo" ? photoRef.current : videoRef.current, mode),
      };

      const analysis = await postJson("/api/analyze", body);
      if (runRef.current !== runId) return;

      setResult(analysis);
      setPhase("done");
    } catch (caught) {
      if (runRef.current !== runId) return;
      if (sourceModeRef.current === "camera") {
        await resumeCamera(videoRef.current);
      }
      setError(caught.message);
      setPhase("ready");
    }
  };

  const startMeasure = async () => {
    if (!faceReady) return;
    if (["measuring", "analyzing", "photo-loading"].includes(phase)) return;

    const runId = runRef.current + 1;
    runRef.current = runId;
    clearResult();

    if (sourceModeRef.current === "photo") {
      const frame = photoFrameRef.current;
      if (frame) await analyzeReport(summarize([frame]), runId);
      return;
    }

    setPhase("measuring");
    framesRef.current = [];

    for (let number = 3; number >= 1; number -= 1) {
      if (runRef.current !== runId) return;
      setCountdown(number);
      await wait(1000);
    }

    setCountdown(null);
    freezeCamera(videoRef.current);
    const measured = summarize(framesRef.current);
    if (!measured) {
      await resumeCamera(videoRef.current);
      setError("표정을 계측하지 못했어요. 얼굴이 화면에 들어오게 한 뒤 다시 시도해 주세요.");
      setPhase("ready");
      return;
    }

    await analyzeReport(measured, runId);
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    // 업로드 파일은 확장자가 아니라 타입과 크기로 먼저 거른다.
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError("JPG, PNG, WebP 이미지 파일을 선택해 주세요.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setError("사진은 12MB 이하로 올려 주세요.");
      return;
    }

    const runId = runRef.current + 1;
    runRef.current = runId;
    clearResult();
    setPhase("photo-loading");
    setFaceReady(false);
    setLive(null);
    sourceModeRef.current = "photo";
    setSourceMode("photo");

    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    photoUrlRef.current = objectUrl;
    setPhotoUrl(objectUrl);

    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      if (runRef.current !== runId) return;

      if (!imageLandmarkerRef.current) {
        if (!visionRef.current) throw new Error("계측 모델이 아직 준비되지 않았습니다.");
        imageLandmarkerRef.current = await createLandmarker(visionRef.current, "IMAGE");
      }

      const detection = imageLandmarkerRef.current.detect(image);
      const frame = readFrame(detection);
      const quality = faceQuality(frame);
      photoFrameRef.current = quality.ok ? frame : null;
      photoLandmarksRef.current = quality.ok ? detection.faceLandmarks?.[0] ?? null : null;
      setFaceReady(quality.ok);
      setHint(quality.reason);
      setLive(quality.ok ? summarize([frame]) : null);
      setPhase("ready");

      requestAnimationFrame(() => {
        drawFace(photoLandmarksRef.current, image.naturalWidth, image.naturalHeight);
      });

      if (!quality.ok) {
        setError(`사진에서 표정을 계측하지 못했어요. ${quality.reason}.`);
      }
    } catch (caught) {
      console.error(caught);
      photoFrameRef.current = null;
      photoLandmarksRef.current = null;
      setFaceReady(false);
      setError(caught.message || "사진을 분석하지 못했습니다.");
      setPhase("ready");
    }
  };

  const switchToCamera = () => {
    runRef.current += 1;
    clearResult();
    sourceModeRef.current = "camera";
    setSourceMode("camera");
    photoFrameRef.current = null;
    photoLandmarksRef.current = null;
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = "";
    setPhotoUrl("");

    const cameraReady = Boolean(videoLandmarkerRef.current && streamRef.current);
    setPhase(cameraReady ? "ready" : "camera-error");
    if (!cameraReady) {
      setFaceReady(false);
      setLive(null);
      setError("카메라를 사용할 수 없어요. 사진 업로드를 이용해 주세요.");
    }
  };

  const reset = async () => {
    runRef.current += 1;
    clearResult();

    if (sourceMode === "camera") {
      const resumed = await resumeCamera(videoRef.current);
      if (!resumed) {
        setFaceReady(false);
        setLive(null);
        setError("카메라 화면을 다시 시작하지 못했어요. 페이지를 새로고침해 주세요.");
        setPhase("camera-error");
        return;
      }
    }

    setPhase(sourceMode === "camera" && !videoLandmarkerRef.current ? "camera-error" : "ready");
  };

  const handlePrimaryAction = () => {
    if (primaryAction === "resume") {
      void reset();
      return;
    }

    void startMeasure();
  };

  const busy = ["measuring", "analyzing", "photo-loading"].includes(phase);
  const primaryAction = getPrimaryCameraAction({
    sourceMode,
    hasResult: Boolean(result),
  });
  const primaryActionDisabled = isPrimaryCameraActionDisabled({
    action: primaryAction,
    faceReady,
    busy,
  });
  const shownReport = report ?? live;
  const meterUnits = (shownReport?.allUnits ?? [])
    .filter((unit) => unit.code !== "AU45")
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const statusText = {
    booting: "계측 모델 준비 중",
    "photo-loading": "사진에서 얼굴 찾는 중",
    "camera-error": "사진 업로드를 이용해 주세요",
    ready: faceReady ? "계측 준비 완료" : hint,
    measuring: "표정을 그대로 유지해 주세요",
    analyzing: "OpenRouter 판독 중",
    done: "판독 완료",
    error: "계측 모델을 준비하지 못했어요",
  }[phase];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="표정연구소 홈">
          <span className="brand-mark">
            <Scan weight="bold" />
          </span>
          <span className="brand-text">
            <b>표정연구소</b>
            <small>FACS EXPRESSION READOUT</small>
          </span>
        </a>

        <h1 id="page-title">
          얼굴 근육을 <em>FACS 18개 지표</em>로 계측하고, AI가 그 수치로 표정을 판독합니다.
        </h1>

        <div className="topbar-meta">
          <span className="meta-chip">
            <LockKey weight="bold" aria-hidden="true" />
            AU 수치 + 640px 이미지만 전송 · 저장하지 않음
          </span>
        </div>
      </header>

      <div className="workspace" aria-labelledby="page-title">
        <section className="studio" aria-label="표정 계측 스튜디오">
          <div
            className={[
              "stage",
              sourceMode === "photo" ? "photo-mode" : "camera-mode",
              faceReady ? "has-face" : "",
            ].join(" ")}
          >
            <video ref={videoRef} playsInline muted hidden={sourceMode === "photo"} aria-label="실시간 카메라 화면" />
            {photoUrl && (
              <img
                ref={photoRef}
                className="uploaded-photo"
                src={photoUrl}
                alt="업로드한 얼굴 사진"
                onLoad={(event) => {
                  drawFace(
                    photoLandmarksRef.current,
                    event.currentTarget.naturalWidth,
                    event.currentTarget.naturalHeight,
                  );
                }}
              />
            )}
            <canvas ref={canvasRef} aria-hidden="true" />

            <div className="stage-grid" aria-hidden="true" />
            <div className="stage-corners" aria-hidden="true">
              <i /><i /><i /><i />
            </div>

            <div className="stage-status" aria-live="polite">
              <span className={`status-dot ${faceReady ? "on" : ""}`} />
              {statusText}
            </div>

            {shownReport?.head && (
              <div className="head-readout" aria-hidden="true">
                <span>YAW <b>{shownReport.head.yaw}°</b></span>
                <span>PITCH <b>{shownReport.head.pitch}°</b></span>
                <span>ROLL <b>{shownReport.head.roll}°</b></span>
              </div>
            )}

            {phase === "booting" && (
              <div className="stage-message">
                <Camera weight="duotone" />
                <strong>계측 모델을 깨우는 중</strong>
                <span>얼굴 랜드마크 모델은 처음 한 번만 내려받습니다.</span>
              </div>
            )}

            {phase === "camera-error" && sourceMode === "camera" && (
              <div className="stage-message">
                <FileImage weight="duotone" />
                <strong>사진으로 시작해도 좋아요</strong>
                <span>{error}</span>
              </div>
            )}

            {phase === "photo-loading" && (
              <div className="stage-message">
                <FileImage weight="duotone" />
                <strong>사진에서 얼굴 찾는 중</strong>
                <span>원본 사진은 이 브라우저 안에서만 처리합니다.</span>
              </div>
            )}

            {countdown && (
              <div className="countdown" key={countdown} aria-live="assertive">
                <span>{countdown}</span>
                <small>표정 유지</small>
              </div>
            )}

            {phase === "analyzing" && (
              <div className="stage-message">
                <Waveform weight="duotone" />
                <strong>OpenRouter가 계측값을 읽는 중</strong>
                <span>AU 수치와 640px 이미지를 함께 보냈어요.</span>
              </div>
            )}
          </div>

          <div className="meter-strip" aria-label="실시간 Action Unit 계측">
            <div className="meter-head">
              <Waveform weight="bold" aria-hidden="true" />
              <strong>실시간 AU 계측</strong>
              <span>브라우저 계산 · API 비용 0</span>
            </div>
            <div className="meters">
              {meterUnits.length ? (
                meterUnits.map((unit) => (
                  <div className="meter" key={unit.code}>
                    <div className="meter-label">
                      <b>{unit.code}</b>
                      <span>{unit.name}</span>
                    </div>
                    <div className="meter-track">
                      <i style={{ width: percent(unit.value) }} />
                    </div>
                    <em>{unit.value.toFixed(2)}</em>
                  </div>
                ))
              ) : (
                <p className="meter-empty">얼굴이 잡히면 활성화된 Action Unit이 여기 표시됩니다.</p>
              )}
            </div>
          </div>

          <div className="control-bar">
            <div className="face-check">
              {faceReady ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}
              <span>{faceReady ? "얼굴 계측 정상" : hint}</span>
            </div>

            <div className="actions">
              <input
                ref={fileInputRef}
                className="file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
              />
              <button
                className="ghost-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={phase === "booting" || phase === "error" || busy}
              >
                <UploadSimple weight="bold" />
                사진 올리기
              </button>

              {sourceMode === "photo" && (
                <button className="ghost-button" type="button" onClick={switchToCamera} disabled={busy}>
                  <VideoCamera weight="bold" />
                  카메라
                </button>
              )}

              {phase !== "camera-error" && phase !== "error" && (
                <button
                  className="primary-button"
                  type="button"
                  onClick={handlePrimaryAction}
                  disabled={primaryActionDisabled}
                >
                  <Sparkle weight="fill" />
                  {busy
                    ? "진행 중"
                    : sourceMode === "photo"
                      ? "이 사진 판독"
                      : primaryAction === "resume"
                        ? "다시 판독하기"
                        : "3초 계측 후 판독"}
                </button>
              )}
            </div>
          </div>
        </section>

        <aside className="readout" aria-label="표정 판독서">
          <div className="readout-head">
            <span>EXPRESSION READOUT</span>
            <strong>{result ? "판독 완료" : "대기 중"}</strong>
          </div>

          {result ? (
            <div className="readout-body" aria-live="polite">
              <section className="verdict">
                <div className="verdict-top">
                  <span className="kicker">판정</span>
                </div>
                <h2>{result.expression}</h2>
                <p>{result.summary}</p>

                <div className="confidence">
                  <div className="confidence-label">
                    <Gauge weight="bold" />
                    <span>판독 신뢰도</span>
                    <b>{percent(result.confidence)}</b>
                  </div>
                  <div className="confidence-track">
                    <i style={{ width: percent(result.confidence) }} />
                  </div>
                </div>
              </section>

              {result.emotions?.length > 0 && (
                <section className="block">
                  <h3>감정 추정</h3>
                  <ul className="emotion-list">
                    {result.emotions.map((emotion) => (
                      <li key={emotion.label}>
                        <span>{emotion.label}</span>
                        <div className="emotion-track">
                          <i style={{ width: percent(emotion.score) }} />
                        </div>
                        <b>{percent(emotion.score)}</b>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {result.evidence?.length > 0 && (
                <section className="block">
                  <h3>판단 근거 (Action Unit)</h3>
                  <ul className="evidence-list">
                    {result.evidence.map((item) => (
                      <li key={item.code}>
                        <code>{item.code}</code>
                        <span>{item.reading}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {result.signals?.length > 0 && (
                <section className="block">
                  <h3>기하 지표에서 읽은 신호</h3>
                  <ul className="signal-list">
                    {result.signals.map((signal) => (
                      <li key={signal}>
                        <Eye weight="bold" />
                        {signal}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {report && (
                <section className="block">
                  <h3>계측 요약</h3>
                  <dl className="stat-grid">
                    <div><dt>표정 강도</dt><dd>{percent(report.intensity)}</dd></div>
                    <div><dt>정서가</dt><dd>{report.valence > 0 ? "+" : ""}{report.valence}</dd></div>
                    <div><dt>각성도</dt><dd>{report.arousal}</dd></div>
                    <div><dt>좌우 비대칭</dt><dd>{report.asymmetry}</dd></div>
                    <div><dt>계측 안정성</dt><dd>{percent(report.stability)}</dd></div>
                    <div><dt>프레임</dt><dd>{report.frames}장</dd></div>
                  </dl>
                  <p className="duchenne">{report.duchenne}</p>
                </section>
              )}

              {result.authenticity && (
                <p className="authenticity">
                  <ShieldCheck weight="bold" />
                  {result.authenticity}
                </p>
              )}

              {result.caution && <p className="caution">※ {result.caution}</p>}

              <div className="readout-foot">
                <button className="ghost-button" type="button" onClick={() => void reset()}>
                  <ArrowClockwise weight="bold" /> 다시 판독하기
                </button>
                {result.tokens ? <span className="token-note">{result.tokens} tokens</span> : null}
              </div>
            </div>
          ) : (
            <div className="readout-empty">
              <div className="empty-mark">
                <ImageSquare weight="duotone" />
              </div>
              <h2>계측이 먼저,<br />판독은 그다음.</h2>
              <p>
                브라우저가 눈썹·눈꺼풀·볼·입술의 움직임을 FACS Action Unit으로 재고,
                그 수치와 축소한 화면 한 장을 OpenRouter로 보내 표정을 판독합니다.
              </p>
              <ol className="steps">
                <li><b>1</b> 얼굴을 화면 안에 맞춥니다</li>
                <li><b>2</b> 3초간 표정을 유지합니다</li>
                <li><b>3</b> 수치 판독서를 받습니다</li>
              </ol>
            </div>
          )}
        </aside>
      </div>

      {error && phase !== "camera-error" && (
        <div className="error-banner" role="alert">
          <WarningCircle weight="fill" />
          <span>{error}</span>
          {phase !== "error" && (
            <button type="button" onClick={() => setError("")}>닫기</button>
          )}
        </div>
      )}

      <footer>
        <span>얼굴 랜드마크와 Action Unit 계측은 전부 이 기기 안에서 처리합니다.</span>
        <span>표정은 겉으로 드러난 신호이며 속마음이나 진위의 증거가 아닙니다.</span>
      </footer>
    </main>
  );
}
