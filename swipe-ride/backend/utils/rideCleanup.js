const Ride = require('../models/Ride');
const User = require('../models/User');

/* ============================================================
   Ride Cleanup Cron Job
   - Runs every minute
   - Auto-cancels expired rides
============================================================ */

async function cleanupExpiredRides(io) {
    try {
        const now = new Date();

        // Find all rides that have expired
        const expiredRides = await Ride.find({
            status: 'requested',
            expiresAt: { $lte: now }
        });

        if (expiredRides.length === 0) {
            return;
        }

        console.log(`[Ride Cleanup] Found ${expiredRides.length} expired rides`);

        for (const ride of expiredRides) {
            ride.status = 'cancelled';
            ride.cancelledAt = new Date();
            ride.cancelReason = 'timeout';

            await ride.save();

            // Broadcast to ALL drivers so they remove it from their available/scheduled lists
            if (io) {
                io.emit("ride-taken", { rideId: ride._id });
            }

            console.log(`[Ride Cleanup] Cancelled ride ${ride._id} due to timeout`);
        }

        console.log(`[Ride Cleanup] Cleanup complete`);
    } catch (error) {
        console.error('[Ride Cleanup] Error:', error);
    }
}

// Run every 1 minute
function startRideCleanup(io) {
    console.log('[Ride Cleanup] Starting ride cleanup cron job');

    // Run immediately on startup
    cleanupExpiredRides(io);

    // Then run every minute
    setInterval(() => cleanupExpiredRides(io), 60 * 1000);
}

module.exports = { startRideCleanup, cleanupExpiredRides };
