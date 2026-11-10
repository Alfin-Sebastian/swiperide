const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const User = require("../models/User");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

/* =====================================================
   GET CURRENT USER PROFILE
===================================================== */
router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select("-password")
      .populate('favoriteDrivers', 'name avatar rating vehicleDetails vehicleImage vehiclePhoto vehicleType totalRides verificationStatus createdAt')
      .populate('emergencyContacts.systemUserId', 'name phone avatar');

    // Sync image field mismatch
    if (user?.vehicleImage && !user.vehiclePhoto) {
      user.vehiclePhoto = user.vehicleImage;
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   UPDATE USER PROFILE
===================================================== */
router.put("/profile", auth, async (req, res) => {
  try {
    const { name, phone, avatar, emergencyContacts, upiId, vehicleDetails, licenseNo } = req.body;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (avatar) user.avatar = avatar;
    if (emergencyContacts) user.emergencyContacts = emergencyContacts;
    if (upiId !== undefined) user.upiId = upiId;
    if (licenseNo) user.licenseNo = licenseNo;

    if (vehicleDetails) {
      user.vehicleDetails = {
        ...user.vehicleDetails,
        ...vehicleDetails
      };
      // Sync top-level vehicleType for Smart Match
      if (vehicleDetails.type) {
        user.vehicleType = vehicleDetails.type;
      }
    }

    await user.save();

    res.json({ message: "Profile updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   UPLOAD PROFILE AVATAR
===================================================== */
router.post("/profile/avatar", auth, upload.single("avatar"), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.file) {
      user.avatar = req.file.location;
      await user.save();
      return res.json({ message: "Avatar updated", avatar: user.avatar, user });
    }

    res.status(400).json({ message: "No file uploaded" });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   LEGACY — UPDATE DRIVER LOCATION (map tracking)
===================================================== */
router.post("/location", auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;

    const updateData = {
      "location.lat": lat,
      "location.lng": lng,
      "location.lastUpdated": new Date(),
    };

    // If driver, also update Smart Match field
    const userRoleCheck = await User.findById(req.userId);
    if (userRoleCheck.role === "driver") {
      updateData.currentLocation = { lat, lng };
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      updateData,
      { new: true }
    ).select("-password");

    const io = req.app.get("io");

    if (user.role === "driver" && user.availability) {
      // Emit for Map tracking
      io.emit("driver-location-update", {
        driverId: user._id,
        location: { lat, lng },
      });
    }

    res.json({ message: "Location updated", user });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   SMART MATCH — UPDATE DRIVER LIVE LOCATION
   Used ONLY for Smart Match scoring
===================================================== */
router.post("/update-location-smart", auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;

    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "driver") {
      return res.status(400).json({ message: "Only drivers update location" });
    }

    user.currentLocation = { lat, lng };
    await user.save();

    res.json({
      success: true,
      message: "Smart location updated",
      currentLocation: user.currentLocation,
    });
  } catch (error) {
    console.error("Smart location update error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   GET VERIFIED AVAILABLE DRIVERS
===================================================== */
router.get("/drivers/available", auth, async (req, res) => {
  try {
    const drivers = await User.find({
      role: "driver",
      availability: true,
      verificationStatus: "approved",
    }).select("-password");

    res.json(drivers);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   UPDATE DRIVER AVAILABILITY
===================================================== */
router.post("/availability", auth, async (req, res) => {
  try {
    const { availability } = req.body;

    const user = await User.findById(req.userId);

    if (user.role !== "driver") {
      return res
        .status(400)
        .json({ message: "Only drivers can update availability" });
    }

    if (user.verificationStatus !== "approved") {
      return res.status(403).json({
        message: "You must be verified before going online.",
      });
    }

    user.availability = availability;
    await user.save();

    res.json({
      message: `Availability ${availability ? "enabled" : "disabled"}`,
      availability: user.availability,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   UPDATE VEHICLE TYPE (Smart Match Filter)
===================================================== */
router.post("/vehicle-type", auth, async (req, res) => {
  try {
    const { vehicleType } = req.body;

    const user = await User.findById(req.userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role !== "driver") {
      return res.status(400).json({ message: "Only drivers can update vehicle type" });
    }

    user.vehicleType = vehicleType;
    await user.save();

    res.json({
      success: true,
      message: "Vehicle type updated",
      vehicleType: user.vehicleType,
    });
  } catch (error) {
    console.error("Vehicle type error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   UPLOAD DRIVER DOCUMENTS
===================================================== */
router.post(
  "/upload-docs",
  auth,
  upload.fields([
    { name: "license", maxCount: 1 },
    { name: "idProof", maxCount: 1 },
    { name: "vehicleImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (user.role !== "driver")
        return res
          .status(403)
          .json({ message: "Only drivers can upload verification documents." });

      // Only block if status is currently pending (waiting for review)
      if (user.verificationStatus === 'pending' && user.isVerificationLocked) {
        return res.status(403).json({
          message: "Documents are locked while awaiting review.",
        });
      }

      // If already approved, reset to 'none' to invalidate current verification
      // If rejected, just stay rejected (the driver is editing a draft)
      if (user.verificationStatus === 'approved') {
        user.verificationStatus = "none";
        user.isVerificationLocked = false;
        user.availability = false; // Disable if they were online
        user.verificationNotes = "Documents updated. Awaiting re-submission.";
      }

      // Ensure flags are reset so they can submit again
      user.isDocsSubmitted = false;
      user.isVerificationLocked = false;

      const files = req.files || {};

      if (files.license?.[0]) {
        user.licenseImage = files.license[0].location;
      }
      if (files.idProof?.[0]) {
        user.idProofImage = files.idProof[0].location;
      }
      if (files.vehicleImage?.[0]) {
        user.vehicleImage = files.vehicleImage[0].location;
      }

      // Reset flags - Note: Status stays as is until Submit button is clicked
      user.isDocsSubmitted = false;

      await user.save();

      res.json({ message: "Documents uploaded successfully", user });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Server error during upload" });
    }
  }
);

/* =====================================================
   SUBMIT VERIFICATION (LOCK DOCUMENTS)
===================================================== */
router.post("/submit-verification", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (user.role !== "driver") {
      return res
        .status(403)
        .json({ message: "Only drivers can submit verification." });
    }

    if (
      !user.licenseImage ||
      !user.idProofImage ||
      !user.vehicleImage ||
      !user.insuranceDocument ||
      !user.registrationDocument ||
      !user.licenseExpiryDate ||
      !user.insuranceExpiryDate ||
      !user.registrationExpiryDate ||
      !user.licenseNo ||
      !user.vehicleDetails?.make ||
      !user.vehicleDetails?.model ||
      !user.vehicleDetails?.year ||
      !user.vehicleDetails?.color ||
      !user.vehicleDetails?.plateNo ||
      !user.vehicleType
    ) {
      return res
        .status(400)
        .json({
          message: "Profile incomplete. Please ensure all documents are uploaded, expiry dates are set, and your License Number and Vehicle Details are fully filled out in your profile."
        });
    }

    user.isDocsSubmitted = true;
    user.isVerificationLocked = true;
    user.verificationStatus = "pending";
    user.verificationSubmittedAt = new Date();

    await user.save();

    const io = req.app.get("io");
    io.to(user._id.toString()).emit("verification-update", {
      status: "pending",
    });

    res.json({ message: "Verification submitted.", user });
  } catch (error) {
    console.error("Submit verification error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   REMOVE DOCUMENT
===================================================== */
router.post("/remove-doc", auth, async (req, res) => {
  try {
    const { type } = req.body;
    const user = await User.findById(req.userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    // Only block if status is currently pending (waiting for review)
    if (user.verificationStatus === 'pending' && user.isVerificationLocked) {
      return res.status(403).json({
        message: "Cannot remove documents while awaiting review.",
      });
    }

    // If already approved, reset to 'none'
    if (user.verificationStatus === 'approved') {
      user.verificationStatus = "none";
      user.isVerificationLocked = false;
      user.availability = false;
    }

    user.isDocsSubmitted = false;
    user.isVerificationLocked = false;

    let filePath = null;

    if (type === "license") filePath = user.licenseImage;
    if (type === "idProof") filePath = user.idProofImage;
    if (type === "vehicle" || type === "vehicleImage") filePath = user.vehicleImage || user.vehiclePhoto;
    if (type === "insurance") filePath = user.insuranceDocument;
    if (type === "registration") filePath = user.registrationDocument;

    if (!filePath)
      return res.status(400).json({ message: "Document not found." });

    const absolutePath = path.join(__dirname, "..", filePath.replace(/^\//, ""));

    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);

    if (type === "license") user.licenseImage = null;
    if (type === "idProof") user.idProofImage = null;
    if (type === "vehicle" || type === "vehicleImage") {
      user.vehicleImage = null;
      user.vehiclePhoto = null;
    }
    if (type === "insurance") user.insuranceDocument = null;
    if (type === "registration") user.registrationDocument = null;

    user.isDocsSubmitted = false;

    await user.save();

    res.json({ message: `${type} removed.`, user });
  } catch (error) {
    console.error("Remove doc error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------
   UPLOAD INSURANCE DOCUMENT
------------------------------ */
router.post('/profile/insurance', auth, upload.single('insurance'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.insuranceDocument = req.file.location;

    // Update expiry date if provided
    if (req.body.expiryDate) {
      user.insuranceExpiryDate = new Date(req.body.expiryDate);
    }

    // If driver was approved, trigger re-verification
    if (user.verificationStatus === 'approved') {
      user.verificationStatus = 'none';
      user.isVerificationLocked = false;
      user.isDocsSubmitted = false;
      user.availability = false;
      user.verificationNotes = 'Insurance document updated. Awaiting re-submission.';
    }

    await user.save();

    res.json({
      message: 'Insurance document uploaded successfully. Click "Submit Verification" when ready.',
      insuranceDocument: user.insuranceDocument,
      insuranceExpiryDate: user.insuranceExpiryDate,
      requiresReVerification: user.verificationStatus === 'none'
    });
  } catch (error) {
    console.error('Insurance upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------
   UPLOAD REGISTRATION DOCUMENT
------------------------------ */
router.post('/profile/registration', auth, upload.single('registration'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.registrationDocument = req.file.location;

    // Update expiry date if provided
    if (req.body.expiryDate) {
      user.registrationExpiryDate = new Date(req.body.expiryDate);
    }

    // If driver was approved, trigger re-verification
    if (user.verificationStatus === 'approved') {
      user.verificationStatus = 'none';
      user.isVerificationLocked = false;
      user.isDocsSubmitted = false;
      user.availability = false;
      user.verificationNotes = 'Registration document updated. Awaiting re-submission.';
    }

    await user.save();

    res.json({
      message: 'Registration document uploaded successfully. Click "Submit Verification" when ready.',
      registrationDocument: user.registrationDocument,
      registrationExpiryDate: user.registrationExpiryDate,
      requiresReVerification: user.verificationStatus === 'none'
    });
  } catch (error) {
    console.error('Registration upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------
   UPDATE DOCUMENT EXPIRY DATES
------------------------------ */
router.post('/profile/expiry-dates', auth, async (req, res) => {
  try {
    const { licenseExpiryDate, insuranceExpiryDate, registrationExpiryDate } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (licenseExpiryDate) user.licenseExpiryDate = new Date(licenseExpiryDate);
    if (insuranceExpiryDate) user.insuranceExpiryDate = new Date(insuranceExpiryDate);
    if (registrationExpiryDate) user.registrationExpiryDate = new Date(registrationExpiryDate);

    await user.save();

    res.json({
      message: 'Expiry dates updated successfully',
      licenseExpiryDate: user.licenseExpiryDate,
      insuranceExpiryDate: user.insuranceExpiryDate,
      registrationExpiryDate: user.registrationExpiryDate
    });
  } catch (error) {
    console.error('Expiry date update error:', error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   SEARCH FOR USER (by Name or ID)
   Used for starting new chats/friend requests.
  ===================================================== */
router.get("/search", auth, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.status(400).json({ message: "Search query too short" });
    }

    const isIdMatch = /^[0-9a-fA-F]{24}$/.test(query);
    const searchOrConditions = [
      { name: { $regex: query, $options: "i" } }
    ];

    if (isIdMatch) {
      searchOrConditions.push({ _id: query });
    }

    const users = await User.find({
      $or: searchOrConditions,
      _id: { $ne: req.userId } // Don't return self
    }).select("name avatar role _id").limit(10);

    res.json(users);
  } catch (error) {
    console.error("User search error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   SEARCH FOR DRIVER (by Name or ID)
   Returns detailed driver info for PassengerHome
===================================================== */
router.get("/search-driver", auth, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.status(400).json({ message: "Search query too short" });
    }

    const isIdMatch = /^[0-9a-fA-F]{24}$/.test(query);
    const searchOrConditions = [
      { name: { $regex: query, $options: "i" } }
    ];

    if (isIdMatch) {
      searchOrConditions.push({ _id: query });
    }

    const drivers = await User.find({
      $or: searchOrConditions,
      role: "driver"
    }).select("name avatar role _id rating vehicleDetails vehicleType verificationStatus vehicleImage vehiclePhoto totalRides createdAt").limit(10);

    res.json(drivers);
  } catch (error) {
    console.error("Driver search error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   SEARCH FOR DRIVER (by Name, Phone, or ID)
   FAVORITES & RECENTS
===================================================== */

// Get favorites
router.get("/favorites", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("favorites");
    res.json(user.favorites || []);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Add favorite
router.post("/favorites", auth, async (req, res) => {
  try {
    const { label, address, lat, lng } = req.body;
    const user = await User.findById(req.userId);
    user.favorites.push({ label, address, lat, lng });
    await user.save();
    res.json(user.favorites);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Remove favorite
router.delete("/favorites/:favId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    user.favorites = user.favorites.filter(f => String(f._id) !== req.params.favId);
    await user.save();
    res.json(user.favorites);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Add to recents
router.post("/recents", auth, async (req, res) => {
  try {
    const { address, lat, lng } = req.body;
    const user = await User.findById(req.userId);

    // Add to front
    user.recentSearches.unshift({ address, lat, lng });

    // Keep last 5
    if (user.recentSearches.length > 5) {
      user.recentSearches = user.recentSearches.slice(0, 5);
    }

    await user.save();
    res.json(user.recentSearches);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// Add a driver to favorites
router.post('/favorite-drivers/:driverId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const driverId = req.params.driverId;

    if (user.favoriteDrivers.includes(driverId)) {
      return res.status(400).json({ message: 'Driver already in favorites' });
    }

    user.favoriteDrivers.push(driverId);
    await user.save();

    res.json({ message: 'Driver added to favorites', favoriteDrivers: user.favoriteDrivers });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove a driver from favorites
router.delete('/favorite-drivers/:driverId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    user.favoriteDrivers = user.favoriteDrivers.filter(id => id.toString() !== req.params.driverId);
    await user.save();

    res.json({ message: 'Driver removed from favorites', favoriteDrivers: user.favoriteDrivers });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// List all favorite drivers
router.get('/favorite-drivers', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('favoriteDrivers', 'name avatar rating vehicleDetails vehicleImage vehiclePhoto vehicleType totalRides verificationStatus createdAt')
      .populate('emergencyContacts.systemUserId', 'name phone avatar');
    res.json(user.favoriteDrivers);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* =====================================================
   GET USER QR CODE
===================================================== */
router.get("/:userId/qr", auth, async (req, res) => {
  try {
    const { generateUserQR } = require("../utils/paymentUtils");
    const qrImage = await generateUserQR(req.params.userId);
    res.json({ qrImage });
  } catch (error) {
    console.error("User QR Generation error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
