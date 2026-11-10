const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const SOS = require('../models/SOS');
const User = require('../models/User');
const Ride = require('../models/Ride');
const Notification = require('../models/Notification');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Mock SMS Service
const sendMockSMS = (to, body) => {
  console.log(`\n[MOCK SMS SERVICE]`);
  console.log(`To: ${to}`);
  console.log(`Message: ${body}`);
  console.log(`Sent at: ${new Date().toISOString()}`);
  console.log(`-----------------------------------`);
};

// Trigger SOS
router.post('/trigger', auth, async (req, res) => {
  try {
    const { rideId, notes, location } = req.body;

    // Get user's current location and contacts
    const user = await User.findById(req.userId);

    // Create SOS alert - Prefer provided location over user's stored location
    const sos = new SOS({
      user: req.userId,
      ride: rideId,
      location: location || user.currentLocation,
      notes
    });

    await sos.save();

    // Populate user and ride info for the real-time socket emission
    await sos.populate('user', 'name phone email avatar');
    await sos.populate({
      path: 'ride',
      populate: [
        { path: 'driver', select: 'name' },
        { path: 'passenger', select: 'name' }
      ]
    });

    // Emit SOS alert via Socket.IO
    const io = req.app.get('io');
    io.emit('new-sos-alert', sos);

    // PERSISTENT NOTIFICATION FOR ALL ADMINS
    const notificationService = require('../services/notificationService');
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await notificationService.notify(io, {
        recipient: admin._id,
        sender: req.userId,
        type: 'sos',
        title: '🚨 EMERGENCY SOS ALERT',
        message: `${user.name} has triggered an SOS!`,
        link: '/admin/sos'
      });
    }

    // NOTIFY EMERGENCY CONTACTS
    let contactsCount = 0;
    if (user.emergencyContacts && user.emergencyContacts.length > 0) {
      const lat = sos.location?.lat || 0;
      const lng = sos.location?.lng || 1; // Default to something identifiable if 0
      const message = `🚨 SOS ALERT! ${user.name} has triggered an emergency SOS.\n📍 Location: https://maps.google.com/?q=${lat},${lng}\n📝 Notes: ${notes || 'No details provided.'}`;

      for (const contact of user.emergencyContacts) {
        // Always send mock SMS if phone exists
        if (contact.phone) {
          sendMockSMS(contact.phone, message);
          contactsCount++;
        }

        // If contact is a registered system user, also send in-app chat message
        if (contact.systemUserId) {
          try {
            // Send in-app notification
            await notificationService.notify(io, {
              recipient: contact.systemUserId,
              sender: req.userId,
              type: 'sos',
              title: '🚨 EMERGENCY SOS ALERT',
              message: `${user.name} has triggered an SOS!`,
              link: `/sos-chat/${sos._id}`
            });

            // Find or create conversation between SOS user and emergency contact
            let conversation = await Conversation.findOne({
              participants: { $all: [req.userId, contact.systemUserId] }
            });
            if (!conversation) {
              conversation = new Conversation({
                participants: [req.userId, contact.systemUserId]
              });
              await conversation.save();
              console.log(`[SOS] Created new conversation between ${user.name} and emergency contact ${contact.name}`);
            }

            // Send the full SOS alert as a chat message
            const chatMsg = new Message({
              conversation: conversation._id,
              sender: req.userId,
              text: message
            });
            await chatMsg.save();

            // Update conversation metadata
            conversation.lastMessage = chatMsg._id;
            conversation.updatedAt = Date.now();
            await conversation.save();

            // Real-time delivery via socket to the emergency contact
            io.to(contact.systemUserId.toString()).emit('new-message', {
              ...chatMsg.toObject(),
              conversationId: conversation._id
            });

            console.log(`[SOS] Sent in-app chat message to emergency contact ${contact.name} (${contact.systemUserId})`);
          } catch (contactErr) {
            console.error(`[SOS] Error notifying system contact ${contact.name}:`, contactErr);
          }
        }
      }

    } else {
      console.log(`[SOS] No emergency contacts found for user ${user.name}`);
    }

    res.status(201).json({
      message: 'SOS triggered and emergency services notified',
      sos
    });

  } catch (error) {
    console.error('SOS Trigger Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get active SOS alert
router.get('/active', auth, async (req, res) => {
  try {
    const sosAlerts = await SOS.find({ status: 'active' })
      .populate('user', 'name phone email avatar emergencyContacts')
      .populate({
        path: 'ride',
        populate: [
          { path: 'driver', select: 'name' },
          { path: 'passenger', select: 'name' }
        ]
      })
      .sort({ createdAt: -1 });

    res.json(sosAlerts);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Resolve SOS alert
router.post('/:sosId/resolve', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const { notes } = req.body;

    const sos = await SOS.findById(req.params.sosId);
    if (!sos) {
      return res.status(404).json({ message: 'SOS alert not found' });
    }

    sos.status = 'resolved';
    sos.resolvedBy = req.userId;
    sos.resolvedAt = new Date();
    if (notes) sos.notes = (sos.notes || '') + '\nResolution Notes: ' + notes;

    await sos.save();

    // Emit event
    const io = req.app.get('io');
    io.emit('sos-resolved', sos);

    res.json({
      message: 'SOS alert resolved',
      sos
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

const { PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../utils/s3Config');

// Upload SOS recording
router.post('/:sosId/recording', auth, async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio) return res.status(400).json({ message: 'No audio provided' });

    const sos = await SOS.findById(req.params.sosId);
    if (!sos) return res.status(404).json({ message: 'SOS not found' });

    const buffer = Buffer.from(audio.split(',')[1], 'base64');
    const fileName = `recordings/sos_recording_${req.params.sosId}_${Date.now()}.webm`;

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: 'audio/webm'
    };

    await s3Client.send(new PutObjectCommand(uploadParams));

    sos.recordingUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    await sos.save();

    res.json({ message: 'Recording uploaded successfully', recordingUrl: sos.recordingUrl });
  } catch (error) {
    console.error('SOS recording upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Get all SOS alerts
router.get('/history', auth, async (req, res) => {
  try {
    const sosAlerts = await SOS.find()
      .populate('user', 'name phone')
      .populate('resolvedBy', 'name')
      .sort({ createdAt: -1 });

    res.json(sosAlerts);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;