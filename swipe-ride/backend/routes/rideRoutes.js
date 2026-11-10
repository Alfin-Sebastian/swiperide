const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Ride = require('../models/Ride');
const User = require('../models/User');
const Message = require('../models/Message');
const { generateUPIQR } = require('../utils/paymentUtils');

/* ============================================================
   Helper: Haversine distance (kilometers)
============================================================ */
function getDistance(loc1, loc2) {
  if (!loc1 || !loc2 || loc1.lat == null || loc2.lat == null) return Infinity;

  const R = 6371;
  const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
  const dLon = (loc2.lng - loc1.lng) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(loc1.lat * Math.PI / 180) *
    Math.cos(loc2.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ============================================================
   State Machine Validator
============================================================ */
const VALID_TRANSITIONS = {
  'requested': ['accepted', 'cancelled', 'scheduled'],
  'scheduled': ['accepted', 'cancelled'],
  'accepted': ['arrived', 'cancelled'],
  'arrived': ['in_progress', 'cancelled'],
  'in_progress': ['completed', 'cancelled'],
  'completed': [],
  'cancelled': []
};

function isValidTransition(currentStatus, newStatus) {
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
  return allowedTransitions.includes(newStatus);
}

function getExpiryTime() {
  return new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
}

/* ============================================================
   Fare Calculation (Secure Backend Logic)
============================================================ */
function calculateFare(km) {
  const base = 50;   // ₹50 base
  const perKm = 15;  // ₹15 per km
  return Math.max(base + km * perKm, 60); // Minimum ₹60
}

/* ============================================================
   1️⃣ GET RIDE HISTORY
============================================================ */
router.get('/history/user', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    let query = {};
    if (user.role === "passenger") query.passenger = req.userId;
    if (user.role === "driver") query.driver = req.userId;

    const rides = await Ride.find(query)
      .populate("driver", "name avatar phone vehicleDetails rating")
      .populate("passenger", "name avatar phone")
      .sort({ requestedAt: -1 });

    const ridesData = rides.map(ride => {
      const r = ride.toObject();
      if (user.role === "driver") {
        delete r.otp;
      }
      return r;
    });

    res.json(ridesData);
  } catch (error) {
    console.error("History fetch error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   2️⃣ CREATE RIDE REQUEST
============================================================ */
router.post('/request', auth, async (req, res) => {
  try {
    const { pickup, destination, matchingMode, vehicleType, driverPreference, fare: frontendFare, distance: frontendDistance } = req.body;

    // SECURE: Calculate straight-line distance on backend as a baseline
    const straightLineDistance = getDistance(pickup?.coordinates, destination?.coordinates);

    // trust the frontend distance (OSRM road distance) if it's reasonably larger than straight-line distance
    // otherwise fallback to straight-line distance calculation
    const distance = (frontendDistance && isFinite(frontendDistance) && frontendDistance >= straightLineDistance * 0.9)
      ? frontendDistance
      : straightLineDistance;

    const safeDistance = isFinite(distance) ? distance : 0;

    // Similarly trust frontend fare if it's within range, otherwise recalculate
    let fare = frontendFare;
    if (!fare || fare < calculateFare(safeDistance) * 0.8) {
      fare = calculateFare(safeDistance);
    }

    const ride = new Ride({
      passenger: req.userId,
      pickup,
      destination,
      matchingMode: matchingMode || 'quick',
      vehicleType: vehicleType || null,
      driverPreference: driverPreference || null,
      scheduledTime: req.body.scheduledTime || null,
      status: req.body.scheduledTime ? 'scheduled' : 'requested',
      distance: safeDistance,
      fare: isFinite(fare) ? fare : 1.0,
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      expiresAt: req.body.scheduledTime ? null : getExpiryTime()
    });

    // Ensure coordinates are numbers (prevent cast errors)
    if (ride.pickup?.coordinates) {
      ride.pickup.coordinates.lat = Number(ride.pickup.coordinates.lat);
      ride.pickup.coordinates.lng = Number(ride.pickup.coordinates.lng);
    }
    if (ride.destination?.coordinates) {
      ride.destination.coordinates.lat = Number(ride.destination.coordinates.lat);
      ride.destination.coordinates.lng = Number(ride.destination.coordinates.lng);
    }

    await ride.save();

    const io = req.app.get('io');
    if (!io) {
      console.error("[CRITICAL] Socket.io instance NOT found in req.app");
    }

    // 1️⃣ HANDLE DIRECT DRIVER ASSIGNMENT (SWIPE MATCH / FAVORITES)
    if (ride.driverPreference) {
      ride.driver = ride.driverPreference;
      // Also update matchingMode if it was quick but had a preference
      if (ride.matchingMode === 'quick') ride.matchingMode = 'swipe';
      await ride.save();

      const populatedRide = await Ride.findById(ride._id)
        .populate("driver", "name avatar phone vehicleDetails rating")
        .populate("passenger", "name avatar phone");

      // Notify ONLY the targeted driver
      if (io) {
        io.to(ride.driverPreference.toString()).emit("smart-ride-request", { ride: populatedRide });
      }

      // PERSISTENT NOTIFICATION
      const notificationService = require('../services/notificationService');
      await notificationService.notify(io, {
        recipient: ride.driverPreference,
        sender: req.userId,
        type: 'ride',
        title: 'Direct Ride Request',
        message: `${populatedRide.passenger.name} has requested a ride from you.`,
        link: `/driver/ride/${ride._id}`
      });

      return res.json({ ride: populatedRide });
    }

    // 2️⃣ HANDLE SMART MATCH (FIND BEST DRIVER)
    if (ride.matchingMode === 'smart') {
      // Find candidates
      let candidates = await User.find({
        role: 'driver',
        availability: true, // For scheduled, maybe they aren't online now, but we'll try online first
        verificationStatus: 'approved',
        currentLocation: { $ne: null }
      });

      // If no online drivers, try any approved driver (less ideal but works for scheduled)
      if (ride.scheduledTime && candidates.length === 0) {
        candidates = await User.find({
          role: 'driver',
          verificationStatus: 'approved'
        });
      }

      if (candidates.length === 0) {
        // No drivers found for Smart Match -> Stay private/pending, NO global broadcast
        return res.json({ ride, message: "No suitable drivers found for Smart Match yet." });
      }

      // Score candidates (using location if available, otherwise just rating)
      const scored = candidates.map(d => {
        const distToDriver = getDistance(ride.pickup?.coordinates, d.currentLocation || d.location);
        const rating = d.rating || 4;
        const load = d.activeRides || 0;

        const score =
          (1 / (isFinite(distToDriver) ? distToDriver + 1 : 100)) * 0.6 +
          (rating / 5) * 0.3 +
          (1 / (load + 1)) * 0.1;

        return { driver: d, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];

      ride.driver = best.driver._id;
      await ride.save();

      const populatedRide = await Ride.findById(ride._id)
        .populate("driver", "name avatar phone vehicleDetails rating")
        .populate("passenger", "name avatar phone");

      if (io && best.driver) {
        const target = best.driver.socketId || best.driver._id.toString();
        io.to(target).emit("smart-ride-request", { ride: populatedRide });
      }

      // PERSISTENT NOTIFICATION
      const notificationService = require('../services/notificationService');
      await notificationService.notify(io, {
        recipient: best.driver._id,
        sender: req.userId,
        type: 'ride',
        title: ride.scheduledTime ? 'New Scheduled Smart Match' : 'New Smart Match',
        message: `You've been matched for a ${ride.scheduledTime ? 'scheduled ' : ''}ride request near ${ride.pickup.address.split(',')[0]}.`,
        link: `/driver/ride/${ride._id}`
      });

      return res.json({ ride: populatedRide });
    }

    // 3️⃣ GLOBAL BROADCAST (QUICK MATCH / OPEN REQUESTS)
    if (io) {
      io.emit("new-ride-request", ride);
    }
    res.json({ ride });
  } catch (error) {
    console.error("Ride request error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   3️⃣ GET AVAILABLE RIDES (DRIVER)
============================================================ */
router.get('/available', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== "driver") {
      return res.status(403).json({ message: "Drivers only" });
    }

    const rides = await Ride.find({
      status: "requested",
      driver: null,
      rejectedBy: { $ne: req.userId }
    }).select('-otp').populate("passenger", "name avatar phone");

    res.json(rides);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   3️⃣.5️⃣ GET AVAILABLE SCHEDULED RIDES (DRIVER)
============================================================ */
router.get('/available-scheduled', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== "driver") {
      return res.status(403).json({ message: "Drivers only" });
    }

    const rides = await Ride.find({
      status: "scheduled",
      driver: null,
      scheduledTime: { $gt: new Date() },
      rejectedBy: { $ne: req.userId }
    }).select('-otp').populate("passenger", "name avatar phone");

    res.json(rides);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   4️⃣ ACCEPT RIDE
============================================================ */
router.post('/:rideId/accept', auth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });

    if (ride.status !== "requested" && ride.status !== "scheduled") {
      return res.status(400).json({ message: "Ride not available" });
    }

    // ATOMIC UPDATE: Only accept if status is still 'requested' or 'scheduled' and driver is null
    const updatedRide = await Ride.findOneAndUpdate(
      {
        _id: req.params.rideId,
        status: { $in: ["requested", "scheduled"] },
        driver: null
      },
      {
        $set: {
          driver: req.userId,
          status: ride.status === 'scheduled' ? 'scheduled' : 'accepted',
          acceptedAt: ride.status === 'scheduled' ? undefined : new Date()
        }
      },
      { new: true }
    );

    if (!updatedRide) {
      return res.status(400).json({ message: "Ride is no longer available or has been taken" });
    }

    await User.findByIdAndUpdate(req.userId, {
      availability: false,
      $inc: { activeRides: 1 }
    });

    const populatedRide = await Ride.findById(updatedRide._id)
      .populate("driver", "name avatar phone vehicleDetails rating")
      .populate("passenger", "name avatar phone");

    const io = req.app.get('io');
    if (io) {
      io.to(ride.passenger.toString()).emit("ride-accepted", { ride: populatedRide });
      // Broadcast to ALL drivers that this ride is no longer available
      io.emit("ride-taken", { rideId: ride._id });
    }

    res.json({ ride: populatedRide });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   4.5️⃣ REJECT RIDE (DRIVER)
============================================================ */
router.post('/:rideId/reject', auth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });

    // Only allow rejection for certain statuses
    if (!['requested', 'scheduled'].includes(ride.status)) {
      return res.status(400).json({ message: "Ride cannot be rejected in current status" });
    }

    // Add this driver to rejectedBy list using string comparison for reliability
    if (!ride.rejectedBy.some(id => id.toString() === req.userId)) {
      ride.rejectedBy.push(req.userId);
    }

    // Security check: Is this a targeted request for this driver?
    const isAssigned = ride.driver && ride.driver.toString() === req.userId;
    const isPreferred = ride.driverPreference && ride.driverPreference.toString() === req.userId;

    // If it was targeted, free the ride up (it will still be filtered out for THIS driver)
    if (isAssigned || isPreferred) {
      ride.driver = null;
      ride.status = 'requested';
    }

    await ride.save();

    const populatedRide = await Ride.findById(ride._id)
      .populate("passenger", "name avatar phone");

    const io = req.app.get('io');
    if (io) {
      // Notify passenger that the specific driver declined
      io.to(ride.passenger.toString()).emit("ride-rejected", {
        rideId: ride._id,
        message: "The driver has declined your request."
      });

      // IMPORTANT: Broadcast to all drivers that this ride's assignment changed 
      // This ensures other drivers might now see it as available (if it was targeted)
      // while THIS driver will filter it out via the rejectedBy list.
      io.emit("new-ride-request", populatedRide);
    }

    return res.json({ message: "Ride request rejected", ride: populatedRide });
  } catch (error) {
    console.error("Reject ride error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   5️⃣ UPDATE RIDE STATUS
============================================================ */
router.post('/:rideId/status', auth, async (req, res) => {
  try {
    const { status, currentLocation } = req.body;
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });

    // Validate state transition
    const userRole = req.userRole; // Assuming this is attached by auth middleware
    const userId = req.userId;

    // SECURITY: Ensure only the assigned driver or an admin can update status
    const isDriver = ride.driver && String(ride.driver) === String(userId);
    const user = await User.findById(userId);
    const isAdmin = user && user.role === 'admin';

    if (!isDriver && !isAdmin) {
      return res.status(403).json({ message: "Unauthorized: Only the assigned driver can update ride status" });
    }

    if (!isValidTransition(ride.status, status)) {
      return res.status(400).json({
        message: `Invalid status transition from '${ride.status}' to '${status}'`,
        currentStatus: ride.status,
        attemptedStatus: status
      });
    }

    ride.status = status;
    if (currentLocation) ride.currentLocation = currentLocation;

    if (status === "in_progress") {
      // OTP Verification
      const { otp } = req.body;
      if (!otp) {
        return res.status(400).json({ message: "OTP is required to start the ride" });
      }
      if (otp !== ride.otp) {
        return res.status(400).json({ message: "Invalid OTP" });
      }
      ride.otpVerified = true;
      if (!ride.startedAt) ride.startedAt = new Date();
    }

    if (status === "completed" && !ride.completedAt) {
      const { tipAmount, paymentMethod } = req.body;
      if (tipAmount !== undefined) {
        ride.tipAmount = parseFloat(tipAmount) || 0;
        ride.finalAmount = (ride.fare || 0) + ride.tipAmount;
      } else {
        ride.finalAmount = ride.finalAmount || ride.fare || 0;
      }

      if (paymentMethod) {
        ride.paymentMethod = paymentMethod;
      }

      // If cash, we can mark payment as completed. If UPI, it stays pending until confirmed (or assumed for now)
      if (ride.paymentMethod === 'cash') {
        ride.paymentStatus = 'completed';
      }

      ride.completedAt = new Date();
      await User.findByIdAndUpdate(ride.driver, {
        availability: true,
        $inc: { activeRides: -1 }
      });
    }

    if (status === "cancelled" && !ride.cancelledAt) {
      ride.cancelledAt = new Date();
      // Free up driver if assigned
      if (ride.driver) {
        await User.findByIdAndUpdate(ride.driver, {
          availability: true,
          $inc: { activeRides: -1 }
        });
      }
    }

    await ride.save();

    const populatedRide = await Ride.findById(ride._id)
      .populate("driver", "name avatar phone vehicleDetails rating")
      .populate("passenger", "name avatar phone");

    req.app.get("io")
      .to(ride._id.toString())
      .emit("ride-status-update", { ride: populatedRide });

    res.json({ ride: populatedRide });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   6️⃣ GET RIDE DETAILS
============================================================ */
router.get('/:rideId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const ride = await Ride.findById(req.params.rideId)
      .populate("driver", "name avatar phone vehicleDetails rating")
      .populate("passenger", "name avatar phone");

    if (!ride) return res.status(404).json({ message: "Ride not found" });

    // SECURE: Access Control
    const isPassenger = ride.passenger?._id.toString() === req.userId;
    const isDriver = ride.driver?._id.toString() === req.userId;
    const isAdmin = user.role === 'admin';

    if (!isPassenger && !isDriver && !isAdmin) {
      return res.status(403).json({ message: "Unauthorized access to ride details" });
    }

    const rideData = ride.toObject();
    if (isDriver && !isAdmin) {
      delete rideData.otp;
    }

    res.json(rideData);
  } catch (error) {
    console.error("Fetch ride details error:", error);
    res.status(500).json({ message: "Server error" });
  }
});





/* ============================================================
   8.5️⃣ CANCEL RIDE
============================================================ */
router.post('/:rideId/cancel', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const ride = await Ride.findById(req.params.rideId);

    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Only allow cancellation for certain statuses
    if (!['requested', 'scheduled', 'accepted', 'arrived'].includes(ride.status)) {
      return res.status(400).json({
        message: `Cannot cancel ride with status '${ride.status}'`
      });
    }

    // Determine who is cancelling
    const user = await User.findById(req.userId);
    let cancelReason = 'passenger';

    if (user.role === 'driver') {
      cancelReason = 'driver';
    } else if (user.role === 'admin') {
      cancelReason = 'system';
    }

    // Override with provided reason if it's 'timeout'
    if (reason === 'timeout') {
      cancelReason = 'timeout';
    }

    ride.status = 'cancelled';
    ride.cancelledAt = new Date();
    ride.cancelReason = cancelReason;

    // Free up driver if assigned
    if (ride.driver) {
      await User.findByIdAndUpdate(ride.driver, {
        availability: true,
        $inc: { activeRides: -1 }
      });
    }

    await ride.save();

    const populatedRide = await Ride.findById(ride._id)
      .populate("driver", "name avatar phone vehicleDetails rating")
      .populate("passenger", "name avatar phone");

    const io = req.app.get("io");
    if (io) {
      io.to(ride._id.toString()).emit("ride-cancelled", { ride: populatedRide });
      // Also broadcast globally so other drivers remove it from their available/scheduled lists
      io.emit("ride-taken", { rideId: ride._id });
    }

    res.json({ message: "Ride cancelled successfully", ride: populatedRide });
  } catch (error) {
    console.error("Cancel ride error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   9️⃣ RATE RIDE (PASSENGER)
============================================================ */
router.post('/:rideId/rate', auth, async (req, res) => {
  try {
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Invalid rating value" });
    }

    const ride = await Ride.findById(req.params.rideId);
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Only passenger who booked can rate
    if (ride.passenger.toString() !== req.userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Ride must be completed
    if (ride.status !== "completed") {
      return res.status(400).json({ message: "Ride not completed" });
    }

    // Prevent double rating
    if (ride.passengerRating) {
      return res.status(400).json({ message: "Ride already rated" });
    }

    // ✅ FIXED: Use schema fields
    ride.passengerRating = rating;
    ride.passengerReview = review || "";

    await ride.save();

    // 🔁 Recalculate driver's average rating
    const ratedRides = await Ride.find({
      driver: ride.driver,
      passengerRating: { $ne: null }
    });

    const avgRating =
      ratedRides.reduce((sum, r) => sum + r.passengerRating, 0) /
      ratedRides.length;

    await User.findByIdAndUpdate(ride.driver, {
      rating: Number(avgRating.toFixed(2))
    });

    res.json({ message: "Rating submitted successfully" });
  } catch (error) {
    console.error("Rating error:", error);
    res.status(500).json({ message: "Server error" });
  }
});




/* ============================================================
   🔟 GUEST TRIP VIEW (PUBLIC)
   ============================================================ */
router.get('/guest/:rideId', async (req, res) => {
  try {
    // SECURE: Filter fields strictly to prevent PII exposure
    const ride = await Ride.findById(req.params.rideId)
      .select('pickup destination status currentLocation route driver passenger requestedAt')
      .populate('driver', 'name vehicleDetails rating')
      .populate('passenger', 'name');

    if (!ride) return res.status(404).json({ message: "Trip not found" });

    const rideData = ride.toObject();
    delete rideData.otp; // Explicitly delete if it somehow got selected

    // Only allow tracking active rides
    const inactiveStatuses = ['completed', 'cancelled'];
    if (inactiveStatuses.includes(rideData.status)) {
      // If completed more than 1 hour ago, hide it
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if ((rideData.completedAt || rideData.requestedAt) < oneHourAgo) {
        return res.status(410).json({ message: "Tracking session expired" });
      }
    }

    res.json(rideData);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   11️⃣ GET PAYMENT QR CODE
   ============================================================ */
router.get('/:rideId/payment-qr', auth, async (req, res) => {
  try {
    const { tip, method } = req.query;
    const tipAmount = Math.max(0, parseFloat(tip) || 0);
    const paymentMethod = method || 'upi';

    const ride = await Ride.findById(req.params.rideId)
      .populate("driver", "name upiId");

    if (!ride) return res.status(404).json({ message: "Ride not found" });

    // Check if the requesting user is the passenger or the assigned driver
    const isPassenger = ride.passenger.toString() === req.userId;
    const isDriver = ride.driver && ride.driver._id.toString() === req.userId;

    if (!isPassenger && !isDriver) {
      return res.status(403).json({ message: "Unauthorized access to payment details" });
    }

    // Save changes proactively
    ride.tipAmount = tipAmount;
    ride.finalAmount = (ride.fare || 0) + tipAmount;
    ride.paymentMethod = paymentMethod;
    await ride.save();

    if (paymentMethod === 'cash') {
      return res.json({
        message: "Payment method set to Cash",
        fare: ride.fare,
        tipAmount,
        totalAmount: ride.finalAmount,
        paymentMethod: 'cash'
      });
    }

    if (!ride.driver || !ride.driver.upiId) {
      return res.status(400).json({ message: "Driver UPI ID not found. Please ask driver to set it up or choose Cash." });
    }

    const { generateUPIUri } = require('../utils/paymentUtils');
    const upiUri = generateUPIUri(ride.driver.upiId, ride.driver.name, ride.finalAmount);
    const qrImage = await generateUPIQR(ride.driver.upiId, ride.driver.name, ride.finalAmount);

    res.json({
      qrImage,
      upiUri,
      fare: ride.fare,
      tipAmount,
      totalAmount: ride.finalAmount,
      upiId: ride.driver.upiId,
      paymentMethod: 'upi'
    });
  } catch (error) {
    console.error("QR Generation error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   12️⃣ PASSENGER: MARK AS PAID (AWAITING CONFIRMATION)
   ============================================================ */
router.post('/:rideId/pay-confirm', auth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });

    // Only the passenger who booked can mark as paid
    if (ride.passenger.toString() !== req.userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Only allow if status is completed or in_progress and payment is pending
    if (!['in_progress', 'completed'].includes(ride.status)) {
      return res.status(400).json({ message: "Ride must be in progress or completed to confirm payment" });
    }

    if (ride.paymentStatus !== 'pending') {
      return res.status(400).json({ message: `Payment is already ${ride.paymentStatus}` });
    }

    ride.paymentStatus = 'awaiting_driver_confirmation';
    await ride.save();

    const populatedRide = await Ride.findById(ride._id)
      .populate("driver", "name avatar phone vehicleDetails rating")
      .populate("passenger", "name avatar phone");

    req.app.get("io")
      .to(ride._id.toString())
      .emit("ride-status-update", { ride: populatedRide });

    res.json({ message: "Payment confirmation sent to driver", ride: populatedRide });
  } catch (error) {
    console.error("Pay confirm error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================================================
   13️⃣ DRIVER: CONFIRM PAYMENT RECEIVED
   ============================================================ */
router.post('/:rideId/payment-confirm', auth, async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });

    // Only the assigned driver can confirm payment
    if (ride.driver && ride.driver.toString() !== req.userId) {
      return res.status(403).json({ message: "Unauthorized: Only the assigned driver can confirm payment" });
    }

    if (ride.paymentStatus !== 'awaiting_driver_confirmation') {
      return res.status(400).json({ message: "No payment confirmation request pending" });
    }

    ride.paymentStatus = 'paid';
    ride.paymentConfirmedBy = req.userId;
    ride.paymentConfirmedAt = new Date();
    await ride.save();

    const populatedRide = await Ride.findById(ride._id)
      .populate("driver", "name avatar phone vehicleDetails rating")
      .populate("passenger", "name avatar phone");

    req.app.get("io")
      .to(ride._id.toString())
      .emit("ride-status-update", { ride: populatedRide });

    res.json({ message: "Payment confirmed successfully", ride: populatedRide });
  } catch (error) {
    console.error("Payment confirm error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
