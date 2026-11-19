import jwt from "jsonwebtoken";
import { logger } from "../config/logger.js";
import { ledger } from "./ledgerService.js";
import { prisma } from "../config/prisma.js";
import { sendGmailReply } from "../queues/gmailPoll.queue.js";
import { startCalendarPoller } from "./calendarPoller.js";
import { startContactsPoller } from "./contactsPoller.js";
import { setSocketServer } from "./realtime.js";
import { resolvePendingAction } from "./pendingActions.service.js";

// Calendar/Contacts pollers run globally from server boot
// (server.js's startGoogleServicePollersForConnectedUsers), independent of
// whether this user has a live socket — so nothing here stops them on
// disconnect anymore. This map only tracks connection count for logging.
// Gmail itself moved off per-socket polling entirely (L-13) — a single
// BullMQ tick re-discovers connected users on its own, so there's no
// per-user start/stop call left to make here.
const userSocketCounts = new Map();

export function setupSocket(io) {
  setSocketServer(io);
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Auth required"));
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret)
        throw new Error("JWT_SECRET environment variable is not set");
      socket.user = jwt.verify(token, secret);
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`🔌 Connected: ${socket.user.name} (${socket.id})`);
    socket.join(`u:${socket.user.id}`);

    const userId = socket.user.id;
    userSocketCounts.set(userId, (userSocketCounts.get(userId) || 0) + 1);

    // Action approval — resolvePendingAction actually runs (or cancels) the
    // real side effect and updates trust score/level; this handler just
    // broadcasts the outcome to every device signed into this account.
    socket.on("action:approve", async ({ actionId, biometricConfirmed }) => {
      try {
        const outcome = await resolvePendingAction(socket.user.id, actionId, "approve", { biometricConfirmed });
        if (outcome.error) {
          socket.emit("action:failed", { actionId, error: outcome.error });
          return;
        }
        logger.info(`✅ Action approved: ${actionId} by ${socket.user.name}`);
        io.to(`u:${socket.user.id}`).emit("action:confirmed", {
          actionId,
          result: outcome.result,
          ts: new Date().toISOString(),
        });
      } catch (err) {
        logger.error(`Action approve failed: ${err.message}`);
        socket.emit("action:failed", { actionId, error: err.message });
      }
    });
    socket.on("action:deny", async ({ actionId }) => {
      try {
        const outcome = await resolvePendingAction(socket.user.id, actionId, "deny");
        if (outcome.error) {
          socket.emit("action:failed", { actionId, error: outcome.error });
          return;
        }
        logger.info(`✕ Action denied: ${actionId}`);
        io.to(`u:${socket.user.id}`).emit("action:denied", { actionId, ts: new Date().toISOString() });
      } catch (err) {
        logger.error(`Action deny failed: ${err.message}`);
        socket.emit("action:failed", { actionId, error: err.message });
      }
    });

    // Ledger sync
    socket.on("ledger:fetch", async () => {
      const entries = await ledger.getByUser(socket.user.id);
      socket.emit("ledger:data", { entries });
    });

    // Send reply directly from notification card
    socket.on(
      "gmail:send_reply",
      async ({ emailId, recipient, subject, draft, notifId }) => {
        try {
          await sendGmailReply(
            socket.user.id,
            emailId,
            recipient,
            subject,
            draft,
          );
          if (notifId) {
            try {
              await prisma.notification.update({
                where: { id: notifId },
                data: { read: true },
              });
            } catch (err) {
              logger.warn(
                `Failed to mark notification ${notifId} read after reply: ${err.message}`,
              );
            }
          }
          socket.emit("gmail:reply_sent", {
            emailId,
            notifId,
            ts: new Date().toISOString(),
          });
          logger.info(
            `Gmail reply sent by ${socket.user.name} to ${recipient}`,
          );
        } catch (err) {
          socket.emit("gmail:reply_error", {
            emailId,
            notifId,
            error: err.message,
          });
        }
      },
    );

    startCalendarPoller(socket.user.id, io);
    startContactsPoller(socket.user.id, io);

    socket.on("disconnect", (reason) => {
      const remaining = Math.max(0, (userSocketCounts.get(userId) || 1) - 1);
      if (remaining === 0) userSocketCounts.delete(userId);
      else userSocketCounts.set(userId, remaining);

      logger.info(
        `🔌 Disconnected: ${socket.user.name} (${reason}); remaining sockets: ${remaining}`,
      );
    });
  });
}
