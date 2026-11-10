const User = require('../models/User');

/* ============================================================
   Verification Cleanup Cron Job
   - Runs daily at midnight
   - Checks for expired driver documents
   - Changes status from approved → pending
   - Disables driver availability
============================================================ */

async function checkExpiredVerifications(io) {
    try {
        const now = new Date();

        // Find all approved drivers with expired verification
        const expiredDrivers = await User.find({
            role: 'driver',
            verificationStatus: 'approved',
            verificationExpiresAt: { $lte: now }
        });

        if (expiredDrivers.length === 0) {
            console.log('[Verification Cleanup] No expired verifications found');
            return;
        }

        console.log(`[Verification Cleanup] Found ${expiredDrivers.length} drivers with expired documents`);

        for (const driver of expiredDrivers) {
            // Change status to pending (requires re-verification)
            driver.verificationStatus = 'pending';
            driver.availability = false; // Disable going online
            driver.isVerificationLocked = false; // Allow re-upload
            driver.isDocsSubmitted = false; // Must resubmit
            driver.onboardingCompleted = false; // Block from dashboard
            driver.verificationNotes = 'Documents expired. Please re-upload and submit for verification.';

            await driver.save();

            console.log(`[Verification Cleanup] Disabled driver ${driver._id} - ${driver.name} (expired: ${driver.verificationExpiresAt})`);

            // 💡 EMIT RE-VERIFICATION REQUIRED NOTIFICATION
            if (io) {
                io.to(driver._id.toString()).emit("re-verification-required", {
                    message: "Your documents have expired. Please re-submit verification."
                });
            }
        }

        console.log(`[Verification Cleanup] Successfully processed ${expiredDrivers.length} expired verifications`);
    } catch (error) {
        console.error('[Verification Cleanup] Error:', error);
    }
}

// Run daily at midnight
function startVerificationCleanup(io) {
    console.log('[Verification Cleanup] Starting verification cleanup cron job');

    // Run immediately on startup (for testing)
    checkExpiredVerifications(io);

    // Then run every 24 hours (86400000 ms)
    setInterval(() => checkExpiredVerifications(io), 24 * 60 * 60 * 1000);
}

module.exports = { startVerificationCleanup, checkExpiredVerifications };
