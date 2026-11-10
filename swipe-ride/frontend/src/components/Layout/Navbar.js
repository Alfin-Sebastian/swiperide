import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationCenter from './NotificationCenter';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getUserDashboardLink = () => {
    if (!user) return '/';

    switch (user.role) {
      case 'admin':
        return '/admin';
      case 'driver':
        return '/driver';
      case 'passenger':
        return '/passenger';
      default:
        return '/';
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <Link to="/" className="logo">
            <span className="logo-icon">🚖</span>
            <span className="logo-text">SwipeRide</span>
          </Link>
        </div>

        <div className="navbar-menu">
          {user ? (
            <>
              <NotificationCenter />
              <Link to={getUserDashboardLink()} className="nav-link">
                Dashboard
              </Link>

              {user.role === 'passenger' && (
                <>
                  <Link to="/passenger/history" className="nav-link">
                    Ride History
                  </Link>

                  <Link to="/passenger/swipe-match" className="nav-link">
                    Swipe Match
                  </Link>
                  <Link to="/messages" className="nav-link">
                    Messages
                  </Link>
                  <Link to="/passenger/profile" className="nav-link">
                    Profile
                  </Link>
                </>
              )}

              {user.role === 'driver' && (
                <>
                  <Link to="/driver/verification" className="nav-link">
                    Verification
                  </Link>
                  <Link to="/driver/history" className="nav-link">
                    History
                  </Link>
                  <Link to="/messages" className="nav-link">
                    Messages
                  </Link>
                  <Link to="/driver/profile" className="nav-link">
                    Profile
                  </Link>
                </>
              )}

              {user.role === 'admin' && (
                <>
                  <Link to="/admin/verifications" className="nav-link">
                    Verifications
                  </Link>
                  <Link to="/admin/users" className="nav-link">
                    Users
                  </Link>
                  <Link to="/admin/rides" className="nav-link">
                    Rides
                  </Link>
                  <Link to="/admin/analytics" className="nav-link">
                    Analytics
                  </Link>
                  <Link to="/admin/sos" className="nav-link">
                    SOS
                  </Link>
                  <Link to="/admin/reports" className="nav-link">
                    Reports
                  </Link>
                </>
              )}

              <div className="user-info">
                <span className="user-name">{user.name}</span>
                <span className="user-role">{user.role}</span>
              </div>

              <button onClick={handleLogout} className="btn btn-logout">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">
                Login
              </Link>
              <Link to="/register" className="btn btn-primary">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;