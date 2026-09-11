import express from "express";

import {
  createMessage,
  getMessages,
  deleteMessagesFrom,
} from "../controllers/message.controller.js";

const router = express.Router();

router.post("/", createMessage);

router.get("/:conversationId", getMessages);

router.delete("/:conversationId/from/:messageId", deleteMessagesFrom);

export default router;
