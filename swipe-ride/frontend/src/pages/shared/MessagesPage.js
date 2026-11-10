import React, { useState, useEffect } from 'react';
import { chatService, userService } from '../../services/api';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { Html5QrcodeScanner } from 'html5-qrcode';

const MessagesPage = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('chats');
    const [conversations, setConversations] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [rides, setRides] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showScanner, setShowScanner] = useState(false);

    const fetchData = React.useCallback(async () => {
        if (!user) return;
        try {
            setLoading(true);
            const [convRes, reqRes, rideRes] = await Promise.all([
                chatService.getConversations(),
                chatService.getPendingRequests(),
                chatService.getRideHistory ? chatService.getRideHistory() : import('../../services/api').then(m => m.rideService.getRideHistory())
            ]);
            setConversations(convRes.data);
            setPendingRequests(reqRes.data);
            setRides(rideRes.data || rideRes);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching chat data:', error);
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user, fetchData]);

    if (!user) return <div className="p-5 text-center mt-5">
        <div className="spinner-border text-primary"></div>
        <p className="mt-3">Loading user profile...</p>
    </div>;


    const respondToRequest = async (requestId, status) => {
        try {
            await chatService.respondToRequest(requestId, status);
            fetchData(); // Refresh list
        } catch (error) {
            alert('Failed to respond to request');
        }
    };

    const startScanner = () => {
        setShowScanner(true);
        setTimeout(() => {
            const scanner = new Html5QrcodeScanner("reader", {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            });

            scanner.render((decodedText) => {
                setSearchQuery(decodedText);
                scanner.clear();
                setShowScanner(false);
                // Trigger search after state update
                setTimeout(() => {
                    const searchInput = document.getElementById('friend-search-input');
                    if (searchInput) {
                        searchInput.focus();
                        handleSearch(decodedText);
                    }
                }, 100);
            }, (error) => {
                // Ignore errors
            });
        }, 300);
    };

    // Modified handleSearch to accept optional direct query
    const handleSearch = async (overrideQuery) => {
        const query = overrideQuery || searchQuery;
        if (query.length < 2) return;
        try {
            const res = await userService.search(query);
            setSearchResults(res.data);
            if (res.data.length === 0) {
                alert('No users found with this ID');
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    };

    const sendRequest = async (userId) => {
        try {
            await chatService.sendRequest(userId);
            alert('Chat request sent!');
            setSearchResults([]);
            setSearchQuery('');
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to send request');
        }
    };

    return (
        <div className="messages-container-fluid w-100 py-4 px-3" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
            <style>{`
                .full-width-section { width: 100% !important; margin-left: 0 !important; margin-right: 0 !important; }
                .search-bar-unified { display: flex !important; width: 100% !important; height: 60px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 30px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
                .search-bar-unified input { flex: 1; border: none; background: transparent; padding: 0 25px; font-size: 1.1rem; outline: none; }
                .search-bar-unified button { border: none; background: var(--primary-color, #2563eb); color: white; padding: 0 40px; font-weight: bold; font-size: 1rem; transition: background 0.2s; }
                .search-bar-unified button:hover { background: #1d4ed8; }
                .filter-pill-container { display: flex; width: 100%; background: white; border: 1px solid #e2e8f0; border-radius: 35px; padding: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .filter-pill-item { flex: 1; border: none; background: transparent; padding: 15px 10px; border-radius: 30px; font-weight: 700; transition: all 0.3s; color: #475569; }
                .filter-pill-item.active { background: #2563eb; color: white; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
                .result-card-premium { background: #f1f5f9 !important; border-radius: 18px; border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.05); transition: transform 0.2s; width: 100%; margin-bottom: 15px; }
                .result-card-premium:hover { transform: translateY(-3px); box-shadow: 0 8px 16px rgba(0,0,0,0.1); }
                .chat-list-container { background: white; border-radius: 20px; overflow: hidden; width: 100%; min-height: 500px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                .chat-item-full { padding: 20px 25px; display: flex; align-items: center; border-bottom: 1px solid #f1f5f9; transition: background 0.2s; width: 100%; }
                .chat-item-full:hover { background: #f8fafc; }
            `}</style>

            <header className="mb-5 px-2">
                <h1 className="fw-bold display-6 mb-1">Messages</h1>
                <p className="text-muted fs-5">Chat with your friends and ride-share partners</p>
            </header>

            {/* Search Section - Absolute Full Width */}
            <div className="full-width-section mb-5">
                <h5 className="fw-bold mb-3 ms-2">Find Friends</h5>
                <div className="search-bar-unified">
                    <input
                        id="friend-search-input"
                        type="text"
                        placeholder="Search by Name, User ID, or Phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <button onClick={() => handleSearch()} style={{ borderRight: '1px solid rgba(255,255,255,0.2)' }}>SEARCH 🔍</button>
                    <button onClick={startScanner} style={{ background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '120px' }}>
                        SCAN 🔳
                    </button>
                </div>

                {/* Search Results in Card Format */}
                {searchResults.length > 0 && (
                    <div className="mt-4" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
                        {searchResults.map(result => (
                            <motion.div
                                key={result._id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="result-card-premium"
                            >
                                <div className="p-3 d-flex align-items-center justify-content-between">
                                    <div className="d-flex align-items-center gap-3">
                                        <div style={{ width: 55, height: 55, borderRadius: '50%', overflow: 'hidden', background: '#fff', border: '1px solid #e2e8f0' }}>
                                            {result.avatar ? (
                                                <img src={result.avatar} className="w-100 h-100" style={{ objectFit: 'contain' }} alt="" />
                                            ) : (
                                                <div className="w-100 h-100 bg-primary text-white d-flex align-items-center justify-content-center fw-bold fs-4">
                                                    {result.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="fw-bold text-dark fs-5">{result.name}</div>
                                            <div className="text-muted text-capitalize small">{result.role}</div>
                                        </div>
                                    </div>
                                    <button className="btn btn-primary rounded-pill px-4 fw-bold" onClick={() => sendRequest(result._id)}>
                                        Add Chat
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Filters Section - Absolute Full Width */}
            <div className="full-width-section mb-5">
                <div className="filter-pill-container">
                    <button
                        className={`filter-pill-item ${activeTab === 'chats' ? 'active' : ''}`}
                        onClick={() => setActiveTab('chats')}
                    >
                        💬 Direct Chats {conversations.length > 0 && <span className="ms-1 badge bg-light text-primary">{conversations.length}</span>}
                    </button>
                    <button
                        className={`filter-pill-item ${activeTab === 'rides' ? 'active' : ''}`}
                        onClick={() => setActiveTab('rides')}
                    >
                        🚖 Ride Chats {rides.length > 0 && <span className="ms-1 badge bg-light text-primary">{rides.length}</span>}
                    </button>
                    <button
                        className={`filter-pill-item ${activeTab === 'requests' ? 'active' : ''}`}
                        onClick={() => setActiveTab('requests')}
                    >
                        📩 Requests {pendingRequests.length > 0 && <span className="ms-1 badge bg-light text-primary">{pendingRequests.length}</span>}
                    </button>
                </div>
            </div>

            {/* Content Section */}
            <div className="full-width-section">
                <div className="chat-list-container">
                    {loading ? (
                        <div className="text-center py-5 mt-5">
                            <div className="spinner-border text-primary"></div>
                            <p className="mt-3 text-muted">Retrieving chats...</p>
                        </div>
                    ) : activeTab === 'chats' ? (
                        <div>
                            {conversations.length === 0 ? (
                                <div className="text-center py-5 mt-5 text-muted">
                                    <div className="display-4 mb-3">✉️</div>
                                    <p>Find friends to start a conversation!</p>
                                </div>
                            ) : (
                                conversations.map(conv => {
                                    const otherUser = conv.participants.find(p => p._id !== user?._id);
                                    return (
                                        <Link to={`/direct-chat/${conv._id}`} key={conv._id} className="text-decoration-none text-dark">
                                            <div className="chat-item-full">
                                                <div className="avatar bg-primary text-white rounded-circle shadow-sm" style={{ width: 60, height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {otherUser?.avatar ? (
                                                        <img src={otherUser.avatar} alt="" className="rounded-circle w-100 h-100" style={{ objectFit: 'cover' }} />
                                                    ) : (
                                                        <span className="fs-3">{otherUser?.name?.charAt(0)}</span>
                                                    )}
                                                </div>
                                                <div className="ms-4 flex-grow-1 overflow-hidden">
                                                    <div className="d-flex justify-content-between align-items-center mb-1">
                                                        <h5 className="mb-0 fw-bold">{otherUser?.name}</h5>
                                                        <span className="text-muted small">{conv.lastMessage ? new Date(conv.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                    </div>
                                                    <p className="text-muted text-truncate mb-0 fs-6" style={{ opacity: 0.8 }}>
                                                        {conv.lastMessage?.text || 'Click to send a message...'}
                                                    </p>
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })
                            )}
                        </div>
                    ) : activeTab === 'rides' ? (
                        <div>
                            {rides.length === 0 ? (
                                <div className="text-center py-5 mt-5 text-muted">
                                    <div className="display-4 mb-3">🚕</div>
                                    <p>No ride chats yet.</p>
                                </div>
                            ) : (
                                rides.map(ride => {
                                    const otherSide = user.role === 'passenger' ? ride.driver : ride.passenger;
                                    const chatLink = user.role === 'passenger' ? `/passenger/message/${ride._id}` : `/driver/chat/${ride._id}`;
                                    return (
                                        <Link to={chatLink} key={ride._id} className="text-decoration-none text-dark">
                                            <div className="chat-item-full">
                                                <div className="avatar bg-info text-white rounded-circle shadow-sm" style={{ width: 60, height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {otherSide?.avatar ? (
                                                        <img src={otherSide.avatar} alt="" className="rounded-circle w-100 h-100" style={{ objectFit: 'cover' }} />
                                                    ) : (
                                                        <span className="small fw-bold">RIDE</span>
                                                    )}
                                                </div>
                                                <div className="ms-4 flex-grow-1 overflow-hidden">
                                                    <div className="d-flex justify-content-between align-items-center mb-1">
                                                        <h5 className="mb-0 fw-bold">{otherSide ? otherSide.name : 'Ride Partner'}</h5>
                                                        <span className="text-muted small">{new Date(ride.requestedAt).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="d-flex justify-content-between align-items-center">
                                                        <div className="text-muted text-truncate me-3 small">
                                                            {ride.pickup.address.split(',')[0]} ➜ {ride.destination.address.split(',')[0]}
                                                        </div>
                                                        <span className={`badge rounded-pill ${ride.status === 'completed' ? 'bg-success' : 'bg-warning'}`} style={{ fontSize: '0.7rem' }}>
                                                            {ride.status}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })
                            )}
                        </div>
                    ) : (
                        <div className="p-3" style={{ background: '#f8fafc' }}>
                            {pendingRequests.length === 0 ? (
                                <div className="text-center py-5 mt-5 text-muted bg-white rounded-4 border">
                                    <p>No chat requests currently.</p>
                                </div>
                            ) : (
                                pendingRequests.map(req => (
                                    <div key={req._id} className="result-card-premium mb-3" style={{ background: '#eff6ff !important' }}>
                                        <div className="p-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
                                            <div className="d-flex align-items-center gap-3">
                                                <div style={{ width: 60, height: 60, borderRadius: '50%', overflow: 'hidden', background: '#fff', border: '1px solid #e2e8f0' }}>
                                                    {req.sender.avatar ? (
                                                        <img src={req.sender.avatar} className="w-100 h-100" style={{ objectFit: 'cover' }} alt="" />
                                                    ) : (
                                                        <div className="w-100 h-100 bg-primary text-white d-flex align-items-center justify-content-center fw-bold fs-4">
                                                            {req.sender.name.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="fw-bold fs-5 text-dark">{req.sender.name}</div>
                                                    <div className="text-muted">Chat Request</div>
                                                </div>
                                            </div>
                                            <div className="d-flex gap-2">
                                                <button className="btn btn-success rounded-pill px-4" onClick={() => respondToRequest(req._id, 'accepted')}>Accept</button>
                                                <button className="btn btn-outline-danger rounded-pill px-4" onClick={() => respondToRequest(req._id, 'rejected')}>Ignore</button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showScanner && (
                <div className="modal-overlay" onClick={() => setShowScanner(false)} style={{ zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)' }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#fff', padding: '20px', borderRadius: '15px', maxWidth: '400px', width: '90%' }}>
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <h4 className="mb-0 fw-bold">Scan QR Code</h4>
                            <button className="btn-close" onClick={() => setShowScanner(false)}></button>
                        </div>
                        <div id="reader" style={{ width: '100%', borderRadius: '10px', overflow: 'hidden' }}></div>
                        <p className="text-center mt-3 text-muted small">Align the QR code within the frame to scan</p>
                        <button className="btn btn-outline-secondary w-100 mt-2" onClick={() => setShowScanner(false)}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MessagesPage;
