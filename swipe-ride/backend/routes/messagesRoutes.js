const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const messageController = require("../controllers/messagesController");

// GET previous messages
router.get("/:rideId", auth, messageController.getMessages);

// POST a new message
router.post("/:rideId", auth, messageController.sendMessage);

module.exports = router;
