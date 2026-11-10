// src/pages/passenger/SwipeMatch.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { userService, rideService } from '../../services/api';
import { useSwipeable } from 'react-swipeable';
import { motion, AnimatePresence } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';

// Fix Leaflet icons (keeps same behavior as other files)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// --- Helpers ---
const debounce = (fn, ms = 350) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

const haversineKm = (a, b) => {
  if (!a || !b) return Infinity;
  const toRad = v => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const hav = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
  return R * c;
};

const CAR_TYPES = ['Sedan', 'SUV', 'Hatchback', 'Van', 'Luxury'];
const RATING_OPTIONS = [1, 2, 3, 4, 4.5];

// FitBounds helper component (has guard for coords)
const FitBounds = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (!coords || !Array.isArray(coords) || coords.length < 2) return;
    try {
      map.fitBounds(coords, { padding: [50, 50] });
    } catch (e) {
      // ignore
    }
  }, [coords, map]);
  return null;
};

// fare calculator
const calculateFareFromKm = (km) => {
  const base = 50;
  const perKm = 15;
  return Math.max(base + km * perKm, 60);
};

// --- Component ---
const SwipeMatch = () => {
  useAuth();
  const socket = useSocket();
  const location = useLocation();

  // map refs for zoom actions
  const mainMapRef = useRef(null);
  const modalMapRef = useRef(null);

  // drivers
  const [drivers, setDrivers] = useState([]);
  const [filteredDrivers, setFilteredDrivers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingDrivers, setLoadingDrivers] = useState(true);

  // pickup/destination/autocomplete
  const [pickup, setPickup] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);

  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);

  // route and fare
  const [routeCoords, setRouteCoords] = useState([]);
  const [distanceKm, setDistanceKm] = useState(null);
  const [estimatedFare, setEstimatedFare] = useState(null);

  // filters
  const [carTypeFilter, setCarTypeFilter] = useState([]);
  const [minRatingFilter, setMinRatingFilter] = useState(0);


  // swipe + animation
  const [swipeDirection, setSwipeDirection] = useState(null);
  const [favoriteDrivers, setFavoriteDrivers] = useState([]);

  // modal map
  const [mapModalOpen, setMapModalOpen] = useState(false);

  // map center fallback
  const mapCenter = pickupCoords || destinationCoords || { lat: 20.5937, lng: 78.9629 };

  // handle incoming navigation state (pre-fill from PassengerHome)
  useEffect(() => {
    if (location?.state) {
      const s = location.state;
      if (s.pickup) setPickup(s.pickup);
      if (s.destination) setDestination(s.destination);
      // accept both {lat,lng} and {lat,lon}
      if (s.pickupCoords && typeof s.pickupCoords.lat === 'number' && typeof (s.pickupCoords.lng ?? s.pickupCoords.lon) === 'number') {
        setPickupCoords({ lat: s.pickupCoords.lat, lng: s.pickupCoords.lng ?? s.pickupCoords.lon });
      }
      if (s.destinationCoords && typeof s.destinationCoords.lat === 'number' && typeof (s.destinationCoords.lng ?? s.destinationCoords.lon) === 'number') {
        setDestinationCoords({ lat: s.destinationCoords.lat, lng: s.destinationCoords.lng ?? s.destinationCoords.lon });
      }
      if (s.estimatedFare) setEstimatedFare(s.estimatedFare);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // --- Nominatim autocomplete ---
  const nominatimSearch = useCallback(async (q) => {
    if (!q || q.length < 2) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=10&countrycodes=in`;
    try {
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) return [];
      const data = await res.json();
      return data.map(item => ({ display_name: item.display_name, lat: parseFloat(item.lat), lon: parseFloat(item.lon) }));
    } catch (e) {
      console.error('Nominatim error', e);
      return [];
    }
  }, []);

  const debouncedPickup = useMemo(() => debounce(async (q) => {
    const results = await nominatimSearch(q);
    setPickupSuggestions(results);
    setShowPickupSuggestions(true);
  }, 350), [nominatimSearch]);

  const debouncedDest = useMemo(() => debounce(async (q) => {
    const results = await nominatimSearch(q);
    setDestSuggestions(results);
    setShowDestSuggestions(true);
  }, 350), [nominatimSearch]);

  // --- Setup: browser geolocation for pickup default ---
  useEffect(() => {
    let mounted = true;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (!mounted) return;
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setPickupCoords({ lat, lng: lon });
          try {
            const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
            if (r.ok) {
              const j = await r.json();
              setPickup(j.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
            } else {
              setPickup(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
            }
          } catch (e) {
            setPickup(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
          }
        },
        () => {
          /* silent fallback */
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
    return () => { mounted = false; };
  }, []);

  // --- Fetch drivers periodically ---
  useEffect(() => {
    let iv;
    let cancelled = false;
    const load = async () => {
      setLoadingDrivers(true);
      try {
        const res = await userService.getAvailableDrivers();
        let list = Array.isArray(res.data) ? res.data : [];
        list = list.filter(d => d.verificationStatus === 'approved' || d.verificationStatus === 'verified' || d.verificationStatus === 'active' || d.verificationStatus === undefined);
        list = list.sort(() => Math.random() - 0.5);
        if (!cancelled) setDrivers(list);
      } catch (err) {
        console.error('fetch drivers', err);
        if (!cancelled) setDrivers([]);
      } finally {
        if (!cancelled) setLoadingDrivers(false);
      }
    };
    const fetchFavoriteDrivers = async () => {
      try {
        const res = await userService.getFavoriteDrivers();
        if (!cancelled) setFavoriteDrivers(res.data.map(d => d._id));
      } catch (err) {
        console.error("Failed to fetch favorite drivers", err);
      }
    };
    load();
    fetchFavoriteDrivers();
    iv = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  // --- Apply filters & sort by distance when pickup coords available ---
  useEffect(() => {
    if (!drivers || drivers.length === 0) {
      setFilteredDrivers([]);
      setCurrentIndex(0);
      return;
    }
    const withDist = drivers.map(d => {
      const loc = d.currentLocation || d.location || null;
      const dist = pickupCoords && loc ? haversineKm(pickupCoords, { lat: loc?.lat, lng: loc?.lng }) : Infinity;
      return { ...d, __distanceToPickup: dist };
    });

    let f = withDist.filter(d => {
      const typeOk = carTypeFilter.length === 0 || (d.vehicleDetails?.type && carTypeFilter.some(ct => ct.toLowerCase() === d.vehicleDetails.type.toLowerCase()));
      const ratingOk = (minRatingFilter === 0) ? true : ((d.rating ?? 0) >= minRatingFilter);
      return typeOk && ratingOk;
    });

    if (pickupCoords) {
      f.sort((a, b) => (a.__distanceToPickup || Infinity) - (b.__distanceToPickup || Infinity));
    }
    setFilteredDrivers(f);
    setCurrentIndex(0);
  }, [drivers, pickupCoords, carTypeFilter, minRatingFilter]);

  // --- Fetch route from OSRM when both coords set ---
  useEffect(() => {
    let cancelled = false;
    const fetchRoute = async () => {
      if (!pickupCoords || !destinationCoords) {
        setRouteCoords([]);
        setDistanceKm(null);
        setEstimatedFare(null);
        return;
      }
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${pickupCoords.lng},${pickupCoords.lat};${destinationCoords.lng},${destinationCoords.lat}?overview=full&geometries=geojson`;
        const r = await fetch(url);
        const js = await r.json();
        if (js?.routes?.length) {
          const coords = js.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          if (!cancelled) setRouteCoords(coords);
          const km = js.routes[0].distance / 1000;
          if (!cancelled) {
            setDistanceKm(km);
            setEstimatedFare(calculateFareFromKm(km));
          }
        } else {
          if (!cancelled) {
            setRouteCoords([]);
            setDistanceKm(null);
            setEstimatedFare(null);
          }
        }
      } catch (e) {
        console.error('OSRM error', e);
        if (!cancelled) {
          setRouteCoords([]);
          setDistanceKm(null);
          setEstimatedFare(null);
        }
      }
    };
    fetchRoute();
    return () => { cancelled = true; };
  }, [pickupCoords, destinationCoords]);

  // --- Swipe handlers ---
  const handlers = useSwipeable({
    onSwipedLeft: () => handleSwipe('left'),
    onSwipedRight: () => handleSwipe('right'),
    preventDefaultTouchmoveEvent: true,
    trackMouse: true
  });

  const currentDriver = filteredDrivers[currentIndex];

  const handleSwipe = async (direction) => {
    if (direction === 'right' && !currentDriver) {
      alert('No driver available to request.');
      return;
    }
    setSwipeDirection(direction);
    setTimeout(async () => {
      setSwipeDirection(null);
      if (direction === 'right') {
        await requestRide(currentDriver);
      } else {
        const next = currentIndex < filteredDrivers.length - 1 ? currentIndex + 1 : 0;
        setCurrentIndex(next);
      }
    }, 380);
  };

  // --- Request ride with driver ---
  const requestRide = async (driver) => {
    if (!pickupCoords || !destinationCoords) {
      alert('Please select both pickup and destination from suggestions.');
      return;
    }
    const rideData = {
      pickup: { address: pickup, coordinates: pickupCoords },
      destination: { address: destination, coordinates: destinationCoords },
      matchingMode: 'swipe',
      // SECURE: Distance and Fare are now calculated on backend
      duration: null,
      driverPreference: driver._id
    };
    try {
      const res = await rideService.requestRide(rideData);
      try { socket?.emit?.('join-ride', res.data.ride._id); } catch (e) { }
      // setRequestedDriver(driver);
      // setShowSuccessModal(true);

      // Navigate away after a delay or let user close
      // setTimeout(() => navigate('/home'), 3000); 
    } catch (err) {
      console.error('Request ride failed', err);
      // alert('Failed to request ride, please try again.');
    }
  };

  // --- Autocomplete select handlers ---
  const selectPickupSuggestion = (s) => {
    if (!s) return;
    setPickup(s.display_name);
    if (typeof s.lat === 'number' && typeof s.lon === 'number') {
      setPickupCoords({ lat: s.lat, lng: s.lon });
    }
    setPickupSuggestions([]);
    setShowPickupSuggestions(false);
  };

  const selectDestSuggestion = (s) => {
    if (!s) return;
    setDestination(s.display_name);
    if (typeof s.lat === 'number' && typeof s.lon === 'number') {
      setDestinationCoords({ lat: s.lat, lng: s.lon });
    }
    setDestSuggestions([]);
    setShowDestSuggestions(false);
  };

  const onPickupChange = (val) => {
    setPickup(val);
    setPickupCoords(null);
    if (val && val.length >= 2) debouncedPickup(val);
    else {
      setPickupSuggestions([]);
      setShowPickupSuggestions(false);
    }
  };

  const onDestChange = (val) => {
    setDestination(val);
    setDestinationCoords(null);
    if (val && val.length >= 2) debouncedDest(val);
    else {
      setDestSuggestions([]);
      setShowDestSuggestions(false);
    }
  };

  // close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (!t.closest('.pickup-autocomplete')) setShowPickupSuggestions(false);
      if (!t.closest('.dest-autocomplete')) setShowDestSuggestions(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // toggle car type in multi-select array
  const toggleCarType = (type) => {
    setCarTypeFilter(prev => {
      if (prev.includes(type)) return prev.filter(t => t !== type);
      return [...prev, type];
    });
  };

  // select or clear min rating (single-select chips)
  const toggleMinRating = (r) => {
    setMinRatingFilter(prev => (prev === r ? 0 : r));
  };

  // --- Zoom helpers (Z1) ---
  const getRouteBounds = () => {
    // routeCoords is array of [lat, lng]
    if (Array.isArray(routeCoords) && routeCoords.length > 0) {
      return routeCoords;
    }
    // fallback to pickup/destination pair
    const pts = [];
    if (pickupCoords && typeof pickupCoords.lat === 'number' && typeof pickupCoords.lng === 'number') pts.push([pickupCoords.lat, pickupCoords.lng]);
    if (destinationCoords && typeof destinationCoords.lat === 'number' && typeof destinationCoords.lng === 'number') pts.push([destinationCoords.lat, destinationCoords.lng]);
    return pts.length >= 1 ? pts : null;
  };

  const zoomMapToRoute = (mapInstance) => {
    try {
      if (!mapInstance) return;
      const boundsArr = getRouteBounds();
      if (boundsArr && boundsArr.length > 1) {
        mapInstance.fitBounds(boundsArr, { padding: [50, 50] });
      } else if (boundsArr && boundsArr.length === 1) {
        mapInstance.setView(boundsArr[0], 15);
      } else {
        // nothing — center on mapCenter
        mapInstance.setView([mapCenter.lat, mapCenter.lng], 13);
      }
    } catch (e) {
      // safe fallback
      try { mapInstance.setView([mapCenter.lat, mapCenter.lng], 13); } catch (_) { }
    }
  };


  // Called for modal only (if you want separate control)
  const handleZoomModalOnly = () => {
    try {
      const mm = modalMapRef.current;
      if (mm && typeof mm.fitBounds === 'function') zoomMapToRoute(mm);
    } catch (e) { /* ignore */ }
  };

  // --- UI small utility: open modal map centered on route/pickup ---
  const openMapModal = () => {
    setMapModalOpen(true);
    // small timeout to allow modal map to mount; fit will be executed by button or on map creation below
    setTimeout(() => {
      try {
        const mm = modalMapRef.current;
        if (mm && typeof mm.invalidateSize === 'function') mm.invalidateSize();
        if (mm) handleZoomModalOnly();
      } catch (e) { }
    }, 350);
  };
  const closeMapModal = () => setMapModalOpen(false);


  // Render
  return (
    <div className="swipe-match page-container">
      <div className="swipe-header header-container">
        <h1 className="page-title">Swipe to Match</h1>
        <p className="page-sub">Swipe right to request a ride — nearest verified drivers prioritized. Click the map to enlarge.</p>
      </div>

      {/* Controls: pickup/destination + refresh */}
      <div className="sm-row first-row">
        <div className="sm-control-col pickup-autocomplete control-col">
          <label className="control-label">Pickup</label>
          <div className="autocomplete-wrap">
            <input
              className="input control-input"
              value={pickup}
              onChange={(e) => onPickupChange(e.target.value)}
              onFocus={() => { if (pickupSuggestions.length) setShowPickupSuggestions(true); }}
              placeholder="Type or use current location"
            />
            {showPickupSuggestions && pickupSuggestions.length > 0 && (
              <ul className="autocomplete-list">
                {pickupSuggestions.map((s, i) => (
                  <li key={i} className="autocomplete-item" onClick={() => selectPickupSuggestion(s)}>{s.display_name}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="sm-control-col dest-autocomplete control-col">
          <label className="control-label">Destination</label>
          <div className="autocomplete-wrap">
            <input
              className="input control-input"
              value={destination}
              onChange={(e) => onDestChange(e.target.value)}
              onFocus={() => { if (destSuggestions.length) setShowDestSuggestions(true); }}
              placeholder="Where to?"
            />
            {showDestSuggestions && destSuggestions.length > 0 && (
              <ul className="autocomplete-list">
                {destSuggestions.map((s, i) => (
                  <li key={i} className="autocomplete-item" onClick={() => selectDestSuggestion(s)}>{s.display_name}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="refresh-col control-col">
          <button
            className="btn btn-outline"
            onClick={() => { setCurrentIndex(0); (async () => { setLoadingDrivers(true); await new Promise(r => setTimeout(r, 300)); setLoadingDrivers(false); })(); }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="sm-row second-row" style={{ marginTop: 12 }}>
        <div className="chips-col">
          <label className="control-label">Car type</label>
          <div className="chips-row">
            {CAR_TYPES.map(ct => {
              const active = carTypeFilter.includes(ct);
              return (
                <button
                  key={ct}
                  className={`chip ${active ? 'chip-active' : ''}`}
                  onClick={() => toggleCarType(ct)}
                >
                  {ct}
                </button>
              );
            })}
            {carTypeFilter.length > 0 && (
              <button className="chip chip-clear" onClick={() => setCarTypeFilter([])}>Clear</button>
            )}
          </div>
        </div>

        <div className="chips-col">
          <label className="control-label">Min rating</label>
          <div className="chips-row">
            {RATING_OPTIONS.map(r => {
              const active = minRatingFilter === r;
              return (
                <button
                  key={r}
                  className={`chip ${active ? 'chip-active rating-active' : ''}`}
                  onClick={() => toggleMinRating(r)}
                >
                  {`⭐ ${r}+`}
                </button>
              );
            })}
            {minRatingFilter > 0 && (
              <button className="chip chip-clear" onClick={() => setMinRatingFilter(0)}>Clear</button>
            )}
          </div>
        </div>

        <div className="filters-meta-col">
          <div className="small-meta">
            <div className="meta-item">Drivers: <strong>{filteredDrivers.length}</strong></div>
            <div className="meta-item">Showing near: <strong>{pickupCoords ? `${pickupCoords.lat.toFixed(2)}, ${pickupCoords.lng.toFixed(2)}` : '—'}</strong></div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="swipe-grid">
        {/* Left: Swipe stack */}
        <div className="swipe-column">
          <div className="swipe-area">
            {loadingDrivers ? (
              <div className="loading-container">
                <div className="loading-spinner" />
                <p>Loading drivers…</p>
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div className="no-drivers">
                <h3>No drivers match your filters</h3>
                <p>Try loosening filters or change pickup location.</p>
              </div>
            ) : (
              <div {...handlers} className="swipe-card-wrapper">
                <AnimatePresence initial={false}>
                  {filteredDrivers.slice(currentIndex, currentIndex + 4).reverse().map((drv, idx) => {
                    const localSet = filteredDrivers.slice(currentIndex, currentIndex + 4);
                    const isTop = idx === (localSet.length - 1);
                    return (
                      <motion.div
                        key={drv._id}
                        layout
                        initial={{ scale: 0.96, opacity: 0, y: 30 }}
                        animate={{
                          scale: isTop ? 1 : 0.97,
                          opacity: 1,
                          y: isTop ? 0 : 18,
                          x: swipeDirection === 'left' && isTop ? -600 : swipeDirection === 'right' && isTop ? 600 : 0,
                          rotate: swipeDirection === 'left' && isTop ? -18 : swipeDirection === 'right' && isTop ? 18 : 0
                        }}
                        exit={{ opacity: 0, scale: 0.9, y: -30 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                        className="swipe-card"
                      >
                        {/* COMPACT DRIVER CARD */}
                        <div className="card-vehicle-banner">
                          {drv.vehiclePhoto ? (
                            <img src={drv.vehiclePhoto} alt="vehicle" className="vehicle-banner-img" />
                          ) : (
                            <div className="vehicle-placeholder-banner">🚗</div>
                          )}
                        </div>

                        <div className="card-content">
                          <div className="card-left">
                            <div className="driver-avatar">
                              {drv.avatar ? <img src={drv.avatar} alt={drv.name} /> : <div className="avatar-placeholder">{drv.name?.charAt(0)}</div>}
                            </div>
                          </div>

                          <div className="card-center">
                            <h3 className="driver-name">{drv.name}</h3>
                            <div className="driver-sub">{drv.vehicleDetails?.make} {drv.vehicleDetails?.model} • {drv.vehicleDetails?.plateNo || '—'}</div>

                            <div className="card-tags">
                              <span className="tag type-tag">{drv.vehicleDetails?.type || 'Unknown'}</span>
                              <span className="tag rating-tag">⭐ {drv.rating ? drv.rating.toFixed(1) : '—'}</span>
                              <span className="tag dist-tag">📍 {drv.__distanceToPickup && isFinite(drv.__distanceToPickup) ? `${drv.__distanceToPickup.toFixed(1)} km` : '—'}</span>
                              <span className="tag rides-tag">🚘 {drv.totalRides || 0} rides</span>
                              {drv.verificationStatus === 'approved' && <span className="tag verified-tag">✔ Verified</span>}
                            </div>
                          </div>

                          <div className="card-right">
                            <div className="fare-label">Estimated Fare</div>
                            <div className="fare-value">₹{(estimatedFare ?? calculateFareFromKm(drv.__distanceToPickup || 3)).toFixed(2)}</div>

                            <div className="card-actions">
                              <button
                                className={`btn btn-sm ${favoriteDrivers.includes(drv._id) ? 'btn-danger' : 'btn-outline'}`}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    if (favoriteDrivers.includes(drv._id)) {
                                      await userService.removeFavoriteDriver(drv._id);
                                      setFavoriteDrivers(prev => prev.filter(id => id !== drv._id));
                                    } else {
                                      await userService.addFavoriteDriver(drv._id);
                                      setFavoriteDrivers(prev => [...prev, drv._id]);
                                    }
                                  } catch (err) {
                                    console.error("Favorite action failed", err);
                                  }
                                }}
                                style={{ minWidth: '44px' }}
                              >
                                {favoriteDrivers.includes(drv._id) ? '❤️' : '🤍'}
                              </button>
                              <button className="btn btn-outline btn-small" onClick={() => handleSwipe('left')}>Skip</button>
                              <button className="btn btn-primary btn-small" onClick={() => handleSwipe('right')} disabled={!pickupCoords || !destinationCoords}>Request</button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* Controls under cards */}
            <div className="card-controls">
              <div className="card-counter">Driver {Math.min(currentIndex + 1, Math.max(1, filteredDrivers.length))} of {filteredDrivers.length}</div>
              <div className="card-nav">
                <button className="btn btn-outline" onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}>Prev</button>
                <button className="btn btn-outline" onClick={() => setCurrentIndex(i => (i < filteredDrivers.length - 1 ? i + 1 : 0))}>Next</button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Map + summary + nearest drivers */}
        <div className="map-column">
          <div className="map-card" onClick={openMapModal}>
            <MapContainer
              center={[mapCenter.lat, mapCenter.lng]}
              zoom={13}
              className="leaflet-map"
              style={{ height: 400 }}
              whenCreated={(mapInstance) => { mainMapRef.current = mapInstance; }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {pickupCoords && pickupCoords.lat != null && pickupCoords.lng != null && (
                <Marker position={[pickupCoords.lat, pickupCoords.lng]} />
              )}
              {destinationCoords && destinationCoords.lat != null && destinationCoords.lng != null && (
                <Marker position={[destinationCoords.lat, destinationCoords.lng]} />
              )}
              {Array.isArray(routeCoords) && routeCoords.length > 0 && (
                <Polyline positions={routeCoords} color="blue" weight={5} />
              )}
              {Array.isArray(routeCoords) && routeCoords.length > 1 && <FitBounds coords={routeCoords} />}
            </MapContainer>
          </div>

          <div className="route-summary card">
            <div className="summary-row">
              <div>
                <div className="summary-label">Distance</div>
                <div className="summary-value">{distanceKm ? `${distanceKm.toFixed(2)} km` : '—'}</div>
              </div>
              <div>
                <div className="summary-label">Estimated Fare</div>
                <div className="summary-value">{estimatedFare ? `₹${estimatedFare.toFixed(2)}` : '—'}</div>
              </div>
              <div>
                <div className="summary-label">Route Points</div>
                <div className="summary-value">{routeCoords && routeCoords.length ? routeCoords.length : '—'}</div>
              </div>
            </div>

            <div className="summary-actions">
              <button className="btn btn-outline" onClick={() => { openMapModal(); /* modal will auto-zoom on open */ }}>Open Map</button>
              <button className="btn btn-outline" onClick={() => { setPickup(''); setPickupCoords(null); setDestination(''); setDestinationCoords(null); setRouteCoords([]); setEstimatedFare(null); }}>Clear</button>
            </div>
          </div>

          <div className="nearest-drivers card">
            <h4>Nearest drivers</h4>
            <div className="nearest-list">
              {filteredDrivers.slice(0, 6).map(drv => {
                const loc = drv.currentLocation || drv.location;
                const hasLoc = loc && typeof loc.lat === 'number' && typeof loc.lng === 'number';
                return (
                  <div key={drv._id} className="nearest-item">
                    <div className="nearest-avatar">
                      {drv.avatar ? <img src={drv.avatar} alt={drv.name} /> : <div className="avatar-placeholder-small">{drv.name?.charAt(0)}</div>}
                    </div>
                    <div className="nearest-info">
                      <div className="nearest-name">{drv.name}</div>
                      <div className="nearest-sub">{drv.vehicleDetails?.make} {drv.vehicleDetails?.model}</div>
                    </div>
                    <div className="nearest-meta">
                      <div className="nearest-rating">⭐ {drv.rating ? drv.rating.toFixed(1) : '—'}</div>
                      <div className="nearest-dist">{drv.__distanceToPickup && isFinite(drv.__distanceToPickup) ? `${drv.__distanceToPickup.toFixed(1)} km` : (hasLoc ? 'nearby' : '—')}</div>
                      <button
                        className="btn btn-sm"
                        style={{ border: 'none', background: 'transparent', padding: '5px', cursor: 'pointer', fontSize: '18px' }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            if (favoriteDrivers.includes(drv._id)) {
                              await userService.removeFavoriteDriver(drv._id);
                              setFavoriteDrivers(prev => prev.filter(id => id !== drv._id));
                            } else {
                              await userService.addFavoriteDriver(drv._id);
                              setFavoriteDrivers(prev => [...prev, drv._id]);
                            }
                          } catch (err) {
                            console.error("Favorite action failed", err);
                          }
                        }}
                      >
                        {favoriteDrivers.includes(drv._id) ? '❤️' : '🤍'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Map Modal */}
      <AnimatePresence>
        {mapModalOpen && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="modal-backdrop" onClick={closeMapModal} />
            <motion.div className="modal-content large" initial={{ y: 30, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 30, scale: 0.98 }}>
              <div className="modal-header">
                <div>
                  <strong>Full Map</strong>
                  <div className="modal-sub">{pickup ? pickup : 'Pickup not set'} → {destination ? destination : 'Destination not set'}</div>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-danger" onClick={closeMapModal}>Close</button>
                </div>
              </div>

              <div className="modal-body">
                {/* Modal map uses 90vh height (chosen automatically) */}
                <MapContainer
                  center={[mapCenter.lat, mapCenter.lng]}
                  zoom={13}
                  className="leaflet-map modal-map"
                  style={{ height: '90vh' }}
                  whenCreated={(mapInstance) => {
                    modalMapRef.current = mapInstance;
                    // ensure sizes and zoom after mount
                    setTimeout(() => {
                      try {
                        if (mapInstance && typeof mapInstance.invalidateSize === 'function') mapInstance.invalidateSize();
                        if (mapInstance) handleZoomModalOnly();
                      } catch (e) { }
                    }, 200);
                  }}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {pickupCoords && pickupCoords.lat != null && pickupCoords.lng != null && <Marker position={[pickupCoords.lat, pickupCoords.lng]} />}
                  {destinationCoords && destinationCoords.lat != null && destinationCoords.lng != null && <Marker position={[destinationCoords.lat, destinationCoords.lng]} />}
                  {Array.isArray(routeCoords) && routeCoords.length > 0 && <Polyline positions={routeCoords} color="blue" weight={6} />}
                  {Array.isArray(routeCoords) && routeCoords.length > 1 && <FitBounds coords={routeCoords} />}
                  {filteredDrivers.slice(0, 12).map(drv => {
                    const loc = drv.currentLocation || drv.location;
                    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
                    return <Marker key={drv._id} position={[loc.lat, loc.lng]} />;
                  })}
                </MapContainer>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SwipeMatch;
