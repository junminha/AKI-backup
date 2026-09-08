import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 8788);
const serverFile = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(serverFile);
const isProduction = process.env.NODE_ENV === "production";

// ── 비용 방어 설정 ─────────────────────────────────────────────────────
const DAILY_LIMIT = Number(process.env.GROQ_DAILY_LIMIT || 120);
const RATE_WINDOW_MS = Number(process.env.GROQ_RATE_WINDOW_MS || 60_000);
const RATE_MAX = Number(process.env.GROQ_RATE_MAX || 8);
const CACHE_MAX = 200;
const CACHE_TTL_MS = 30 * 60 * 1000;

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
// 리버스 프록시 뒤에 배포한다면 이 값을 실제 홉 수로 바꿔야 rate limit이 정확해진다.
app.set("trust proxy", false);

// EXPRESS-AUTH-001 / EXPRESS-DOS-001: 분석 엔드포인트에 요청 상한을 건다.
const analyzeLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  limit: RATE_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.", code: "rate_limited" },
});

// EXPRESS-BODY-001: 본문 파서는 필요한 라우트에만, 명시적 상한과 함께 붙인다.
const analyzeBody = express.json({ limit: "900kb" });

function requireGroqKey(_request, response, next) {
  if (!process.env.GROQ_API_KEY) {
    return response.status(503).json({
      error: ".env의 GROQ_API_KEY를 먼저 입력해 주세요.",
      code: "missing_groq_api_key",
    });
  }
  next();
}

function groqClient() {
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
    timeout: 30_000,
    maxRetries: 1,
  });
}

function groqErrorMessage(error) {
  if (error?.status === 401) return "Groq API 키를 확인해 주세요.";
  if (error?.status === 413) return "전송한 이미지가 너무 큽니다. 절약 모드로 다시 시도해 주세요.";
  if (error?.status === 429) return "Groq 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  return "Groq가 표정을 판독하는 중 문제가 생겼습니다.";
}

// ── 하루 사용량 집계 ────────────────────────────────────────────────────
const usage = { day: new Date().toDateString(), calls: 0, cacheHits: 0 };

function rollDay() {
  const today = new Date().toDateString();
  if (usage.day !== today) {
    usage.day = today;
    usage.calls = 0;
    usage.cacheHits = 0;
  }
}

// ── 판독 결과 캐시 ─────────────────────────────────────────────────────
// 같은 표정 계측값이 다시 들어오면 Groq를 부르지 않고 이전 판독을 돌려준다.
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // 최근 사용 항목을 뒤로 보내 LRU를 유지한다.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, at: Date.now() });
  while (cache.size > CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
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
  rollDay();
  response.json({
    ok: true,
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    usage: { calls: usage.calls, cacheHits: usage.cacheHits, limit: DAILY_LIMIT },
  });
});

app.post("/api/analyze", analyzeLimiter, requireGroqKey, analyzeBody, async (request, response) => {
  rollDay();

  const report = cleanReport(request.body?.report);
  const image = cleanImage(request.body?.image);

  if (!report) {
    return response.status(400).json({ error: "표정 계측 데이터가 올바르지 않습니다." });
  }
  if (request.body?.image !== undefined && request.body?.image !== null && !image) {
    return response.status(400).json({ error: "이미지 형식이 올바르지 않습니다." });
  }

  // 1차 절약: 서버 캐시. 같은 계측값이면 Groq를 부르지 않는다.
  const key = crypto
    .createHash("sha256")
    .update(JSON.stringify({ report, withImage: Boolean(image) }))
    .digest("hex");

  const hit = cacheGet(key);
  if (hit) {
    usage.cacheHits += 1;
    return response.json({ ...hit, cached: true, usage: { calls: usage.calls, cacheHits: usage.cacheHits, limit: DAILY_LIMIT } });
  }

  // 2차 절약: 하루 호출 상한. 넘으면 API를 아예 호출하지 않는다.
  if (usage.calls >= DAILY_LIMIT) {
    return response.status(429).json({
      error: `오늘 Groq 호출 한도(${DAILY_LIMIT}회)를 모두 썼습니다. .env의 GROQ_DAILY_LIMIT을 조정하세요.`,
      code: "daily_limit_reached",
    });
  }

  const content = [
    {
      type: "text",
      text: `브라우저에서 계측한 표정 데이터다. 이 수치를 근거로 판독하고, 8개 키를 모두 채운 JSON을 출력해라.
${JSON.stringify(report)}`,
    },
  ];
  // 3차 절약: 이미지는 정밀 모드에서만 붙는다. 기본 절약 모드는 수치만 보낸다.
  if (image) content.push({ type: "image_url", image_url: { url: image } });

  try {
    const completion = await groqClient().chat.completions.create({
      model: process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b",
      reasoning_effort: "none",
      temperature: 0.4,
      top_p: 0.85,
      max_completion_tokens: 420,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    });

    usage.calls += 1;
    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    if (!parsed.expression || !parsed.summary) {
      throw new Error("Groq response did not match the expected format");
    }

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

    cacheSet(key, result);
    response.json({
      ...result,
      cached: false,
      usage: { calls: usage.calls, cacheHits: usage.cacheHits, limit: DAILY_LIMIT },
    });
  } catch (error) {
    console.error("Groq expression analysis failed", error);
    response.status(error?.status && error.status < 600 ? error.status : 500).json({
      error: groqErrorMessage(error),
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
