import { memoryService } from '../services/memory.service.js'

export async function recallMemory(query = '', userId = null, limit = 5) {
  const results = await memoryService.recall(query, userId, limit)
  return {
    query,
    results,
  }
}
