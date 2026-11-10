const Notification = require('../models/Notification');

/**
 * notificationService
 * Unified service to handle in-app, socket, and (future) push/email notifications.
 */
const notificationService = {
    /**
     * notify
     * @param {Object} io - Socket.io instance
     * @param {Object} params - { recipient, sender, type, title, message, link }
     */
    async notify(io, { recipient, sender, type, title, message, link }) {
        try {
            // 1. Persist to Database
            const notification = new Notification({
                recipient,
                sender,
                type,
                title,
                message,
                link
            });
            await notification.save();

            // 2. Real-time emit via Socket.IO
            if (io) {
                // Emit to the specific user room
                io.to(recipient.toString()).emit('new-notification', notification);
            }

            // 3. (Mock) Fallbacks for SMS/Email can be added here
            console.log(`[Notification Service] User ${recipient}: ${title} - ${message}`);

            return notification;
        } catch (error) {
            console.error('[Notification Service] Error:', error);
        }
    }
};

module.exports = notificationService;
