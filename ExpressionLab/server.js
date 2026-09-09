import "dotenv/config";
import express from "express";
import helmet from "helmet";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 8788);
const serverFile = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(serverFile);
const isProduction = process.env.NODE_ENV === "production";

// EXPRESS-FINGERPRINT-001 / EXPRESS-HEADERS-001:
// 서버 종류를 숨기고 필수 보안 헤더를 붙인다.
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // MediaPipe는 WASM을 컴파일하고 Worker를 blob으로 띄운다.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'", "https://cdn.jsdelivr.net"],
        workerSrc: ["'self'", "blob:"],
        // 모델 파일(.task)과 WASM 번들을 내려받는 출처만 허용한다.
        connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://storage.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        // HTTP로 도는 로컬 실행에서 자동 업그레이드는 요청을 깨뜨린다.
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    // 카메라 프리뷰(blob:)와 WASM이 같은 문서에서 동작해야 한다.
    crossOriginEmbedderPolicy: false,
    // HSTS는 되돌리기 어렵다. 실제 HTTPS 배포에서 ENABLE_HSTS=true로 켤 때만 붙인다.
    strictTransportSecurity: process.env.ENABLE_HSTS === "true"
      ? { maxAge: 15_552_000, includeSubDomains: true }
      : false,
  }),
);

// EXPRESS-PROXY-001: 로컬 실행 기준이므로 프록시 헤더를 신뢰하지 않는다.
app.set("trust proxy", false);

// EXPRESS-BODY-001: 본문 파서는 필요한 라우트에만, 명시적 상한과 함께 붙인다.
const analyzeBody = express.json({ limit: "900kb" });

// HTTP 헤더 값에는 Latin-1 문자만 넣을 수 있다. 한글이 들어가면 요청을 만들기도 전에
// fetch가 TypeError를 던지므로, ASCII가 아니면 안전한 기본값으로 되돌린다.
function asciiHeader(value, fallback) {
  const text = String(value ?? "").trim();
  return text && /^[ -~]+$/.test(text) ? text : fallback;
}

function requireOpenRouterKey(_request, response, next) {
  if (!process.env.OPENROUTER_API_KEY) {
    return response.status(503).json({
      error: ".env의 OPENROUTER_API_KEY를 먼저 입력해 주세요.",
      code: "missing_openrouter_api_key",
    });
  }
  next();
}

function openRouterClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    // OpenRouter 앱 랭킹용 헤더. 없어도 동작하지만 대시보드에서 출처를 구분해 준다.
    defaultHeaders: {
      "HTTP-Referer": asciiHeader(process.env.OPENROUTER_SITE_URL, "https://facegroq.vercel.app"),
      "X-Title": asciiHeader(process.env.OPENROUTER_APP_NAME, "Expression Lab"),
    },
    // Vercel 함수 상한이 60초다. 재시도까지 하면 30초 × 2 = 60초로 상한에 부딪혀
    // 함수가 강제 종료되고 원인 없는 500이 된다. 한 번만 시도하고 여유를 준다.
    // 재시도까지 두 번 시도해도 Vercel 함수 상한 60초 안에 끝나야 한다.
    timeout: 25_000,
    maxRetries: 0,
  });
}

// 실패 원인을 한 단어로 분류한다. 응답 본문을 그대로 흘리지 않으면서도
// 어디서 깨졌는지(상류 4xx/5xx · 타임아웃 · JSON 파싱 · 키 누락)는 알 수 있게 한다.
function classifyError(error) {
  if (error instanceof SyntaxError) return "bad_json";
  if (error?.message === "missing_keys") return "missing_keys";
  if (error?.status) return `upstream_${error.status}`;
  const name = error?.name || "";
  if (name.includes("Timeout") || error?.code === "ETIMEDOUT") return "timeout";
  if (name.includes("Connection") || error?.code === "ECONNRESET") return "connection";
  return "unknown";
}

// OpenRouter는 같은 모델이라도 요청마다 다른 provider로 라우팅한다. 그중 일부가
// 드물게 JSON이 아닌 응답이나 키가 빠진 응답을 돌려주므로, 그때만 한 번 더 시도한다.
// 인증·크레딧·요청 형식 오류는 다시 보내도 같은 결과라 즉시 포기한다.
async function completeJson(create, isValid) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const completion = await create();
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      if (!isValid(parsed)) throw new Error("missing_keys");
      return { completion, parsed };
    } catch (error) {
      lastError = error;
      const reason = classifyError(error);
      const worthRetrying = reason === "bad_json" || reason === "missing_keys" || error?.status >= 500;
      if (!worthRetrying) break;
    }
  }
  throw lastError;
}

function openRouterErrorMessage(error) {
  if (error?.status === 401) return "OpenRouter API 키를 확인해 주세요.";
  if (error?.status === 402) return "OpenRouter 크레딧이 부족합니다. 잔액을 충전해 주세요.";
  if (error?.status === 413) return "전송한 이미지가 너무 큽니다. 더 작은 사진으로 다시 시도해 주세요.";
  if (error?.status === 429) return "OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  return `OpenRouter가 표정을 판독하는 중 문제가 생겼습니다. (${classifyError(error)})`;
}

// ── 입력 검증 (EXPRESS-INPUT-001: 모든 요청 본문은 신뢰하지 않는다) ────
const NUMBER_KEYS = ["intensity", "asymmetry", "stability", "blink", "valence", "arousal", "frames"];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  // 구조 검사: 필수 필드의 타입까지 확인한다.
  if (!Array.isArray(value.active) || value.active.length > 12) return null;
  for (const unit of value.active) {
    if (!unit || typeof unit !== "object") return null;
    if (typeof unit.code !== "string" || unit.code.length > 8) return null;
    if (typeof unit.name !== "string" || unit.name.length > 40) return null;
    if (!isFiniteNumber(unit.value)) return null;
  }
  for (const key of NUMBER_KEYS) {
    if (key in value && !isFiniteNumber(value[key])) return null;
  }
  if ("duchenne" in value && (typeof value.duchenne !== "string" || value.duchenne.length > 60)) {
    return null;
  }

  // 크기 검사: 예상 밖으로 큰 페이로드는 그대로 반려한다.
  if (JSON.stringify(value).length > 4000) return null;
  return value;
}

function cleanImage(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 900_000) return null;
  // 허용 목록 방식: data:image/{jpeg,png,webp} base64만 통과시킨다.
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return null;
  return value;
}

// 스키마를 문장으로 나열하면 뒤쪽 키가 누락된다. 채워야 할 JSON 형태를 그대로 보여 준다.
const OUTPUT_TEMPLATE = `{
  "expression": "12자 이내 한국어 표정 이름",
  "summary": "40자 이내 한 줄 요약",
  "emotions": [{ "label": "한국어 감정명", "score": 0.00 }],
  "evidence": [{ "code": "AU12", "reading": "그 AU가 뜻하는 바 30자 이내" }],
  "signals": ["눈·입·머리 기하 지표에서 읽은 특징 25자 이내"],
  "authenticity": "자발성 판단 25자 이내",
  "confidence": 0.00,
  "caution": "이번 판독의 한계 30자 이내"
}`;

const SYSTEM_PROMPT = [
  "너는 FACS(Facial Action Coding System)를 훈련받은 한국어 표정 분석가다.",
  "입력은 MediaPipe가 브라우저에서 계측한 Action Unit 강도(0~1), 눈·입 기하 지표, 머리 각도다.",
  "이 수치만을 근거로 판독하고, 수치가 뒷받침하지 않는 주장은 하지 마라.",
  "금지: 신원 추정, 나이·성별·인종·출신 추정, 건강·정신질환·거짓말 여부 판정, 외모 평가.",
  "표정은 겉으로 드러난 신호일 뿐 속마음의 증거가 아니다. 단정하지 말고 가능성으로 서술하라.",
  "",
  "아래 JSON 객체 하나만 출력한다. 8개 키를 하나도 빠뜨리지 말고 모두 채워라.",
  OUTPUT_TEMPLATE,
  "",
  "emotions는 최대 4개이며 score 내림차순이다. evidence는 최대 4개, signals는 정확히 2~3개다.",
  "authenticity는 duchenne 값과 asymmetry 수치를 근거로 쓴다.",
  "confidence는 stability와 intensity가 낮을수록 낮게 준다. 절대 0으로 두지 마라.",
].join("\n");

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  });
});

app.post("/api/analyze", requireOpenRouterKey, analyzeBody, async (request, response) => {
  const report = cleanReport(request.body?.report);
  const image = cleanImage(request.body?.image);

  if (!report) {
    return response.status(400).json({ error: "표정 계측 데이터가 올바르지 않습니다." });
  }
  if (request.body?.image !== undefined && request.body?.image !== null && !image) {
    return response.status(400).json({ error: "이미지 형식이 올바르지 않습니다." });
  }

  const content = [
    {
      type: "text",
      text: `브라우저에서 계측한 표정 데이터다. 이 수치를 근거로 판독하고, 8개 키를 모두 채운 JSON을 출력해라.
${JSON.stringify(report)}`,
    },
  ];
  if (image) content.push({ type: "image_url", image_url: { url: image } });

  try {
    const client = openRouterClient();
    const { completion, parsed } = await completeJson(
      () =>
        client.chat.completions.create({
          model: process.env.OPENROUTER_VISION_MODEL || "qwen/qwen3.6-27b",
          // OpenRouter는 reasoning_effort 대신 reasoning 객체로 사고 토큰을 끈다.
          reasoning: { enabled: false },
          // JSON 모드를 실제로 지원하는 provider로만 라우팅한다. 지원하지 않는
          // provider에 걸리면 설명문이 섞여 와서 파싱이 깨진다.
          provider: { require_parameters: true },
          temperature: 0.4,
          top_p: 0.85,
          max_tokens: 420,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content },
          ],
        }),
      (value) => Boolean(value?.expression && value?.summary),
    );

    const clampScore = (value) =>
      isFiniteNumber(value) ? Number(Math.min(1, Math.max(0, value)).toFixed(2)) : 0;

    // 모델이 키를 빠뜨려도 화면이 비지 않도록 계측값에서 대체값을 만든다.
    const modelConfidence = clampScore(parsed.confidence);
    const measuredConfidence = Number(
      Math.min(
        0.9,
        Math.max(0.2, (report.stability ?? 0.6) * 0.55 + (report.intensity ?? 0.4) * 0.45),
      ).toFixed(2),
    );

    const result = {
      expression: String(parsed.expression).slice(0, 30),
      summary: String(parsed.summary).slice(0, 100),
      emotions: (Array.isArray(parsed.emotions) ? parsed.emotions : [])
        .slice(0, 4)
        .map((item) => ({
          label: String(item?.label ?? "").slice(0, 20),
          score: clampScore(item?.score),
        }))
        .filter((item) => item.label),
      evidence: (Array.isArray(parsed.evidence) ? parsed.evidence : [])
        .slice(0, 4)
        .map((item) => ({
          code: String(item?.code ?? "").slice(0, 8),
          reading: String(item?.reading ?? "").slice(0, 60),
        }))
        .filter((item) => item.code),
      signals: (Array.isArray(parsed.signals) ? parsed.signals : [])
        .slice(0, 3)
        .map((item) => String(item).slice(0, 60))
        .filter(Boolean),
      authenticity: String(parsed.authenticity || report.duchenne || "").slice(0, 60),
      confidence: modelConfidence || measuredConfidence,
      caution: String(parsed.caution || "표정 신호일 뿐 속마음의 증거는 아닙니다.").slice(0, 60),
      tokens: completion.usage?.total_tokens ?? null,
    };

    response.json(result);
  } catch (error) {
    // 상류 오류는 status/이름/본문이 각각 다른 곳에 담긴다. 셋 다 남겨야 원인을 좁힐 수 있다.
    console.error("OpenRouter expression analysis failed", {
      reason: classifyError(error),
      name: error?.name,
      status: error?.status,
      message: error?.message,
      body: error?.error ?? error?.response?.data,
    });
    response.status(error?.status && error.status < 600 ? error.status : 500).json({
      error: openRouterErrorMessage(error),
      code: classifyError(error),
    });
  }
});

// EXPRESS-STATIC-001: 빌드 산출물만 정적으로 제공한다.
app.use(express.static(path.join(projectRoot, "dist"), { dotfiles: "deny", index: false }));

// SPA 폴백. /api/* 는 여기 오기 전에 처리되므로 존재하지 않는 API는 404로 떨어진다.
app.get("/{*path}", (request, response, next) => {
  if (request.path.startsWith("/api/")) return next();
  response.sendFile(path.join(projectRoot, "dist", "index.html"));
});

// EXPRESS-FINGERPRINT-001: 기본 404 대신 직접 만든 응답을 준다.
app.use((_request, response) => {
  response.status(404).json({ error: "요청한 경로를 찾을 수 없습니다." });
});

// EXPRESS-ERROR-001: 스택 트레이스나 내부 메시지를 클라이언트로 흘리지 않는다.
app.use((error, _request, response, _next) => {
  console.error("Unhandled error", error);
  const status = error?.status || error?.statusCode || 500;
  const message = status === 413
    ? "전송한 데이터가 너무 큽니다."
    : isProduction
      ? "요청을 처리하지 못했습니다."
      : error?.message || "요청을 처리하지 못했습니다.";
  response.status(status).json({ error: message });
});

if (process.argv[1] && path.resolve(process.argv[1]) === serverFile) {
  const server = app.listen(port, "127.0.0.1", () => {
    console.log(`표정연구소 API ready at http://127.0.0.1:${port}`);
  });

  // EXPRESS-DOS-001: 느린 연결이 소켓을 붙잡지 못하도록 타임아웃을 명시한다.
  server.headersTimeout = 20_000;
  server.requestTimeout = 40_000;
  server.keepAliveTimeout = 10_000;
  server.on("clientError", (error, socket) => {
    console.error("Client connection error", error?.code);
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });
}

export default app;
