const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Report = require('../models/Report');
const User = require('../models/User');

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
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

// Submit a report
router.post('/', auth, async (req, res) => {
    try {
        const { reportedUser, ride, type, description } = req.body;

        const report = new Report({
            reporter: req.userId,
            reportedUser,
            ride,
            type,
            description
        });

        await report.save();
        res.status(201).json({ message: 'Report submitted successfully', report });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all reports (Admin)
router.get('/admin/all', auth, isAdmin, async (req, res) => {
    try {
        const reports = await Report.find()
            .populate('reporter', 'name email role')
            .populate('reportedUser', 'name email role')
            .populate('ride')
            .sort({ createdAt: -1 });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Resolve a report (Admin)
router.put('/admin/:id/resolve', auth, isAdmin, async (req, res) => {
    try {
        const { status, adminNotes } = req.body;

        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });

        report.status = status || 'resolved';
        report.adminNotes = adminNotes || report.adminNotes;
        report.resolvedBy = req.userId;
        report.resolvedAt = new Date();

        await report.save();

        // NOTIFY REPORTER
        const io = req.app.get('io');
        const notificationService = require('../services/notificationService');
        await notificationService.notify(io, {
            recipient: report.reporter,
            type: 'system',
            title: 'Report Update',
            message: `Your report regarding a ${report.type} issue has been ${report.status}.`,
            link: '/passenger/history'
        });

        res.json({ message: 'Report resolved successfully', report });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
