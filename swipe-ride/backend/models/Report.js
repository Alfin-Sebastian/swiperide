const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    ride: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ride',
        default: null
    },
    type: {
        type: String,
        enum: ['safety', 'behavior', 'payment', 'vehicle', 'other'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'investigating', 'resolved'],
        default: 'pending'
    },
    adminNotes: {
        type: String,
        default: ''
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    resolvedAt: Date
});

module.exports = mongoose.model('Report', reportSchema);
