import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { userService, rideService, adminService } from '../../services/api';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion } from 'framer-motion';

// Fix default map marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const DriverHome = () => {
  const { user, refreshUser } = useAuth();
  const socket = useSocket();

  const [availability, setAvailability] = useState(user?.availability || false);
  const [currentRide, setCurrentRide] = useState(null);
  const [stats, setStats] = useState({
    totalRides: 0,
    rating: 0,
    completionRate: 0
  });
  const [earnings, setEarnings] = useState({
    today: 0,
    weekly: 0,
    monthly: 0
  });
  const [viewMode, setViewMode] = useState('now'); // 'now' or 'scheduled'
  const [rejectedRideIds, setRejectedRideIds] = useState([]);
  const [availableRides, setAvailableRides] = useState([]);
  const [scheduledRides, setScheduledRides] = useState([]);
  const [rideRequests, setRideRequests] = useState([]);
  const [recentRides, setRecentRides] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [driverLocation, setDriverLocation] = useState({
    lat: 22.5726,
    lng: 88.3639
  });
  const [loading, setLoading] = useState(true);

  // HEATMAP STATE
  const [demandCoords, setDemandCoords] = useState([]);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const isApproved = user?.verificationStatus === "approved";

  // ⭐ SMART MATCH POPUP STATE
  const [smartRide, setSmartRide] = useState(null);
  const [showSmartPopup, setShowSmartPopup] = useState(false);

  // Helper to fetch the freshest user profile
  const getFreshUser = useCallback(async () => {
    try {
      const res = await userService.getProfile();
      return res.data;
    } catch (err) {
      console.error('Failed to get fresh user profile', err);
      return null;
    }
  }, []);

  /* ---------------------------------------------------------
     FETCH DEMAND DATA (HEATMAP)
  --------------------------------------------------------- */
  const fetchDemandHeatmap = async () => {
    try {
      const res = await adminService.getDemandCoords();
      setDemandCoords(res.data || []);
    } catch (err) {
      console.error("Heatmap fetch error:", err);
    }
  };

  /* ---------------------------------------------------------
     SYNC LOCAL AVAILABILITY WHEN CONTEXT USER UPDATES
  --------------------------------------------------------- */
  useEffect(() => {
    if (user?.availability !== undefined) {
      setAvailability(user.availability);
    }
  }, [user]);

  /* ---------------------------------------------------------
     FETCH DRIVER DATA
  --------------------------------------------------------- */
  const fetchDriverData = useCallback(async () => {
    try {
      if (typeof refreshUser === 'function') {
        try {
          await refreshUser();
        } catch (err) { }
      }

      const freshUser = await getFreshUser();
      if (freshUser) {
        setAvailability(Boolean(freshUser.availability));
      }

      const ridesRes = await rideService.getAvailableRides();
      setAvailableRides(ridesRes.data || []);

      const scheduledRes = await rideService.getAvailableScheduledRides();
      setScheduledRides(scheduledRes.data || []);

      const historyRes = await rideService.getRideHistory();
      const allRides = historyRes.data || [];

      const requested = allRides.filter(r => (r.status === "requested" || r.status === "scheduled") && r.driver && r.driver._id === (freshUser._id || freshUser.id));

      setRideRequests(requested);

      const activeRide = allRides.find(
        r => r.status === "accepted" || r.status === "in_progress"
      );
      setCurrentRide(activeRide || null);

      const completed = allRides.filter(r => r.status === "completed");
      const cancelledByDriver = allRides.filter(r => r.status === "cancelled" && r.cancelReason === "driver");
      const totalAttempted = completed.length + cancelledByDriver.length;
      const completionRate = totalAttempted > 0 ? (completed.length / totalAttempted) * 100 : 100;

      setStats({
        totalRides: freshUser?.totalRides || completed.length,
        rating: freshUser?.rating || 0,
        completionRate: Math.round(completionRate)
      });

      const today = new Date();

      const todayEarnings = completed
        .filter(r => r.completedAt && new Date(r.completedAt).toDateString() === today.toDateString())
        .reduce((sum, r) => sum + (r.fare || 0) + (r.tipAmount || 0), 0);

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const weeklyEarnings = completed
        .filter(r => r.completedAt && new Date(r.completedAt) >= oneWeekAgo)
        .reduce((sum, r) => sum + (r.fare || 0) + (r.tipAmount || 0), 0);

      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const monthlyEarnings = completed
        .filter(r => r.completedAt && new Date(r.completedAt) >= oneMonthAgo)
        .reduce((sum, r) => sum + (r.fare || 0) + (r.tipAmount || 0), 0);

      setEarnings({
        today: todayEarnings,
        weekly: weeklyEarnings,
        monthly: monthlyEarnings
      });

      // Also refresh heatmap
      fetchDemandHeatmap();

      setLoading(false);
    } catch (err) {
      console.error("Driver load error:", err);
      setLoading(false);
    }
  }, [refreshUser, getFreshUser]);

  /* ---------------------------------------------------------
     SOCKET LISTENERS
  --------------------------------------------------------- */
  const setupSocketListeners = useCallback(() => {
    if (!socket) return;

    socket.off("new-ride-request");
    socket.off("ride-accepted");
    socket.off("smart-ride-request");

    socket.on("smart-ride-request", data => {
      const ride = data?.ride || data;
      setRideRequests(prev => {
        if (prev.find(r => r._id === ride._id)) return prev;
        return [ride, ...prev];
      });
      setSmartRide(ride);
      setShowSmartPopup(true);
    });
    socket.on("new-ride-request", ride => {
      // Don't show if we already rejected it
      setRejectedRideIds(currentRejected => {
        if (currentRejected.includes(ride._id)) return currentRejected;

        if (ride.scheduledTime && new Date(ride.scheduledTime) > new Date()) {
          setScheduledRides(prev => {
            if (prev.find(r => r._id === ride._id)) return prev;
            return [ride, ...prev];
          });
        } else {
          setAvailableRides(prev => {
            if (prev.find(r => r._id === ride._id)) return prev;
            return [ride, ...prev];
          });
        }
        return currentRejected;
      });
      fetchDemandHeatmap(); // Refresh heatmap on new request
    });

    socket.on("ride-taken", data => {
      const { rideId } = data;
      setAvailableRides(prev => prev.filter(r => r._id !== rideId));
      setScheduledRides(prev => prev.filter(r => r._id !== rideId));
      setRideRequests(prev => prev.filter(r => r._id !== rideId));
    });

    socket.on("ride-accepted", data => {
      const driverId = data.driverId || data.driver?._id;
      const currentUserId = user?._id || user?.id;
      if (driverId && String(driverId) === String(currentUserId)) {
        setCurrentRide(data.ride || data);
        setAvailability(false);
      }
    });

    const smartHandler = (e) => {
      try {
        const data = e.detail;
        const incomingRide = data?.ride || data;
        setSmartRide(incomingRide);
        setShowSmartPopup(true);
      } catch (err) {
        console.error("smartRideRequest handler error:", err);
      }
    };

    window.addEventListener("smartRideRequest", smartHandler);

    return () => {
      window.removeEventListener("smartRideRequest", smartHandler);
      socket.off("new-ride-request");
      socket.off("ride-accepted");
      socket.off("smart-ride-request");
      socket.off("ride-taken");
    };
  }, [socket, user]);

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setDriverLocation({ lat: latitude, lng: longitude });
        userService.updateLocation(latitude, longitude).catch(err => console.error('Location update err', err));
      },
      err => console.error(err),
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => {
    if (!isApproved) {
      setLoading(false);
      return;
    }

    fetchDriverData();
    const cleanupSmart = setupSocketListeners();
    getCurrentLocation();
    fetchDemandHeatmap();

    const interval = setInterval(fetchDriverData, 10000);

    return () => {
      clearInterval(interval);
      socket?.off("new-ride-request");
      socket?.off("ride-accepted");
      if (typeof cleanupSmart === 'function') cleanupSmart();
    };
  }, [isApproved, socket, fetchDriverData, setupSocketListeners, getCurrentLocation]);

  const toggleAvailability = useCallback(async () => {
    if (!isApproved) {
      alert("You must be verified to go online.");
      return;
    }

    try {
      const newState = !availability;
      await userService.updateAvailability(newState);

      if (typeof refreshUser === 'function') {
        try {
          await refreshUser();
        } catch (_) { }
      }
      const fresh = await getFreshUser();
      setAvailability(Boolean(fresh?.availability ?? newState));

      if (newState) {
        const watchId = navigator.geolocation.watchPosition(
          pos => {
            const { latitude, longitude } = pos.coords;
            setDriverLocation({ lat: latitude, lng: longitude });
            userService.updateLocation(latitude, longitude).catch(err => console.error('Location update err', err));
          },
          err => console.error(err),
          { enableHighAccuracy: true, maximumAge: 10000 }
        );
        window._driver_watch_id = watchId;
      } else {
        if (window._driver_watch_id) {
          navigator.geolocation.clearWatch(window._driver_watch_id);
          window._driver_watch_id = null;
        }
      }
    } catch (err) {
      console.error("Availability update error:", err);
    }
  }, [availability, isApproved, refreshUser, getFreshUser]);

  const acceptRide = async (rideId) => {
    if (!isApproved) {
      alert('You must be verified to accept rides.');
      return;
    }

    try {
      const res = await rideService.acceptRide(rideId);
      setCurrentRide(res.data.ride);
      setAvailableRides(prev => prev.filter(r => r._id !== rideId));
      setAvailability(false);
      socket?.emit("join-ride", rideId);
    } catch (err) {
      console.error("Error accepting ride:", err);
    }
  };

  const startRide = async () => {
    if (!currentRide) return;
    try {
      await rideService.updateRideStatus(currentRide._id, "in_progress");
      setCurrentRide(prev => ({ ...prev, status: "in_progress" }));
    } catch (err) {
      console.error(err);
    }
  };

  const completeRide = async () => {
    if (!currentRide) return;
    try {
      await rideService.updateRideStatus(currentRide._id, "completed");
      setCurrentRide(null);
      if (typeof refreshUser === 'function') {
        try {
          await refreshUser();
        } catch (_) { }
      }
      await fetchDriverData();
    } catch (err) {
      console.error(err);
    }
  };

  const cancelRide = async () => {
    if (!currentRide) return;
    if (!window.confirm('Are you sure you want to cancel this ride?')) return;
    try {
      await rideService.cancelRide(currentRide._id, 'driver');
      setCurrentRide(null);
      if (typeof refreshUser === 'function') {
        try {
          await refreshUser();
        } catch (_) { }
      }
      await fetchDriverData();
    } catch (err) {
      console.error(err);
    }
  };

  const confirmPayment = async (rideId) => {
    if (!window.confirm('Confirm that you have received the payment for this ride?')) return;
    try {
      await rideService.confirmPayment(rideId);
      alert('Payment confirmed successfully!');
      fetchDriverData();
    } catch (err) {
      console.error('Failed to confirm payment:', err);
      alert(err.response?.data?.message || 'Could not confirm payment');
    }
  };

  const acceptSmartRide = async () => {
    if (!smartRide) return;
    try {
      const res = await rideService.acceptRide(smartRide._id);
      setCurrentRide(res.data.ride);
      setShowSmartPopup(false);
      setAvailability(false);
      socket?.emit("join-ride", smartRide._id);
      setSmartRide(null);
    } catch (err) {
      console.error("Smart accept error:", err);
    }
  };

  const rejectSmartRide = async () => {
    if (!smartRide) return;
    try {
      await rideService.rejectRide(smartRide._id);
      setShowSmartPopup(false);
      setSmartRide(null);
      setRejectedRideIds(prev => prev.includes(smartRide._id) ? prev : [...prev, smartRide._id]);
    } catch (err) {
      console.error("Smart reject error:", err);
      // Even if API fails, hide it locally
      setShowSmartPopup(false);
      setSmartRide(null);
    }
  };

  const handleRejectRide = async (rideId) => {
    try {
      await rideService.rejectRide(rideId);
      setRejectedRideIds(prev => prev.includes(rideId) ? prev : [...prev, rideId]);
    } catch (err) {
      console.error("Reject ride error:", err);
      setRejectedRideIds(prev => prev.includes(rideId) ? prev : [...prev, rideId]);
    }
  };

  const renderVerificationStatus = () => {
    if (!user) return null;

    const config = {
      pending: { color: "#f59e0b", icon: "⏳", text: "Pending Verification" },
      approved: { color: "#10b981", icon: "✅", text: "Verified Driver" },
      rejected: { color: "#ef4444", icon: "❌", text: "Verification Rejected" }
    }[user.verificationStatus];

    return (
      <div className="verification-status" style={{ borderColor: config.color }}>
        <span className="status-icon">{config.icon}</span>
        <div>
          <h4>Verification Status</h4>
          <p style={{ color: config.color }}>{config.text}</p>
          {user.verificationNotes && <small>{user.verificationNotes}</small>}
        </div>
      </div>
    );
  };

  if (!isApproved) {
    return (
      <div className="driver-locked container">
        <motion.div className="locked-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h1>🔒 Driver Dashboard Locked</h1>
          <p>You must complete verification before accessing the dashboard.</p>

          <p><strong>Status:</strong> {user?.verificationStatus}</p>
          {user?.verificationStatus === "rejected" && <p>Notes: {user.verificationNotes}</p>}

          <a className="btn btn-primary" href="/driver/verification">
            Go to Verification
          </a>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading driver dashboard...</p>
      </div>
    );
  }

  return (
    <div className="driver-home">

      {/* SMART MATCH POPUP */}
      {showSmartPopup && smartRide && (
        <div className="smart-popup-overlay">
          <motion.div
            className="smart-popup-card"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <h2>🚗 Smart Match Ride Request</h2>

            <div className="smart-popup-content">
              <p><strong>Passenger:</strong> {smartRide.passenger?.name}</p>
              <p><strong>Pickup:</strong> {smartRide.pickup?.address}</p>
              <p><strong>Destination:</strong> {smartRide.destination?.address}</p>
            </div>

            <div className="smart-popup-actions">
              <button className="btn btn-success" onClick={acceptSmartRide}>
                Accept Ride
              </button>
              <button className="btn btn-danger" onClick={rejectSmartRide}>
                Reject
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="container">

        <header className="page-header">
          <h1>Welcome, {user?.name}!</h1>
          <p>
            Driver Dashboard • {user?.vehicleDetails?.make}{" "}
            {user?.vehicleDetails?.model}
          </p>
        </header>

        <div className="dashboard-grid">

          {/* LEFT PANEL */}
          <div className="left-panel">

            {renderVerificationStatus()}

            <motion.div className="card availability-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="availability-header">
                <h3>Go Online</h3>
                <div className={`availability-toggle ${availability ? "active" : ""}`}>
                  <span>{availability ? "ONLINE" : "OFFLINE"}</span>
                  <button
                    onClick={toggleAvailability}
                    className={`toggle-btn ${availability ? "on" : "off"}`}
                    disabled={currentRide}
                  >
                    <div className="toggle-circle"></div>
                  </button>
                </div>
              </div>
            </motion.div>

            <motion.div className="card earnings-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h3>Earnings Summary</h3>
              <div className="earnings-grid">
                <div className="earning-item">
                  <div className="earning-label">Today</div>
                  <div className="earning-amount">₹{earnings.today.toFixed(2)}</div>
                </div>
                <div className="earning-item">
                  <div className="earning-label">This Week</div>
                  <div className="earning-amount">₹{earnings.weekly.toFixed(2)}</div>
                </div>
                <div className="earning-item">
                  <div className="earning-label">This Month</div>
                  <div className="earning-amount">₹{earnings.monthly.toFixed(2)}</div>
                </div>
              </div>
            </motion.div>

            <motion.div className="card stats-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="card-header">
                <h3>Performance Stats</h3>
              </div>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-icon">🚖</div>
                  <div>
                    <div className="stat-value">{stats.totalRides}</div>
                    <div className="stat-label">Total Rides</div>
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-icon">⭐</div>
                  <div>
                    <div className="stat-value">{stats.rating || "N/A"}</div>
                    <div className="stat-label">Avg. Rating</div>
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-icon">✅</div>
                  <div>
                    <div className="stat-value">{stats.completionRate}%</div>
                    <div className="stat-label">Completion</div>
                  </div>
                </div>

                <div className="stat-item">
                  <div className="stat-icon">💰</div>
                  <div>
                    <div className="stat-value">₹{earnings.weekly.toFixed(0)}</div>
                    <div className="stat-label">This Week</div>
                  </div>
                </div>
              </div>
            </motion.div>

            {pendingPayments.length > 0 && (
              <motion.div className="card pending-payments-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ borderLeft: '4px solid #10b981' }}>
                <h3 style={{ color: '#059669' }}>💳 Pending Payments ({pendingPayments.length})</h3>
                <div className="pending-list" style={{ marginTop: '10px' }}>
                  {pendingPayments.map(ride => (
                    <div key={ride._id} className="pending-payment-item" style={{ padding: '12px', background: '#f0fdf4', borderRadius: '8px', marginBottom: '10px', border: '1px solid #d1fae5' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{ride.passenger?.name}</div>
                          <div style={{ fontSize: '13px', color: '#666' }}>
                            Fare: ₹{ride.fare?.toFixed(2)}
                            {ride.tipAmount > 0 && <span style={{ color: '#059669' }}> + Tip: ₹{ride.tipAmount.toFixed(2)}</span>}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>
                            Total: ₹{(ride.finalAmount || (ride.fare + (ride.tipAmount || 0))).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '12px', color: '#999' }}>{new Date(ride.requestedAt).toLocaleDateString()}</div>
                        </div>
                        <button
                          className="btn btn-sm btn-success"
                          style={{ borderRadius: '20px', padding: '5px 15px' }}
                          onClick={() => confirmPayment(ride._id)}
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* RIGHT PANEL */}
          <div className="right-panel">

            {/* MAP CARD WITH HEATMAP TOGGLE */}
            <motion.div className="card map-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>Your Location</h3>
                <button
                  className={`btn btn-sm ${showHeatmap ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setShowHeatmap(!showHeatmap)}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                >
                  {showHeatmap ? '🔥 Heatmap ON' : '🔥 Heatmap OFF'}
                </button>
              </div>

              <MapContainer
                center={[driverLocation.lat, driverLocation.lng]}
                zoom={14}
                style={{ height: "400px", width: "100%", borderRadius: 8 }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                <Marker position={[driverLocation.lat, driverLocation.lng]}>
                  <Popup>
                    <strong>You are here</strong><br />
                    Status: {availability ? "Online" : "Offline"}
                  </Popup>
                </Marker>

                {/* DEMAND HEATMAP CIRCLES */}
                {showHeatmap && demandCoords.map((coord, i) => (
                  <Circle
                    key={`demand-${i}`}
                    center={[coord.lat, coord.lng]}
                    radius={300}
                    pathOptions={{
                      color: 'red',
                      fillColor: '#f03',
                      fillOpacity: 0.4,
                      weight: 1
                    }}
                  />
                ))}

                {currentRide?.destination?.coordinates && (
                  <Marker
                    position={[
                      currentRide.destination.coordinates.lat,
                      currentRide.destination.coordinates.lng
                    ]}
                    icon={L.divIcon({
                      className: "dest-marker",
                      html: "🏁",
                      iconSize: [30, 30]
                    })}
                  >
                    <Popup>Destination</Popup>
                  </Marker>
                )}
              </MapContainer>
              <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                {showHeatmap && <span>Red circles indicate recent ride requests (last 6 hours).</span>}
              </div>
            </motion.div>

            {currentRide && (
              <motion.div className="card current-ride-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h3>Current Ride</h3>

                <div className="ride-info">
                  <div className="ride-passenger">
                    <div className="passenger-avatar">
                      {currentRide.passenger?.avatar ? (
                        <img src={currentRide.passenger.avatar} alt="" />
                      ) : (
                        <span>{currentRide.passenger?.name?.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <h4>{currentRide.passenger?.name}</h4>
                      <p>{currentRide.passenger?.phone}</p>
                    </div>
                  </div>

                  <div className="ride-route">
                    <div className="route-point">
                      <span>📍</span>
                      <div>
                        <div>Pickup:</div>
                        <strong>{currentRide.pickup?.address}</strong>
                      </div>
                    </div>

                    <div className="route-point">
                      <span>🏁</span>
                      <div>
                        <div>Destination:</div>
                        <strong>{currentRide.destination?.address}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="ride-actions">
                    {currentRide.status === "accepted" && (
                      <button onClick={startRide} className="btn btn-primary btn-block">
                        Start Ride
                      </button>
                    )}

                    {currentRide.status === "in_progress" && (
                      <button onClick={completeRide} className="btn btn-success btn-block">
                        Complete Ride
                      </button>
                    )}
                    <button onClick={cancelRide} className="btn btn-danger btn-block">
                      Cancel Ride
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            <motion.div className="card rides-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="card-header">
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className={`btn btn-sm ${viewMode === 'now' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setViewMode('now')}
                  >
                    Now ({availableRides.length})
                  </button>
                  <button
                    className={`btn btn-sm ${viewMode === 'scheduled' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setViewMode('scheduled')}
                  >
                    Scheduled ({scheduledRides.length})
                  </button>
                  <button
                    className={`btn btn-sm ${viewMode === 'requests' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setViewMode('requests')}
                  >
                    Requests ({rideRequests.length})
                  </button>
                </div>
                <button onClick={fetchDriverData} className="btn btn-sm btn-outline">Refresh</button>
              </div>

              {viewMode === 'now' ? (
                availableRides.length === 0 ? (
                  <div className="empty-rides"><p>No instant requests available</p></div>
                ) : (
                  <div className="rides-list">
                    {availableRides
                      .filter(r => !rejectedRideIds.includes(r._id))
                      .slice(0, 5)
                      .map(ride => (
                        <div key={ride._id} className="ride-request-card">
                          <div className="request-header">
                            <div className="passenger-info">
                              <div className="passenger-avatar small">
                                {ride.passenger?.avatar ? (
                                  <img src={ride.passenger.avatar} alt="" />
                                ) : (
                                  <span>{ride.passenger?.name?.charAt(0)}</span>
                                )}
                              </div>
                              <div>
                                <h4>{ride.passenger?.name}</h4>
                                <div className="ride-meta">
                                  <span>{ride.matchingMode}</span>
                                  <span>₹{ride.fare?.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="request-actions" style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => acceptRide(ride._id)}
                                className="btn btn-primary btn-sm"
                                disabled={!availability}
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleRejectRide(ride._id)}
                                className="btn btn-outline btn-sm"
                                style={{ color: '#ef4444', borderColor: '#ef4444' }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                          <div className="request-details">
                            <div><strong>Pickup:</strong> {ride.pickup?.address}</div>
                            <div><strong>Destination:</strong> {ride.destination?.address}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                )
              ) : viewMode === 'scheduled' ? (
                scheduledRides.length === 0 ? (
                  <div className="empty-rides"><p>No scheduled requests available</p></div>
                ) : (
                  <div className="rides-list">
                    {scheduledRides
                      .filter(r => !rejectedRideIds.includes(r._id))
                      .map(ride => (
                        <div key={ride._id} className="ride-request-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
                          <div className="request-header">
                            <div className="passenger-info">
                              <div className="passenger-avatar small">
                                {ride.passenger?.avatar ? <img src={ride.passenger.avatar} alt="" /> : <span>{ride.passenger?.name?.charAt(0)}</span>}
                              </div>
                              <div>
                                <h4>{ride.passenger?.name} — {new Date(ride.scheduledTime).toLocaleString()}</h4>
                                <div className="ride-meta">
                                  <span>📅 Scheduled</span>
                                  <span>₹{ride.fare?.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="request-actions" style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => acceptRide(ride._id)} className="btn btn-primary btn-sm">
                                Accept
                              </button>
                              <button
                                onClick={() => handleRejectRide(ride._id)}
                                className="btn btn-outline btn-sm"
                                style={{ color: '#ef4444', borderColor: '#ef4444' }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                          <div className="request-details">
                            <div><strong>Pickup:</strong> {ride.pickup?.address}</div>
                            <div><strong>Destination:</strong> {ride.destination?.address}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                )
              ) : (
                // REQUESTS VIEW
                rideRequests.length === 0 ? (
                  <div className="empty-rides"><p>No targeted requests specifically for you</p></div>
                ) : (
                  <div className="rides-list">
                    {rideRequests
                      .filter(r => !rejectedRideIds.includes(r._id))
                      .map(ride => (
                        <div key={ride._id} className="ride-request-card" style={{ borderLeft: '4px solid #ec4899' }}>
                          <div className="request-header">
                            <div className="passenger-info">
                              <div className="passenger-avatar small">
                                {ride.passenger?.avatar ? (
                                  <img src={ride.passenger.avatar} alt="" />
                                ) : (
                                  <span>{ride.passenger?.name?.charAt(0)}</span>
                                )}
                              </div>
                              <div>
                                <h4>{ride.passenger?.name}</h4>
                                <div className="ride-meta">
                                  <span style={{ color: '#ec4899' }}>🎯 Targeted</span>
                                  <span>₹{ride.fare?.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="request-actions" style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => acceptRide(ride._id)}
                                className="btn btn-primary btn-sm"
                                disabled={!availability}
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleRejectRide(ride._id)}
                                className="btn btn-outline btn-sm"
                                style={{ color: '#ef4444', borderColor: '#ef4444' }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                          <div className="request-details">
                            <div><strong>Type:</strong> {ride.matchingMode === 'smart' ? 'Smart Match' : 'Direct Swipe'}</div>
                            <div><strong>Pickup:</strong> {ride.pickup?.address}</div>
                            <div><strong>Destination:</strong> {ride.destination?.address}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                )
              )}
            </motion.div>

            <motion.div className="card history-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="card-header">
                <h3>Recent Rides</h3>
                <a href="/driver/history" className="btn btn-sm btn-outline">View All</a>
              </div>
              <div className="history-list">
                {recentRides.map(ride => (
                  <div key={ride._id} className="history-item">
                    <div className="history-icon">
                      {ride.status === "completed" ? "✅" :
                        ride.status === "cancelled" ? "❌" : "⏳"}
                    </div>
                    <div className="history-details" style={{ flex: 1, marginLeft: '12px' }}>
                      <div style={{ fontWeight: 600 }}>{ride.passenger?.name}</div>
                      <small style={{ color: '#666' }}>{new Date(ride.requestedAt).toLocaleDateString()}</small>
                      {ride.paymentStatus === 'paid' && (
                        <div style={{ color: '#059669', fontSize: '11px', fontWeight: 700, marginTop: '2px' }}>
                          ✅ Payment Received
                        </div>
                      )}
                    </div>
                    <div className={`history-status ${ride.status}`} style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      textTransform: 'capitalize'
                    }}>
                      {ride.status}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverHome;
