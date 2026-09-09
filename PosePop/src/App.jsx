import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  Camera,
  CheckCircle,
  FileImage,
  ImageSquare,
  Lightning,
  LockKey,
  MagicWand,
  PersonSimpleRun,
  UploadSimple,
  VideoCamera,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { averageLandmarks, compactPose } from "./pose";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const MAX_PHOTO_SIZE = 12 * 1024 * 1024;
const ANALYSIS_MAX_SIDE = 960;
const ANALYSIS_QUALITY = 0.72;
const SHOT_MAX_SIDE = 1280;
const SHOT_QUALITY = 0.9;
const FIRST_BODY_LANDMARK = 11;
const BODY_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS.filter(
  ({ start, end }) =>
    start >= FIRST_BODY_LANDMARK && end >= FIRST_BODY_LANDMARK,
);

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const hasVisiblePose = (landmarks) =>
  Boolean(
    landmarks &&
    [11, 12, 23, 24].every(
      (index) => (landmarks[index]?.visibility ?? 0) > 0.45,
    ),
  );

async function createLandmarker(vision, runningMode) {
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode,
    numPoses: 1,
    minPoseDetectionConfidence: 0.55,
    minPosePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  };

  try {
    return await PoseLandmarker.createFromOptions(vision, options);
  } catch {
    return PoseLandmarker.createFromOptions(vision, {
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
  if (!response.ok)
    throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

function captureImage(source, mode, maxSide, quality) {
  const sourceWidth =
    mode === "photo" ? source?.naturalWidth : source?.videoWidth;
  const sourceHeight =
    mode === "photo" ? source?.naturalHeight : source?.videoHeight;
  if (!source || !sourceWidth || !sourceHeight) {
    throw new Error("분석할 화면을 캡처하지 못했습니다.");
  }

  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export default function App() {
  const videoRef = useRef(null);
  const photoRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const visionRef = useRef(null);
  const videoLandmarkerRef = useRef(null);
  const imageLandmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const samplesRef = useRef([]);
  const photoLandmarksRef = useRef(null);
  const animationRef = useRef(0);
  const runRef = useRef(0);
  const sourceModeRef = useRef("camera");
  const frozenRef = useRef(false);
  const photoUrlRef = useRef("");

  const [phase, setPhase] = useState("booting");
  const [sourceMode, setSourceMode] = useState("camera");
  const [photoUrl, setPhotoUrl] = useState("");
  const [capturedShot, setCapturedShot] = useState("");
  const [countdown, setCountdown] = useState(null);
  const [posePresent, setPosePresent] = useState(false);
  const [result, setResult] = useState(null);
  const [generatedImage, setGeneratedImage] = useState("");
  const [error, setError] = useState("");

  const drawPose = useCallback((landmarks, width, height) => {
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
    drawing.drawConnectors(landmarks, BODY_CONNECTIONS, {
      color: "#D8FF62",
      lineWidth: 5,
    });
    drawing.drawLandmarks(landmarks.slice(FIRST_BODY_LANDMARK), {
      color: "#FF7058",
      fillColor: "#171914",
      lineWidth: 2,
      radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 7, 3),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lastVideoTime = -1;
    let lastDetectionAt = 0;

    async function initialize() {
      setPhase("booting");

      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks(WASM_URL);
        if (cancelled) return;
        visionRef.current = vision;
      } catch (caught) {
        console.error(caught);
        setError(
          "포즈 모델을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.",
        );
        setPhase("error");
        return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
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
            !frozenRef.current &&
            video?.readyState >= 2 &&
            video.currentTime !== lastVideoTime &&
            now - lastDetectionAt > 45
          ) {
            const detection = landmarker.detectForVideo(video, now);
            const landmarks = detection.landmarks?.[0];
            const visible = hasVisiblePose(landmarks);

            if (visible) {
              samplesRef.current = [
                ...samplesRef.current.slice(-11),
                landmarks,
              ];
            }

            if (sourceModeRef.current === "camera") {
              setPosePresent(visible);
              drawPose(
                visible ? landmarks : null,
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
        setError(
          "카메라용 포즈 모델을 시작하지 못했습니다. 사진 업로드는 시도할 수 있습니다.",
        );
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
  }, [drawPose]);

  const releaseShot = () => {
    frozenRef.current = false;
    setCapturedShot("");
  };

  const clearResult = () => {
    releaseShot();
    setCountdown(null);
    setResult(null);
    setGeneratedImage("");
    setError("");
  };

  const analyzeLandmarks = async (landmarks, runId, presetImage) => {
    try {
      setPhase("analyzing");
      const mode = sourceModeRef.current;
      const source = mode === "photo" ? photoRef.current : videoRef.current;
      const image =
        presetImage ||
        captureImage(source, mode, ANALYSIS_MAX_SIDE, ANALYSIS_QUALITY);
      const analysis = await postJson("/api/analyze", {
        pose: compactPose(landmarks),
        image,
      });

      if (runRef.current !== runId) return;
      setResult(analysis);
      setPhase("done");
    } catch (caught) {
      if (runRef.current !== runId) return;
      releaseShot();
      setError(caught.message);
      setPhase("ready");
    }
  };

  const generatePoseImage = async () => {
    if (!result?.imagePrompt || phase === "generating") return;

    const runId = runRef.current;
    setError("");
    setGeneratedImage("");
    setPhase("generating");

    try {
      // OpenRouter가 포즈를 보고 만든 판독(제목·한마디)까지 함께 보낸다.
      // 그림이 포즈뿐 아니라 판독 결과의 분위기까지 담게 하려는 것이다.
      const imageData = await postJson("/api/generate", {
        imagePrompt: result.imagePrompt,
        title: result.title,
        comment: result.comment,
      });

      if (runRef.current !== runId) return;
      setGeneratedImage(imageData.image);
      setPhase("done");
    } catch (caught) {
      if (runRef.current !== runId) return;
      setError(caught.message);
      setPhase("done");
    }
  };

  const startAnalysis = async () => {
    if (
      ["counting", "analyzing", "generating", "photo-loading"].includes(phase)
    )
      return;
    // 카메라 모드에서는 아직 포즈가 안 잡혀도 시작할 수 있다. 5초 카운트다운이
    // 포즈를 취할 시간이므로, 누르는 시점에 이미 서 있으라고 요구할 이유가 없다.
    // 사진 모드에는 카운트다운이 없어서 고를 때 이미 포즈가 있어야 한다.
    if (sourceModeRef.current === "photo" && !photoLandmarksRef.current) return;

    const runId = runRef.current + 1;
    runRef.current = runId;
    clearResult();

    if (sourceModeRef.current === "photo") {
      const landmarks = photoLandmarksRef.current;
      if (landmarks) await analyzeLandmarks(landmarks, runId);
      return;
    }

    setPhase("counting");
    samplesRef.current = [];

    for (let number = 5; number >= 1; number -= 1) {
      if (runRef.current !== runId) return;
      setCountdown(number);
      await wait(1000);
    }

    setCountdown(null);
    const averaged = averageLandmarks(samplesRef.current);
    if (!averaged) {
      setError("포즈를 놓쳤어요. 전신이 보이게 한 번 더 시도해 주세요.");
      setPhase("ready");
      return;
    }

    const video = videoRef.current;
    let analysisImage;
    let shot;
    try {
      analysisImage = captureImage(
        video,
        "camera",
        ANALYSIS_MAX_SIDE,
        ANALYSIS_QUALITY,
      );
      shot = captureImage(video, "camera", SHOT_MAX_SIDE, SHOT_QUALITY);
    } catch (caught) {
      setError(caught.message);
      setPhase("ready");
      return;
    }

    frozenRef.current = true;
    setCapturedShot(shot);
    drawPose(
      samplesRef.current.at(-1) || averaged,
      video.videoWidth,
      video.videoHeight,
    );

    await analyzeLandmarks(averaged, runId, analysisImage);
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("JPG, PNG, WebP 같은 이미지 파일을 선택해 주세요.");
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
    setPosePresent(false);
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
        if (!visionRef.current)
          throw new Error("포즈 모델이 아직 준비되지 않았습니다.");
        imageLandmarkerRef.current = await createLandmarker(
          visionRef.current,
          "IMAGE",
        );
      }

      const detection = imageLandmarkerRef.current.detect(image);
      const landmarks = detection.landmarks?.[0];
      const visible = hasVisiblePose(landmarks);
      photoLandmarksRef.current = visible ? landmarks : null;
      setPosePresent(visible);
      setPhase("ready");

      requestAnimationFrame(() => {
        drawPose(
          visible ? landmarks : null,
          image.naturalWidth,
          image.naturalHeight,
        );
      });

      if (!visible) {
        setError(
          "사진에서 포즈를 찾지 못했어요. 전신이 잘 보이는 사진을 골라 주세요.",
        );
      }
    } catch (caught) {
      console.error(caught);
      photoLandmarksRef.current = null;
      setPosePresent(false);
      setError(caught.message || "사진을 분석하지 못했습니다.");
      setPhase("ready");
    }
  };

  const switchToCamera = () => {
    runRef.current += 1;
    clearResult();
    sourceModeRef.current = "camera";
    setSourceMode("camera");
    photoLandmarksRef.current = null;
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = "";
    setPhotoUrl("");

    const latest = samplesRef.current.at(-1);
    const cameraReady = Boolean(
      videoLandmarkerRef.current && streamRef.current,
    );
    setPosePresent(cameraReady && hasVisiblePose(latest));
    setPhase(cameraReady ? "ready" : "camera-error");
    if (!cameraReady) {
      setError("카메라를 사용할 수 없어요. 사진 업로드를 이용해 주세요.");
    }

    requestAnimationFrame(() => {
      const video = videoRef.current;
      if (cameraReady && video?.videoWidth) {
        drawPose(latest, video.videoWidth, video.videoHeight);
      } else {
        drawPose(null, canvasRef.current?.width, canvasRef.current?.height);
      }
    });
  };

  const reset = () => {
    runRef.current += 1;
    clearResult();
    const currentPose =
      sourceModeRef.current === "photo"
        ? photoLandmarksRef.current
        : samplesRef.current.at(-1);
    setPosePresent(hasVisiblePose(currentPose));
    setPhase(
      sourceModeRef.current === "camera" && !videoLandmarkerRef.current
        ? "camera-error"
        : "ready",
    );
  };

  const busy = [
    "counting",
    "analyzing",
    "generating",
    "photo-loading",
  ].includes(phase);
  const statusText = {
    booting: "포즈 모델 준비 중",
    "photo-loading": "사진에서 스켈레톤 찾는 중",
    "camera-error": "사진 업로드를 이용해 주세요",
    ready:
      sourceMode === "photo"
        ? posePresent
          ? "사진 속 포즈를 찾았어요"
          : "다른 사진을 골라 주세요"
        : posePresent
          ? "포즈를 찾았어요"
          : "시작을 누르고 5초 안에 포즈를 취하세요",
    counting: "5초 안에 포즈를 취해 주세요",
    analyzing: "AI가 포즈에 이름 붙이는 중",
    generating: "포즈 캐릭터를 그리는 중",
    done: generatedImage ? "오늘의 포즈 완성" : "포즈 설명 완료",
    error: "포즈 모델을 준비하지 못했어요",
  }[phase];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="포즈팝 홈">
          <span className="brand-mark">
            <PersonSimpleRun weight="fill" />
          </span>
          <span>포즈팝</span>
        </a>
        <div className="title-block">
          <span>AI 포즈 놀이터</span>
          <h1 id="page-title">몸으로 말해요. AI가 제목을 붙일게요.</h1>
        </div>
        <div className="privacy-note">
          <LockKey aria-hidden="true" />
          <span>압축한 화면 한 장만 OpenRouter로 전송</span>
        </div>
      </header>

      <div className="workspace" aria-labelledby="page-title">
        <section className="studio" aria-label="포즈 분석 스튜디오">
          <div
            className={`camera-stage ${sourceMode === "photo" ? "photo-mode" : ""} ${capturedShot ? "shot-mode" : ""} ${posePresent ? "has-pose" : ""}`}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              hidden={sourceMode === "photo"}
              aria-label="실시간 카메라 화면"
            />
            {photoUrl && (
              <img
                ref={photoRef}
                className="uploaded-photo"
                src={photoUrl}
                alt="업로드한 포즈"
                onLoad={(event) => {
                  const landmarks = photoLandmarksRef.current;
                  if (landmarks) {
                    drawPose(
                      landmarks,
                      event.currentTarget.naturalWidth,
                      event.currentTarget.naturalHeight,
                    );
                  }
                }}
              />
            )}
            {capturedShot && (
              <img
                className="captured-shot"
                src={capturedShot}
                alt="방금 촬영한 포즈 장면"
              />
            )}
            <canvas ref={canvasRef} aria-hidden="true" />
            <div className="camera-shade" aria-hidden="true" />

            <div className="live-state" aria-live="polite">
              <span className="live-indicator" />
              {statusText}
            </div>

            {capturedShot && (
              <div className="shot-badge">
                <Camera weight="fill" />
                <span>촬영한 장면</span>
              </div>
            )}

            <div className="frame-corners" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>

            {phase === "booting" && (
              <div className="stage-message">
                <Camera weight="duotone" />
                <strong>포즈 모델 깨우는 중</strong>
                <span>처음 한 번만 포즈 모델을 내려받아요.</span>
              </div>
            )}

            {phase === "camera-error" && sourceMode === "camera" && (
              <div className="stage-message camera-unavailable">
                <FileImage weight="duotone" />
                <strong>사진으로 시작해도 좋아요</strong>
                <span>{error}</span>
              </div>
            )}

            {phase === "photo-loading" && (
              <div className="stage-message processing">
                <FileImage weight="duotone" />
                <strong>사진 속 포즈 찾는 중</strong>
                <span>원본 사진은 이 브라우저 안에서만 처리해요.</span>
              </div>
            )}

            {countdown && (
              <div className="countdown" key={countdown} aria-live="assertive">
                <span>{countdown}</span>
                <small>포즈 취하세요</small>
              </div>
            )}

            {phase === "analyzing" && (
              <div className="stage-message processing">
                <MagicWand weight="duotone" />
                <strong>이 포즈, 느낌이 오는데요</strong>
                <span>
                  화면 한 장과 관절 좌표를 OpenRouter가 분석하고 있어요.
                </span>
              </div>
            )}

            <div className="control-bar">
              <div className="pose-check">
                {posePresent ? (
                  <CheckCircle weight="fill" />
                ) : (
                  <WarningCircle weight="fill" />
                )}
                <span>
                  {posePresent
                    ? "스켈레톤 인식 완료"
                    : "전신이 보이면 더 정확해요"}
                </span>
              </div>
              <div className="action-buttons">
                <input
                  ref={fileInputRef}
                  className="file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoUpload}
                />
                <button
                  className="upload-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={phase === "booting" || phase === "error" || busy}
                >
                  <UploadSimple weight="bold" />
                  사진 올리기
                </button>
                {sourceMode === "photo" && (
                  <button
                    className="camera-button"
                    type="button"
                    onClick={switchToCamera}
                    disabled={busy}
                  >
                    <VideoCamera weight="bold" />
                    <span>카메라</span>
                  </button>
                )}
                {phase !== "camera-error" && phase !== "error" && (
                  <button
                    className="start-button"
                    type="button"
                    onClick={startAnalysis}
                    // 카메라 모드는 카운트다운 안에 포즈를 취하면 되므로 상시 누를 수 있다.
                    disabled={busy || (sourceMode === "photo" && !posePresent)}
                  >
                    <Lightning weight="fill" />
                    {busy
                      ? "진행 중"
                      : sourceMode === "photo"
                        ? "이 사진 분석하기"
                        : result
                          ? "다시 포즈"
                          : "5초 뒤 분석 시작"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="result-panel" aria-label="포즈 설명과 이미지 생성">
          <div className="panel-heading">
            <span>AI TAKE</span>
            <strong>{result ? "포즈 판정 완료" : "결과 대기 중"}</strong>
          </div>

          {result ? (
            <section className="result-section" aria-live="polite">
              <div className="result-copy">
                <span className="result-kicker">오늘의 포즈</span>
                <h2>{result.title}</h2>
                <p>{result.comment}</p>
                <button className="reset-button" type="button" onClick={reset}>
                  <ArrowClockwise /> 새 포즈 도전
                </button>
              </div>

              <div className="image-result">
                {generatedImage ? (
                  <img
                    src={generatedImage}
                    alt={`${result.title} 포즈를 표현한 AI 캐릭터`}
                  />
                ) : phase === "generating" ? (
                  <div className="image-loading">
                    <ImageSquare weight="duotone" />
                    <strong>캐릭터 그리는 중</strong>
                    <span>저용량 초안 품질로 생성하고 있어요.</span>
                  </div>
                ) : (
                  <div className="image-choice">
                    <ImageSquare weight="duotone" />
                    <strong>이 포즈를 캐릭터로 볼까요?</strong>
                    <span>버튼을 누를 때만 이미지 생성 비용이 사용돼요.</span>
                    <button
                      className="generate-button"
                      type="button"
                      onClick={generatePoseImage}
                    >
                      <MagicWand weight="fill" /> 이미지 만들기
                    </button>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <div className="result-empty">
              <div className="empty-icon">
                <ImageSquare weight="duotone" />
              </div>
              <span>오른쪽은 AI 판정석</span>
              <h2>
                포즈를 잡으면
                <br />
                여기에 결과가 떠요.
              </h2>
              <p>
                왼쪽 화면에서 전신을 맞추고 분석을 시작하세요. 이미지 생성은
                결과를 본 뒤 선택할 수 있어요.
              </p>
            </div>
          )}
        </aside>
      </div>

      {error && phase !== "camera-error" && (
        <div className="error-banner" role="alert">
          <WarningCircle weight="fill" />
          <span>{error}</span>
          {phase !== "error" && (
            <button type="button" onClick={() => setError("")}>
              닫기
            </button>
          )}
        </div>
      )}

      <footer>
        <span>MediaPipe가 사진과 영상의 포즈를 기기 안에서 읽습니다.</span>
        <span>포즈 분석과 이미지 생성 모두 OpenRouter를 사용합니다.</span>
      </footer>
    </main>
  );
}
