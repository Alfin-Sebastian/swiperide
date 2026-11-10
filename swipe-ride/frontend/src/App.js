import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Layout/Navbar';
import Footer from './components/Layout/Footer';
import ScrollToTop from './components/ScrollToTop';

// Public pages
import LandingPage from './pages/public/LandingPage';
import LoginPage from './pages/public/LoginPage';
import RegisterPage from './pages/public/RegisterPage';
import GuestRideView from './pages/public/GuestRideView';

// Passenger pages (to be created in Phase 3)
import PassengerHome from './pages/passenger/PassengerHome';
import PassengerRideHistory from './pages/passenger/PassengerRideHistory';
import PassengerProfile from './pages/passenger/PassengerProfile';
import SwipeMatch from './pages/passenger/SwipeMatch';
import PassengerRideDetails from './pages/passenger/PassengerRideDetails';
import PassengerMessage from './pages/passenger/PassengerMessage';
import PassengerRateRide from './pages/passenger/PassengerRateRide';


// Driver pages (to be created in Phase 3)
import DriverHome from './pages/driver/DriverHome';
import DriverVerification from './pages/driver/DriverVerification';
import DriverRideHistory from './pages/driver/DriverRideHistory';
import DriverProfile from './pages/driver/DriverProfile';
import DriverRideDetails from './pages/driver/DriverRideDetails';
import DriverMessage from './pages/driver/DriverMessage';

// Admin pages (to be created in Phase 3)
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminVerifications from './pages/admin/AdminVerifications';
import AdminRides from './pages/admin/AdminRides';
import AdminSOS from './pages/admin/AdminSOS';
import AdminUsers from './pages/admin/AdminUsers';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminReports from './pages/admin/AdminReports';

// Shared components
import MessagesPage from './pages/shared/MessagesPage';
import DirectChatPage from './pages/shared/DirectChatPage';

import './styles/App.css';

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <ScrollToTop />
          <div className="App">
            <Navbar />
            <main className="main-content">
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/tracking/:rideId" element={<GuestRideView />} />

                {/* Passenger Routes */}
                <Route path="/passenger" element={
                  <ProtectedRoute requiredRole="passenger">
                    <PassengerHome />
                  </ProtectedRoute>
                } />
                <Route path="/passenger/history" element={
                  <ProtectedRoute requiredRole="passenger">
                    <PassengerRideHistory />
                  </ProtectedRoute>
                } />
                <Route
                  path="/passenger/ride/:rideId"
                  element={
                    <ProtectedRoute requiredRole="passenger">
                      <PassengerRideDetails />
                    </ProtectedRoute>
                  }
                />

                <Route path="/passenger/profile" element={
                  <ProtectedRoute requiredRole="passenger">
                    <PassengerProfile />
                  </ProtectedRoute>
                } />
                <Route path="/passenger/swipe-match" element={
                  <ProtectedRoute requiredRole="passenger">
                    <SwipeMatch />
                  </ProtectedRoute>
                } />
                <Route
                  path="/passenger/message/:rideId"
                  element={
                    <ProtectedRoute requiredRole="passenger">
                      <PassengerMessage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/passenger/rate/:rideId" element={
                  <ProtectedRoute requiredRole="passenger">
                    <PassengerRateRide />
                  </ProtectedRoute>
                } />


                {/* Driver Routes */}
                <Route path="/driver" element={
                  <ProtectedRoute requiredRole="driver">
                    <DriverHome />
                  </ProtectedRoute>
                } />
                <Route path="/driver/verification" element={
                  <ProtectedRoute requiredRole="driver">
                    <DriverVerification />
                  </ProtectedRoute>
                } />
                <Route path="/driver/history" element={
                  <ProtectedRoute requiredRole="driver">
                    <DriverRideHistory />
                  </ProtectedRoute>
                } />
                <Route path="/driver/profile" element={
                  <ProtectedRoute requiredRole="driver">
                    <DriverProfile />
                  </ProtectedRoute>
                } />

                <Route
                  path="/driver/ride/:rideId"
                  element={
                    <ProtectedRoute requiredRole="driver">
                      <DriverRideDetails />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/driver/chat/:rideId"
                  element={
                    <ProtectedRoute requiredRole="driver">
                      <DriverMessage />
                    </ProtectedRoute>
                  }
                />


                {/* Admin Routes */}
                <Route path="/admin" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                } />
                <Route path="/admin/verifications" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminVerifications />
                  </ProtectedRoute>
                } />
                <Route path="/admin/rides" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminRides />
                  </ProtectedRoute>
                } />
                <Route path="/admin/sos" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminSOS />
                  </ProtectedRoute>
                } />
                <Route path="/admin/users" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminUsers />
                  </ProtectedRoute>
                } />
                <Route path="/admin/analytics" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminAnalytics />
                  </ProtectedRoute>
                } />
                <Route path="/admin/reports" element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminReports />
                  </ProtectedRoute>
                } />

                {/* Shared Chat Routes */}
                <Route path="/messages" element={
                  <ProtectedRoute>
                    <MessagesPage />
                  </ProtectedRoute>
                } />
                <Route path="/direct-chat/:id" element={
                  <ProtectedRoute>
                    <DirectChatPage />
                  </ProtectedRoute>
                } />

                {/* Catch all route */}
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </Router>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;