import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { rideService } from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const DriverMessage = () => {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();

  const [ride, setRide] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const quickReplies = [
    "I have arrived at the pickup location.",
    "I'm on my way.",
    "Where exactly are you?",
    "Okay, see you soon.",
    "Stuck in traffic."
  ];

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [rideRes, msgRes] = await Promise.all([
          rideService.getRide(rideId),
          rideService.getMessages(rideId)
        ]);
        setRide(rideRes.data);
        setMessages(msgRes.data);
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch initial data", err);
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [rideId]);

  useEffect(() => {
    if (socket) {
      socket.emit('join-chat', rideId);

      socket.on('new-message', (msg) => {
        setMessages((prev) => {
          const exists = prev.some(m => m._id === msg._id || (m.timestamp === msg.timestamp && m.text === msg.text));
          if (exists) return prev;
          return [...prev, msg];
        });
      });


      return () => socket.off('new-message');
    }
  }, [socket, rideId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onCallPassenger = () => {
    if (ride?.passenger?.phone) {
      window.open(`tel:${ride.passenger.phone}`);
    } else {
      alert('Passenger phone number is not available.');
    }
  };


  const handleSendMessage = async (text) => {
    const messageText = text || inputText;
    if (!messageText.trim()) return;

    try {
      await rideService.sendMessage(rideId, messageText);
      if (!text) setInputText('');
    } catch (err) {
      console.error("Failed to send message", err);
      alert("Failed to send message. Please try again.");
    }
  };


  if (loading) return <div className="loading">Loading chat...</div>;

  return (
    <div className="message-page">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button onClick={() => navigate(-1)} className="btn btn-sm btn-outline">Back</button>
        <div style={{ flex: 1 }}>
          <h1>Chat with {ride?.passenger?.name || 'Passenger'}</h1>
          <p style={{ fontSize: '12px', opacity: 0.8 }}>Pickup: {ride?.pickup?.address || 'Current Location'}</p>
        </div>
        <button
          className="btn btn-sm btn-outline"
          onClick={onCallPassenger}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <span>📞</span> Call
        </button>

      </header>

      <div className="messages-container" style={{ height: '60vh', overflowY: 'auto', padding: '20px', background: '#fff', borderRadius: '12px', marginBottom: '20px' }}>
        <AnimatePresence>
          {messages.map((msg, i) => {
            const isSelf = (msg.self) ||
              (typeof msg.sender === 'string' && (msg.sender === user._id || msg.sender === user.id)) ||
              (msg.sender?._id === user._id || msg.sender?.id === user.id);

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`message-bubble ${isSelf ? 'self' : 'other'}`}
                style={{
                  alignSelf: isSelf ? 'flex-end' : 'flex-start',
                  backgroundColor: isSelf ? '#7c3aed' : '#f1f5f9',
                  color: isSelf ? '#fff' : '#1e293b',
                  padding: '10px 15px',
                  borderRadius: '15px',
                  marginBottom: '10px',
                  maxWidth: '80%',
                  marginLeft: isSelf ? 'auto' : '0'
                }}
              >
                <div>{msg.text}</div>
                <small style={{ fontSize: '10px', opacity: 0.7 }}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <div className="quick-replies" style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '15px' }}>
        {quickReplies.map((reply, i) => (
          <button
            key={i}
            className="btn btn-sm btn-outline"
            style={{ whiteSpace: 'nowrap', borderRadius: '20px', fontSize: '12px', border: '1px solid #e2e8f0', background: '#fff' }}
            onClick={() => handleSendMessage(reply)}
          >
            {reply}
          </button>
        ))}
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="input"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn btn-primary" disabled={!inputText.trim()}>Send</button>
      </form>
    </div>
  );
};

export default DriverMessage;
