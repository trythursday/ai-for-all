// The subset of the OpenAI chat body we forward. Anything else a client sends
// is dropped: they should not know or care how the upstream is backed, and
// fields like `provider` or `models` would let them steer routing and cost.
export const OPENAI_FIELDS = [
  "messages",
  "model",
  "temperature",
  "top_p",
  "n",
  "stop",
  "max_tokens",
  "max_completion_tokens",
  "stream",
  "stream_options",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "response_format",
  "seed",
  "logprobs",
  "top_logprobs",
  "logit_bias",
  "presence_penalty",
  "frequency_penalty",
  "user",
  "metadata",
  "store",
  "service_tier",
  "reasoning_effort",
  "modalities",
  "audio",
  "prediction",
] as const;

export function pickOpenAiFields(body: Record<string, unknown>) {
  const picked: Record<string, unknown> = {};

  for (const field of OPENAI_FIELDS) {
    if (body[field] !== undefined) picked[field] = body[field];
  }

  return picked;
}

export function estimateTokens(value: unknown) {
  return Math.ceil(JSON.stringify(value).length / 4);
}
