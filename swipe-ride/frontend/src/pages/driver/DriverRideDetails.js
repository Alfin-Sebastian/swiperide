// src/pages/driver/DriverRideDetails.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { rideService } from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default leaflet icon paths (same approach used elsewhere)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// FitBounds helper
const FitBounds = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length === 0) return;
    try {
      map.fitBounds(coords, { padding: [60, 60] });
    } catch (e) {
      // ignore
    }
  }, [coords, map]);
  return null;
};

// taxi icon
const taxiIcon = L.divIcon({
  html: '🚖',
  className: 'driver-marker',
  iconSize: [30, 30]
});

const FALLBACK_CENTER = [20.5937, 78.9629]; // India center fallback

const DriverRideDetails = () => {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();

  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);

  const [driverLocation, setDriverLocation] = useState(null); // {lat,lng}
  const [driverPath, setDriverPath] = useState([]); // [[lat,lng], ...]
  const [routeCoords, setRouteCoords] = useState([]); // OSRM static route
  const [watchId, setWatchId] = useState(null);
  const [otp, setOtp] = useState('');
  const [showMapModal, setShowMapModal] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [upiId, setUpiId] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);


  const mapRef = useRef(null);

  const loadRide = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rideService.getRide(rideId);
      const data = res.data || res;
      setRide(data);

      // initialize driver location if backend provided a currentLocation or driver.location
      const initial =
        data?.currentLocation ||
        (data?.driver && data.driver.location) ||
        data?.driverLocation ||
        null;

      if (initial && typeof initial.lat === 'number' && typeof initial.lng === 'number') {
        setDriverLocation(initial);
        setDriverPath([[initial.lat, initial.lng]]);
      } else {
        setDriverLocation(null);
      }

      // static route if coords present
      if (
        data?.pickup?.coordinates?.lat &&
        data?.pickup?.coordinates?.lng &&
        data?.destination?.coordinates?.lat &&
        data?.destination?.coordinates?.lng
      ) {
        fetchStaticRoute(data.pickup.coordinates, data.destination.coordinates, setRouteCoords);
      } else {
        setRouteCoords([]);
      }
    } catch (err) {
      console.error('Failed to load ride', err);
      setRide(null);
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    if (!rideId) return;
    loadRide();

    if (socket) {
      socket.emit('join-ride', rideId);
    }

    return () => {
      if (socket) {
        socket.emit('leave-ride', rideId);
      }
      // clear geolocation watch if set
      if (watchId && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, socket]);

  // socket listeners for incoming updates
  useEffect(() => {
    if (!socket) return;

    const onDriverLoc = (payload) => {
      // payload: { driverId, location: {lat,lng}, rideId? }
      try {
        // only care about this ride's driver
        const rideDriverId = ride?.driver?._id || ride?.driver;
        const payloadDriverId = payload?.driverId || payload?.driver?._id;
        const belongsToDriver = rideDriverId && payloadDriverId && String(payloadDriverId) === String(rideDriverId);
        // sometimes server might send payload.rideId — ensure same ride
        const belongsToRide = !payload.rideId || String(payload.rideId) === String(rideId);
        if (!belongsToDriver && !belongsToRide) {
          // ignore updates for other rides/drivers
          return;
        }
        const loc = payload.location;
        if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
        setDriverLocation(loc);
        setDriverPath(prev => {
          const last = prev[prev.length - 1];
          if (last && Math.abs(last[0] - loc.lat) < 1e-6 && Math.abs(last[1] - loc.lng) < 1e-6) {
            return prev;
          }
          return [...prev, [loc.lat, loc.lng]];
        });
      } catch (e) {
        console.error('onDriverLoc error', e);
      }
    };

    const onRideUpdate = (data) => {
      const incoming = data?.ride || data;
      if (!incoming || (incoming._id && String(incoming._id) !== String(rideId))) return;
      // refresh ride object
      setRide(incoming);
      // fetch static route if previously empty
      if (
        incoming.pickup?.coordinates &&
        incoming.destination?.coordinates &&
        (!routeCoords || routeCoords.length === 0)
      ) {
        fetchStaticRoute(incoming.pickup.coordinates, incoming.destination.coordinates, setRouteCoords);
      }
    };

    socket.on('driver-location-update', onDriverLoc);
    socket.on('ride-status-update', onRideUpdate);
    socket.on('ride-updated', onRideUpdate);
    socket.on('ride-accepted', onRideUpdate);

    return () => {
      socket.off('driver-location-update', onDriverLoc);
      socket.off('ride-status-update', onRideUpdate);
      socket.off('ride-updated', onRideUpdate);
      socket.off('ride-accepted', onRideUpdate);
    };
  }, [socket, ride, rideId, routeCoords]);

  // geolocation watch — emit driver location to server so passenger sees live updates
  useEffect(() => {
    if (!navigator.geolocation || !socket) return;

    // watchPosition options
    const opts = { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 };

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const loc = { lat, lng };
        // update local state/path
        setDriverLocation(loc);
        setDriverPath(prev => {
          const last = prev[prev.length - 1];
          if (last && Math.abs(last[0] - lat) < 1e-6 && Math.abs(last[1] - lng) < 1e-6) return prev;
          return [...prev, [lat, lng]];
        });

        // emit to server so others (passenger / admin) receive driver's live location
        try {
          socket.emit('location-update', { driverId: user?._id, rideId, location: loc });
        } catch (e) {
          // ignore emit errors
        }
      },
      (err) => {
        // optionally show error or ignore
        // console.warn('Geolocation watch error', err);
      },
      opts
    );

    setWatchId(id);

    return () => {
      if (id && navigator.geolocation) navigator.geolocation.clearWatch(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, user, rideId]);

  // fetch static OSRM route
  const fetchStaticRoute = async (pickupCoords, destCoords, setter) => {
    try {
      const from = `${pickupCoords.lng},${pickupCoords.lat}`;
      const to = `${destCoords.lng},${destCoords.lat}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${from};${to}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) {
        setter([]);
        return;
      }
      const json = await res.json();
      if (json.routes && json.routes.length > 0) {
        const coords = json.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        setter(coords);
      } else {
        setter([]);
      }
    } catch (e) {
      console.warn('OSRM fetch failed', e);
      setter([]);
    }
  };

  // status update helpers
  const updateStatus = async (status, otpVal = null) => {
    if (!ride) return;
    try {
      // optimistic UI (except for in_progress which needs server validation)
      if (status !== 'in_progress') {
        setRide(prev => ({ ...prev, status }));
      }

      await rideService.updateRideStatus(ride._id, status, driverLocation, otpVal);
      // server should emit ride-updated; but we also reload to be safe
      await loadRide();
      if (status === 'in_progress') setOtp('');
      // emit to server via socket optionally
      socket?.emit('ride-status-update', { rideId: ride._id, status });
    } catch (err) {
      console.error('Status update failed', err);
      const msg = err.response?.data?.message || 'Failed to update status';
      alert(msg);
      await loadRide();
    }
  };

  const onAccept = () => updateStatus('accepted');
  const onArrived = () => updateStatus('arrived');
  const onStart = () => {
    if (!otp || otp.length !== 4) {
      return alert('Enter 4-digit OTP');
    }
    updateStatus('in_progress', otp);
  };
  const onComplete = () => updateStatus('completed');
  const onCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this ride?')) return;
    updateStatus('cancelled');
  };

  const openInGoogleMaps = () => {
    if (!ride?.pickup?.coordinates || !ride?.destination?.coordinates) return;
    const { lat: pLat, lng: pLng } = ride.pickup.coordinates;
    const { lat: dLat, lng: dLng } = ride.destination.coordinates;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLng}&destination=${dLat},${dLng}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const fetchPaymentQR = async (tip = 0) => {
    setPaymentLoading(true);
    try {
      const res = await rideService.getPaymentQR(rideId, tip, 'upi');
      setQrCode(res.data?.qrImage || res.qrImage || null);
      setUpiId(res.data?.upiId || res.upiId || null);
    } catch (err) {
      console.error('Failed to load payment info:', err);
    } finally {
      setPaymentLoading(false);
    }
  };

  const onOpenPayment = () => {
    setShowPayment(true);
    fetchPaymentQR(ride?.tipAmount || 0);
  };

  const handleConfirmPayment = async () => {
    if (!window.confirm('Confirm that you have received the payment?')) return;
    try {
      setPaymentLoading(true);
      const res = await rideService.confirmPayment(rideId);
      setRide(res.data?.ride || res.ride || res);
      alert('Payment confirmed successfully!');
      setShowPayment(false);
    } catch (err) {
      console.error('Failed to confirm payment:', err);
      alert(err.response?.data?.message || 'Could not confirm payment');
    } finally {
      setPaymentLoading(false);
    }
  };


  // map center and bounds calculation
  const mapCenter = (() => {
    if (driverLocation) return [driverLocation.lat, driverLocation.lng];
    if (ride?.pickup?.coordinates) return [ride.pickup.coordinates.lat, ride.pickup.coordinates.lng];
    if (ride?.destination?.coordinates) return [ride.destination.coordinates.lat, ride.destination.coordinates.lng];
    return FALLBACK_CENTER;
  })();

  const combinedBounds = (() => {
    const pts = [];
    if (ride?.pickup?.coordinates) pts.push([ride.pickup.coordinates.lat, ride.pickup.coordinates.lng]);
    if (driverPath && driverPath.length) pts.push(...driverPath);
    else if (driverLocation) pts.push([driverLocation.lat, driverLocation.lng]);
    if (ride?.destination?.coordinates) pts.push([ride.destination.coordinates.lat, ride.destination.coordinates.lng]);
    return pts;
  })();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading ride details...</p>
      </div>
    );
  }

  if (!ride) {
    return (
      <div className="empty-state">
        <h3>Ride not found</h3>
        <p>We couldn't find ride details.</p>
      </div>
    );
  }

  // timeline helper
  const formatStatusText = (s) => (s ? s.replace('_', ' ') : s);

  return (
    <div className="driver-ride-details">
      <div className="container">
        <header className="page-header">
          <h1>Drive: Ride #{String(ride._id).slice(-6).toUpperCase()}</h1>
          <p>{formatStatusText(ride.status)}</p>
        </header>

        <div className="details-grid">
          {/* left column: ride & passenger info */}
          <div className="left-col">
            <motion.div className="card ride-summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h3>Ride Info</h3>

              <div className="route">
                <div className="point">
                  <div className="label">Pickup</div>
                  <div className="address">{ride.pickup?.address || 'Not specified'}</div>
                </div>

                <div className="point">
                  <div className="label">Destination</div>
                  <div className="address">{ride.destination?.address || 'Not specified'}</div>
                </div>

                <div className="meta-row">
                  <div><strong>Mode:</strong> {ride.matchingMode || 'quick'}</div>
                  <div><strong>Requested:</strong> {ride.requestedAt ? new Date(ride.requestedAt).toLocaleString() : '—'}</div>
                </div>

                <div className="fare-row">
                  <div><strong>Fare:</strong> ₹{ride.fare?.toFixed(2) || '0.00'}</div>
                  {ride.tipAmount > 0 && <div><strong>Tip:</strong> ₹{ride.tipAmount.toFixed(2)}</div>}
                  <div><strong>Total:</strong> ₹{(ride.finalAmount || (ride.fare + (ride.tipAmount || 0))).toFixed(2)}</div>
                  {ride.paymentStatus === 'paid' && (
                    <div style={{ color: '#059669', fontWeight: 700, marginTop: '8px' }}>
                      ✅ Payment Received
                    </div>
                  )}
                  {ride.paymentMethod && <div style={{ marginTop: ride.paymentStatus === 'paid' ? '4px' : '0' }}><strong>Method:</strong> <span style={{ textTransform: 'uppercase' }}>{ride.paymentMethod}</span></div>}
                  <div><strong>Distance:</strong> {ride.distance ? `${ride.distance.toFixed(1)} km` : '—'}</div>
                </div>
              </div>

              <div className="passenger-card" style={{ marginTop: 20 }}>
                <h4>Passenger</h4>
                {ride.passenger ? (
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: 12, overflow: 'hidden',
                      background: '#f3f3f3', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {ride.passenger.avatar ? <img src={ride.passenger.avatar} alt={ride.passenger.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontWeight: 700 }}>{ride.passenger.name?.charAt(0)}</div>}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{ride.passenger.name}</div>
                      <div style={{ color: '#666' }}>{ride.passenger.phone || 'Phone not available'}</div>
                      <div style={{ marginTop: 8 }}>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            if (ride.passenger?.phone) {
                              window.open(`tel:${ride.passenger.phone}`);
                            } else {
                              // Ideally show a toast, but for now a cleaner alert or UI feedback
                              alert('Passenger phone number is not available.');
                            }
                          }}
                        >
                          Call
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => navigate(`/driver/chat/${ride._id}`)}
                        >
                          Chat
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p>Passenger details not available</p>
                )}
              </div>

              <div className="timeline" style={{ marginTop: 18 }}>
                <h4>Timeline</h4>
                <ol>
                  <li className={ride.status === 'requested' || ['accepted', 'arrived', 'in_progress', 'completed'].includes(ride.status) ? 'active' : ''}>
                    <div className="t-row"><div className="t-title">Requested</div><div className="t-time">{ride.requestedAt ? new Date(ride.requestedAt).toLocaleString() : ''}</div></div>
                  </li>
                  <li className={['accepted', 'arrived', 'in_progress', 'completed'].includes(ride.status) ? 'active' : ''}>
                    <div className="t-row"><div className="t-title">Accepted</div><div className="t-time">{ride.acceptedAt ? new Date(ride.acceptedAt).toLocaleString() : ''}</div></div>
                  </li>
                  <li className={['arrived', 'in_progress', 'completed'].includes(ride.status) ? 'active' : ''}>
                    <div className="t-row"><div className="t-title">Arrived</div><div className="t-time">{ride.arrivedAt ? new Date(ride.arrivedAt).toLocaleString() : ''}</div></div>
                  </li>
                  <li className={['in_progress', 'completed'].includes(ride.status) ? 'active' : ''}>
                    <div className="t-row"><div className="t-title">In Progress</div><div className="t-time">{ride.startedAt ? new Date(ride.startedAt).toLocaleString() : ''}</div></div>
                  </li>
                  <li className={ride.status === 'completed' ? 'active' : ''}>
                    <div className="t-row"><div className="t-title">Completed</div><div className="t-time">{ride.completedAt ? new Date(ride.completedAt).toLocaleString() : ''}</div></div>
                  </li>
                  {ride.status === 'cancelled' && (
                    <li className="active">
                      <div className="t-row"><div className="t-title">Cancelled</div><div className="t-time">{ride.cancelledAt ? new Date(ride.cancelledAt).toLocaleString() : ''}</div></div>
                    </li>
                  )}
                </ol>
              </div>

              <div className="actions-row" style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ride.status === 'arrived' && (
                  <div className="otp-input-area" style={{ background: '#f8f9fa', padding: '12px', borderRadius: '8px', border: '1px solid #dee2e6' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Passenger OTP</label>
                    <input
                      type="text"
                      maxLength="4"
                      placeholder="Enter 4-digit OTP"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      style={{
                        width: '100%',
                        padding: '10px',
                        fontSize: '18px',
                        letterSpacing: '4px',
                        textAlign: 'center',
                        borderRadius: '6px',
                        border: '1px solid #ced4da'
                      }}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  {/* Buttons enabled/disabled by current state */}
                  {ride.status === 'requested' && <button className="btn btn-sm btn-primary" onClick={onAccept}>Accept</button>}
                  {(ride.status === 'accepted' || ride.status === 'in_progress') && <button className="btn btn-sm btn-outline" onClick={onArrived}>Mark Arrived</button>}
                  {ride.status === 'arrived' && <button className="btn btn-sm btn-primary" onClick={onStart} disabled={otp.length !== 4}>Start Ride</button>}
                  {ride.status === 'in_progress' && <button className="btn btn-sm btn-primary" onClick={onComplete}>Complete Ride</button>}
                  {(ride.status === 'in_progress' || ride.status === 'completed') && (
                    <button
                      className="btn btn-sm"
                      style={{ background: '#00b894', color: '#fff' }}
                      onClick={onOpenPayment}
                    >
                      💰 Show QR
                    </button>
                  )}
                  {(ride.status !== 'completed' && ride.status !== 'cancelled') && <button className="btn btn-sm btn-danger" onClick={onCancel}>Cancel</button>}
                  <button className="btn btn-sm btn-outline" onClick={loadRide}>Refresh</button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* right column: live map */}
          <div className="right-col">
            <motion.div className="card map-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}>Live Map</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => setShowMapModal(true)}>
                    ⛶ Full Map
                  </button>
                  <button className="btn btn-sm btn-outline" onClick={openInGoogleMaps}>
                    🌐 Google Maps
                  </button>
                </div>
              </div>


              <MapContainer
                center={mapCenter}
                zoom={13}
                style={{ height: 420, width: '100%' }}
                whenCreated={(map) => (mapRef.current = map)}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {/* route from OSRM */}
                {routeCoords && routeCoords.length > 0 && (
                  <Polyline positions={routeCoords} pathOptions={{ color: '#7db8ff', weight: 5, opacity: 0.7 }} />
                )}

                {/* driver path */}
                {driverPath && driverPath.length > 0 && (
                  <Polyline positions={driverPath} pathOptions={{ color: '#0066ff', weight: 4 }} />
                )}

                {/* pickup */}
                {ride.pickup?.coordinates && (
                  <Marker position={[ride.pickup.coordinates.lat, ride.pickup.coordinates.lng]}>
                    <Popup><strong>Pickup</strong><br />{ride.pickup.address}</Popup>
                  </Marker>
                )}

                {/* destination */}
                {ride.destination?.coordinates && (
                  <Marker position={[ride.destination.coordinates.lat, ride.destination.coordinates.lng]}>
                    <Popup><strong>Destination</strong><br />{ride.destination.address}</Popup>
                  </Marker>
                )}

                {/* driver */}
                {driverLocation && (
                  <Marker position={[driverLocation.lat, driverLocation.lng]} icon={taxiIcon}>
                    <Popup><strong>You (Driver)</strong></Popup>
                  </Marker>
                )}

                {/* fit bounds */}
                {combinedBounds && combinedBounds.length > 0 && <FitBounds coords={combinedBounds} />}
              </MapContainer>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Map Modal */}
      <AnimatePresence>
        {showMapModal && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ zIndex: 3000 }}
          >
            <div className="modal-backdrop" onClick={() => setShowMapModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
            <motion.div
              className="modal-content large"
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 50, opacity: 0, scale: 0.95 }}
              style={{ position: 'relative', height: '90vh', width: '95vw', maxWidth: '1400px', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header" style={{ padding: '15px 20px', borderBottom: '1px solid #eee' }}>
                <h2 style={{ margin: 0 }}>Ride Route</h2>
                <button className="btn btn-sm btn-danger" onClick={() => setShowMapModal(false)}>Close</button>
              </div>
              <div className="modal-body" style={{ flex: 1, padding: 0, position: 'relative', overflow: 'hidden' }}>
                <MapContainer
                  center={mapCenter}
                  zoom={14}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                  {routeCoords && routeCoords.length > 0 && (
                    <Polyline positions={routeCoords} pathOptions={{ color: '#7db8ff', weight: 6, opacity: 0.8 }} />
                  )}

                  {driverPath && driverPath.length > 0 && (
                    <Polyline positions={driverPath} pathOptions={{ color: '#0066ff', weight: 5 }} />
                  )}

                  {ride.pickup?.coordinates && (
                    <Marker position={[ride.pickup.coordinates.lat, ride.pickup.coordinates.lng]}>
                      <Popup><strong>Pickup</strong><br />{ride.pickup.address}</Popup>
                    </Marker>
                  )}

                  {ride.destination?.coordinates && (
                    <Marker position={[ride.destination.coordinates.lat, ride.destination.coordinates.lng]}>
                      <Popup><strong>Destination</strong><br />{ride.destination.address}</Popup>
                    </Marker>
                  )}

                  {driverLocation && (
                    <Marker position={[driverLocation.lat, driverLocation.lng]} icon={taxiIcon}>
                      <Popup><strong>You (Driver)</strong></Popup>
                    </Marker>
                  )}

                  {combinedBounds && combinedBounds.length > 0 && <FitBounds coords={combinedBounds} />}
                </MapContainer>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showPayment && (
        <div className="modal-overlay" onClick={() => setShowPayment(false)} style={{ zIndex: 4000 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: '400px' }}>
            <h2 className="fw-bold mb-3">Payment QR</h2>
            <p className="text-muted">Show this QR to the passenger to receive payment via UPI</p>

            <div className="payment-summary mb-4 p-3 bg-light rounded-4 border">
              <div className="d-flex justify-content-between mb-2">
                <span>Ride Fare:</span>
                <span className="fw-bold">₹{ride?.fare?.toFixed(2)}</span>
              </div>
              {ride?.tipAmount > 0 && (
                <div className="d-flex justify-content-between mb-2">
                  <span>Tip:</span>
                  <span className="fw-bold text-success">+ ₹{ride.tipAmount.toFixed(2)}</span>
                </div>
              )}
              <hr />
              <div className="d-flex justify-content-between fs-5 fw-bold text-primary">
                <span>Total Amount:</span>
                <span>₹{(ride?.finalAmount || ride?.fare).toFixed(2)}</span>
              </div>
            </div>

            <div className="qr-box mx-auto p-4 bg-white border rounded-4 d-flex flex-column align-items-center justify-content-center" style={{ width: '260px', minHeight: '260px', margin: '0 auto', textAlign: 'center' }}>
              {paymentLoading ? (
                <div className="spinner-border text-primary my-4"></div>
              ) : qrCode ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
                  <img src={qrCode} alt="Payment QR" className="img-fluid" style={{ maxWidth: '200px', height: 'auto', display: 'block' }} />
                </div>
              ) : (
                <div className="text-muted small my-4">Generating QR...</div>
              )}
            </div>

            <p className="mt-4 text-muted small px-3">
              This QR is linked to your UPI ID: <strong>{upiId || user?.upiId || 'Not set'}</strong>
              {upiId && (
                <button
                  className="btn btn-link btn-sm p-0 ml-2"
                  style={{ verticalAlign: 'baseline', textDecoration: 'none' }}
                  onClick={() => {
                    navigator.clipboard.writeText(upiId);
                    alert('UPI ID copied!');
                  }}
                >
                  📋 Copy
                </button>
              )}
              .<br />
              Ensure the passenger confirms the payment before leaving.
            </p>

            <div className="payment-actions mt-4">
              {ride?.paymentStatus === 'awaiting_driver_confirmation' ? (
                <button
                  className="btn btn-success w-100 py-3 rounded-pill fw-bold mb-2"
                  onClick={handleConfirmPayment}
                  disabled={paymentLoading}
                >
                  {paymentLoading ? 'Confirming...' : '✅ Confirm Payment Received'}
                </button>
              ) : ride?.paymentStatus === 'paid' ? (
                <div className="alert alert-success py-2 px-3 rounded-pill mb-2 d-flex align-items-center justify-content-center" style={{ background: '#d1fae5', color: '#065f46', borderColor: '#a7f3d0' }}>
                  <span className="mr-2">💰</span>
                  <span>Payment Received & Confirmed</span>
                </div>
              ) : (
                <div className="alert alert-warning py-2 px-3 rounded-pill mb-2" style={{ fontSize: '13px' }}>
                  <span>Waiting for passenger to pay...</span>
                </div>
              )}

              <button className="btn btn-primary w-100 py-3 rounded-pill fw-bold" onClick={() => setShowPayment(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
};

export default DriverRideDetails;
