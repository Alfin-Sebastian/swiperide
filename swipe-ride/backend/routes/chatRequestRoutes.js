const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ChatRequest = require('../models/ChatRequest');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

// Send a chat request
router.post('/send', auth, async (req, res) => {
    try {
        const { recipientId } = req.body;
        if (req.userId === recipientId) {
            return res.status(400).json({ message: "You cannot send a request to yourself." });
        }

        // Check if a request already exists
        const existingRequest = await ChatRequest.findOne({
            $or: [
                { sender: req.userId, recipient: recipientId },
                { sender: recipientId, recipient: req.userId }
            ]
        });

        if (existingRequest) {
            return res.status(400).json({ message: "A request already exists between you and this user." });
        }

        // Check if they are already in a conversation
        const existingConversation = await Conversation.findOne({
            participants: { $all: [req.userId, recipientId] }
        });

        if (existingConversation) {
            return res.status(400).json({ message: "You are already in a conversation with this user." });
        }

        const chatRequest = new ChatRequest({
            sender: req.userId,
            recipient: recipientId
        });

        await chatRequest.save();
        res.status(201).json(chatRequest);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Respond to a chat request
router.post('/:requestId/respond', auth, async (req, res) => {
    try {
        const { status } = req.body; // 'accepted' or 'rejected'
        if (!['accepted', 'rejected'].includes(status)) {
            return res.status(400).json({ message: "Invalid status." });
        }

        const chatRequest = await ChatRequest.findById(req.params.requestId);
        if (!chatRequest) {
            return res.status(404).json({ message: "Request not found." });
        }

        if (chatRequest.recipient.toString() !== req.userId) {
            return res.status(403).json({ message: "Unauthorized." });
        }

        chatRequest.status = status;
        await chatRequest.save();

        if (status === 'accepted') {
            // Create a conversation
            const conversation = new Conversation({
                participants: [chatRequest.sender, chatRequest.recipient]
            });
            await conversation.save();
            return res.json({ message: "Request accepted", conversation });
        }

        res.json({ message: `Request ${status}` });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get pending requests for current user
router.get('/pending', auth, async (req, res) => {
    try {
        const requests = await ChatRequest.find({
            recipient: req.userId,
            status: 'pending'
        }).populate('sender', 'name avatar');
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
