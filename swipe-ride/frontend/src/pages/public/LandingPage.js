import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';

const LandingPage = () => {
  const { user } = useAuth();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <h1>SwipeRide</h1>
        <p>Modern Ride-Sharing with Swipe Matching</p>
      </header>

      <main className="landing-content">
        <motion.section
          className="hero"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h2>Get where you need to go</h2>
          <p>Safe, reliable, and efficient ride-sharing with real-time tracking</p>

          <div className="cta-buttons">
            {user ? (
              <Link to={user.role === 'admin' ? '/admin' : user.role === 'driver' ? '/driver' : '/passenger'} className="btn btn-primary">
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link to="/register?role=passenger" className="btn btn-primary">
                  Book a Ride
                </Link>
                <Link to="/register?role=driver" className="btn btn-secondary">
                  Become a Driver
                </Link>
              </>
            )}
          </div>
        </motion.section>

        <section className="features">
          <h3>How It Works</h3>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📍</div>
              <h4>Set Destination</h4>
              <p>Enter pickup and drop-off locations</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">👆</div>
              <h4>Choose Mode</h4>
              <p>Quick, Swipe, or Smart matching</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">🚖</div>
              <h4>Match & Ride</h4>
              <p>Connect with verified drivers instantly</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📱</div>
              <h4>Track & Pay</h4>
              <p>Live tracking and secure payment</p>
            </div>
          </div>
        </section>

        <section className="match-modes">
          <h3>Ride Matching Modes</h3>
          <div className="modes-grid">
            <div className="mode-card">
              <h4>⚡ Quick Match</h4>
              <p>Instantly connect with the nearest available driver</p>
            </div>

            <div className="mode-card">
              <h4>👆 Swipe Match</h4>
              <p>Swipe through driver profiles to choose your ride</p>
            </div>

            <div className="mode-card">
              <h4>🤖 Smart Match</h4>
              <p>AI-powered matching based on multiple factors</p>
            </div>
          </div>
        </section>

        {!user && (
          <section className="auth-section">
            <div className="auth-card">
              <h3>Ready to Ride?</h3>
              <div className="auth-buttons">
                <Link to="/login" className="btn btn-outline">
                  Sign In
                </Link>
                <Link to="/register" className="btn btn-primary">
                  Create Account
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="landing-footer">

      </footer>
    </div>
  );
};

export default LandingPage;