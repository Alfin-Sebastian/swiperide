const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');

// Register user
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role, vehicleDetails, licenseNo } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // CHECK TOGGLE
    if (role === 'driver') {
      const toggle = await SystemSetting.findOne({ key: 'driverRegistrationEnabled' });
      if (toggle && toggle.value === false) {
        return res.status(403).json({ message: "Driver registrations are closed." });
      }
    }

    // Create user based on role
    // Role can only be passenger or driver. Admin must be created via DB or separate secure route.
    let userRole = role || 'passenger';
    if (!['passenger', 'driver'].includes(userRole)) {
      userRole = 'passenger';
    }

    const userData = {
      name,
      email,
      phone,
      password,
      role: userRole
    };

    // Add driver-specific fields
    if (userRole === 'driver') {
      userData.vehicleDetails = vehicleDetails;
      userData.licenseNo = licenseNo;
      userData.verificationStatus = 'none';
    }

    const user = new User(userData);
    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        verificationStatus: user.verificationStatus
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        verificationStatus: user.verificationStatus,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;