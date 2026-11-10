import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { rideService } from '../../services/api';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';   // ← ADDED

const PassengerRideHistory = () => {
  useAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchRideHistory();
  }, []);

  const fetchRideHistory = async () => {
    try {
      const response = await rideService.getRideHistory();
      setRides(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching ride history:', error);
      setLoading(false);
    }
  };

  /* -------------------------------------------------
      FIX: In Progress should include ACCEPTED rides
  -------------------------------------------------- */
  const filteredRides = rides.filter(ride => {
    if (filter === 'all') return true;

    if (filter === 'in_progress') {
      return ride.status === 'in_progress' || ride.status === 'accepted';
    }

    return ride.status === filter;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'cancelled': return 'danger';
      case 'in_progress': return 'warning';
      case 'accepted': return 'warning'; // also treated as in-progress
      default: return 'info';
    }
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
    <div className="ride-history">
      <div className="container">
        <header className="page-header">
          <h1>Ride History</h1>
          <p>View all your past and current rides</p>
        </header>

        <div className="filters">
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
            className={`filter-btn ${filter === 'cancelled' ? 'active' : ''}`}
            onClick={() => setFilter('cancelled')}
          >
            Cancelled
          </button>
          <button
            className={`filter-btn ${filter === 'in_progress' ? 'active' : ''}`}
            onClick={() => setFilter('in_progress')}
          >
            In Progress
          </button>
        </div>

        {filteredRides.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🚖</div>
            <h3>No rides found</h3>
            <p>You haven't taken any rides yet. Book your first ride!</p>
          </div>
        ) : (
          <div className="rides-grid">
            {filteredRides.map((ride, index) => (
              <motion.div
                key={ride._id}
                className="ride-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="ride-header">
                  <div className="ride-id">
                    Ride #{ride._id.slice(-6).toUpperCase()}
                  </div>

                  <div className={`status-badge ${getStatusColor(ride.status)}`}>
                    {ride.status.replace('_', ' ')}
                  </div>
                </div>

                <div className="ride-details">
                  <div className="route">
                    <div className="route-point pickup">
                      <div className="point-marker">📍</div>
                      <div className="point-info">
                        <div className="point-label">Pickup</div>
                        <div className="point-address">
                          {ride.pickup?.address || 'Location not specified'}
                        </div>
                      </div>
                    </div>

                    <div className="route-line"></div>

                    <div className="route-point destination">
                      <div className="point-marker">🏁</div>
                      <div className="point-info">
                        <div className="point-label">Destination</div>
                        <div className="point-address">
                          {ride.destination?.address || 'Location not specified'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="ride-info">
                    <div className="info-item">
                      <span className="info-label">Date:</span>
                      <span className="info-value">
                        {new Date(ride.requestedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">Time:</span>
                      <span className="info-value">
                        {new Date(ride.requestedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">Driver:</span>
                      <span className="info-value">
                        {ride.driver?.name || 'Not assigned'}
                      </span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">Mode:</span>
                      <span className="info-value">
                        {ride.matchingMode || 'quick'}
                      </span>
                    </div>
                  </div>

                  <div className="ride-footer">
                    <div className="fare">
                      <span className="fare-label">Fare:</span>
                      <span className="fare-amount">₹{ride.fare?.toFixed(2) || '0.00'}</span>
                    </div>

                    <div className="actions">
                      {ride.status === 'completed' && (
                        <Link to={`/passenger/rate/${ride._id}`} className="btn btn-sm btn-outline">
                          Rate Ride
                        </Link>
                      )}

                      {/* FIXED: View Details now WORKS */}
                      <a
                        href={`/passenger/ride/${ride._id}`}
                        className="btn btn-sm btn-primary"
                      >
                        View Details
                      </a>

                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* SUMMARY FOOTER */}
        <div className="stats-summary">
          <div className="stat-card">
            <div className="stat-value">{rides.length}</div>
            <div className="stat-label">Total Rides</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">
              ₹{rides.reduce((sum, ride) => sum + (ride.fare || 0), 0).toFixed(2)}
            </div>
            <div className="stat-label">Total Spent</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">
              {rides.filter(r => r.status === 'completed').length}
            </div>
            <div className="stat-label">Completed</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">
              {rides.filter(r => r.status === 'cancelled').length}
            </div>
            <div className="stat-label">Cancelled</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PassengerRideHistory;
