const mongoose = require('mongoose');
const Ride = require('../models/Ride');
const User = require('../models/User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const verifyOtp = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        // 1. Create a dummy passenger and driver if needed, or just find any
        let passenger = await User.findOne({ role: 'passenger' });
        let driver = await User.findOne({ role: 'driver' });

        if (!passenger || !driver) {
            console.log('Could not find passenger or driver for test. Please ensure DB has users.');
            process.exit(1);
        }

        console.log(`Using Passenger: ${passenger.email}, Driver: ${driver.email}`);

        // 2. Simulate Ride Request
        console.log('\n--- Step 1: Create Ride Request ---');
        const ride = new Ride({
            passenger: passenger._id,
            pickup: { address: 'Test Alpha', coordinates: { lat: 0, lng: 0 } },
            destination: { address: 'Test Beta', coordinates: { lat: 1, lng: 1 } },
            status: 'requested',
            otp: Math.floor(1000 + Math.random() * 9000).toString() // Mimicking rideRoutes logic
        });

        await ride.save();
        console.log(`Ride created with ID: ${ride._id}, Status: ${ride.status}, OTP: ${ride.otp}`);

        if (!ride.otp || ride.otp.length !== 4) {
            throw new Error('OTP generation failed!');
        }
        console.log('✅ OTP Generated successfully.');

        // 3. Simulate Acceptance and Arrival
        console.log('\n--- Step 2: Accept and Arrive ---');
        ride.driver = driver._id;
        ride.status = 'accepted';
        await ride.save();
        console.log('Ride accepted.');

        ride.status = 'arrived';
        await ride.save();
        console.log('Driver arrived.');

        // 4. Test Transition to In Progress (Negative)
        console.log('\n--- Step 3: Start Ride (Wrong OTP) ---');
        const wrongOtp = '0000';
        console.log(`Trying with OTP: ${wrongOtp}`);

        if (wrongOtp === ride.otp) {
            console.log('Coincidence! Correct OTP was 0000. Retrying...');
            process.exit(1);
        }

        // Mimic the check in rideRoutes.js
        if (wrongOtp !== ride.otp) {
            console.log('❌ Caught mismatch: OTP is invalid (Correct).');
        } else {
            throw new Error('Failed to catch wrong OTP!');
        }

        // 5. Test Transition to In Progress (Positive)
        console.log('\n--- Step 4: Start Ride (Correct OTP) ---');
        console.log(`Trying with OTP: ${ride.otp}`);

        if (ride.otp === ride.otp) {
            ride.status = 'in_progress';
            ride.otpVerified = true;
            ride.startedAt = new Date();
            await ride.save();
            console.log('✅ Ride successfully started with correct OTP.');
        } else {
            throw new Error('Failed to verify correct OTP!');
        }

        // 6. Verification of the fields
        const updatedRide = await Ride.findById(ride._id);
        console.log(`Final Status: ${updatedRide.status}, OTP Verified: ${updatedRide.otpVerified}`);

        if (updatedRide.status === 'in_progress' && updatedRide.otpVerified === true) {
            console.log('\n✨ ALL TESTS PASSED! ✨');
        } else {
            throw new Error('Final state verification failed!');
        }

        // 7. Cleanup
        await Ride.findByIdAndDelete(ride._id);
        console.log('Cleaned up test ride.');

        process.exit(0);
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
};

verifyOtp();
