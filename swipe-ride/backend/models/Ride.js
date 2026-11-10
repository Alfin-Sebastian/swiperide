const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  passenger: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Swipe Match: passenger-selected driver
  driverPreference: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  pickup: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  destination: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  // Smart Match → helps filter drivers by car type
  vehicleType: {
    type: String,
    default: null
  },

  distance: Number,   // in kilometers
  duration: Number,   // in minutes

  fare: {
    type: Number,
    default: 0
  },

  tipAmount: {
    type: Number,
    default: 0,
    min: 0
  },

  finalAmount: {
    type: Number
  },
  paymentMethod: {
    type: String,
    enum: ['upi', 'cash'],
    default: 'upi'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'awaiting_driver_confirmation', 'paid', 'failed'],
    default: 'pending'
  },
  paymentConfirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  paymentConfirmedAt: {
    type: Date,
    default: null
  },
  completedAt: Date,

  matchingMode: {
    type: String,
    enum: ['quick', 'swipe', 'smart'],
    default: 'quick'
  },

  scheduledTime: Date,

  status: {
    type: String,
    enum: [
      'requested',
      'scheduled',
      'assigned',
      'accepted',
      'arrived',
      'in_progress',
      'completed',
      'cancelled'
    ],
    default: 'requested'
  },

  // Real-time driver tracking during the ride
  currentLocation: {
    lat: Number,
    lng: Number
  },

  // Driver route / path history
  route: [
    {
      lat: Number,
      lng: Number
    }
  ],

  /* ----------------------------
     TIMESTAMPS
  ----------------------------- */
  requestedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: Date,
  startedAt: Date,
  completedAt: Date,

  /* ----------------------------
     ⭐ RATINGS & REVIEWS
     (Passenger → Driver)
  ----------------------------- */
  passengerRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },

  passengerReview: {
    type: String,
    trim: true,
    default: null
  },

  // (Optional / future use)
  driverRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },

  driverReview: {
    type: String,
    trim: true,
    default: null
  },

  /* ----------------------------
     CANCELLATION & TIMEOUT
  ----------------------------- */
  cancelledAt: Date,

  cancelReason: {
    type: String,
    enum: ['timeout', 'passenger', 'driver', 'system']
  },

  expiresAt: Date,

  otp: {
    type: String,
    default: null
  },

  otpVerified: {
    type: Boolean,
    default: false
  },

  // Track drivers who rejected this ride
  rejectedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  notes: String
});

module.exports = mongoose.model('Ride', rideSchema);
