import { Message } from "ai/react";
import { ModelConfig } from "./model/model-config.type";
import { ImageModelId } from "./model/model.type";

type GetModelPromptArgs = {
  modelId: ImageModelId;
  messages: Message[];
  config?: ModelConfig;
};

export const getImageModelPrompt = ({ modelId, messages, config }: GetModelPromptArgs) => {
  const settings = config?.reduce(
    (obj, item) => {
      if (!item.value) return obj;
      obj[item.name] = item.type === "number" ? Number(item.value) : item.value;
      return obj;
    },
    {} as Record<string, any>,
  );

  switch (modelId) {
    case "amazon.titan-image-generator-v1":
    case "amazon.titan-image-generator-v2:0":
      return {
        taskType: "TEXT_IMAGE",
        textToImageParams: {
          text: messages[0].content,
        },
        imageGenerationConfig: {
          ...settings,
        },
      };
    case "stability.stable-diffusion-xl-v1":
      return {
        text_prompts: messages.map((m) => ({ text: m.content })),
        ...settings,
      };
    case "stability.stable-image-core-v1:0":
    case "stability.stable-image-ultra-v1:0":
    case "stability.sd3-large-v1:0":
      return {
        prompt: messages.at(0)?.content,
        ...settings,
      };
    default:
      throw new Error("Model not found");
  }
};

export const getImageModelResponse = (modelId: ImageModelId, response: any) => {
  switch (modelId) {
    case "amazon.titan-image-generator-v1":
    case "amazon.titan-image-generator-v2:0":
      return (response.images as []).map((imageData: any) => `![Image](data:image/png;base64,${imageData})`).join("\n");
    case "stability.stable-diffusion-xl-v1":
      return `![${response.result}](data:image/png;base64,${response.artifacts[0].base64})`;
    case "stability.stable-image-core-v1:0":
    case "stability.stable-image-ultra-v1:0":
    case "stability.sd3-large-v1:0":
      return `![Image](data:image/png;base64,${response.images[0]})`;
    default:
      throw new Error("Model not found");
  }
};