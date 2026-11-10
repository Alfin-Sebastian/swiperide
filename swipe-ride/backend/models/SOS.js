const mongoose = require('mongoose');

const sosSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ride: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride'
  },
  location: {
    lat: Number,
    lng: Number
  },
  status: {
    type: String,
    enum: ['active', 'resolved'],
    default: 'active'
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String,
  recordingUrl: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: Date
});

module.exports = mongoose.model('SOS', sosSchema);