import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';

// Fix default leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const taxiIcon = L.divIcon({
    html: '🚖',
    className: 'driver-marker',
    iconSize: [30, 30]
});

const FitBounds = ({ coords }) => {
    const map = useMap();
    useEffect(() => {
        if (!coords || coords.length === 0) return;
        map.fitBounds(coords, { padding: [50, 50] });
    }, [coords, map]);
    return null;
};

const GuestRideView = () => {
    const { rideId } = useParams();
    const [ride, setRide] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRide = async () => {
            try {
                const res = await axios.get(`/api/rides/guest/${rideId}`);
                setRide(res.data);
            } catch (err) {
                console.error("Guest fetch error", err);
            } finally {
                setLoading(false);
            }
        };

        fetchRide();
        const iv = setInterval(fetchRide, 5000);
        return () => clearInterval(iv);
    }, [rideId]);

    if (loading) return <div className="loading">Loading live trip...</div>;
    if (!ride) return <div className="error">Trip not found or expired.</div>;

    const mapCenter = ride.currentLocation ? [ride.currentLocation.lat, ride.currentLocation.lng] : [20.5937, 78.9629];
    const driverPath = ride.route ? ride.route.map(p => [p.lat, p.lng]) : [];

    return (
        <div className="guest-view" style={{ padding: '20px', fontFamily: 'Inter, sans-serif' }}>
            <header style={{ marginBottom: '20px', textAlign: 'center' }}>
                <h1 style={{ color: '#0066ff' }}>SwipeRide Live Trip</h1>
                <p>You are tracking <strong>{ride.passenger?.name}'s</strong> ride.</p>
                <div className="badge" style={{
                    display: 'inline-block', padding: '5px 15px', borderRadius: '20px',
                    background: ride.status === 'completed' ? '#27ae60' : '#0066ff', color: '#fff', fontSize: '0.9rem'
                }}>
                    {ride.status.toUpperCase().replace('_', ' ')}
                </div>
            </header>

            <div className="card" style={{
                background: '#fff', borderRadius: '15px', overflow: 'hidden',
                boxShadow: '0 8px 30px rgba(0,0,0,0.1)', height: '500px'
            }}>
                <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                    {ride.pickup?.coordinates && (
                        <Marker position={[ride.pickup.coordinates.lat, ride.pickup.coordinates.lng]} />
                    )}

                    {ride.destination?.coordinates && (
                        <Marker position={[ride.destination.coordinates.lat, ride.destination.coordinates.lng]} />
                    )}

                    {ride.currentLocation && (
                        <Marker position={[ride.currentLocation.lat, ride.currentLocation.lng]} icon={taxiIcon} />
                    )}

                    {driverPath.length > 0 && (
                        <Polyline positions={driverPath} pathOptions={{ color: '#0066ff', weight: 4 }} />
                    )}

                    <FitBounds coords={[
                        ride.pickup?.coordinates ? [ride.pickup.coordinates.lat, ride.pickup.coordinates.lng] : null,
                        ride.destination?.coordinates ? [ride.destination.coordinates.lat, ride.destination.coordinates.lng] : null,
                        ride.currentLocation ? [ride.currentLocation.lat, ride.currentLocation.lng] : null
                    ].filter(Boolean)} />
                </MapContainer>
            </div>

            <div className="details" style={{ marginTop: '20px', background: '#f9f9f9', padding: '20px', borderRadius: '12px' }}>
                <h3>Driver Details</h3>
                {ride.driver ? (
                    <div>
                        <p><strong>Name:</strong> {ride.driver.name}</p>
                        <p><strong>Vehicle:</strong> {ride.driver.vehicleDetails?.make} {ride.driver.vehicleDetails?.model} ({ride.driver.vehicleDetails?.plateNo})</p>
                    </div>
                ) : (
                    <p>Finding driver...</p>
                )}
            </div>
        </div>
    );
};

export default GuestRideView;
