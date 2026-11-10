import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { rideService, sosService } from '../../services/api';
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
import ReportModal from '../../components/Common/ReportModal';

// Fix default marker images (same approach as your other components)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// FitBounds helper component to zoom/fit to coords
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

// taxi icon (matches PassengerHome)
const taxiIcon = L.divIcon({
  html: '🚖',
  className: 'driver-marker',
  iconSize: [30, 30]
});

// fallback center (India)
const FALLBACK_CENTER = [20.5937, 78.9629];

const STATUS_ORDER = ['requested', 'accepted', 'in_progress', 'completed'];

const PassengerRideDetails = () => {
  const { rideId } = useParams();
  const navigate = useNavigate();
  useAuth();
  const socket = useSocket();

  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);

  // dynamic driver path (grows with live updates)
  const [driverPath, setDriverPath] = useState([]); // [[lat,lng], ...]
  const [driverLocation, setDriverLocation] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);


  // static route between pickup and destination (OSRM) - fallback to show road
  const [routeCoords, setRouteCoords] = useState([]);

  const mapRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [showSOS, setShowSOS] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [qrCode, setQrCode] = useState(null);
  const [upiUri, setUpiUri] = useState(null);
  const [upiId, setUpiId] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('upi');

  // load ride once
  const loadRide = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rideService.getRide(rideId);
      const r = res.data || res; // guard if API returns plain object
      setRide(r);

      // initialize driver location & path
      const initialDriverLoc =
        r?.currentLocation ||
        r?.driverLocation ||
        (r?.driver?.location ? r.driver.location : null);

      if (initialDriverLoc && initialDriverLoc.lat && initialDriverLoc.lng) {
        setDriverLocation(initialDriverLoc);
        setDriverPath([[initialDriverLoc.lat, initialDriverLoc.lng]]);
      } else {
        setDriverLocation(null);
      }

      // fetch static route (OSRM) if pickup & destination coords present
      if (
        r?.pickup?.coordinates?.lat &&
        r?.pickup?.coordinates?.lng &&
        r?.destination?.coordinates?.lat &&
        r?.destination?.coordinates?.lng
      ) {
        fetchStaticRoute(
          r.pickup.coordinates,
          r.destination.coordinates,
          setRouteCoords
        );
      } else {
        setRouteCoords([]);
      }
    } catch (err) {
      console.error('Failed to load ride:', err);
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
        socket.off('driver-location-update');
        socket.off('ride-status-update');
        socket.off('ride-accepted');
        socket.off('ride-updated');
      }
    };
  }, [rideId, socket, loadRide]);

  // socket listeners for live updates
  useEffect(() => {
    if (!socket) return;

    // driver location update: { driverId, location: { lat, lng } }
    const onDriverLoc = (payload) => {
      try {
        const driverId =
          typeof payload.driverId === 'string'
            ? payload.driverId
            : payload.driver?._id || payload.driverId;
        // ensure payload belongs to this ride's driver
        const rideDriverId = ride?.driver?._id || ride?.driver;
        if (!rideDriverId) return;
        if (String(driverId) !== String(rideDriverId)) return;

        const loc = payload.location;
        if (!loc) return;
        // update live driverLocation and append to driverPath
        setDriverLocation(loc);
        setDriverPath((prev) => {
          // avoid duplicate consecutive points
          const last = prev[prev.length - 1];
          if (last && Math.abs(last[0] - loc.lat) < 1e-6 && Math.abs(last[1] - loc.lng) < 1e-6) {
            return prev;
          }
          return [...prev, [loc.lat, loc.lng]];
        });
      } catch (e) {
        console.error('driver-location-update handler error', e);
      }
    };

    // ride status / ride updates: refresh ride object
    const onRideUpdate = (data) => {
      const incoming = data?.ride || data;
      if (!incoming) return;
      if (incoming._id && String(incoming._id) === String(rideId)) {
        // Set ride and possibly fetch static route if changed
        setRide(incoming);
        if (
          incoming.pickup?.coordinates &&
          incoming.destination?.coordinates &&
          (!routeCoords || routeCoords.length === 0)
        ) {
          // fetch static route if not already
          fetchStaticRoute(
            incoming.pickup.coordinates,
            incoming.destination.coordinates,
            setRouteCoords
          );
        }
      }
    };

    socket.on('driver-location-update', onDriverLoc);
    socket.on('ride-status-update', onRideUpdate);
    socket.on('ride-accepted', onRideUpdate);
    socket.on('ride-updated', onRideUpdate);

    return () => {
      socket.off('driver-location-update', onDriverLoc);
      socket.off('ride-status-update', onRideUpdate);
      socket.off('ride-accepted', onRideUpdate);
      socket.off('ride-updated', onRideUpdate);
    };
  }, [socket, ride, rideId, routeCoords]);

  // fetch static OSRM route (overview=full -> geojson -> convert to [lat,lng])
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
        const coords = json.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
        setter(coords);
      } else {
        setter([]);
      }
    } catch (e) {
      console.warn('OSRM route fetch failed', e);
      setter([]);
    }
  };

  // helper to format status
  const formatStatus = (s) => (s ? s.replace('_', ' ') : '');

  // cancel ride
  const onCancelRide = async () => {
    if (!ride) return;
    if (!window.confirm('Are you sure you want to cancel this ride?')) return;
    try {
      await rideService.cancelRide(ride._id, 'passenger');
      await loadRide();
    } catch (err) {
      console.error('Cancel failed', err);
      alert('Could not cancel ride');
    }
  };

  const onContactDriver = () => {
    if (!ride?.driver) return alert('Driver not available yet');
    if (ride.driver.phone) {
      window.open(`tel:${ride.driver.phone}`);
    } else {
      alert('Driver contact not available');
    }
  };

  const onRateRide = () => navigate(`/passenger/rate/${ride._id}`);

  const openInGoogleMaps = () => {
    if (!ride?.pickup?.coordinates || !ride?.destination?.coordinates) return;
    const { lat: pLat, lng: pLng } = ride.pickup.coordinates;
    const { lat: dLat, lng: dLng } = ride.destination.coordinates;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLng}&destination=${dLat},${dLng}&travelmode=driving`;
    window.open(url, '_blank');
  };


  // Math helper for distance
  const haversineKm = (coords1, coords2) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (coords2.lat - coords1.lat) * Math.PI / 180;
    const dLon = (coords2.lng - coords1.lng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  /* ---------------------------------------------------
        SAFE HAVENS (Hospitals/Police)
  ---------------------------------------------------- */
  const [safeHavens, setSafeHavens] = useState([]);
  const [fetchingHavens, setFetchingHavens] = useState(false);
  const [showHavens, setShowHavens] = useState(false);

  const fetchSafeHavens = async () => {
    if (safeHavens.length > 0) {
      setShowHavens(!showHavens);
      return;
    }
    setFetchingHavens(true);
    setShowHavens(true);

    try {
      const lat = driverLocation?.lat || ride?.pickup?.coordinates?.lat || 22.5726;
      const lng = driverLocation?.lng || ride?.pickup?.coordinates?.lng || 88.3639;

      // Overpass API Query for hospitals and police within 3km
      const query = `[out:json];(node["amenity"="hospital"](around:3000,${lat},${lng});node["amenity"="police"](around:3000,${lat},${lng}););out body;`;
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

      const res = await fetch(url);
      const data = await res.json();

      const results = data.elements.map(el => ({
        id: el.id,
        name: el.tags.name || (el.tags.amenity === 'hospital' ? 'Hospital' : 'Police Station'),
        type: el.tags.amenity,
        lat: el.lat,
        lng: el.lon,
        distance: haversineKm({ lat, lng }, { lat: el.lat, lng: el.lon }).toFixed(1)
      })).sort((a, b) => a.distance - b.distance).slice(0, 5);

      setSafeHavens(results);
    } catch (err) {
      console.error("Safe Havens Error:", err);
    } finally {
      setFetchingHavens(false);
    }
  };

  const onShareTrip = () => {
    const shareUrl = `${window.location.origin}/tracking/${ride._id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert("Live tracking link copied to clipboard! Share it with friends or family.");
    }).catch(err => {
      console.error("Failed to copy link", err);
      alert("Tracking link: " + shareUrl);
    });
  };

  // map center logic (prefer showing pickup/destination/driver)
  const mapCenter = (() => {
    if (driverLocation) return [driverLocation.lat, driverLocation.lng];
    if (ride?.pickup?.coordinates) return [ride.pickup.coordinates.lat, ride.pickup.coordinates.lng];
    if (ride?.destination?.coordinates) return [ride.destination.coordinates.lat, ride.destination.coordinates.lng];
    return FALLBACK_CENTER;
  })();

  // Track browser geolocation for SOS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        null,
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const onTriggerSOS = async () => {
    try {
      // Force refresh location or use existing, fallback to pickup
      let finalLocation = userLocation;

      if (!finalLocation && navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000
            });
          });
          finalLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(finalLocation);
        } catch (err) {
          console.warn("SOS: Geolocation failed, using pickup fallback", err);
        }
      }

      // Final fallback to pickup location if GPS is totally unavailable
      if (!finalLocation && ride?.pickup?.coordinates) {
        finalLocation = {
          lat: ride.pickup.coordinates.lat,
          lng: ride.pickup.coordinates.lng
        };
      }

      const res = await sosService.triggerSOS({
        rideId: ride?._id,
        location: finalLocation, // Send live or fallback location
        notes: 'Emergency triggered from Ride Details'
      });
      const sosId = res.data?.sos?._id || res.sos?._id;

      alert('SOS Alert Sent! Emergency contacts notified. Recording audio...');
      setShowSOS(false);

      // Recording logic (60s)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            const base64Audio = reader.result;
            try {
              await sosService.uploadRecording(sosId, base64Audio);
              console.log("SOS Recording uploaded");
            } catch (err) {
              console.error("Failed to upload recording", err);
            }
          };
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') mediaRecorder.stop();
        }, 60000);
      } catch (err) {
        console.warn("Audio recording error:", err);
      }
    } catch (err) {
      console.error('SOS trigger failed', err);
      alert('Failed to send SOS alert. Please call emergency services.');
    }
  };

  const fetchPaymentQR = async (tip = 0, method = 'upi') => {
    setPaymentLoading(true);
    try {
      const res = await rideService.getPaymentQR(rideId, tip, method);
      setQrCode(res.data?.qrImage || res.qrImage || null);
      setUpiUri(res.data?.upiUri || res.upiUri || null);
      setUpiId(res.data?.upiId || res.upiId || null);
    } catch (err) {
      console.error('Failed to load payment info:', err);
      alert(err.response?.data?.message || 'Could not update payment details');
    } finally {
      setPaymentLoading(false);
    }
  };

  const onOpenPayment = () => {
    setShowPayment(true);
    fetchPaymentQR(tipAmount, paymentMethod);
  };

  const handleTipChange = (e) => {
    const val = Math.max(0, parseFloat(e.target.value) || 0);
    setTipAmount(val);
  };

  const onRefreshQR = () => {
    fetchPaymentQR(tipAmount, paymentMethod);
  };

  const handleMethodChange = (method) => {
    setPaymentMethod(method);
    fetchPaymentQR(tipAmount, method);
  };

  const handlePayConfirm = async () => {
    try {
      setPaymentLoading(true);
      const res = await rideService.payConfirm(rideId);
      setRide(res.data?.ride || res.ride || res);
      alert("Payment confirmation request sent to driver. Please wait for them to confirm.");
      setShowPayment(false);
    } catch (err) {
      console.error('Failed to confirm payment:', err);
      alert(err.response?.data?.message || 'Could not send payment confirmation');
    } finally {
      setPaymentLoading(false);
    }
  };

  // compute overall bounds coords (pickup, driver path, destination)
  const combinedBounds = (() => {
    const pts = [];
    if (ride?.pickup?.coordinates) {
      pts.push([ride.pickup.coordinates.lat, ride.pickup.coordinates.lng]);
    }
    if (driverPath && driverPath.length) {
      pts.push(...driverPath);
    } else if (driverLocation) {
      pts.push([driverLocation.lat, driverLocation.lng]);
    }
    if (ride?.destination?.coordinates) {
      pts.push([ride.destination.coordinates.lat, ride.destination.coordinates.lng]);
    }
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
        <p>We couldn't find the ride details.</p>
      </div>
    );
  }

  const STATUS_TIMELINE = [
    { key: 'requested', title: 'Requested', time: ride.requestedAt },
    { key: 'accepted', title: 'Accepted', time: ride.acceptedAt || null },
    { key: 'in_progress', title: 'In Progress', time: ride.startedAt || null },
    { key: 'completed', title: 'Completed', time: ride.completedAt || null }
  ];
  if (ride.status === 'cancelled') {
    STATUS_TIMELINE.push({ key: 'cancelled', title: 'Cancelled', time: ride.cancelledAt || null });
  }

  return (
    <div className="passenger-ride-details">
      <div className="container">
        <header className="page-header">
          <h1>Ride Details</h1>
          <p>
            Ride #{String(ride._id).slice(-6).toUpperCase()} • {formatStatus(ride.status)}
          </p>
          {ride.otp && (ride.status === 'accepted' || ride.status === 'arrived') && (
            <div className="otp-display" style={{
              marginTop: '10px',
              padding: '10px 20px',
              background: '#fff3cd',
              border: '1px solid #ffeeba',
              borderRadius: '8px',
              display: 'inline-block'
            }}>
              <span style={{ fontSize: '14px', color: '#856404', fontWeight: 600 }}>RIDE OTP: </span>
              <span style={{ fontSize: '24px', letterSpacing: '4px', fontWeight: 800, color: '#856404' }}>{ride.otp}</span>
              <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#856404' }}>Share this with your driver to start the ride.</p>
            </div>
          )}
        </header>

        <div className="details-grid">
          {/* Left column */}
          <div className="left-col">
            <motion.div className="card ride-summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h3>Ride Summary</h3>

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
                  <div><strong>Distance:</strong> {ride.distance ? `${ride.distance.toFixed(1)} km` : '—'}</div>
                </div>
              </div>

              <div className="driver-card">
                <h4>Driver</h4>
                {ride.driver ? (
                  <div className="driver-inner">
                    <div className="avatar">
                      {ride.driver.avatar ? (
                        <img src={ride.driver.avatar} alt={ride.driver.name} />
                      ) : (
                        <div className="initial">{ride.driver.name?.charAt(0) || 'D'}</div>
                      )}
                    </div>

                    <div className="driver-info">
                      <div className="name">{ride.driver.name}</div>
                      <div className="sub">{ride.driver.phone || 'Phone not available'}</div>
                      <div className="vehicle">
                        {ride.driver.vehicleDetails?.make} {ride.driver.vehicleDetails?.model} • {ride.driver.vehicleDetails?.plateNo}
                      </div>
                      <div className="rating">Rating: {ride.driver?.rating ?? 'N/A'}</div>
                    </div>

                    <div className="driver-actions" style={{ display: "flex", gap: "8px" }}>
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={onContactDriver}
                      >
                        Call
                      </button>

                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => navigate(`/passenger/message/${ride._id}`)}
                      >
                        Message
                      </button>
                    </div>

                  </div>
                ) : (
                  <p>Driver not assigned yet</p>
                )}
              </div>

              <div className="timeline">
                <h4>Status Timeline</h4>
                <ol>
                  {STATUS_TIMELINE.map(item => {
                    const isActive = (STATUS_ORDER.indexOf(item.key) <= STATUS_ORDER.indexOf(ride.status)) || ride.status === item.key || item.key === 'cancelled';
                    return (
                      <li key={item.key} className={isActive ? 'active' : ''}>
                        <div className="t-row">
                          <div className="t-title">{item.title}</div>
                          <div className="t-time">{item.time ? new Date(item.time).toLocaleString() : (isActive ? 'Now' : '')}</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="actions-row">
                <button className="btn btn-sm btn-outline" onClick={loadRide}>Refresh</button>
                {(ride.status === 'requested' || ride.status === 'accepted') && (
                  <button className="btn btn-sm btn-danger" onClick={onCancelRide}>Cancel Ride</button>
                )}
                {ride.status === 'completed' && (
                  <button className="btn btn-sm btn-primary" onClick={onRateRide}>Rate Ride</button>
                )}
                <button
                  className="btn btn-sm btn-accent"
                  style={{ background: '#6c5ce7', color: '#fff' }}
                  onClick={onShareTrip}
                >
                  🔗 Share Trip
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  style={{ background: '#00b894', color: '#fff' }}
                  onClick={fetchSafeHavens}
                >
                  🏥 Safe Havens
                </button>
                <button
                  className="btn btn-sm"
                  style={{ background: '#ef4444', color: '#fff', marginLeft: '8px' }}
                  onClick={() => setShowSOS(true)}
                >
                  🆘 SOS
                </button>
                {(ride.status === 'in_progress' || ride.status === 'completed') && (
                  <button
                    className="btn btn-sm"
                    style={{ background: '#00b894', color: '#fff', marginLeft: '8px' }}
                    onClick={onOpenPayment}
                  >
                    💰 Pay Driver
                  </button>
                )}
                {ride.driver && (
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ marginLeft: '8px' }}
                    onClick={() => setShowReportModal(true)}
                  >
                    🚩 Report
                  </button>
                )}
              </div>

              {/* SAFE HAVENS LIST */}
              {showHavens && (
                <div className="safe-havens-panel" style={{ marginTop: '15px', padding: '10px', background: '#f0fff4', borderRadius: '8px', border: '1px solid #c6f6d5' }}>
                  <h4 style={{ color: '#276749', marginBottom: '8px', fontSize: '14px' }}>🛡️ Safe Havens Nearby</h4>
                  {fetchingHavens ? (
                    <div style={{ fontSize: '13px', color: '#666' }}>Fetching nearby safe locations...</div>
                  ) : safeHavens.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#666' }}>No hospitals or police stations found within 3km.</div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {safeHavens.map(haven => (
                        <li key={haven.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
                          <span>{haven.type === 'hospital' ? '🏥' : '👮'} {haven.name}</span>
                          <span style={{ fontWeight: 600 }}>{haven.distance} km</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <small style={{ marginTop: '8px', display: 'block', color: '#718096', fontSize: '11px' }}>*Tap to see nearest emergency points</small>
                </div>
              )}
            </motion.div>
          </div>

          {/* Right column: map */}
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

                {/* Static route (OSRM) - rendered as a pale blue line */}
                {routeCoords && routeCoords.length > 0 && (
                  <Polyline positions={routeCoords} pathOptions={{ color: '#7db8ff', weight: 5, opacity: 0.7 }} />
                )}

                {/* Dynamic driver path (grows with live updates) - solid blue */}
                {driverPath && driverPath.length > 0 && (
                  <Polyline positions={driverPath} pathOptions={{ color: '#0066ff', weight: 5 }} />
                )}

                {/* Pickup marker */}
                {ride.pickup?.coordinates && (
                  <Marker position={[ride.pickup.coordinates.lat, ride.pickup.coordinates.lng]}>
                    <Popup><strong>Pickup</strong><br />{ride.pickup.address}</Popup>
                  </Marker>
                )}

                {/* Destination marker */}
                {ride.destination?.coordinates && (
                  <Marker position={[ride.destination.coordinates.lat, ride.destination.coordinates.lng]}>
                    <Popup><strong>Destination</strong><br />{ride.destination.address}</Popup>
                  </Marker>
                )}

                {/* Driver live marker (taxi icon) */}
                {driverLocation && (
                  <Marker
                    position={[driverLocation.lat, driverLocation.lng]}
                    icon={taxiIcon}
                  >
                    <Popup>
                      <strong>{ride.driver?.name || 'Driver'}</strong><br />
                      {ride.driver?.vehicleDetails?.make || ''} {ride.driver?.vehicleDetails?.model || ''}
                    </Popup>
                  </Marker>
                )}

                {/* Fit bounds to include pickup, driverPath and destination */}
                {combinedBounds && combinedBounds.length > 0 && <FitBounds coords={combinedBounds} />}
              </MapContainer>
            </motion.div>
          </div>
        </div>

        {/* Full Map Modal */}
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
                        <Popup><strong>{ride.driver?.name || 'Driver'}</strong></Popup>
                      </Marker>
                    )}

                    {combinedBounds && combinedBounds.length > 0 && <FitBounds coords={combinedBounds} />}
                  </MapContainer>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>


        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUser={ride.driver}
          rideId={ride._id}
        />

        {showSOS && (
          <div className="modal-overlay" onClick={() => setShowSOS(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ borderColor: '#ef4444', borderTopWidth: 4 }}>
              <h2 style={{ color: '#ef4444' }}>🆘 Emergency SOS</h2>
              <p>Triggering SOS will immediately notify emergency contacts and authorities with your live location.</p>

              <div style={{ background: '#fee2e2', padding: 15, borderRadius: 8, margin: '15px 0' }}>
                <strong>Use only for real emergencies.</strong>
                {userLocation && (
                  <div style={{ marginTop: '5px', fontSize: '13px' }}>
                    Current Coords: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                  </div>
                )}
              </div>

              <button className="btn btn-danger btn-block" style={{ height: '50px', fontSize: '18px' }} onClick={onTriggerSOS}>
                TRIGGER SOS NOW
              </button>

              <button className="btn btn-outline btn-block" style={{ marginTop: '10px' }} onClick={() => setShowSOS(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {showPayment && (
          <div className="modal-overlay" onClick={() => setShowPayment(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
              <h2>Payment</h2>
              <p>Choose your preferred payment method</p>

              <div className="payment-method-toggle" style={{ display: 'flex', gap: '10px', justifyContent: 'center', margin: '15px 0' }}>
                <button
                  className={`btn btn-sm ${paymentMethod === 'upi' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handleMethodChange('upi')}
                >
                  📱 UPI QR
                </button>
                <button
                  className={`btn btn-sm ${paymentMethod === 'cash' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => handleMethodChange('cash')}
                >
                  💵 Cash
                </button>
              </div>

              <div className="payment-summary" style={{ margin: '20px 0', padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Ride Fare:</span>
                  <span style={{ fontWeight: 600 }}>₹{ride?.fare?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                  <span>Add Tip:</span>
                  <input
                    type="number"
                    value={tipAmount}
                    onChange={handleTipChange}
                    style={{ width: '80px', padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e1', textAlign: 'right' }}
                    min="0"
                  />
                </div>
                <hr style={{ margin: '10px 0', border: 0, borderTop: '1px solid #e2e8f0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
                  <span>Total Amount:</span>
                  <span>₹{(ride?.fare + tipAmount).toFixed(2)}</span>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  style={{ marginTop: '10px', width: '100%' }}
                  onClick={onRefreshQR}
                  disabled={paymentLoading}
                >
                  🔄 Update Total & QR
                </button>
              </div>

              <div className="qr-container" style={{ margin: '20px auto', width: '220px', minHeight: '220px', padding: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                {paymentLoading ? (
                  <div className="loading-spinner"></div>
                ) : paymentMethod === 'upi' ? (
                  <>
                    {qrCode && <img src={qrCode} alt="Payment QR" style={{ width: '200px', height: '200px', marginBottom: '15px' }} />}
                    {upiUri && (
                      <a
                        href={upiUri}
                        className="btn btn-primary btn-sm rounded-pill w-100 fw-bold mb-2"
                        style={{ background: '#00b894', border: 'none' }}
                      >
                        📱 Pay with UPI App
                      </a>
                    )}
                    {upiId && (
                      <div
                        className="mt-1 p-2 border rounded bg-light d-flex align-items-center justify-content-between w-100"
                        style={{ cursor: 'pointer', fontSize: '13px' }}
                        onClick={() => {
                          navigator.clipboard.writeText(upiId);
                          alert('UPI ID copied!');
                        }}
                      >
                        <span className="text-truncate mr-2"><strong>ID:</strong> {upiId}</span>
                        <span style={{ color: '#0066ff' }}>📋</span>
                      </div>
                    )}
                    {!qrCode && !upiUri && <p style={{ fontSize: '12px', color: '#64748b' }}>Generating payment info...</p>}
                  </>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '10px' }}>💵</div>
                    <p style={{ fontWeight: 600, color: '#1e293b' }}>Pay in Cash</p>
                    <p style={{ fontSize: '12px', color: '#64748b' }}>Please pay ₹{(ride?.fare + tipAmount).toFixed(2)} to the driver directly</p>
                  </div>
                )}
              </div>

              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '20px' }}>
                {paymentMethod === 'upi'
                  ? "Direct payment to driver's UPI. Confirm the amount in your app before paying."
                  : "Hand over the exact amount to the driver in cash."}
              </p>

              {ride?.paymentStatus === 'awaiting_driver_confirmation' ? (
                <div className="alert alert-info mt-3 py-2 px-3 rounded-pill d-flex align-items-center justify-content-center" style={{ fontSize: '14px' }}>
                  <span className="mr-2">⏳</span>
                  <span>Awaiting driver confirmation...</span>
                </div>
              ) : ride?.paymentStatus === 'paid' ? (
                <div className="alert alert-success mt-3 py-2 px-3 rounded-pill d-flex align-items-center justify-content-center" style={{ fontSize: '14px', background: '#d1fae5', color: '#065f46', borderColor: '#a7f3d0' }}>
                  <span className="mr-2">✅</span>
                  <span>Payment Confirmed!</span>
                </div>
              ) : (
                <button
                  className="btn btn-primary btn-block fw-bold py-3 mt-3 rounded-pill"
                  style={{ background: '#6366f1', border: 'none' }}
                  onClick={handlePayConfirm}
                  disabled={paymentLoading}
                >
                  {paymentLoading ? 'Confirming...' : 'I have Paid'}
                </button>
              )}

              <button className="btn btn-outline btn-block mt-3" onClick={() => setShowPayment(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PassengerRideDetails;
