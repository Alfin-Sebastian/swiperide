const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },

  phone: {
    type: String,
    required: true
  },

  password: {
    type: String,
    required: true
  },

  role: {
    type: String,
    enum: ['passenger', 'driver', 'admin'],
    default: 'passenger'
  },

  avatar: {
    type: String,
    default: ''
  },

  emergencyContacts: [
    {
      name: String,
      phone: String,
      relationship: String,
      systemUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      }
    }
  ],

  /* ------------------------------
        DRIVER SPECIFIC FIELDS
  ------------------------------ */

  licenseNo: String,

  // Uploaded documents
  licenseImage: {
    type: String,
    default: null
  },
  idProofImage: {
    type: String,
    default: null
  },
  vehicleImage: {
    type: String,
    default: null
  },

  // Compatibility fallback
  vehiclePhoto: {
    type: String,
    default: null
  },

  // NEW: Insurance and Registration documents
  insuranceDocument: {
    type: String,
    default: null
  },

  registrationDocument: {
    type: String,
    default: null
  },

  // Document expiry dates
  licenseExpiryDate: {
    type: Date,
    default: null
  },

  insuranceExpiryDate: {
    type: Date,
    default: null
  },

  registrationExpiryDate: {
    type: Date,
    default: null
  },

  vehicleDetails: {
    make: String,
    model: String,
    year: Number,
    color: String,
    plateNo: String,

    // Required for Smart Match filtering
    type: {
      type: String,
      enum: ['Sedan', 'SUV', 'Hatchback', 'Van', 'Luxury'],
      default: 'Sedan'
    }
  },

  // SHORTCUT VEHICLE TYPE for easy Smart Match filtering
  vehicleType: {
    type: String,
    default: 'Sedan'
  },

  /* ------------------------------
        VERIFICATION SYSTEM
  ------------------------------ */

  verificationStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none'
  },

  verificationNotes: {
    type: String,
    default: ''
  },

  // Verification metadata
  verifiedAt: {
    type: Date,
    default: null
  },

  verificationExpiresAt: {
    type: Date,
    default: null
  },

  documentsReviewed: {
    type: Boolean,
    default: false
  },

  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  verificationSubmittedAt: {
    type: Date,
    default: null
  },
  verificationApprovedAt: {
    type: Date,
    default: null
  },
  verificationRejectedAt: {
    type: Date,
    default: null
  },

  isDocsSubmitted: {
    type: Boolean,
    default: false
  },

  isVerificationLocked: {
    type: Boolean,
    default: false
  },

  onboardingCompleted: {
    type: Boolean,
    default: false
  },

  /* ------------------------------
      AVAILABILITY / PERFORMANCE
  ------------------------------ */

  availability: {
    type: Boolean,
    default: false
  },

  rating: {
    type: Number,
    default: 0
  },

  totalRides: {
    type: Number,
    default: 0
  },

  /* ------------------------------
      SMART MATCH NEW FIELDS
  ------------------------------ */

  // Driver's current GPS position
  currentLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },

  // How many ongoing rides driver has
  activeRides: {
    type: Number,
    default: 0
  },

  // To send SmartMatch ride request directly to driver
  socketId: {
    type: String,
    default: null
  },

  /* ------------------------------
      LEGACY LOCATION (KEEP)
  ------------------------------ */
  location: {
    lat: Number,
    lng: Number,
    lastUpdated: Date
  },

  favorites: [
    {
      label: String, // e.g. "Home", "Work"
      address: String,
      lat: Number,
      lng: Number
    }
  ],

  recentSearches: [
    {
      address: String,
      lat: Number,
      lng: Number,
      timestamp: { type: Date, default: Date.now }
    }
  ],

  upiId: {
    type: String,
    trim: true,
    default: ''
  },

  favoriteDrivers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  ],

  createdAt: {
    type: Date,
    default: Date.now
  }
});


/* ------------------------------
    PASSWORD HASHING
------------------------------ */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});


/* ------------------------------
    PASSWORD COMPARISON
------------------------------ */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
