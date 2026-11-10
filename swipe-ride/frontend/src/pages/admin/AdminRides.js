import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminService } from '../../services/api';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'framer-motion';


// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const AdminRides = () => {
  useAuth();
  const [rides, setRides] = useState([]);
  const [filteredRides, setFilteredRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState({
    start: '',
    end: ''
  });
  const [selectedRide, setSelectedRide] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
  const [showMapModal, setShowMapModal] = useState(false);
  const [routeCoords, setRouteCoords] = useState([]);


  const fetchAllRides = useCallback(async () => {
    try {
      const response = await adminService.getAllRides();
      // Handle both { rides: [] } and direct [] responses
      const ridesData = Array.isArray(response.data) ? response.data : (response.data.rides || []);
      setRides(ridesData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching rides:', error);
      setLoading(false);
    }
  }, []);

  const filterRides = useCallback(() => {
    let filtered = [...rides];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(ride =>
        ride._id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ride.passenger?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ride.driver?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(ride => ride.status === statusFilter);
    }

    // Apply date filter
    if (dateFilter.start) {
      const startDate = new Date(dateFilter.start);
      filtered = filtered.filter(ride => new Date(ride.requestedAt) >= startDate);
    }

    if (dateFilter.end) {
      const endDate = new Date(dateFilter.end);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(ride => new Date(ride.requestedAt) <= endDate);
    }

    // Sort by requestedAt descending (most recent first)
    filtered.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    setFilteredRides(filtered);
  }, [rides, searchTerm, statusFilter, dateFilter]);

  useEffect(() => {
    fetchAllRides();
  }, [fetchAllRides]);

  useEffect(() => {
    filterRides();
  }, [filterRides]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'cancelled': return 'danger';
      case 'in_progress': return 'warning';
      case 'accepted': return 'info';
      case 'requested': return 'secondary';
      default: return 'light';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return '✅';
      case 'cancelled': return '❌';
      case 'in_progress': return '🚗';
      case 'accepted': return '👌';
      case 'requested': return '⏳';
      default: return '📋';
    }
  };

  const openInGoogleMaps = (ride) => {
    if (!ride?.pickup?.coordinates || !ride?.destination?.coordinates) return;
    const { lat: pLat, lng: pLng } = ride.pickup.coordinates;
    const { lat: dLat, lng: dLng } = ride.destination.coordinates;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLng}&destination=${dLat},${dLng}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const calculateStats = () => {

    if (!Array.isArray(rides)) return { total: 0, completed: 0, cancelled: 0, active: 0, revenue: 0 };
    const total = rides.length;
    const completed = rides.filter(r => r.status === 'completed').length;
    const cancelled = rides.filter(r => r.status === 'cancelled').length;
    const active = rides.filter(r =>
      r.status === 'accepted' || r.status === 'in_progress'
    ).length;
    const revenue = rides
      .filter(r => r.status === 'completed')
      .reduce((sum, ride) => sum + (ride.fare || 0), 0);

    return { total, completed, cancelled, active, revenue };
  };

  const stats = calculateStats();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading ride data...</p>
      </div>
    );
  }

  const fetchRoute = async (ride) => {
    if (!ride?.pickup?.coordinates || !ride?.destination?.coordinates) return;
    try {
      const { lat: pLat, lng: pLng } = ride.pickup.coordinates;
      const { lat: dLat, lng: dLng } = ride.destination.coordinates;
      const url = `https://router.project-osrm.org/route/v1/driving/${pLng},${pLat};${dLng},${dLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        setRouteCoords(coords);
      } else {
        setRouteCoords([[pLat, pLng], [dLat, dLng]]);
      }
    } catch (error) {
      console.error('Error fetching route:', error);
      setRouteCoords([[ride.pickup.coordinates.lat, ride.pickup.coordinates.lng], [ride.destination.coordinates.lat, ride.destination.coordinates.lng]]);
    }
  };

  return (
    <div className="admin-rides">
      <div className="container">
        <header className="page-header">
          <div className="header-content">
            <div>
              <h1>Ride Management</h1>
              <p>Monitor and manage all ride activities</p>
            </div>
            <div className="view-toggle">
              <button
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                📋 List View
              </button>
              <button
                className={`view-btn ${viewMode === 'map' ? 'active' : ''}`}
                onClick={() => setViewMode('map')}
              >
                🗺️ Map View
              </button>
            </div>
          </div>
        </header>

        {/* Stats Overview */}
        <div className="stats-overview">
          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="stat-header">
              <div className="stat-icon">🚖</div>
              <h3>Total Rides</h3>
            </div>
            <div className="stat-value">{stats.total}</div>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="stat-header">
              <div className="stat-icon">✅</div>
              <h3>Completed</h3>
            </div>
            <div className="stat-value">{stats.completed}</div>
            <div className="stat-percentage">
              {((stats.completed / stats.total) * 100).toFixed(1)}%
            </div>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="stat-header">
              <div className="stat-icon">❌</div>
              <h3>Cancelled</h3>
            </div>
            <div className="stat-value">{stats.cancelled}</div>
            <div className="stat-percentage">
              {((stats.cancelled / stats.total) * 100).toFixed(1)}%
            </div>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="stat-header">
              <div className="stat-icon">💰</div>
              <h3>Total Revenue</h3>
            </div>
            <div className="stat-value">₹{stats.revenue.toFixed(2)}</div>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="filters-section">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search by Ride ID, Passenger, or Driver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button className="search-btn">
              🔍
            </button>
          </div>

          <div className="filter-controls">
            <div className="filter-group">
              <label>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Status</option>
                <option value="requested">Requested</option>
                <option value="accepted">Accepted</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="filter-group">
              <label>From Date</label>
              <input
                type="date"
                value={dateFilter.start}
                onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                className="date-input"
              />
            </div>

            <div className="filter-group">
              <label>To Date</label>
              <input
                type="date"
                value={dateFilter.end}
                onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                className="date-input"
              />
            </div>

            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setDateFilter({ start: '', end: '' });
              }}
              className="btn btn-outline"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        {viewMode === 'list' ? (
          <div className="rides-list-section">
            <div className="table-responsive">
              <table className="rides-table">
                <thead>
                  <tr>
                    <th>Ride ID</th>
                    <th>Passenger</th>
                    <th>Driver</th>
                    <th>Date & Time</th>
                    <th>Pickup</th>
                    <th>Destination</th>
                    <th>Fare</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRides.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="empty-table">
                        <div className="empty-state">
                          <div className="empty-icon">🚖</div>
                          <h3>No rides found</h3>
                          <p>Try adjusting your search or filters</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRides.map((ride, index) => (
                      <motion.tr
                        key={ride._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        onClick={() => setSelectedRide(ride)}
                        className="ride-row"
                      >
                        <td className="ride-id">
                          #{ride._id.slice(-6).toUpperCase()}
                        </td>
                        <td className="user-cell">
                          <div className="user-info">
                            <div className="user-avatar">
                              {ride.passenger?.avatar ? (
                                <img src={ride.passenger.avatar} alt="Passenger" />
                              ) : (
                                <span>{ride.passenger?.name?.charAt(0)}</span>
                              )}
                            </div>
                            <div className="user-details">
                              <div className="user-name">{ride.passenger?.name}</div>
                              <div className="user-contact">{ride.passenger?.phone}</div>
                            </div>
                          </div>
                        </td>
                        <td className="user-cell">
                          {ride.driver ? (
                            <div className="user-info">
                              <div className="user-avatar">
                                {ride.driver?.avatar ? (
                                  <img src={ride.driver.avatar} alt="Driver" />
                                ) : (
                                  <span>{ride.driver?.name?.charAt(0)}</span>
                                )}
                              </div>
                              <div className="user-details">
                                <div className="user-name">{ride.driver?.name}</div>
                                <div className="user-vehicle">
                                  {ride.driver?.vehicleDetails?.make} {ride.driver?.vehicleDetails?.model}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="no-driver">Not assigned</span>
                          )}
                        </td>
                        <td className="datetime-cell">
                          <div className="date">
                            {new Date(ride.requestedAt).toLocaleDateString()}
                          </div>
                          <div className="time">
                            {new Date(ride.requestedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
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
                          <div className="fare-amount">₹{ride.fare?.toFixed(2) || '0.00'}</div>
                          <div className="fare-mode">{ride.matchingMode}</div>
                        </td>
                        <td className="payment-cell">
                          <div className={`payment-status ${ride.paymentStatus || 'pending'}`}>
                            {ride.paymentStatus || 'pending'}
                          </div>
                        </td>
                        <td className="status-cell">
                          <div className={`status-badge ${getStatusColor(ride.status)}`}>
                            <span className="status-icon">
                              {getStatusIcon(ride.status)}
                            </span>
                            <span className="status-text">
                              {ride.status.replace('_', ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="actions-cell">
                          <div className="table-actions">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRide(ride);
                              }}
                              className="btn btn-sm btn-outline"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredRides.length > 0 && (
              <div className="pagination">
                <button className="pagination-btn" disabled>
                  ← Previous
                </button>
                <span className="pagination-info">
                  Page 1 of {Math.ceil(filteredRides.length / 10)}
                </span>
                <button className="pagination-btn">
                  Next →
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="map-view-section">
            <div className="map-container">
              <MapContainer
                center={
                  filteredRides.length > 0 && filteredRides[0].pickup?.coordinates
                    ? [filteredRides[0].pickup.coordinates.lat, filteredRides[0].pickup.coordinates.lng]
                    : [20.5937, 78.9629] // India center
                }
                zoom={filteredRides.length > 0 ? 10 : 5}
                style={{ height: '600px', width: '100%', borderRadius: '8px' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                {/* Auto-zoom/bounds component */}
                {(() => {
                  const MapBounds = () => {
                    const map = require('react-leaflet').useMap();
                    useEffect(() => {
                      if (filteredRides.length > 0) {
                        const points = filteredRides
                          .filter(r => r.pickup?.coordinates)
                          .map(r => [r.pickup.coordinates.lat, r.pickup.coordinates.lng]);

                        if (points.length > 0) {
                          const bounds = L.latLngBounds(points);
                          map.fitBounds(bounds, { padding: [50, 50] });
                        }
                      }
                    }, [map]);
                    return null;
                  };
                  return <MapBounds />;
                })()}

                {filteredRides
                  .filter(ride => ride.status === 'in_progress' || ride.status === 'accepted' || ride.status === 'requested')
                  .map((ride) => {
                    if (!ride.pickup?.coordinates) return null;

                    return (
                      <Marker
                        key={ride._id}
                        position={[
                          ride.pickup.coordinates.lat,
                          ride.pickup.coordinates.lng
                        ]}
                        icon={L.divIcon({
                          className: 'ride-marker',
                          html: '🚗',
                          iconSize: [30, 30]
                        })}
                      >
                        <Popup>
                          <div className="ride-popup">
                            <h4>Ride #{ride._id.slice(-6).toUpperCase()}</h4>
                            <p><strong>Passenger:</strong> {ride.passenger?.name}</p>
                            <p><strong>Driver:</strong> {ride.driver?.name || 'Not assigned'}</p>
                            <p><strong>Status:</strong> {ride.status}</p>
                            <p><strong>Fare:</strong> ₹{ride.fare?.toFixed(2)}</p>
                            <button
                              className="btn btn-sm btn-primary"
                              style={{ width: '100%', marginTop: '10px' }}
                              onClick={() => setSelectedRide(ride)}
                            >
                              View Details
                            </button>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
              </MapContainer>
            </div>

            <div className="map-legend">
              <h4>Legend</h4>
              <div className="legend-items">
                <div className="legend-item">
                  <span className="legend-icon">🚗</span>
                  <span className="legend-text">Active Ride</span>
                </div>
                <div className="legend-item">
                  <span className="legend-icon" style={{ color: '#10b981' }}>●</span>
                  <span className="legend-text">Completed Today</span>
                </div>
                <div className="legend-item">
                  <span className="legend-icon" style={{ color: '#ef4444' }}>●</span>
                  <span className="legend-text">Cancelled Today</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ride Details Modal */}
        {selectedRide && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedRide(null)}
          >
            <motion.div
              className="modal-content large"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Ride Details</h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      fetchRoute(selectedRide);
                      setShowMapModal(true);
                    }}
                  >
                    ⛶ View Route Map
                  </button>
                  <button
                    onClick={() => setSelectedRide(null)}
                    className="close-btn"
                  >
                    ✕
                  </button>
                </div>
              </div>


              <div className="modal-body">
                {/* Ride Information */}
                <div className="section">
                  <h3>Ride Information</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <label>Ride ID</label>
                      <div className="info-value">
                        #{selectedRide._id.slice(-6).toUpperCase()}
                      </div>
                    </div>
                    <div className="info-item">
                      <label>Status</label>
                      <div className={`status-display ${getStatusColor(selectedRide.status)}`}>
                        {selectedRide.status.replace('_', ' ')}
                      </div>
                    </div>
                    <div className="info-item">
                      <label>Matching Mode</label>
                      <div className="info-value">
                        {selectedRide.matchingMode}
                      </div>
                    </div>
                    <div className="info-item">
                      <label>Requested At</label>
                      <div className="info-value">
                        {new Date(selectedRide.requestedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="info-item">
                      <label>Fare</label>
                      <div className="info-value fare">
                        ₹{selectedRide.fare?.toFixed(2)}
                      </div>
                    </div>
                    <div className="info-item">
                      <label>Distance</label>
                      <div className="info-value">
                        {selectedRide.distance?.toFixed(1)} km
                      </div>
                    </div>
                    <div className="info-item">
                      <label>Payment Status</label>
                      <div className={`payment-status-badge ${selectedRide.paymentStatus || 'pending'}`}>
                        {selectedRide.paymentStatus || 'pending'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Passenger Information */}
                <div className="section">
                  <h3>Passenger Details</h3>
                  <div className="user-details-card">
                    <div className="user-avatar large">
                      {selectedRide.passenger?.avatar ? (
                        <img src={selectedRide.passenger.avatar} alt="Passenger" />
                      ) : (
                        <span>{selectedRide.passenger?.name?.charAt(0)}</span>
                      )}
                    </div>
                    <div className="user-info">
                      <h4>{selectedRide.passenger?.name}</h4>
                      <div className="user-contact">
                        <span className="contact-item">{selectedRide.passenger?.email}</span>
                        <span className="contact-item">{selectedRide.passenger?.phone}</span>
                      </div>
                      <div className="user-stats">
                        <span className="stat-item">
                          Total Rides: {selectedRide.passenger?.totalRides || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Driver Information */}
                {selectedRide.driver && (
                  <div className="section">
                    <h3>Driver Details</h3>
                    <div className="user-details-card">
                      <div className="user-avatar large">
                        {selectedRide.driver?.avatar ? (
                          <img src={selectedRide.driver.avatar} alt="Driver" />
                        ) : (
                          <span>{selectedRide.driver?.name?.charAt(0)}</span>
                        )}
                      </div>
                      <div className="user-info">
                        <h4>{selectedRide.driver?.name}</h4>
                        <div className="user-contact">
                          <span className="contact-item">{selectedRide.driver?.email}</span>
                          <span className="contact-item">{selectedRide.driver?.phone}</span>
                        </div>
                        <div className="vehicle-info">
                          <span className="vehicle-item">
                            {selectedRide.driver?.vehicleDetails?.make} {selectedRide.driver?.vehicleDetails?.model} ({selectedRide.driver?.vehicleDetails?.year})
                          </span>
                          <span className="vehicle-item">
                            {selectedRide.driver?.vehicleDetails?.color} • {selectedRide.driver?.vehicleDetails?.plateNo}
                          </span>
                        </div>
                        <div className="user-stats">
                          <span className="stat-item">
                            Rating: ⭐ {selectedRide.driver?.rating || 'N/A'}
                          </span>
                          <span className="stat-item">
                            Total Rides: {selectedRide.driver?.totalRides || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Route Information */}
                <div className="section">
                  <h3>Route Details</h3>
                  <div className="route-details">
                    <div className="route-point pickup">
                      <div className="point-marker">📍</div>
                      <div className="point-info">
                        <div className="point-label">Pickup Location</div>
                        <div className="point-address">
                          {selectedRide.pickup?.address || 'Not specified'}
                        </div>
                        {selectedRide.pickup?.coordinates && (
                          <div className="point-coordinates">
                            {selectedRide.pickup.coordinates.lat.toFixed(6)}, {selectedRide.pickup.coordinates.lng.toFixed(6)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="route-line"></div>

                    <div className="route-point destination">
                      <div className="point-marker">🏁</div>
                      <div className="point-info">
                        <div className="point-label">Destination</div>
                        <div className="point-address">
                          {selectedRide.destination?.address || 'Not specified'}
                        </div>
                        {selectedRide.destination?.coordinates && (
                          <div className="point-coordinates">
                            {selectedRide.destination.coordinates.lat.toFixed(6)}, {selectedRide.destination.coordinates.lng.toFixed(6)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: '15px' }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => openInGoogleMaps(selectedRide)}
                        style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                      >
                        🌐 Open in Google Maps Directions
                      </button>
                    </div>
                  </div>
                </div>


                {/* Timeline */}
                <div className="section">
                  <h3>Ride Timeline</h3>
                  <div className="timeline">
                    <div className="timeline-item">
                      <div className="timeline-time">
                        {new Date(selectedRide.requestedAt).toLocaleTimeString()}
                      </div>
                      <div className="timeline-content">
                        <div className="timeline-title">Ride Requested</div>
                      </div>
                    </div>

                    {selectedRide.acceptedAt && (
                      <div className="timeline-item">
                        <div className="timeline-time">
                          {new Date(selectedRide.acceptedAt).toLocaleTimeString()}
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-title">Ride Accepted by Driver</div>
                        </div>
                      </div>
                    )}

                    {selectedRide.startedAt && (
                      <div className="timeline-item">
                        <div className="timeline-time">
                          {new Date(selectedRide.startedAt).toLocaleTimeString()}
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-title">Ride Started</div>
                        </div>
                      </div>
                    )}

                    {selectedRide.completedAt && (
                      <div className="timeline-item">
                        <div className="timeline-time">
                          {new Date(selectedRide.completedAt).toLocaleTimeString()}
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-title">Ride Completed</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <div className="action-buttons">
                  <button
                    onClick={() => setSelectedRide(null)}
                    className="btn btn-outline"
                  >
                    Close
                  </button>
                  {selectedRide.status === 'in_progress' && (
                    <button className="btn btn-danger">
                      Force Cancel
                    </button>
                  )}
                  <button className="btn btn-primary">
                    Export Details
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Nested Map Modal for Admin */}
        <AnimatePresence>
          {showMapModal && selectedRide && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ zIndex: 3000 }}
              onClick={() => setShowMapModal(false)}
            >
              <motion.div
                className="modal-content large"
                initial={{ y: 50, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 50, opacity: 0, scale: 0.95 }}
                style={{ position: 'relative', height: '80vh', width: '90vw', maxWidth: '1200px', display: 'flex', flexDirection: 'column' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="modal-header" style={{ padding: '15px 20px', borderBottom: '1px solid #eee' }}>
                  <h2 style={{ margin: 0 }}>Ride Route Map</h2>
                  <button className="btn btn-sm btn-danger" onClick={() => setShowMapModal(false)}>Close</button>
                </div>
                <div className="modal-body" style={{ flex: 1, padding: 0, position: 'relative', overflow: 'hidden' }}>
                  <MapContainer
                    center={[selectedRide.pickup?.coordinates?.lat || 20.5937, selectedRide.pickup?.coordinates?.lng || 78.9629]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                    {selectedRide.pickup?.coordinates && (
                      <Marker position={[selectedRide.pickup.coordinates.lat, selectedRide.pickup.coordinates.lng]}>
                        <Popup><strong>Pickup</strong><br />{selectedRide.pickup.address}</Popup>
                      </Marker>
                    )}

                    {selectedRide.destination?.coordinates && (
                      <Marker position={[selectedRide.destination.coordinates.lat, selectedRide.destination.coordinates.lng]}>
                        <Popup><strong>Destination</strong><br />{selectedRide.destination.address}</Popup>
                      </Marker>
                    )}

                    {routeCoords.length > 0 && (
                      <Polyline
                        positions={routeCoords}
                        color="blue"
                        weight={5}
                      />
                    )}
                  </MapContainer>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>

  );
};

export default AdminRides;