const Message = require("../models/Message");
const Ride = require("../models/Ride");
const User = require("../models/User");

exports.getMessages = async (req, res) => {
  try {
    const { rideId } = req.params;

    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ error: "Ride not found" });

    const messages = await Message.find({ ride: rideId })
      .populate("sender", "name avatar")
      .sort({ timestamp: 1 });

    // SECURITY: Ensure user is passenger, driver, or admin
    const userId = req.userId;
    const isPassenger = String(ride.passenger) === String(userId);
    const isDriver = ride.driver && String(ride.driver) === String(userId);
    const user = await User.findById(userId);
    const isAdmin = user && user.role === 'admin';

    if (!isPassenger && !isDriver && !isAdmin) {
      return res.status(403).json({ error: "Access denied. You are not part of this ride." });
    }

    res.json(messages);

  } catch (err) {
    console.error("GET messages error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { text } = req.body;

    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ error: "Ride not found" });

    // FIXED → get authenticated user ID correctly
    const userId = req.userId;

    const isPassenger = String(ride.passenger) === String(userId);
    const isDriver = String(ride.driver) === String(userId);

    if (!isPassenger && !isDriver) {
      return res
        .status(403)
        .json({ error: "You cannot send messages for this ride" });
    }

    const message = await Message.create({
      ride: rideId,
      sender: userId,
      text,
    });

    const populatedMsg = await message.populate("sender", "name avatar");

    // SOCKET.IO EMIT
    const io = req.app.get("io");
    if (io) io.to(rideId).emit("new-message", populatedMsg);


    res.json(populatedMsg);

  } catch (err) {
    console.error("SEND message error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
