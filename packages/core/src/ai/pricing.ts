// Approximate USD per million tokens, input then output. Unknown model pricing is never displayed.
const rates: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
  'anthropic/claude-haiku-5.5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
  'anthropic/claude-sonnet-5.5': [2, 10],
  'openrouter/free': [0, 0],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10],
};
export function price(model: string, input: number, output: number): number | null {
  const rate = rates[model];
  return rate ? (input * rate[0] + output * rate[1]) / 1000000 : null;
}
