export async function summarizeText(text = '') {
  return { summary: text.slice(0, 100) };
}
