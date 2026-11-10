import React from 'react';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h4>SwipeRide</h4>
          <p>Modern ride-sharing with swipe matching technology</p>
        </div>
        
        <div className="footer-section">
          <h4>Quick Links</h4>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/safety">Safety</a></li>
            <li><a href="/help">Help Center</a></li>
          </ul>
        </div>
        
        <div className="footer-section">
          <h4>Contact</h4>
          <ul>
            <li>Email: support@swiperide.com</li>
            <li>Phone: 1-800-SWIPE-RIDE</li>
            <li>24/7 Support Available</li>
          </ul>
        </div>
      </div>
      
      <div className="footer-bottom">
        <p>&copy; 2024 SwipeRide. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;