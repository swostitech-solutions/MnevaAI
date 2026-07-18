import express from "express";

import {
  createConversation,
  getConversations,
} from "../controllers/conversation.controller.js";

const router = express.Router();

router.post("/", createConversation);

router.get("/", getConversations);

export default router;
