const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// List user's conversations
router.get('/', auth, async (req, res) => {
    try {
        const conversations = await Conversation.find({
            participants: req.userId
        })
            .populate('participants', 'name avatar')
            .populate({
                path: 'lastMessage',
                select: 'text timestamp sender'
            })
            .sort({ updatedAt: -1 });

        res.json(conversations);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get a single conversation by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const conversation = await Conversation.findOne({
            _id: req.params.id,
            participants: req.userId
        }).populate('participants', 'name avatar role phone');

        if (!conversation) {
            return res.status(404).json({ message: 'Conversation not found' });
        }

        res.json(conversation);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get messages for a specific conversation
router.get('/:id/messages', auth, async (req, res) => {
    try {
        const messages = await Message.find({
            conversation: req.params.id
        }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Send a message in a conversation (DM)
router.post('/:id/messages', auth, async (req, res) => {
    try {
        const { text } = req.body;
        const conversationId = req.params.id;

        // Verify user is participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.includes(req.userId)) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const message = new Message({
            conversation: conversationId,
            sender: req.userId,
            text
        });

        await message.save();

        conversation.lastMessage = message._id;
        conversation.updatedAt = Date.now();
        await conversation.save();

        // Emit via socket for real-time delivery
        const io = req.app.get('io');
        if (io) {
            // Notify all participants in real-time
            conversation.participants.forEach(participantId => {
                if (participantId.toString() !== req.userId) {
                    io.to(participantId.toString()).emit('new-message', {
                        ...message.toObject(),
                        conversationId: conversation._id
                    });
                }
            });
        }

        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
