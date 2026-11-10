const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const SystemSetting = require("../models/SystemSetting");
const Ride = require("../models/Ride");
const SOS = require("../models/SOS");
const Report = require("../models/Report");

/* ------------------------------
   ADMIN MIDDLEWARE
------------------------------ */
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

/* ------------------------------
   ADMIN DASHBOARD DATA
------------------------------ */
router.get("/dashboard", auth, isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalDrivers = await User.countDocuments({ role: "driver" });
    const totalPassengers = await User.countDocuments({ role: "passenger" });
    const totalAdmins = await User.countDocuments({ role: "admin" });

    const activeRides = await Ride.countDocuments({
      status: { $in: ["requested", "accepted", "in_progress"] }
    });
    const totalRides = await Ride.countDocuments();

    const pendingVerifications = await User.countDocuments({
      role: "driver",
      verificationStatus: "pending",
    });
    const approvedVerifications = await User.countDocuments({
      role: "driver",
      verificationStatus: "approved",
    });
    const rejectedVerifications = await User.countDocuments({
      role: "driver",
      verificationStatus: "rejected",
    });

    const activeDrivers = await User.countDocuments({
      role: "driver",
      availability: true,
      verificationStatus: "approved"
    });

    const activeSOS = await SOS.countDocuments({ status: "active" });
    const pendingReports = await Report.countDocuments({ status: "pending" });

    // Revenue stats
    const revenueStats = await Ride.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$fare" } } }
    ]);
    const totalRevenue = revenueStats[0]?.total || 0;

    // Weekly rides trend
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyRides = await Ride.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } }
    ]);

    // Average rating
    const driverStats = await User.aggregate([
      { $match: { role: "driver", rating: { $exists: true } } },
      { $group: { _id: null, avgRating: { $avg: "$rating" } } }
    ]);

    // Recent Activity
    const recentRides = await Ride.find()
      .populate("passenger", "name")
      .populate("driver", "name")
      .sort({ createdAt: -1 })
      .limit(5);

    const recentSOS = await SOS.find()
      .sort({ createdAt: -1 })
      .limit(3);

    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5);

    const recentActivity = [
      ...recentRides.map(r => ({
        id: r._id,
        type: 'ride',
        user: r.passenger?.name || 'User',
        status: r.status,
        timestamp: r.createdAt
      })),
      ...recentSOS.map(s => ({
        id: s._id,
        type: 'sos',
        user: 'Emergency',
        status: s.status,
        timestamp: s.createdAt
      })),
      ...recentUsers.map(u => ({
        id: u._id,
        type: 'user',
        user: u.name,
        status: u.verificationStatus || 'new',
        timestamp: u.createdAt
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);

    res.json({
      totalUsers,
      totalDrivers,
      totalPassengers,
      totalAdmins,
      activeRides,
      totalRides,
      pendingVerifications,
      approvedVerifications,
      rejectedVerifications,
      activeDrivers,
      activeSOS,
      pendingReports,
      totalRevenue,
      weeklyRides,
      avgRating: driverStats[0]?.avgRating || 0,
      recentActivity
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Busy Areas Analytics
router.get("/analytics/busy-areas", auth, isAdmin, async (req, res) => {
  try {
    const busyAreas = await Ride.aggregate([
      {
        $group: {
          _id: "$pickup.address",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    res.json(busyAreas);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------
   DRIVER VERIFICATION
------------------------------ */

// Get verifications (with optional status filter)
router.get("/verifications", auth, isAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const query = { role: "driver" };

    if (status && status !== 'all') {
      query.verificationStatus = status;
    }

    const drivers = await User.find(query).select("-password").sort({ updatedAt: -1 });
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Update verification status
router.post("/verifications/:driverId/update", auth, isAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const updateData = {
      verificationStatus: status,
      verificationNotes: notes,
    };

    // If rejected, allow driver to edit documents again
    if (status === 'rejected') {
      updateData.isVerificationLocked = false;
      updateData.isDocsSubmitted = false;
    }

    const driver = await User.findByIdAndUpdate(
      req.params.driverId,
      updateData,
      { new: true }
    );

    if (!driver) return res.status(404).json({ message: "Driver not found" });

    res.json({ message: `Driver verification ${status}`, driver });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------
   USER MANAGEMENT
------------------------------ */

// Get all users
router.get("/users", auth, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Toggle user status (active/inactive)
router.post("/users/:userId/status", auth, isAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isActive },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: `User status updated to ${isActive ? "active" : "inactive"}`, user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------
   RIDE MONITORING
------------------------------ */

// Get active rides
router.get("/rides/active", auth, isAdmin, async (req, res) => {
  try {
    const rides = await Ride.find({
      status: { $in: ["requested", "accepted", "in_progress"] },
    })
      .populate("passenger", "name phone")
      .populate("driver", "name phone")
      .sort({ createdAt: -1 });
    res.json(rides);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get all rides (with filters)
router.get("/rides", auth, isAdmin, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;

    const rides = await Ride.find(query)
      .populate("passenger", "name email")
      .populate("driver", "name email")
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json(rides);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------
   SYSTEM ANALYTICS
------------------------------ */
router.get("/analytics", auth, isAdmin, async (req, res) => {
  try {
    // Basic aggregation
    const revenueStats = await Ride.aggregate([
      { $match: { status: "completed" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$fare" },
          avgFare: { $avg: "$fare" },
          count: { $sum: 1 },
        },
      },
    ]);

    const dailyRides = await Ride.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]);

    res.json({
      revenue: revenueStats[0] || { totalRevenue: 0, avgFare: 0, count: 0 },
      dailyRides,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   SYSTEM SETTINGS MANAGEMENT
===================================================== */

// Get all settings
router.get("/settings", auth, isAdmin, async (req, res) => {
  try {
    const settings = await SystemSetting.find();
    res.json(settings); // Returns [{key, value}, ...]
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Update a setting
router.post("/settings", auth, isAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;

    let setting = await SystemSetting.findOneAndUpdate(
      { key },
      { value },
      { new: true, upsert: true }
    );

    res.json({ message: `Setting ${key} updated`, setting });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


/* =====================================================
   DEMAND HEATMAP DATA
===================================================== */

// Get recent ride coordinates for heatmap (last 6 hours)
router.get("/demand-coords", auth, async (req, res) => {
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    // Find rides requested recently
    const rides = await Ride.find({
      createdAt: { $gte: sixHoursAgo }
    }).select("pickup.coordinates");

    const coords = rides.map(r => r.pickup.coordinates).filter(c => c && c.lat && c.lng);

    res.json(coords);
  } catch (err) {
    console.error("Demand coords error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
