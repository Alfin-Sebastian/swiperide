// src/pages/passenger/PassengerHome.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { rideService, userService, sosService } from '../../services/api';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';

// Fix Leaflet default icons (webpack / CRA friendly)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Helper component to fit map bounds to route
const FitBounds = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length < 2) return;
    map.fitBounds(coords, { padding: [50, 50] });
  }, [coords, map]);
  return null;
};

// Simple debounce utility
const debounce = (fn, delay) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
};

// Haversine distance (km)
const haversineKm = (a, b) => {
  if (!a || !b) return Infinity;
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const hav = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
  return R * c;
};

const PassengerHome = () => {
  const { user } = useAuth();
  const socket = useSocket();
  const mapRef = useRef(null);
  const navigate = useNavigate();

  // Inputs & autocomplete
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [showPickupSuggestions, setShowPickupSuggestions] = useState(false);
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);

  // Coordinates
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destinationCoords, setDestinationCoords] = useState(null);

  // Matching & drivers
  const [matchingMode, setMatchingMode] = useState('quick');
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [driverLocations, setDriverLocations] = useState({}); // keyed by driverId
  const [rideRequested, setRideRequested] = useState(false);
  const [currentRide, setCurrentRide] = useState(null);

  // Routing & fare
  const [routeCoords, setRouteCoords] = useState([]);
  const [estimatedFare, setEstimatedFare] = useState(0);

  // Fallback user location (Kolkata)
  const [userLocation, setUserLocation] = useState({ lat: 22.5726, lng: 88.3639 });

  // Smart drivers computed list
  const [smartDrivers, setSmartDrivers] = useState([]);

  // Scheduled Rides & Filters
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [driverFilter, setDriverFilter] = useState({
    type: 'all',
    minRating: 0
  });

  // UI States for Modals
  const [viewDriver, setViewDriver] = useState(null); // The driver object to show details for
  const [showSOS, setShowSOS] = useState(false);

  // Global Search State
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [driverSearchResults, setDriverSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Favorites & Recents
  const [favorites, setFavorites] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [favoriteDrivers, setFavoriteDrivers] = useState([]);
  const [fullFavoriteDrivers, setFullFavoriteDrivers] = useState([]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // ---- Nominatim search
  const nominatimSearch = useCallback(async (q) => {
    if (!q || q.length < 2) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      q
    )}&addressdetails=1&limit=10&countrycodes=in`;

    try {
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((item) => ({
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        type: item.type,
        class: item.class,
      }));
    } catch (e) {
      console.error('Nominatim search error', e);
      return [];
    }
  }, []);

  const debouncedPickupSearch = useMemo(
    () =>
      debounce(async (q) => {
        const results = await nominatimSearch(q);
        setPickupSuggestions(results);
        setShowPickupSuggestions(true);
      }, 400),
    [nominatimSearch]
  );

  const debouncedDestSearch = useMemo(
    () =>
      debounce(async (q) => {
        const results = await nominatimSearch(q);
        setDestSuggestions(results);
        setShowDestSuggestions(true);
      }, 400),
    [nominatimSearch]
  );

  // ---- Driver Global Search
  const handleDriverSearch = async (val) => {
    setDriverSearchQuery(val);
    if (!val || val.length < 3) {
      setDriverSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await userService.searchDriver(val);
      setDriverSearchResults(res.data || []);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Periodically fetch available drivers
  useEffect(() => {
    let mounted = true;
    const fetchDrivers = async () => {
      try {
        const response = await userService.getAvailableDrivers();
        if (!mounted) return;
        setAvailableDrivers(response.data || []);
      } catch (err) {
        console.error('Error fetching drivers', err);
      }
    };
    const fetchFavoriteDrivers = async () => {
      try {
        const res = await userService.getFavoriteDrivers();
        if (mounted) {
          setFullFavoriteDrivers(res.data || []);
          setFavoriteDrivers(res.data.map(d => d._id));
        }
      } catch (err) {
        console.error("Failed to fetch favorite drivers", err);
      }
    };

    fetchDrivers();
    fetchFavoriteDrivers();
    const iv = setInterval(fetchDrivers, 10000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  // Browser geolocation (try to set pickup to current)
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          setPickupCoords({ lat: latitude, lng: longitude });

          (async () => {
            const rev = await reverseGeocode(latitude, longitude);
            setPickup(rev);
          })();

          userService.updateLocation(latitude, longitude).catch(() => { });
        },
        (err) => {
          console.warn('Geolocation failed, using default', err);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, []);

  // Fetch favorites and recents
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const [favRes, profileRes] = await Promise.all([
          userService.getFavorites(),
          userService.getProfile()
        ]);
        setFavorites(favRes.data || []);
        setRecentSearches(profileRes.data?.recentSearches || []);
      } catch (err) {
        console.error("Error fetching favorites/recents", err);
      }
    };
    fetchUserData();
  }, []);

  // Reverse geocode helper
  const reverseGeocode = async (lat, lon) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
      const res = await fetch(url);
      const data = await res.json();
      return data.display_name || `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    } catch (e) {
      console.error('Reverse geocode failed', e);
      return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }
  };

  // Fetch route from OSRM
  const fetchRoute = async () => {
    if (!pickupCoords || !destinationCoords) return;
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${pickupCoords.lng},${pickupCoords.lat};${destinationCoords.lng},${destinationCoords.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.routes?.length) {
        const coords = json.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
        setRouteCoords(coords);
        const km = json.routes[0].distance / 1000;
        const fare = Math.max(50 + km * 15, 60);
        setEstimatedFare(fare);
      }
    } catch (e) {
      console.error('Routing error', e);
    }
  };

  useEffect(() => {
    fetchRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupCoords, destinationCoords]);

  useEffect(() => {
    if (currentRide && currentRide.status === 'completed' && !currentRide.passengerRating) {
      navigate(`/rate/${currentRide._id}`);
    }
  }, [currentRide, navigate]);

  // ---- Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onDriverLoc = (data) => {
      if (!data || !data.driverId) return;
      setDriverLocations((prev) => ({ ...prev, [data.driverId]: data.location }));
    };

    const onRideAccepted = (data) => {
      if (data?.rideId) {
        fetchRideDetails(data.rideId);
        setRideRequested(false);
      }
    };

    const onRideStatus = (data) => {
      if (!data || !data.rideId) return;
      if (currentRide && currentRide._id === data.rideId) {
        setCurrentRide((prev) => ({ ...prev, status: data.status, currentLocation: data.currentLocation }));
      }
    };

    socket.on('driver-location-update', onDriverLoc);
    socket.on('ride-accepted', onRideAccepted);
    socket.on('ride-status-update', onRideStatus);

    return () => {
      socket.off('driver-location-update', onDriverLoc);
      socket.off('ride-accepted', onRideAccepted);
      socket.off('ride-status-update', onRideStatus);
    };
  }, [socket, currentRide]);

  const fetchRideDetails = async (rideId) => {
    try {
      const res = await rideService.getRide(rideId);
      setCurrentRide(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Request Ride (Quick & Smart; Swipe redirects)
  const handleRequestRide = async () => {
    if (!pickupCoords || !destinationCoords) {
      alert('Please select pickup and destination.');
      return;
    }

    if (matchingMode === 'swipe') {
      navigate('/passenger/swipe-match', {
        state: {
          pickup,
          destination,
          pickupCoords,
          destinationCoords,
          estimatedFare,
        },
      });
      return;
    }

    try {
      const distance = routeCoords.length > 1 ? (estimatedFare - 50) / 15 : 0; // rough inverse or we can use the actual OSRM distance if stored

      const rideData = {
        pickup: { address: pickup, coordinates: pickupCoords },
        destination: { address: destination, coordinates: destinationCoords },
        matchingMode,
        fare: estimatedFare,
        distance: distance > 0 ? distance : 0,
        scheduledTime: isScheduled ? scheduledTime : null
      };

      const res = await rideService.requestRide(rideData);
      setCurrentRide(res.data.ride);
      setRideRequested(true);
      socket?.emit('join-ride', res.data.ride._id);
      alert('Ride requested! Waiting for driver...');
    } catch (err) {
      console.error('Request ride failed:', err.response?.data || err.message);
      alert(err.response?.data?.message || 'Failed to request ride.');
    }
  };

  // Request ride preferring a particular driver
  const requestRideWithDriver = async (driver) => {
    if (!pickupCoords || !destinationCoords) {
      alert('Please select pickup and destination.');
      return;
    }
    try {
      const distance = routeCoords.length > 1 ? (estimatedFare - 50) / 15 : 0;

      const rideData = {
        pickup: { address: pickup, coordinates: pickupCoords },
        destination: { address: destination, coordinates: destinationCoords },
        matchingMode: 'smart',
        fare: estimatedFare,
        distance: distance > 0 ? distance : 0,
        driverPreference: driver._id,
        scheduledTime: isScheduled ? scheduledTime : null
      };
      const res = await rideService.requestRide(rideData);
      setCurrentRide(res.data.ride);
      setRideRequested(true);
      socket?.emit('join-ride', res.data.ride._id);
      alert(`Ride requested — waiting for ${driver.name} to confirm.`);
    } catch (err) {
      console.error('Request ride with driver failed:', err.response?.data || err.message);
      alert(err.response?.data?.message || 'Failed to request ride. Try again.');
    }
  };

  // Input handlers
  const onPickupChange = (val) => {
    setPickup(val);
    setPickupCoords(null);
    if (val && val.length >= 2) debouncedPickupSearch(val);
    else {
      setPickupSuggestions([]);
      setShowPickupSuggestions(false);
    }
  };

  const onDestinationChange = (val) => {
    setDestination(val);
    setDestinationCoords(null);
    if (val && val.length >= 2) debouncedDestSearch(val);
    else {
      setDestSuggestions([]);
      setShowDestSuggestions(false);
    }
  };

  const selectPickupSuggestion = async (suggestion) => {
    const lat = suggestion.lat;
    const lon = suggestion.lon;
    setPickup(suggestion.display_name);
    setPickupCoords({ lat, lng: lon });
    setPickupSuggestions([]);
    setShowPickupSuggestions(false);
    if (destinationCoords) fetchRoute();
  };

  const selectDestSuggestion = async (suggestion) => {
    const lat = suggestion.lat;
    const lon = suggestion.lon;
    setDestination(suggestion.display_name);
    setDestinationCoords({ lat, lng: lon });
    setDestSuggestions([]);
    setShowDestSuggestions(false);
    userService.addRecent({ address: suggestion.display_name, lat, lng: lon }).catch(() => { });
    if (pickupCoords) fetchRoute();
  };

  const selectFavorite = (fav) => {
    setDestination(fav.address);
    setDestinationCoords({ lat: fav.lat, lng: fav.lng });
    userService.addRecent({ address: fav.address, lat: fav.lat, lng: fav.lng }).catch(() => { });
  };

  const selectRecent = (recent) => {
    setDestination(recent.address);
    setDestinationCoords({ lat: recent.lat, lng: recent.lng });
    userService.addRecent({ address: recent.address, lat: recent.lat, lng: recent.lng }).catch(() => { });
  };

  const handlePickupDrag = async (e) => {
    const { lat, lng } = e.target.getLatLng();
    setPickupCoords({ lat, lng });
    const address = await reverseGeocode(lat, lng);
    setPickup(address);
  };

  const handleMapClick = async (e) => {
    const { lat, lng } = e.latlng;
    setDestinationCoords({ lat, lng });
    const address = await reverseGeocode(lat, lng);
    setDestination(address);
    userService.addRecent({ address, lat, lng }).catch(() => { });
  };
  // Ride status UI
  const renderRideStatus = () => {
    if (!currentRide) return null;

    const handleCancelRide = async () => {
      if (!window.confirm('Are you sure you want to cancel this ride?')) return;

      try {
        await rideService.cancelRide(currentRide._id, 'passenger');
        alert('Ride cancelled successfully');
        setCurrentRide(null);
        setRideRequested(false);
      } catch (err) {
        console.error('Cancel ride error:', err);
        alert('Failed to cancel ride');
      }
    };

    const getTimeRemaining = () => {
      if (!currentRide.expiresAt) return null;
      const now = new Date();
      const expiry = new Date(currentRide.expiresAt);
      const diff = expiry - now;
      if (diff <= 0) return 'Expired';
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    switch (currentRide.status) {
      case 'requested':
        const timeRemaining = getTimeRemaining();
        return (
          <div className="ride-status requested">
            <h3>⏳ Waiting for driver...</h3>
            <p>Looking for available drivers in your area</p>
            {timeRemaining && (
              <p style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                Time remaining: {timeRemaining}
              </p>
            )}
            <button
              onClick={handleCancelRide}
              className="btn btn-outline"
              style={{ marginTop: '10px' }}
            >
              Cancel Ride
            </button>
          </div>
        );
      case 'accepted':
        return (
          <div className="ride-status accepted">
            <h3>✅ Ride Accepted!</h3>
            <p>Driver is on the way to your pickup location</p>
            <button
              onClick={handleCancelRide}
              className="btn btn-outline"
              style={{ marginTop: '10px' }}
            >
              Cancel Ride
            </button>
          </div>
        );
      case 'in_progress':
        return (
          <div className="ride-status in-progress">
            <h3>🚗 Ride in Progress</h3>
            <p>You're on your way to the destination</p>
          </div>
        );
      default:
        return null;
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      const target = e.target;
      if (!target || !target.closest) return;
      if (!target.closest('.pickup-autocomplete')) setShowPickupSuggestions(false);
      if (!target.closest('.dest-autocomplete')) setShowDestSuggestions(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // deterministic fallback jitter based on index
  const driverFallbackPos = useCallback((idx) => {
    const jitterLat = (idx % 7) * 0.0015 - 0.005; // deterministic small spread
    const jitterLng = ((idx + 3) % 5) * 0.0016 - 0.004;
    return { lat: userLocation.lat + jitterLat, lng: userLocation.lng + jitterLng };
  }, [userLocation]);

  // ------------------------
  // SMART MATCH COMPUTATION
  // ------------------------
  useEffect(() => {
    if (!availableDrivers || availableDrivers.length === 0) {
      setSmartDrivers([]);
      return;
    }

    const pickupPoint = pickupCoords || userLocation;

    const scored = availableDrivers.map((d, index) => {
      // Prefer live location from socket, then stored location, then fallback jitter
      const live = driverLocations[d._id];
      const loc =
        live && typeof live.lat === 'number' && typeof live.lng === 'number'
          ? live
          : d.location && typeof d.location.lat === 'number' && typeof d.location.lng === 'number'
            ? d.location
            : driverFallbackPos(index);

      // Filter Logic
      if (driverFilter.type !== 'all' && d.vehicleDetails?.type?.toLowerCase() !== driverFilter.type.toLowerCase()) return null;
      if (d.rating < driverFilter.minRating) return null;

      const distanceKm = isFinite(haversineKm(pickupPoint, loc)) ? haversineKm(pickupPoint, loc) : 9999;

      const maxDist = 20;
      const distNormalized = Math.max(0, (maxDist - Math.min(distanceKm, maxDist)) / maxDist); // 0..1

      const rating = d.rating ?? 0;
      const ratingNormalized = Math.min(1, rating / 5);

      const availableFlag = d.available === true || d.status === 'available' || d.isOnline === true ? 1 : 0;

      const wDist = 0.5;
      const wRating = 0.35;
      const wAvail = 0.15;

      const score = (distNormalized * wDist + ratingNormalized * wRating + availableFlag * wAvail) * 10;

      return {
        driver: d,
        loc,
        distanceKm,
        score,
      };
    });

    // sort by distance (asc), then score desc to break ties
    scored.sort((a, b) => {
      if (Math.abs(a.distanceKm - b.distanceKm) < 1e-3) return (b.score || 0) - (a.score || 0);
      return (a.distanceKm || 0) - (b.distanceKm || 0);
    });

    setSmartDrivers(scored.filter(x => x !== null)); // Remove filtered out drivers
  }, [availableDrivers, pickupCoords, driverLocations, userLocation, driverFilter, driverFallbackPos]);

  // UI determination for which drivers to display
  const driverResultsTitle = matchingMode === 'smart' ? 'Smart Match Results' : 'Available Drivers';

  const driversToRender =
    matchingMode === 'smart'
      ? smartDrivers
      : // convert availableDrivers into consistent objects: { driver, loc, distanceKm, score }
      availableDrivers.map((d, ix) => {
        const live = driverLocations[d._id];
        const loc =
          live && typeof live.lat === 'number' && typeof live.lng === 'number'
            ? live
            : d.location && typeof d.location.lat === 'number' && typeof d.location.lng === 'number'
              ? d.location
              : driverFallbackPos(ix);

        return {
          driver: d,
          loc,
          distanceKm: null,
          score: null,
        };
      });

  const computeDistanceText = (drvObj) => {
    if (!pickupCoords) return '—';
    const loc = drvObj.loc || (drvObj.driver && (drvObj.driver.location || drvObj.driver.currentLocation)) || null;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return '—';
    const km = haversineKm(pickupCoords, { lat: loc.lat, lng: loc.lng });
    if (!isFinite(km)) return '—';
    return `${km.toFixed(1)} km`;
  };

  // ------------------------
  // RENDER JSX
  // ------------------------
  return (
    <div className="passenger-home">
      <div className="container">
        <header className="page-header">
          <h1>Welcome, {user?.name}!</h1>
          <p>Book a ride with OpenStreetMap autocomplete</p>
        </header>

        <div className="dashboard-grid">
          {/* LEFT PANEL (Booking) */}
          <div className="booking-panel">
            <div className="card">
              <h3>Book a Ride</h3>

              <div className="form-group pickup-autocomplete" style={{ position: 'relative' }}>
                <label>Pickup Location</label>
                <input
                  type="text"
                  value={pickup}
                  onChange={(e) => onPickupChange(e.target.value)}
                  onFocus={() => {
                    if (pickupSuggestions.length) setShowPickupSuggestions(true);
                  }}
                  placeholder="Start typing pickup location..."
                  className="input"
                />
                {showPickupSuggestions && pickupSuggestions.length > 0 && (
                  <ul className="autocomplete-list">
                    {pickupSuggestions.map((s, i) => (
                      <li key={i} className="autocomplete-item" onClick={() => selectPickupSuggestion(s)}>
                        {s.display_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="form-group dest-autocomplete" style={{ position: 'relative' }}>
                <label>Destination</label>

                {/* FAVORITES & RECENTS CHIPS */}
                {(favorites.length > 0 || recentSearches.length > 0) && (
                  <div className="quick-locations" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {favorites.map((fav, i) => (
                      <button
                        key={`fav-${i}`}
                        className="btn btn-sm btn-outline"
                        style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '15px' }}
                        onClick={() => selectFavorite(fav)}
                      >
                        ⭐ {fav.label}
                      </button>
                    ))}
                    {recentSearches.map((rec, i) => (
                      <button
                        key={`rec-${i}`}
                        className="btn btn-sm btn-outline"
                        style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '15px', color: '#666' }}
                        onClick={() => selectRecent(rec)}
                      >
                        🕒 {rec.address.split(',')[0]}
                      </button>
                    ))}
                  </div>
                )}

                <input
                  type="text"
                  value={destination}
                  onChange={(e) => onDestinationChange(e.target.value)}
                  onFocus={() => {
                    if (destSuggestions.length) setShowDestSuggestions(true);
                  }}
                  placeholder="Type destination or click on map"
                  className="input"
                />
                {showDestSuggestions && destSuggestions.length > 0 && (
                  <ul className="autocomplete-list">
                    {destSuggestions.map((s, i) => (
                      <li key={i} className="autocomplete-item" onClick={() => selectDestSuggestion(s)}>
                        {s.display_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="matching-mode-selector" style={{ marginTop: '10px' }}>
                <label>
                  <strong>Select Matching Mode</strong>
                </label>
                <div className="mode-buttons" style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                  <button
                    className={`btn btn-sm ${matchingMode === 'quick' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setMatchingMode('quick')}
                  >
                    ⚡ Quick Match
                  </button>

                  <button
                    className={`btn btn-sm ${matchingMode === 'smart' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setMatchingMode('smart')}
                  >
                    🤖 Smart Match
                  </button>

                  <button
                    className={`btn btn-sm ${matchingMode === 'swipe' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setMatchingMode('swipe')}
                  >
                    👆 Swipe Match
                  </button>
                </div>
              </div>

              <div className="fare-estimate" style={{ marginTop: 12 }}>
                <h4>Estimated Fare: ₹{estimatedFare ? estimatedFare.toFixed(2) : '0.00'}</h4>
                <small>Base fare: ₹50 + ₹15 per km (Min ₹60)</small>
              </div>

              {/* SCHEDULE RIDE TOGGLE */}
              <div className="schedule-ride-section" style={{ marginTop: 15, borderTop: '1px solid #eee', paddingTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                  />
                  <strong>Schedule for Later</strong>
                </label>

                {isScheduled && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="datetime-local"
                      className="input"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                  </div>
                )}
              </div>

              {!rideRequested ? (
                <button onClick={handleRequestRide} className="btn btn-primary btn-block" style={{ marginTop: 12 }}>
                  Request Ride
                </button>
              ) : (
                renderRideStatus()
              )}
            </div>
          </div>

          {/* RIGHT PANEL (Map) */}
          <div className="map-panel">
            <div className="card map-container">
              <MapContainer
                center={[userLocation.lat, userLocation.lng]}
                zoom={14}
                style={{ height: '600px', width: '100%' }}
                whenCreated={(map) => (mapRef.current = map)}
                onClick={handleMapClick}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {/* Draggable pickup marker */}
                {pickupCoords && (
                  <Marker position={[pickupCoords.lat, pickupCoords.lng]} draggable={true} eventHandlers={{ dragend: handlePickupDrag }}>
                    <Popup>Pickup</Popup>
                  </Marker>
                )}

                {/* Destination */}
                {destinationCoords && (
                  <Marker
                    position={[destinationCoords.lat, destinationCoords.lng]}
                    icon={L.divIcon({ html: '<b>📍</b>', className: 'dest-marker', iconSize: [30, 30] })}
                  >
                    <Popup>Destination</Popup>
                  </Marker>
                )}

                {/* Route */}
                {routeCoords.length > 0 && <Polyline positions={routeCoords} color="blue" />}

                {routeCoords.length > 0 && <FitBounds coords={routeCoords} />}

                {/* Live driver markers */}
                {availableDrivers.map((driver, ix) => {
                  const liveLoc = driverLocations[driver._id];
                  const loc =
                    liveLoc && typeof liveLoc.lat === 'number' && typeof liveLoc.lng === 'number'
                      ? liveLoc
                      : driver.location && typeof driver.location.lat === 'number' && typeof driver.location.lng === 'number'
                        ? driver.location
                        : driverFallbackPos(ix);

                  const usedLat = loc && typeof loc.lat === 'number' ? loc.lat : userLocation.lat;
                  const usedLng = loc && typeof loc.lng === 'number' ? loc.lng : userLocation.lng;

                  return (
                    <Marker
                      key={driver._id || `drv-${ix}`}
                      position={[usedLat, usedLng]}
                      icon={L.divIcon({ html: '🚖', className: 'driver-marker', iconSize: [30, 30] })}
                    >
                      <Popup>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {driver.name}
                          {driver.verificationStatus === 'approved' && <span style={{ color: '#3b82f6', fontSize: '0.9rem' }}>💎</span>}
                        </strong>
                        <br />
                        {driver.vehicleDetails?.make} {driver.vehicleDetails?.model}
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </div>
        </div>

        {/* QUICK BOOKING SECTION (FAVORITES) */}
        {fullFavoriteDrivers.length > 0 && (
          <div className="favorites-scroll-section card" style={{ padding: '16px', marginBottom: '16px' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              ❤️ Your Favorite Drivers
            </h4>
            <div className="favorites-horizontal-scroll" style={{
              display: 'flex',
              gap: '12px',
              overflowX: 'auto',
              padding: '4px 4px 12px 4px',
              scrollbarWidth: 'none', // Firefox
              msOverflowStyle: 'none'  // IE/Edge
            }}>
              {fullFavoriteDrivers.map(drv => (
                <div key={drv._id} className="fav-scroll-card" style={{
                  flex: '0 0 160px',
                  background: 'white',
                  borderRadius: '12px',
                  padding: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  border: '1px solid #eee',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center'
                }}>
                  <div style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    marginBottom: '8px',
                    background: '#f8fafc'
                  }}>
                    {drv.avatar ? (
                      <img src={drv.avatar} alt={drv.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                        {drv.name?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                    {drv.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                    ⭐ {drv.rating?.toFixed(1) || 'New'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => setViewDriver(drv)}
                      style={{ flex: 1, fontSize: '10px', padding: '4px 0' }}
                    >
                      View
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => requestRideWithDriver(drv)}
                      style={{ flex: 1, fontSize: '10px', padding: '4px 0' }}
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FULL-WIDTH DRIVER RESULTS PANEL */}
        <div className="driver-results-panel" style={{ marginTop: 16 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>
                {driverResultsTitle} {matchingMode === 'smart' && `• ${smartDrivers.length} results`}
              </h3>
              <div style={{ fontSize: 13, color: '#666' }}>
                {matchingMode === 'smart' ? 'Sorted by nearest distance (Smart score shown)' : 'Live available drivers'}
              </div>
            </div>

            {/* DRIVER FILTERS */}
            <div className="driver-filters" style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <select
                className="input input-sm"
                value={driverFilter.type}
                onChange={(e) => setDriverFilter(prev => ({ ...prev, type: e.target.value }))}
                style={{ flex: 1 }}
              >
                <option value="all">All Vehicle Types</option>
                <option value="sedan">Sedan</option>
                <option value="suv">SUV</option>
                <option value="luxury">Luxury</option>
              </select>

              <select
                className="input input-sm"
                value={driverFilter.minRating}
                onChange={(e) => setDriverFilter(prev => ({ ...prev, minRating: Number(e.target.value) }))}
                style={{ flex: 1 }}
              >
                <option value={0}>Any Rating</option>
                <option value={4}>4+ Stars</option>
                <option value={4.5}>4.5+ Stars</option>
              </select>

              <div style={{ flex: 2, position: 'relative' }}>
                <input
                  type="text"
                  placeholder="🔍 Search specific driver (Name/Phone)..."
                  className="input input-sm"
                  value={driverSearchQuery}
                  onChange={(e) => handleDriverSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
                {isSearching && <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 12 }}>Searching...</div>}
              </div>
            </div>

            {/* SEARCH RESULTS OVERLAY (if active) */}
            {driverSearchResults.length > 0 && (
              <div className="search-results-box" style={{
                background: '#fff9e6',
                border: '1px solid #f59e0b',
                padding: '12px',
                borderRadius: '8px',
                marginTop: '15px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <strong style={{ color: '#92400e' }}>Global Search Results</strong>
                  <button onClick={() => { setDriverSearchQuery(''); setDriverSearchResults([]); }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                </div>
                {driverSearchResults.map(d => (
                  <div key={d._id} className="search-result-item" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(0,0,0,0.05)'
                  }}>
                    <div>
                      <strong>{d.name}</strong> • {d.vehicleDetails?.make} ({d.vehicleType})
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className={`btn btn-sm ${favoriteDrivers.includes(d._id) ? 'btn-danger' : 'btn-outline'}`}
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            if (favoriteDrivers.includes(d._id)) {
                              await userService.removeFavoriteDriver(d._id);
                              setFavoriteDrivers(prev => prev.filter(id => id !== d._id));
                            } else {
                              await userService.addFavoriteDriver(d._id);
                              setFavoriteDrivers(prev => [...prev, d._id]);
                            }
                          } catch (err) {
                            console.error("Favorite action failed", err);
                          }
                        }}
                      >
                        {favoriteDrivers.includes(d._id) ? '❤️' : '🤍'}
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => requestRideWithDriver(d)}>Book Direct</button>
                    </div>
                  </div>
                ))}
              </div>
            )}


            <div className="passenger-driver-card-grid" style={{ marginTop: 12 }}>
              {driversToRender.length === 0 ? (
                <div style={{ padding: 20 }}>No drivers available right now.</div>
              ) : (
                driversToRender.map((drvObj, idx) => {
                  const driver = drvObj.driver;
                  const distanceDisplay =
                    drvObj.distanceKm != null && isFinite(drvObj.distanceKm)
                      ? `${drvObj.distanceKm.toFixed(1)} km`
                      : pickupCoords
                        ? computeDistanceText(drvObj)
                        : '—';

                  const smartScoreDisplay = drvObj.score != null ? drvObj.score.toFixed(2) : matchingMode === 'smart' ? '—' : null;

                  return (
                    <div
                      key={driver._id || `${driver.name}-${idx}`}
                      className="smart-driver-card"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 12,
                        borderBottom: '1px solid #eee',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          className="passenger-driver-avatar"
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 8,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#f3f3f3',
                          }}
                        >
                          {driver.avatar ? (
                            <img src={driver.avatar} alt={driver.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 20 }}>{driver.name?.charAt(0) ?? 'D'}</span>
                          )}
                        </div>

                        <div>
                          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {driver.name}
                            {driver.verificationStatus === 'approved' && <span style={{ color: '#3b82f6', fontSize: '1rem' }}>💎</span>}
                          </h4>
                          <div style={{ fontSize: 13, color: '#555' }}>
                            {driver.vehicleDetails?.make} {driver.vehicleDetails?.model} • {driver.vehicleDetails?.plateNo || '—'}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 13, color: '#666' }}>
                            Rating: ⭐ {driver.rating ?? 'New'} • Distance: {distanceDisplay}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {matchingMode === 'smart' && (
                          <div style={{ textAlign: 'right', minWidth: 92 }}>
                            <div style={{ fontSize: 12, color: '#888' }}>Smart Score</div>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>{smartScoreDisplay}/10</div>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className={`btn btn-sm ${favoriteDrivers.includes(driver._id) ? 'btn-danger' : 'btn-outline'}`}
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                if (favoriteDrivers.includes(driver._id)) {
                                  await userService.removeFavoriteDriver(driver._id);
                                  setFavoriteDrivers(prev => prev.filter(id => id !== driver._id));
                                } else {
                                  await userService.addFavoriteDriver(driver._id);
                                  setFavoriteDrivers(prev => [...prev, driver._id]);
                                }
                              } catch (err) {
                                console.error("Favorite action failed", err);
                              }
                            }}
                            title={favoriteDrivers.includes(driver._id) ? "Remove from Favorites" : "Add to Favorites"}
                          >
                            {favoriteDrivers.includes(driver._id) ? '❤️' : '🤍'}
                          </button>

                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => setViewDriver(driver)}
                          >
                            👁 View
                          </button>

                          <button className="btn btn-sm btn-primary" onClick={() => requestRideWithDriver(driver)}>
                            Request
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="quick-actions" style={{ marginTop: 16 }}>
          <button className="action-btn" onClick={() => navigate('/passenger/history')}>📋 Ride History</button>
          <button className="action-btn" onClick={() => navigate('/passenger/profile')}>👤 Profile</button>
          <button className="action-btn">💰 Payment Methods</button>
          <button className="action-btn" onClick={() => setShowSOS(true)} style={{ backgroundColor: '#ef4444', color: 'white' }}>🆘 Emergency Contacts</button>
        </div>

        {/* DRIVER DETAILS MODAL */}
        {viewDriver && (
          <div className="modal-overlay" onClick={() => setViewDriver(null)}>
            <div className="modal-content driver-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Driver Profile</h2>
                <button className="close-btn" onClick={() => setViewDriver(null)}>×</button>
              </div>

              <div className="driver-modal-body">
                <div className="driver-profile-header">
                  <div className="driver-avatar-large">
                    {viewDriver.avatar ? (
                      <img src={viewDriver.avatar} alt={viewDriver.name} />
                    ) : (
                      <span>{viewDriver.name?.charAt(0) ?? 'D'}</span>
                    )}
                  </div>
                  <div className="driver-identity">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h3 style={{ margin: 0 }}>{viewDriver.name}</h3>
                      {viewDriver.verificationStatus === 'approved' && (
                        <span className="verified-badge" title="Verified Driver" style={{ background: '#3b82f620', color: '#1d4ed8', border: '1px solid #3b82f6', borderRadius: '12px', padding: '2px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          💎 Verified
                        </span>
                      )}
                    </div>
                    <div className="driver-rating-badge" style={{ marginTop: 8 }}>
                      ⭐ {viewDriver.rating?.toFixed(1) || 'New'} <span className="dot">•</span> {viewDriver.totalRides || 0} Rides
                    </div>
                    <div className="member-since" style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
                      Member since {viewDriver.createdAt ? new Date(viewDriver.createdAt).toLocaleDateString() : '2024'}
                    </div>
                  </div>
                </div>

                <div className="vehicle-preview" style={{ marginTop: 20 }}>
                  <div className="vehicle-image-container">
                    {(viewDriver.vehicleImage || viewDriver.vehiclePhoto) ? (
                      <img
                        src={viewDriver.vehicleImage || viewDriver.vehiclePhoto}
                        alt="Vehicle"
                        className="vehicle-real-photo"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'block';
                        }}
                      />
                    ) : null}
                    <div className="vehicle-placeholder-icon" style={{ display: (viewDriver.vehicleImage || viewDriver.vehiclePhoto) ? 'none' : 'block' }}>
                      🚗
                    </div>
                  </div>
                  <div className="vehicle-info-strip" style={{ marginTop: 15, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    <div className="vehicle-spec">
                      <span className="label" style={{ display: 'block', fontSize: 11, color: '#888' }}>Vehicle</span>
                      <span className="value" style={{ fontWeight: 600 }}>{viewDriver.vehicleDetails?.make} {viewDriver.vehicleDetails?.model}</span>
                    </div>
                    <div className="vehicle-spec">
                      <span className="label" style={{ display: 'block', fontSize: 11, color: '#888' }}>Type</span>
                      <span className="value" style={{ fontWeight: 600 }}>{viewDriver.vehicleType || viewDriver.vehicleDetails?.type || 'Sedan'}</span>
                    </div>
                    <div className="vehicle-spec">
                      <span className="label" style={{ display: 'block', fontSize: 11, color: '#888' }}>Color</span>
                      <span className="value" style={{ fontWeight: 600 }}>{viewDriver.vehicleDetails?.color}</span>
                    </div>
                    <div className="vehicle-spec">
                      <span className="label" style={{ display: 'block', fontSize: 11, color: '#888' }}>Plate No</span>
                      <span className="value" style={{ fontWeight: 600 }}>{viewDriver.vehicleDetails?.plateNo}</span>
                    </div>
                  </div>
                </div>

                <div className="driver-modal-actions" style={{ marginTop: 25 }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <button
                      className={`btn btn-block ${favoriteDrivers.includes(viewDriver._id) ? 'btn-danger' : 'btn-outline'}`}
                      onClick={async () => {
                        try {
                          if (favoriteDrivers.includes(viewDriver._id)) {
                            await userService.removeFavoriteDriver(viewDriver._id);
                            setFavoriteDrivers(prev => prev.filter(id => id !== viewDriver._id));
                          } else {
                            await userService.addFavoriteDriver(viewDriver._id);
                            setFavoriteDrivers(prev => [...prev, viewDriver._id]);
                          }
                        } catch (err) {
                          console.error("Favorite action failed", err);
                        }
                      }}
                    >
                      {favoriteDrivers.includes(viewDriver._id) ? '❤️ Remove Favorite' : '🤍 Add Favorite'}
                    </button>
                  </div>
                  <button
                    className="btn btn-primary btn-lg btn-block"
                    onClick={() => {
                      requestRideWithDriver(viewDriver);
                      setViewDriver(null);
                    }}
                  >
                    Request This Driver
                  </button>
                  <button className="btn btn-outline btn-block" style={{ marginTop: 10 }} onClick={() => setViewDriver(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SOS MODAL */}
        {showSOS && (
          <div className="modal-overlay" onClick={() => setShowSOS(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ borderColor: '#ef4444', borderTopWidth: 4 }}>
              <h2 style={{ color: '#ef4444' }}>🆘 Emergency Output</h2>
              <p>Clicking the button below will send an immediate alert to your emergency contacts and local authorities.</p>

              <div style={{ background: '#fee2e2', padding: 15, borderRadius: 8, margin: '15px 0' }}>
                <strong>Use only in real emergencies.</strong>
                <br />
                Current Location: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
              </div>

              <button
                className="btn btn-danger btn-block"
                style={{ fontSize: 18, padding: 15 }}
                onClick={async () => {
                  try {
                    // Start SOS
                    const res = await sosService.triggerSOS({
                      rideId: currentRide?._id,
                      notes: 'Emergency triggered by user'
                    });
                    const sosId = res.data?.sos?._id || res.sos?._id;

                    alert('SOS Alert Sent! Emergency contacts have been notified with your live location. Recording audio for evidence...');
                    setShowSOS(false);

                    // RECORDING LOGIC (60 seconds)
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                      const mediaRecorder = new MediaRecorder(stream);
                      mediaRecorderRef.current = mediaRecorder;
                      audioChunksRef.current = [];

                      mediaRecorder.ondataavailable = (event) => {
                        if (event.data.size > 0) audioChunksRef.current.push(event.data);
                      };

                      mediaRecorder.onstop = async () => {
                        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                        const reader = new FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = async () => {
                          const base64Audio = reader.result;
                          try {
                            await sosService.uploadRecording(sosId, base64Audio);
                            console.log("SOS Recording uploaded successfully");
                          } catch (err) {
                            console.error("Failed to upload SOS recording", err);
                          }
                        };
                        // Stop all tracks
                        stream.getTracks().forEach(track => track.stop());
                      };

                      mediaRecorder.start();
                      // Auto-stop after 60 seconds
                      setTimeout(() => {
                        if (mediaRecorder.state === 'recording') mediaRecorder.stop();
                      }, 60000);
                    } catch (err) {
                      console.warn("Could not start audio recording:", err);
                    }

                  } catch (error) {
                    console.error('SOS failed', error);
                    alert('Failed to send SOS alert. Please call police immediately.');
                  }
                }}
              >
                SEND SOS ALERT
              </button>

              <button
                className="btn btn-outline btn-block"
                style={{ marginTop: 10 }}
                onClick={() => setShowSOS(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div >
  );
};

export default PassengerHome;
