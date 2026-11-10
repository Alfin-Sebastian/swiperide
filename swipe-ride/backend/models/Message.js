const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  ride: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: false },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: false },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", messageSchema);
