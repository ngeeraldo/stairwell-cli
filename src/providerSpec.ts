export interface StairwellModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
}

export interface StairwellProvider {
  baseUrl: string;
  api: string;
  apiKey: string;
  models: StairwellModel[];
}

export const PROVIDER_ID = "stairwell";

export const STAIRWELL_PROVIDER: StairwellProvider = {
  baseUrl: "https://api.stairwell.run/v1",
  api: "openai-completions",
  apiKey: "__INJECTED__",
  models: [
    {
      id: "default",
      name: "Stairwell Default",
      reasoning: false,
      input: ["text"],
      contextWindow: 200000,
      maxTokens: 8192
    },
  ],
};

export const DEFAULT_MODEL = "stairwell/default";

export function buildProvider(apiKey: string): StairwellProvider {
  const override = process.env.STAIRWELL_TEST_PROVIDER_OVERRIDE;
  if (override) {
    const parsed = JSON.parse(override);
    return { ...parsed, apiKey };
  }
  return { ...STAIRWELL_PROVIDER, apiKey };
}
