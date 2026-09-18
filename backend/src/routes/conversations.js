import express from "express";

import {
  createConversation,
  getConversations,
  getLatestConversation,
} from "../controllers/conversation.controller.js";

const router = express.Router();

router.post("/", createConversation);

router.get("/latest", getLatestConversation);

router.get("/", getConversations);

export default router;
