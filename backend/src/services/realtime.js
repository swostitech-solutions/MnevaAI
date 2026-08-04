// Keeps Socket.IO access out of route and agent modules. Importing server.js from
// those modules creates a circular boot dependency and drops realtime updates.
let socketServer = null

export function setSocketServer(io) {
  socketServer = io
}

export function emitToUser(userId, event, payload) {
  if (!socketServer || !userId) return false
  socketServer.to(`u:${userId}`).emit(event, payload)
  return true
}
