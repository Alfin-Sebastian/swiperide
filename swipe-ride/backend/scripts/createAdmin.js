const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@swiperide.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Create admin user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    const admin = new User({
      name: 'System Admin',
      email: 'admin@swiperide.com',
      phone: '+1234567890',
      password: hashedPassword,
      role: 'admin',
      verificationStatus: 'approved'
    });

    await admin.save();
    console.log('✅ Admin user created successfully!');
    console.log('Email: admin@swiperide.com');
    console.log('Password: admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin:', error);
    process.exit(1);
  }
};

createAdmin();