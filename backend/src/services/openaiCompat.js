// GPT-5 / o-series "reasoning" models reject any non-default `temperature`
// (only 1, the default, is accepted), need `max_completion_tokens` instead
// of the legacy `max_tokens`, and — for latency-sensitive chat use — should
// pass `reasoning_effort: 'minimal'`, otherwise a modest token budget can be
// entirely consumed by hidden reasoning tokens, leaving the visible reply
// empty. Centralised here so every call site stays correct if OPENAI_MODEL
// switches between a reasoning model and a classic one (e.g. gpt-4o-mini).
export function isReasoningModel(model) {
  return /^(gpt-5|o1|o3|o4)/i.test(String(model || ''))
}

export function applyModelCompat(payload, { temperature, maxTokens } = {}) {
  const out = { ...payload }
  if (isReasoningModel(payload.model)) {
    if (maxTokens != null) out.max_completion_tokens = maxTokens
    out.reasoning_effort = 'minimal'
  } else {
    if (temperature != null) out.temperature = temperature
    if (maxTokens != null) out.max_tokens = maxTokens
  }
  return out
}
