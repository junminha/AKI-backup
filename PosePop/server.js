import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 8787);
const serverFile = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(serverFile);

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

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
    // OpenRouter 대시보드에서 앱 출처를 구분하기 위한 선택 헤더다.
    defaultHeaders: {
      "HTTP-Referer": asciiHeader(
        process.env.OPENROUTER_SITE_URL,
        "https://posepop-rouge.vercel.app",
      ),
      "X-Title": asciiHeader(process.env.OPENROUTER_APP_NAME, "Pose Pop"),
    },
    // SDK 기본 타임아웃(600초)은 Vercel 함수 상한 60초를 한참 넘겨
    // 원인 없는 500으로 끝난다. 상한 안에서 끝나도록 줄인다.
    // 재시도까지 두 번 시도해도 Vercel 함수 상한 60초 안에 끝나야 한다.
    timeout: 25_000,
    maxRetries: 0,
  });
}

function imageErrorMessage(error) {
  if (error?.status === 401) return "OpenRouter API 키를 확인해 주세요.";
  if (error?.status === 402)
    return "OpenRouter 크레딧이 부족합니다. 잔액을 충전해 주세요.";
  if (error?.status === 429)
    return "이미지 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  // max_price에 걸리면 OpenRouter가 "No endpoints found that satisfy the max price"로 답한다.
  if (/max price/i.test(error?.message || ""))
    return `지금 단가가 장당 예산(약 ${Math.round(IMAGE_BUDGET_USD * 1400)}원)을 넘어 생성을 중단했습니다.`;
  return `이미지를 만드는 중 문제가 생겼습니다. (${classifyError(error)})`;
}

// 실패 원인을 한 단어로 분류한다. 응답 본문을 그대로 흘리지 않으면서도
// 어디서 깨졌는지(상류 4xx/5xx · 타임아웃 · JSON 파싱 · 키 누락)는 알 수 있게 한다.
function classifyError(error) {
  if (error instanceof SyntaxError) return "bad_json";
  if (error?.message === "missing_keys") return "missing_keys";
  if (error?.status) return `upstream_${error.status}`;
  const name = error?.name || "";
  if (name.includes("Timeout") || error?.code === "ETIMEDOUT") return "timeout";
  if (name.includes("Connection") || error?.code === "ECONNRESET")
    return "connection";
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
      const parsed = JSON.parse(
        completion.choices[0]?.message?.content || "{}",
      );
      if (!isValid(parsed)) throw new Error("missing_keys");
      return { completion, parsed };
    } catch (error) {
      lastError = error;
      const reason = classifyError(error);
      const worthRetrying =
        reason === "bad_json" ||
        reason === "missing_keys" ||
        error?.status >= 500;
      if (!worthRetrying) break;
    }
  }
  throw lastError;
}

function openRouterErrorMessage(error) {
  if (error?.status === 401) return "OpenRouter API 키를 확인해 주세요.";
  if (error?.status === 402)
    return "OpenRouter 크레딧이 부족합니다. 잔액을 충전해 주세요.";
  if (error?.status === 413)
    return "분석 이미지가 너무 큽니다. 더 작은 사진으로 다시 시도해 주세요.";
  if (error?.status === 429)
    return "OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  return `OpenRouter가 포즈를 분석하는 중 문제가 생겼습니다. (${classifyError(error)})`;
}

function cleanPosePayload(value) {
  if (!value || typeof value !== "object") return null;

  const text = JSON.stringify(value);
  if (text.length > 6000) return null;

  return value;
}

function cleanImagePayload(value) {
  if (typeof value !== "string" || value.length > 1_500_000) return null;
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value))
    return null;
  return value;
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  });
});

app.post("/api/analyze", requireOpenRouterKey, async (request, response) => {
  const pose = cleanPosePayload(request.body?.pose);
  const image = cleanImagePayload(request.body?.image);

  if (!pose || !image) {
    return response
      .status(400)
      .json({ error: "분석할 이미지 또는 포즈 데이터가 올바르지 않습니다." });
  }

  try {
    const client = openRouterClient();
    const { parsed } = await completeJson(
      () =>
        client.chat.completions.create({
          model: process.env.OPENROUTER_VISION_MODEL || "qwen/qwen3.6-27b",
          // OpenRouter는 reasoning_effort 대신 reasoning 객체로 사고 토큰을 끈다.
          reasoning: { enabled: false },
          // JSON 모드를 실제로 지원하는 provider로만 라우팅한다.
          provider: { require_parameters: true },
          temperature: 0.7,
          top_p: 0.8,
          presence_penalty: 1.5,
          max_tokens: 320,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "너는 재치 있지만 다정한 한국어 포즈 해설가다. 이미지 속 사람의 포즈만 설명하고 신체 평가, 신원 확인, 나이·성별·인종·건강 등 민감한 특징 추측은 하지 마라. 반드시 title, comment, imagePrompt 키를 가진 JSON 객체만 출력한다. title은 16자 이내의 재미있는 한국어 포즈 이름, comment는 45자 이내의 유쾌한 한국어 한마디, imagePrompt는 같은 포즈의 성별 중립 캐릭터를 그리는 간결한 영어 프롬프트다. imagePrompt에 실제 인물의 외모, 글자, 로고를 넣지 마라.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `이미지와 MediaPipe 관절 특징을 함께 보고 포즈를 분석해 줘. 관절 특징: ${JSON.stringify(pose)}`,
                },
                { type: "image_url", image_url: { url: image } },
              ],
            },
          ],
        }),
      (value) => Boolean(value?.title && value?.comment && value?.imagePrompt),
    );

    response.json({
      title: String(parsed.title).slice(0, 40),
      comment: String(parsed.comment).slice(0, 100),
      imagePrompt: String(parsed.imagePrompt).slice(0, 500),
    });
  } catch (error) {
    console.error("OpenRouter pose analysis failed", {
      reason: classifyError(error),
      name: error?.name,
      status: error?.status,
      message: error?.message,
      body: error?.error ?? error?.response?.data,
    });
    response
      .status(error?.status && error.status < 600 ? error.status : 500)
      .json({
        error: openRouterErrorMessage(error),
        code: classifyError(error),
      });
  }
});

// 그림 한 장의 예산 상한($). 이 값을 넘길 수 있는 provider로는 아예 라우팅하지 않는다.
const IMAGE_BUDGET_USD = Number(
  process.env.OPENROUTER_IMAGE_BUDGET_USD || 0.05,
);
// gemini-2.5-flash-image는 1024x1024 한 장을 1290 completion 토큰으로 청구한다.
// 예산을 이 토큰 수로 나누면 허용 가능한 100만 토큰당 단가가 나온다.
const IMAGE_TOKENS_PER_PICTURE = 1290;
const IMAGE_MAX_PRICE_PER_MTOK =
  Math.floor((IMAGE_BUDGET_USD / IMAGE_TOKENS_PER_PICTURE) * 1_000_000 * 100) /
  100;

app.post("/api/generate", requireOpenRouterKey, async (request, response) => {
  // 모델은 프롬프트를 마침표로 끝내는 편이라, 그대로 이어 붙이면 "...sideways.." 가 된다.
  const imagePrompt =
    typeof request.body?.imagePrompt === "string"
      ? request.body.imagePrompt
          .trim()
          .slice(0, 500)
          .replace(/[.\s]+$/, "")
      : "";

  if (!imagePrompt) {
    return response
      .status(400)
      .json({ error: "이미지 프롬프트가 비어 있습니다." });
  }

  // OpenRouter가 포즈를 보고 내놓은 판독(제목·한마디). 그림의 분위기를 잡는 데만 쓴다.
  // 따옴표는 미리 지운다. 프롬프트 안에서 인용부호가 겹치면 모델이 글자로 오해하기 쉽다.
  const asCaption = (value, limit) =>
    typeof value === "string"
      ? value
          .replace(/["'`]/g, "")
          .replace(/[\s]+/g, " ")
          .trim()
          .slice(0, limit)
      : "";
  const title = asCaption(request.body?.title, 40);
  const comment = asCaption(request.body?.comment, 100);
  const caption = [title, comment].filter(Boolean).join(" — ");

  // 한국어 판독을 그대로 넘기므로, 글자로 그리지 말라는 지시를 특히 분명히 해야 한다.
  const moodLine = caption
    ? ` The Korean caption for this pose is ${caption}. Use it only to set the character's mood, expression and energy — never draw the words themselves or any Hangul.`
    : "";

  // 스타일 지시는 앱 팔레트(--bg #171914 / --accent #d8ff62 / --coral #ff7058)를 따른다.
  // 분위기 형용사는 넣지 않는다. "energetic"이 고정으로 붙으면 차분한 포즈와 충돌한다.
  // 금지 사항은 "no text" 같은 단어 조각 대신 명령문으로 쓴다. 지시를 따르는 모델에게는
  // 조각이 오히려 글자를 불러들이고, 명령문이 훨씬 안정적으로 지켜진다.
  const prompt = `${imagePrompt}.${moodLine} Bold editorial character illustration on a charcoal background with lime and coral accents. Square 1:1 composition. Frame the whole figure from head to feet with margin on all sides. Render the illustration completely free of any lettering, numerals, Hangul, captions, watermarks, signatures, or brand marks.`;

  try {
    // OpenRouter의 이미지 생성은 별도 엔드포인트가 아니라 chat completions에
    // modalities: ["image", "text"]를 붙이는 방식이다. 결과는 message.images[]에 담긴다.
    const completion = await openRouterClient().chat.completions.create({
      model:
        process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
      // 예산 상한. 이 단가를 넘는 provider가 없으면 그림을 만들지 않고 실패한다.
      // 돈이 나간 뒤에 확인하는 사후 점검이 아니라, 호출 자체를 막는 사전 차단이다.
      provider: { max_price: { completion: IMAGE_MAX_PRICE_PER_MTOK } },
      messages: [{ role: "user", content: prompt }],
    });

    const image = completion.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!image) throw new Error("No image returned");

    // 실제 청구액을 남겨 두면 단가가 조용히 오를 때 로그에서 바로 드러난다.
    console.log("Image generated", {
      model: completion.model,
      cost: completion.usage?.cost,
      imageTokens: completion.usage?.completion_tokens_details?.image_tokens,
    });

    // 이미 data URI 형태(data:image/png;base64,...)로 오므로 그대로 넘긴다.
    response.json({ image });
  } catch (error) {
    console.error("Image generation failed", {
      reason: classifyError(error),
      name: error?.name,
      status: error?.status,
      message: error?.message,
      body: error?.error ?? error?.response?.data,
    });
    // 예산 상한에 걸리면 OpenRouter가 404("No endpoints found")로 답한다. 경로가 없다는
    // 뜻으로 오해되지 않도록, 비용 때문에 멈췄다는 의미의 402로 바꿔 내보낸다.
    const blockedByBudget = /max price/i.test(error?.message || "");
    const status = blockedByBudget
      ? 402
      : error?.status && error.status < 600
        ? error.status
        : 500;
    response.status(status).json({
      error: imageErrorMessage(error),
      code: blockedByBudget ? "over_image_budget" : classifyError(error),
    });
  }
});

app.use(express.static(path.join(projectRoot, "dist")));
app.get("/{*path}", (_request, response) => {
  response.sendFile(path.join(projectRoot, "dist", "index.html"));
});

if (process.argv[1] && path.resolve(process.argv[1]) === serverFile) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`Pose Pop API ready at http://127.0.0.1:${port}`);
  });
}

export default app;
