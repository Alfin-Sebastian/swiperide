import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { sosService } from '../../services/api';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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

// Helper to validate coordinates (prevents Leaflet crashes on null/undefined)
const isValidCoord = (loc) => {
  return loc && typeof loc.lat === 'number' && typeof loc.lng === 'number';
};

// Helper to recenter map based on alerts
const RecenterMap = ({ alerts, selectedAlert }) => {
  const map = useMap();

  useEffect(() => {
    if (selectedAlert && isValidCoord(selectedAlert.location)) {
      map.flyTo([selectedAlert.location.lat, selectedAlert.location.lng], 15);
    } else if (alerts && alerts.length > 0) {
      const points = [];
      alerts.forEach(a => {
        if (isValidCoord(a.location)) {
          points.push([a.location.lat, a.location.lng]);
        }
      });

      if (points.length > 0) {
        const bounds = L.latLngBounds(points);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
      }
    }
  }, [alerts, selectedAlert, map]);

  return null;
};

const AdminSOS = () => {
  useAuth();
  const socket = useSocket();
  const [alerts, setAlerts] = useState([]);
  const [filteredAlerts, setFilteredAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [resolveNotes, setResolveNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `http://localhost:5000${path}`;
  };

  const fetchSOSAlerts = useCallback(async () => {
    try {
      const response = await sosService.getActiveSOS();
      setAlerts(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching SOS alerts:', error);
      setLoading(false);
    }
  }, []);

  const setupSocketListeners = useCallback(() => {
    if (!socket) return;

    socket.on('new-sos-alert', (alert) => {
      setAlerts(prev => [alert, ...prev]);
    });

    socket.on('sos-resolved', (resolvedAlert) => {
      setAlerts(prev => prev.filter(alert => alert._id !== resolvedAlert._id));
    });

    return () => {
      socket.off('new-sos-alert');
      socket.off('sos-resolved');
    };
  }, [socket]);

  const filterAlerts = useCallback(() => {
    let filtered = [...alerts];

    if (statusFilter !== 'all') {
      filtered = filtered.filter(alert => alert.status === statusFilter);
    }

    setFilteredAlerts(filtered);
  }, [alerts, statusFilter]);

  useEffect(() => {
    fetchSOSAlerts();
    const cleanup = setupSocketListeners();

    const interval = setInterval(fetchSOSAlerts, 10000); // Refresh every 10 seconds
    return () => {
      clearInterval(interval);
      if (typeof cleanup === 'function') cleanup();
    };
  }, [fetchSOSAlerts, setupSocketListeners]);

  useEffect(() => {
    filterAlerts();
  }, [filterAlerts]);

  const handleResolveAlert = async () => {
    if (!selectedAlert) return;

    setIsResolving(true);
    try {
      await sosService.resolveSOS(selectedAlert._id, resolveNotes);

      setAlerts(prev => prev.filter(alert => alert._id !== selectedAlert._id));
      setSelectedAlert(null);
      setResolveNotes('');

      alert('SOS alert resolved successfully!');
    } catch (error) {
      console.error('Error resolving SOS alert:', error);
      alert('Failed to resolve SOS alert');
    } finally {
      setIsResolving(false);
    }
  };

  const getTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  };

  const getAlertIcon = (status) => {
    return status === 'active' ? '🚨' : '✅';
  };

  const getStatusColor = (status) => {
    return status === 'active' ? 'danger' : 'success';
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading SOS alerts...</p>
      </div>
    );
  }

  return (
    <div className="admin-sos">
      <div className="container">
        <header className="page-header">
          <div className="header-content">
            <div>
              <h1>SOS Emergency Alerts</h1>
              <p>Monitor and respond to emergency situations</p>
            </div>
            <div className="header-stats">
              <span className="stat-badge danger">
                {alerts.filter(a => a.status === 'active').length} Active
              </span>
              <span className="stat-badge warning">
                {alerts.length} Total Today
              </span>
            </div>
          </div>
        </header>

        {/* Alert Overview */}
        <div className="alert-overview">
          <motion.div
            className="alert-card urgent"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
          >
            <div className="alert-icon">🚨</div>
            <div className="alert-content">
              <h3>Emergency Response Protocol</h3>
              <p>Follow these steps for active SOS alerts:</p>
              <ol className="protocol-steps">
                <li>Click on alert to view details and location</li>
                <li>Contact user immediately via phone</li>
                <li>Notify emergency contacts if needed</li>
                <li>Dispatch support if required</li>
                <li>Mark as resolved when situation is handled</li>
              </ol>
            </div>
          </motion.div>

          <div className="quick-stats">
            <motion.div
              className="stat-card"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="stat-icon">⏱️</div>
              <div className="stat-content">
                <div className="stat-value">
                  {alerts.filter(a => a.status === 'active').length === 0 ? '0' : '2.5'}
                </div>
                <div className="stat-label">Avg. Response Time (min)</div>
              </div>
            </motion.div>

            <motion.div
              className="stat-card"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="stat-icon">✅</div>
              <div className="stat-content">
                <div className="stat-value">98%</div>
                <div className="stat-label">Resolution Rate</div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-section">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${statusFilter === 'active' ? 'active' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              Active Alerts ({alerts.filter(a => a.status === 'active').length})
            </button>
            <button
              className={`filter-btn ${statusFilter === 'resolved' ? 'active' : ''}`}
              onClick={() => setStatusFilter('resolved')}
            >
              Resolved Alerts
            </button>
            <button
              className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All Alerts ({alerts.length})
            </button>
          </div>

          <button
            onClick={fetchSOSAlerts}
            className="btn btn-outline"
          >
            Refresh Alerts
          </button>
        </div>

        {/* Alerts List and Map */}
        <div className="alerts-container">
          <div className="alerts-list">
            {filteredAlerts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✅</div>
                <h3>No {statusFilter} alerts</h3>
                <p>All emergency situations are currently handled</p>
              </div>
            ) : (
              <div className="alerts-grid">
                {filteredAlerts.map((alert, index) => (
                  <motion.div
                    key={alert._id}
                    className="alert-item"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => setSelectedAlert(alert)}
                  >
                    <div className="alert-item-header">
                      <div className="alert-icon-status">
                        <span className="alert-icon-large">
                          {getAlertIcon(alert.status)}
                        </span>
                        <div className={`status-badge ${getStatusColor(alert.status)}`}>
                          {alert.status}
                        </div>
                      </div>
                      <div className="alert-time">
                        {getTimeAgo(alert.createdAt)}
                      </div>
                    </div>

                    {alert.recordingUrl && (
                      <div className="recording-badge" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        marginBottom: '10px'
                      }}>
                        🎤 Recording available
                      </div>
                    )}

                    <div className="alert-item-body">
                      <div className="user-info">
                        <div className="user-avatar">
                          {alert.user?.avatar ? (
                            <img src={getImageUrl(alert.user.avatar)} alt={alert.user.name} />
                          ) : (
                            <span>{alert.user?.name?.charAt(0)}</span>
                          )}
                        </div>
                        <div className="user-details">
                          <h4>{alert.user?.name}</h4>
                          <p className="user-contact">
                            {alert.user?.phone} • {alert.user?.email}
                          </p>
                        </div>
                      </div>

                      {alert.ride && (
                        <div className="ride-info">
                          <div className="ride-icon">🚗</div>
                          <div className="ride-details">
                            <div className="ride-id">
                              Ride #{alert.ride._id?.slice(-6) || 'N/A'}
                            </div>
                            {alert.ride.driver && (
                              <div className="ride-driver">
                                Driver: {alert.ride.driver?.name}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {alert.notes && (
                        <div className="alert-notes">
                          <strong>Notes:</strong> {alert.notes}
                        </div>
                      )}

                      {alert.location && (
                        <div className="alert-location">
                          <span className="location-icon">📍</span>
                          <span className="location-text">
                            {alert.location.lat?.toFixed(4)}, {alert.location.lng?.toFixed(4)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="alert-item-footer">
                      {alert.status === 'active' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAlert(alert);
                          }}
                        >
                          Respond Now
                        </button>
                      )}
                      <button className="btn btn-outline btn-sm">
                        View Details
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div className="alerts-map">
            <div className="map-container">
              <MapContainer
                center={[40.7128, -74.0060]}
                zoom={12}
                style={{ height: '100%', width: '100%', borderRadius: '8px' }}
              >
                <RecenterMap alerts={filteredAlerts} selectedAlert={selectedAlert} />
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                {filteredAlerts
                  .filter(alert => isValidCoord(alert.location))
                  .map((alert) => (
                    <Marker
                      key={alert._id}
                      position={[alert.location.lat, alert.location.lng]}
                      icon={L.divIcon({
                        className: `sos-marker ${alert.status}`,
                        html: alert.status === 'active' ? '🚨' : '✅',
                        iconSize: [40, 40]
                      })}
                    >
                      <Popup>
                        <div className="sos-popup">
                          <h4>SOS Alert</h4>
                          <p><strong>User:</strong> {alert.user?.name}</p>
                          <p><strong>Status:</strong> {alert.status}</p>
                          <p><strong>Time:</strong> {getTimeAgo(alert.createdAt)}</p>
                          {alert.notes && (
                            <p><strong>Notes:</strong> {alert.notes}</p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
              </MapContainer>
            </div>

            <div className="map-legend">
              <h4>Map Legend</h4>
              <div className="legend-items">
                <div className="legend-item">
                  <span className="legend-icon">🚨</span>
                  <span className="legend-text">Active SOS Alert</span>
                </div>
                <div className="legend-item">
                  <span className="legend-icon">✅</span>
                  <span className="legend-text">Resolved SOS Alert</span>
                </div>
                <div className="legend-item">
                  <span className="legend-icon" style={{ color: '#3b82f6' }}>●</span>
                  <span className="legend-text">User Location</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Alert Details Modal */}
        <AnimatePresence>
          {selectedAlert && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAlert(null)}
            >
              <motion.div
                className="modal-content"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2>SOS Alert Details</h2>
                  <button
                    onClick={() => setSelectedAlert(null)}
                    className="close-btn"
                  >
                    ✕
                  </button>
                </div>

                <div className="modal-body">
                  {/* Alert Status */}
                  <div className="alert-status-section">
                    <div className={`status-display ${getStatusColor(selectedAlert.status)}`}>
                      <span className="status-icon-large">
                        {getAlertIcon(selectedAlert.status)}
                      </span>
                      <div>
                        <h3>SOS Alert - {selectedAlert.status.toUpperCase()}</h3>
                        <p className="alert-time">
                          Triggered {getTimeAgo(selectedAlert.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* User Information */}
                  <div className="section">
                    <h3>User in Distress</h3>
                    <div className="user-details-card">
                      <div className="user-avatar large">
                        {selectedAlert.user?.avatar ? (
                          <img src={getImageUrl(selectedAlert.user.avatar)} alt="User" />
                        ) : (
                          <span>{selectedAlert.user?.name?.charAt(0)}</span>
                        )}
                      </div>
                      <div className="user-info">
                        <h4>{selectedAlert.user?.name}</h4>
                        <div className="user-contact">
                          <div className="contact-item">
                            <strong>Phone:</strong> {selectedAlert.user?.phone}
                          </div>
                          <div className="contact-item">
                            <strong>Email:</strong> {selectedAlert.user?.email}
                          </div>
                        </div>
                        <div className="emergency-contacts">
                          <h5>Emergency Contacts</h5>
                          {selectedAlert.user?.emergencyContacts?.length > 0 ? (
                            selectedAlert.user.emergencyContacts.map((contact, index) => (
                              <div key={index} className="emergency-contact">
                                <span className="contact-name">{contact.name} :</span>
                                <span className="contact-phone"> {contact.phone}</span>
                                {contact.relationship && (
                                  <span className="contact-relationship">
                                    ({contact.relationship})
                                  </span>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="no-contacts">No emergency contacts registered</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Location Information */}
                  {selectedAlert.location && (
                    <div className="section">
                      <h3>Location</h3>
                      <div className="location-details">
                        <div className="coordinates">
                          <span className="coordinate-label">Latitude:</span>
                          <span className="coordinate-value">
                            {selectedAlert.location.lat?.toFixed(6)}
                          </span>
                          <span className="coordinate-label"> Longitude:</span>
                          <span className="coordinate-value">
                            {selectedAlert.location.lng?.toFixed(6)}
                          </span>
                        </div>
                        <div className="location-actions">
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedAlert.location?.lat && selectedAlert.location?.lng) {
                                const url = `https://www.google.com/maps?q=${selectedAlert.location.lat},${selectedAlert.location.lng}`;
                                window.open(url, '_blank', 'noopener,noreferrer');
                              } else {
                                alert('Invalid location coordinates');
                              }
                            }}
                          >
                            View on Google Maps
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedAlert.location?.lat && selectedAlert.location?.lng) {
                                const coords = `${selectedAlert.location.lat}, ${selectedAlert.location.lng}`;
                                if (navigator.clipboard) {
                                  navigator.clipboard.writeText(coords)
                                    .then(() => alert('Coordinates copied to clipboard!'))
                                    .catch(err => alert('Failed to copy: ' + err));
                                } else {
                                  alert(`Clipboard not supported. Coordinates: ${coords}`);
                                }
                              } else {
                                alert('Invalid location coordinates');
                              }
                            }}
                          >
                            Copy Coordinates
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ride Information */}
                  {selectedAlert.ride && (
                    <div className="section">
                      <h3>Associated Ride</h3>
                      <div className="ride-details">
                        <div className="ride-id">
                          <strong>Ride ID:</strong> #{selectedAlert.ride._id?.slice(-6)}
                        </div>
                        {selectedAlert.ride.driver && (
                          <div className="ride-driver">
                            <strong>Driver:</strong> {selectedAlert.ride.driver?.name}
                          </div>
                        )}
                        {selectedAlert.ride.pickup?.address && (
                          <div className="ride-pickup">
                            <strong>Pickup:</strong> {selectedAlert.ride.pickup.address}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Alert Notes */}
                  <div className="section">
                    <h3>Alert Notes</h3>
                    <div className="alert-notes-display">
                      {selectedAlert.notes || 'No additional notes provided.'}
                    </div>
                  </div>

                  {/* SOS Recording Playback */}
                  {selectedAlert.recordingUrl && (
                    <div className="section">
                      <h3>🆘 Audio Evidence</h3>
                      <div className="audio-player-card" style={{ background: '#000', padding: '15px', borderRadius: '8px', marginTop: '10px' }}>
                        <audio
                          controls
                          src={getImageUrl(selectedAlert.recordingUrl)}
                          style={{ width: '100%' }}
                        />
                        <p style={{ color: '#fff', fontSize: '10px', marginTop: '5px', textAlign: 'center' }}>
                          Evidence recorded during SOS trigger
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Resolution Notes (for active alerts) */}
                  {selectedAlert.status === 'active' && (
                    <div className="section">
                      <h3>Resolution Notes</h3>
                      <textarea
                        value={resolveNotes}
                        onChange={(e) => setResolveNotes(e.target.value)}
                        placeholder="Enter resolution details..."
                        className="resolution-textarea"
                        rows={4}
                      />
                      <small className="notes-hint">
                        These notes will be saved with the alert resolution.
                      </small>
                    </div>
                  )}

                  {/* Resolution History (for resolved alerts) */}
                  {selectedAlert.status === 'resolved' && selectedAlert.resolvedBy && (
                    <div className="section">
                      <h3>Resolution Details</h3>
                      <div className="resolution-details">
                        <div className="resolution-info">
                          <div className="resolution-item">
                            <strong>Resolved By:</strong> {selectedAlert.resolvedBy?.name || 'Admin'}
                          </div>
                          <div className="resolution-item">
                            <strong>Resolved At:</strong>{' '}
                            {new Date(selectedAlert.resolvedAt).toLocaleString()}
                          </div>
                          {selectedAlert.notes && (
                            <div className="resolution-item">
                              <strong>Resolution Notes:</strong> {selectedAlert.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="modal-footer">
                  <div className="action-buttons">
                    <button
                      onClick={() => setSelectedAlert(null)}
                      className="btn btn-outline"
                    >
                      Close
                    </button>

                    {selectedAlert.status === 'active' && (
                      <>
                        <button
                          className="btn btn-warning"
                          onClick={() => {
                            if (selectedAlert.user?.phone) {
                              window.location.href = `tel:${selectedAlert.user.phone}`;
                            } else {
                              alert('No phone number available for this user.');
                            }
                          }}
                        >
                          Call User
                        </button>
                        <button
                          onClick={handleResolveAlert}
                          className="btn btn-success"
                          disabled={isResolving}
                        >
                          {isResolving ? 'Resolving...' : 'Mark as Resolved'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminSOS;