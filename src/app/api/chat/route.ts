import { convertAiMessagesToCoreMessages } from "@/lib/convert-messages-to-core-messages";
import { getRequestCost } from "@/lib/model/get-request-cost";
import { TextModelConfig } from "@/lib/model/model-configs";
import { TextModelId } from "@/lib/model/model.type";
import { textModels } from "@/lib/model/models";
import { ratelimit } from "@/lib/rate-limiter";
import { ResponseMetrics } from "@/types/response-metrics.type";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createOpenAI } from "@ai-sdk/openai";
import { Message, StreamData, streamText } from "ai";
import { NextRequest } from "next/server";

// IMPORTANT! Set the runtime to edge
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const { success } = await ratelimit.limit(req.ip ?? "127.0.0.1");

  if (!success) {
    return new Response(JSON.stringify({ message: "Too many requests" }), { status: 429 });
  }

  const { modelId, messages, config } = (await req.json()) as {
    modelId: TextModelId;
    messages: Message[];
    config?: TextModelConfig;
  };

  const modelInfo = textModels.find((m) => m.id === modelId);

  try {
    const model =
      modelInfo?.provider === "Nvidia"
        ? createOpenAI({
            baseURL: "https://integrate.api.nvidia.com/v1",
            apiKey: process.env.NVIDIA_NIM_API_KEY ?? "",
          })(modelId)
        : modelInfo?.provider === "OpenAI"
          ? createOpenAI({
              compatibility: "strict",
              apiKey: process.env.OPENAI_API_KEY ?? "",
            })(modelId)
          : createAmazonBedrock({
              region: modelInfo?.region ?? process.env.AWS_REGION ?? "us-east-1",
              accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
            })(modelId);

    let firstTokenTime: number = NaN;
    const data = new StreamData();
    const start = Date.now();

    const result = await streamText({
      model,
      system: modelInfo?.systemPromptSupport ? config?.systemPrompt : undefined,
      messages: convertAiMessagesToCoreMessages(messages),
      maxTokens: config?.maxTokens.value,
      temperature: config?.temperature.value,
      topP: config?.topP.value,
      onChunk: () => {
        if (!firstTokenTime) {
          firstTokenTime = Date.now() - start;
        }
      },
      onFinish: (e) => {
        const inputTokens = e.usage.promptTokens ?? NaN;
        const outputTokens = e.usage.completionTokens ?? NaN;
        data.append({
          firstTokenTime,
          responseTime: Date.now() - start,
          inputTokens,
          outputTokens,
          cost: getRequestCost({ modelId, inputTokens, outputTokens }),
        } satisfies ResponseMetrics);
        data.close();
      },
    });

    return result.toDataStreamResponse({ data });
  } catch (err: any) {
    console.error("ERROR", err);
    return Response.json({ message: err.message }, { status: err.httpStatusCode ?? 500 });
  }
}