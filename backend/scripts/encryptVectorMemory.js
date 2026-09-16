// One-time backfill: encrypt the `text` field of every existing Qdrant
// memory point saved before payload encryption existed (qdrant.service.js).
// Safe to re-run — points whose text is already encrypted are left as-is.
import 'dotenv/config'
import { qdrantService } from '../src/services/qdrant.service.js'
import { isEncryptedToken } from '../src/services/tokenCrypto.js'

const COLLECTION = 'mneva_memory'

try {
  const points = await qdrantService.scrollAll(COLLECTION)
  const plaintext = points.filter((p) => typeof p.payload?.text === 'string' && p.payload.text && !isEncryptedToken(p.payload.text))

  if (plaintext.length) {
    // upsertPoints() encrypts payload.text on the way in — re-saving each
    // point with its own id/vector/payload is all that's needed.
    await qdrantService.upsertPoints(COLLECTION, plaintext.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })))
  }

  console.log(`Scrolled ${points.length} point(s) in "${COLLECTION}"; encrypted ${plaintext.length}.`)
} catch (error) {
  console.error(`Vector memory encryption backfill failed: ${error.message}`)
  process.exitCode = 1
}
