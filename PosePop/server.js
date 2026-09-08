import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 8787);
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

function requireGroqKey(_request, response, next) {
  if (!process.env.GROQ_API_KEY) {
    return response.status(503).json({
      error: ".env의 GROQ_API_KEY를 먼저 입력해 주세요.",
      code: "missing_groq_api_key",
    });
  }
  next();
}

function requireOpenAIKey(_request, response, next) {
  if (!process.env.OPENAI_API_KEY) {
    return response.status(503).json({
      error: ".env의 OPENAI_API_KEY를 먼저 입력해 주세요.",
      code: "missing_api_key",
    });
  }
  next();
}

function openAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function groqClient() {
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

function openAIErrorMessage(error, fallback) {
  if (error?.status === 401) return "OpenAI API 키를 확인해 주세요.";
  if (error?.code === "credit_balance_exhausted" || error?.type === "insufficient_quota") {
    return "OpenAI API 크레딧이 없습니다. 결제 설정에서 크레딧을 충전한 뒤 다시 시도해 주세요.";
  }
  if (error?.status === 429) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  return fallback;
}

function groqErrorMessage(error) {
  if (error?.status === 401) return "Groq API 키를 확인해 주세요.";
  if (error?.status === 413) return "분석 이미지가 너무 큽니다. 더 작은 사진으로 다시 시도해 주세요.";
  if (error?.status === 429) return "Groq 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  return "Groq가 포즈를 분석하는 중 문제가 생겼습니다.";
}

function cleanPosePayload(value) {
  if (!value || typeof value !== "object") return null;

  const text = JSON.stringify(value);
  if (text.length > 6000) return null;

  return value;
}

function cleanImagePayload(value) {
  if (typeof value !== "string" || value.length > 1_500_000) return null;
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return null;
  return value;
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
});

app.post("/api/analyze", requireGroqKey, async (request, response) => {
  const pose = cleanPosePayload(request.body?.pose);
  const image = cleanImagePayload(request.body?.image);

  if (!pose || !image) {
    return response.status(400).json({ error: "분석할 이미지 또는 포즈 데이터가 올바르지 않습니다." });
  }

  try {
    const completion = await groqClient().chat.completions.create({
      model: process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b",
      reasoning_effort: "none",
      temperature: 0.7,
      top_p: 0.8,
      presence_penalty: 1.5,
      max_completion_tokens: 320,
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
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    if (!parsed.title || !parsed.comment || !parsed.imagePrompt) {
      throw new Error("Groq response did not match the expected format");
    }
    response.json({
      title: String(parsed.title).slice(0, 40),
      comment: String(parsed.comment).slice(0, 100),
      imagePrompt: String(parsed.imagePrompt).slice(0, 500),
    });
  } catch (error) {
    console.error("Groq pose analysis failed", error);
    response.status(error?.status || 500).json({
      error: groqErrorMessage(error),
    });
  }
});

app.post("/api/generate", requireOpenAIKey, async (request, response) => {
  const imagePrompt = typeof request.body?.imagePrompt === "string"
    ? request.body.imagePrompt.trim().slice(0, 500)
    : "";

  if (!imagePrompt) {
    return response.status(400).json({ error: "이미지 프롬프트가 비어 있습니다." });
  }

  try {
    const result = await openAIClient().images.generate({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      prompt: `${imagePrompt}. Bold editorial character illustration, energetic composition, charcoal background, lime and coral accents, full body, no text, no logo.`,
      size: "816x816",
      quality: "low",
      output_format: "webp",
      output_compression: 72,
      n: 1,
    });

    const image = result.data?.[0]?.b64_json;
    if (!image) throw new Error("No image returned");

    response.json({ image: `data:image/webp;base64,${image}` });
  } catch (error) {
    console.error("Image generation failed", error);
    response.status(error?.status || 500).json({
      error: openAIErrorMessage(error, "이미지를 만드는 중 문제가 생겼습니다."),
    });
  }
});

app.use(express.static(path.join(projectRoot, "dist")));
app.get("/{*path}", (_request, response) => {
  response.sendFile(path.join(projectRoot, "dist", "index.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Pose Pop API ready at http://127.0.0.1:${port}`);
});
