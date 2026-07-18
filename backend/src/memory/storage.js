import { memoryService } from '../services/memory.service.js'

export async function storeMemory(record = {}) {
  return memoryService.store(record)
}
