const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const User = require("./models/User");   // ✅ Needed for Smart Match socketId saving

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const rideRoutes = require('./routes/rideRoutes');
const adminRoutes = require('./routes/adminRoutes');
const sosRoutes = require('./routes/sosRoutes');
const messagesRoutes = require('./routes/messagesRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Make uploaded images accessible
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // 🖐️ 5s timeout to catch ENOTFOUND faster
})
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB initial connection error:', err.message);
    if (err.name === 'MongoServerSelectionError') {
      console.log('💡 TIP: Check your internet connection or DNS settings. Your ISP might be blocking the database.');
    }
  });

// Handle connection events
mongoose.connection.on('error', err => {
  console.error('❌ MongoDB runtime error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected successfully');
});


// Start ride cleanup cron job
const { startRideCleanup } = require('./utils/rideCleanup');
startRideCleanup(io);

// Start verification cleanup cron job
const { startVerificationCleanup } = require('./utils/verificationCleanup');
startVerificationCleanup(io);

/* =====================================================
   SOCKET.IO – WITH SMART MATCH SUPPORT
===================================================== */
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  /* -----------------------------------------------------
       STORE DRIVER SOCKET ID (Smart Match Requirement)
     ----------------------------------------------------- */
  socket.on("driver-online", async (driverId) => {
    try {
      await User.findByIdAndUpdate(driverId, { socketId: socket.id });
      console.log(`Driver ${driverId} is online with socket ${socket.id}`);
    } catch (err) {
      console.log("Error saving driver socketId:", err);
    }
  });

  /* -----------------------------------------------------
       SAVE SOCKET ID WHEN ANY USER JOINS
     ----------------------------------------------------- */
  socket.on("join-user", async (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);

    try {
      // Save socket for passenger/admin too (optional)
      await User.findByIdAndUpdate(userId, { socketId: socket.id });
    } catch (err) {
      console.log("Error linking socket to user:", err);
    }
  });

  /* -----------------------------------------------------
       JOIN RIDE ROOM
     ----------------------------------------------------- */
  socket.on('join-ride', (rideId) => {
    socket.join(rideId);
    console.log(`User joined ride room: ${rideId}`);
  });

  socket.on('join-chat', (rideId) => {
    socket.join(rideId);
    console.log(`User joined chat room: ${rideId}`);
  });


  /* -----------------------------------------------------
       DRIVER LIVE LOCATION
     ----------------------------------------------------- */
  socket.on('location-update', async (data) => {
    // Broadcast to ride participants
    io.to(data.rideId).emit('driver-location-update', data);

    // Persist driver location to database
    if (data.driverId && data.location) {
      try {
        await User.findByIdAndUpdate(data.driverId, {
          currentLocation: data.location
        });
      } catch (err) {
        console.error('Error persisting driver location:', err);
      }
    }
  });

  /* -----------------------------------------------------
       CHAT MESSAGES & ROOMS
     ----------------------------------------------------- */
  socket.on('leave-chat', (rideId) => {
    socket.leave(rideId);
    console.log(`User left chat room: ${rideId}`);
  });




  /* -----------------------------------------------------
       SOS BROADCAST
     ----------------------------------------------------- */
  socket.on('sos-alert', (data) => {
    io.emit('new-sos-alert', data);
  });

  /* -----------------------------------------------------
       SOS CHAT FOR EMERGENCY CONTACTS
     ----------------------------------------------------- */
  socket.on('join-sos-chat', (sosId) => {
    socket.join(`sos-chat-${sosId}`);
    console.log(`User joined SOS chat room: sos-chat-${sosId}`);
  });

  socket.on('send-sos-message', (data) => {
    // data: { sosId, senderName, text, timestamp }
    io.to(`sos-chat-${data.sosId}`).emit('new-sos-message', data);
  });

  /* -----------------------------------------------------
       HANDLE DISCONNECT
     ----------------------------------------------------- */
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/chat-requests', require('./routes/chatRequestRoutes'));
app.use('/api/conversations', require('./routes/conversationRoutes'));
app.use("/api/messages", require("./routes/messagesRoutes"));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));

// Default route
app.get('/', (req, res) => {
  res.json({ message: 'SwipeRide API is running' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
