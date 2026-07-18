const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 100

export function chunkText(text = '', metadata = {}) {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []

  const chunks = []
  let start = 0
  let chunkIndex = 0

  while (start < cleaned.length) {
    const end = Math.min(start + CHUNK_SIZE, cleaned.length)
    const chunkText = cleaned.slice(start, end)
    if (chunkText.trim().length > 20) {
      chunks.push({
        text: chunkText,
        chunkIndex,
        charStart: start,
        charEnd: end,
        totalChars: cleaned.length,
        ...metadata,
      })
      chunkIndex++
    }

    if (end >= cleaned.length) break
    start = end - CHUNK_OVERLAP
  }

  return chunks
}
