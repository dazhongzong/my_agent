import type { Tool } from "../types.ts";

export const weatherTool: Tool = {
  name: "get_weather",
  description: "Get the weather for a specific city.",
  schema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "The city name to check weather for.",
      },
    },
    required: ["city"],
  },
  async run({ city }: Record<string, any>): Promise<string> {
    return `The weather in ${city} is 24°C and sunny.`;
  },
};
