import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { chatService } from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';

const DirectChatPage = () => {
    const { user } = useAuth();
    const { id } = useParams();
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [otherUser, setOtherUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef(null);

    const currentUserId = user?._id;

    const fetchData = useCallback(async () => {
        if (!id || !currentUserId) return;
        try {
            const [convRes, msgRes] = await Promise.all([
                chatService.getConversation(id),
                chatService.getMessages(id)
            ]);

            const conversation = convRes.data;
            const other = conversation.participants.find(p => p._id !== currentUserId);
            setOtherUser(other);
            setMessages(msgRes.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching chat data:', error);
            setLoading(false);
        }
    }, [id, currentUserId]);

    const fetchMessages = useCallback(async () => {
        if (!id) return;
        try {
            const res = await chatService.getMessages(id);
            if (res && res.data) {
                setMessages(res.data);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    }, [id]);

    useEffect(() => {
        if (user && id) {
            fetchData();
            const interval = setInterval(fetchMessages, 3000); // Poll messages every 3s
            return () => clearInterval(interval);
        }
    }, [id, user, fetchData, fetchMessages]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    if (!user) return <div className="p-5 text-center">Loading...</div>;

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const onCallUser = () => {
        if (otherUser?.phone) {
            window.open(`tel:${otherUser.phone}`);
        } else {
            alert('Phone number is not available.');
        }
    };

    const handleSendMessage = async (e) => {
        if (e) e.preventDefault();
        if (!newMessage.trim()) return;

        try {
            const tempText = newMessage;
            setNewMessage('');
            await chatService.sendMessage(id, tempText);
            fetchMessages();
        } catch (error) {
            alert('Failed to send message');
        }
    };

    if (loading) return <div className="loading">Loading chat...</div>;

    return (
        <div className="message-page container py-4">
            <header className="page-header shadow-sm" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px 20px', background: '#fff', borderRadius: '12px', marginBottom: '20px' }}>
                <button onClick={() => navigate('/messages')} className="btn btn-sm btn-outline">Back</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <div className="avatar shadow-sm" style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: '#f3f3f3' }}>
                        {otherUser?.avatar ? (
                            <img src={otherUser.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <div className="w-100 h-100 d-flex align-items-center justify-content-center bg-primary text-white fw-bold">
                                {otherUser?.name?.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div>
                        <h4 className="mb-0" style={{ fontSize: '1.1rem' }}>{otherUser?.name || 'Chat'}</h4>
                        <p className="mb-0 text-muted text-capitalize" style={{ fontSize: '12px' }}>{otherUser?.role || 'User'}</p>
                    </div>
                </div>
                <button
                    className="btn btn-sm btn-outline"
                    onClick={onCallUser}
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                    <span>📞</span> Call
                </button>
            </header>

            <div className="messages-container shadow-sm" style={{ height: '60vh', overflowY: 'auto', padding: '20px', background: '#fff', borderRadius: '12px', marginBottom: '20px' }}>
                <AnimatePresence>
                    {messages.map((msg, i) => {
                        const isSelf = msg.sender === currentUserId || msg.sender?._id === currentUserId;

                        return (
                            <motion.div
                                key={msg._id || i}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={`d-flex mb-3 ${isSelf ? 'justify-content-end' : 'justify-content-start'}`}
                            >
                                <div
                                    style={{
                                        maxWidth: '75%',
                                        padding: '12px 16px',
                                        borderRadius: isSelf ? '18px 18px 2px 18px' : '18px 18px 18px 2px',
                                        backgroundColor: isSelf ? '#2563eb' : '#f1f5f9',
                                        color: isSelf ? '#fff' : '#1e293b',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                    }}
                                >
                                    <div style={{ wordBreak: 'break-word', fontSize: '0.95rem' }}>{msg.text}</div>
                                    <small className={`d-block text-end mt-1 ${isSelf ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.7rem' }}>
                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </small>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            <form className="chat-input shadow-sm" onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px', background: '#fff', padding: '15px', borderRadius: '12px' }}>
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="form-control"
                    style={{ flex: 1, borderRadius: '25px', border: '1px solid #e2e8f0' }}
                />
                <button type="submit" className="btn btn-primary rounded-circle" disabled={!newMessage.trim()} style={{ width: 45, height: 45, display: 'flex', alignItems: 'center', justify: 'center' }}>
                    ✈️
                </button>
            </form>
        </div>
    );
};

export default DirectChatPage;
