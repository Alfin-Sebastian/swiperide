import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { rideService } from '../../services/api';
import { motion } from 'framer-motion';
import { useNavigate } from "react-router-dom";

const DriverRideHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });
  const [stats, setStats] = useState({
    totalEarnings: 0,
    totalRides: 0,
    avgRating: 0,
    completedRides: 0
  });
  const [recentFeedback, setRecentFeedback] = useState([]);

  const fetchRideHistory = useCallback(async () => {
    try {
      const response = await rideService.getRideHistory();
      const driverRides = response.data;
      setRides(driverRides);

      // Calculate stats
      const completedRides = driverRides.filter(r => r.status === 'completed');
      const totalEarnings = completedRides.reduce((sum, ride) => sum + (ride.fare || 0) + (ride.tipAmount || 0), 0);
      const totalRides = driverRides.length;
      const avgRating = user?.rating || 0;

      setStats({
        totalEarnings,
        totalRides,
        avgRating,
        completedRides: completedRides.length,
        weeklySummary: {
          rides: completedRides.filter(r => r.completedAt && new Date(r.completedAt) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length,
          earnings: completedRides
            .filter(r => r.completedAt && new Date(r.completedAt) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
            .reduce((sum, r) => sum + (r.fare || 0) + (r.tipAmount || 0), 0)
        }
      });

      // Get recent feedback (rides with passenger reviews)
      const feedback = driverRides
        .filter(r => r.passengerRating && r.passengerReview)
        .slice(0, 3);
      setRecentFeedback(feedback);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching ride history:', error);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRideHistory();
  }, [fetchRideHistory]);

  const filteredRides = rides.filter(ride => {
    if (filter === 'all') return true;
    if (filter === 'completed') return ride.status === 'completed';
    if (filter === 'cancelled') return ride.status === 'cancelled';
    if (filter === 'active') return ride.status === 'accepted' || ride.status === 'in_progress';
    return true;
  });

  const handleDateFilter = () => {
    // Implement date filtering logic here
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'cancelled': return 'danger';
      case 'in_progress': return 'warning';
      case 'accepted': return 'info';
      default: return 'secondary';
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading ride history...</p>
      </div>
    );
  }

  return (
    <div className="driver-history">
      <div className="container">
        <header className="page-header">
          <h1>Ride History</h1>
          <p>Track all your completed and active rides</p>
        </header>

        {/* Stats Overview */}
        <div className="stats-overview">
          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <div className="stat-value">₹{stats.totalEarnings.toFixed(2)}</div>
              <div className="stat-label">Total Earnings</div>
            </div>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="stat-icon">🚖</div>
            <div className="stat-content">
              <div className="stat-value">{stats.completedRides}</div>
              <div className="stat-label">Completed Rides</div>
            </div>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="stat-icon">⭐</div>
            <div className="stat-content">
              <div className="stat-value">{stats.avgRating}</div>
              <div className="stat-label">Average Rating</div>
            </div>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <div className="stat-value">{stats.totalRides}</div>
              <div className="stat-label">Total Rides</div>
            </div>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="filters-section">
          <div className="filter-group">
            <h4>Filter by Status</h4>
            <div className="status-filters">
              <button
                className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All Rides
              </button>
              <button
                className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
                onClick={() => setFilter('completed')}
              >
                Completed
              </button>
              <button
                className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
                onClick={() => setFilter('active')}
              >
                Active
              </button>
              <button
                className={`filter-btn ${filter === 'cancelled' ? 'active' : ''}`}
                onClick={() => setFilter('cancelled')}
              >
                Cancelled
              </button>
            </div>
          </div>

          <div className="filter-group">
            <h4>Filter by Date</h4>
            <div className="date-filters">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="date-input"
              />
              <span className="date-separator">to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="date-input"
              />
              <button onClick={handleDateFilter} className="btn btn-primary">
                Apply
              </button>
            </div>
          </div>
        </div>

        {/* Rides Table */}
        <div className="rides-table-section">
          <div className="table-responsive">
            <table className="rides-table">
              <thead>
                <tr>
                  <th>Ride ID</th>
                  <th>Passenger</th>
                  <th>Date & Time</th>
                  <th>Pickup</th>
                  <th>Destination</th>
                  <th>Fare</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRides.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-table">
                      <div className="empty-state">
                        <div className="empty-icon">🚖</div>
                        <h3>No rides found</h3>
                        <p>You haven't completed any rides yet.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRides.map((ride, index) => (
                    <motion.tr
                      key={ride._id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <td className="ride-id">
                        #{ride._id.slice(-6).toUpperCase()}
                      </td>
                      <td className="passenger-cell">
                        <div className="passenger-info">
                          <div className="passenger-avatar small">
                            {ride.passenger?.avatar ? (
                              <img src={ride.passenger.avatar} alt="Passenger" />
                            ) : (
                              <span>{ride.passenger?.name?.charAt(0)}</span>
                            )}
                          </div>
                          <div className="passenger-details">
                            <div className="passenger-name">{ride.passenger?.name}</div>
                            <div className="passenger-phone">{ride.passenger?.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="datetime-cell">
                        <div className="date">{new Date(ride.requestedAt).toLocaleDateString()}</div>
                        <div className="time">{formatTime(ride.requestedAt)}</div>
                      </td>
                      <td className="location-cell">
                        <div className="location-text">
                          {ride.pickup?.address?.substring(0, 30)}...
                        </div>
                      </td>
                      <td className="location-cell">
                        <div className="location-text">
                          {ride.destination?.address?.substring(0, 30)}...
                        </div>
                      </td>
                      <td className="fare-cell">
                        <div className="fare-amount" style={{ fontWeight: 700 }}>₹{(ride.fare + (ride.tipAmount || 0)).toFixed(2)}</div>
                        <div className="fare-breakdown" style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                          Base: ₹{ride.fare?.toFixed(2)}
                          {ride.tipAmount > 0 && <span style={{ display: 'block', color: '#059669', fontWeight: 600 }}>Tip: +₹{ride.tipAmount.toFixed(2)}</span>}
                        </div>
                        <div className="fare-mode mt-1" style={{ fontSize: '10px', textTransform: 'uppercase', opacity: 0.6 }}>{ride.matchingMode}</div>
                      </td>
                      <td className="status-cell">
                        <span className={`status-badge ${getStatusColor(ride.status)}`}>
                          {ride.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <div className="table-actions">
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => navigate(`/driver/ride/${ride._id}`)}
                          >
                            Details
                          </button>


                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="summary-cards">
          <motion.div
            className="summary-card"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h4>Weekly Summary</h4>
            <div className="summary-content">
              <div className="summary-item">
                <span className="item-label">Rides This Week:</span>
                <span className="item-value">{stats.weeklySummary?.rides || 0}</span>
              </div>
              <div className="summary-item">
                <span className="item-label">Weekly Earnings:</span>
                <span className="item-value">₹{(stats.weeklySummary?.earnings || 0).toFixed(2)}</span>
              </div>
              <div className="summary-item">
                <span className="item-label">Avg. Rating:</span>
                <span className="item-value">{stats.avgRating || 'N/A'}</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="summary-card"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >

            <h4>Recent Feedback</h4>
            <div className="feedback-content">
              {recentFeedback.length === 0 ? (
                <p className="no-feedback">No feedback yet.</p>
              ) : (
                recentFeedback.map(ride => (
                  <div className="feedback-item" key={ride._id}>
                    <div className="feedback-rating">
                      {"⭐".repeat(ride.passengerRating)}
                    </div>
                    <div className="feedback-text">
                      "{ride.passengerReview}"
                    </div>
                    <div className="feedback-date">
                      {new Date(ride.completedAt || ride.requestedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default DriverRideHistory;