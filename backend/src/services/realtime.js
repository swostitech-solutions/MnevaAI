// Keeps Socket.IO access out of route and agent modules. Importing server.js from
// those modules creates a circular boot dependency and drops realtime updates.
let socketServer = null
// Pending emits queued before socket server is ready
const pendingEmits = []

export function setSocketServer(io) {
  socketServer = io
  // Flush any events that were queued before the socket server was ready
  while (pendingEmits.length) {
    const { userId, event, payload } = pendingEmits.shift()
    io.to(`u:${userId}`).emit(event, payload)
  }
}

export function emitToUser(userId, event, payload) {
  if (!userId) return false
  if (!socketServer) {
    // Queue the emit — will be flushed once setSocketServer is called
    pendingEmits.push({ userId, event, payload })
    return false
  }
  socketServer.to(`u:${userId}`).emit(event, payload)
  return true
}
