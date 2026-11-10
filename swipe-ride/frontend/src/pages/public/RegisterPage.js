import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';

const RegisterPage = () => {
  const [searchParams] = useSearchParams();
  const defaultRole = searchParams.get('role') || 'passenger';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: defaultRole,
    // Driver specific
    licenseNo: '',
    vehicleDetails: {
      make: '',
      model: '',
      year: '',
      color: '',
      plateNo: ''
    }
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name.startsWith('vehicle.')) {
      const field = name.split('.')[1];
      setFormData({
        ...formData,
        vehicleDetails: {
          ...formData.vehicleDetails,
          [field]: value
        }
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  const handleRoleChange = (role) => {
    setFormData({
      ...formData,
      role
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    // Prepare data for API
    const userData = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      password: formData.password,
      role: formData.role
    };

    // Add driver-specific data
    if (formData.role === 'driver') {
      userData.licenseNo = formData.licenseNo;
      userData.vehicleDetails = formData.vehicleDetails;
    }
    const result = await register(userData);

    if (result.success) {
      // Redirect based on role
      if (result.user.role === 'admin') {
        navigate('/admin');
      } else if (result.user.role === 'driver') {
        navigate('/driver');
      } else {
        navigate('/passenger');
      }
    } else {
      setError(result.message);
    }

    setLoading(false);
  };

  return (
    <div className="register-page">
      <motion.div
        className="register-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="register-header">
          <h2>Create Account</h2>
          <p>Join SwipeRide as a passenger or driver</p>
        </div>

        <div className="role-selector">
          <button
            type="button"
            className={`role-btn ${formData.role === 'passenger' ? 'active' : ''}`}
            onClick={() => handleRoleChange('passenger')}
          >
            🧍 Passenger
          </button>
          <button
            type="button"
            className={`role-btn ${formData.role === 'driver' ? 'active' : ''}`}
            onClick={() => handleRoleChange('driver')}
          >
            🚖 Driver
          </button>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Enter your full name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="Enter your email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone Number</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              placeholder="Enter your phone number"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Create password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                placeholder="Confirm password"
              />
            </div>
          </div>

          {/* Driver-specific fields */}
          {formData.role === 'driver' && (
            <motion.div
              className="driver-fields"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.3 }}
            >
              <h4>Driver Information</h4>

              <div className="form-group">
                <label htmlFor="licenseNo">Driver's License Number</label>
                <input
                  type="text"
                  id="licenseNo"
                  name="licenseNo"
                  value={formData.licenseNo}
                  onChange={handleChange}
                  required
                  placeholder="Enter license number"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="vehicle.make">Vehicle Company</label>
                  <input
                    type="text"
                    id="vehicle.make"
                    name="vehicle.make"
                    value={formData.vehicleDetails.make}
                    onChange={handleChange}
                    required
                    placeholder="e.g., Toyota, Maruti"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="vehicle.model">Vehicle Model</label>
                  <input
                    type="text"
                    id="vehicle.model"
                    name="vehicle.model"
                    value={formData.vehicleDetails.model}
                    onChange={handleChange}
                    required
                    placeholder="e.g., Camry"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="vehicle.year">Year</label>
                  <input
                    type="number"
                    id="vehicle.year"
                    name="vehicle.year"
                    value={formData.vehicleDetails.year}
                    onChange={handleChange}
                    required
                    placeholder="e.g., 2020"
                    min="2000"
                    max="2024"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="vehicle.color">Color</label>
                  <input
                    type="text"
                    id="vehicle.color"
                    name="vehicle.color"
                    value={formData.vehicleDetails.color}
                    onChange={handleChange}
                    required
                    placeholder="e.g., Red"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="vehicle.plateNo">License Plate Number</label>
                <input
                  type="text"
                  id="vehicle.plateNo"
                  name="vehicle.plateNo"
                  value={formData.vehicleDetails.plateNo}
                  onChange={handleChange}
                  required
                  placeholder="Enter plate number"
                />
              </div>

              <div className="note">
                <p>⚠️ Your driver account will be pending verification. You'll need to upload documents after registration.</p>
              </div>
            </motion.div>
          )}


          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="register-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="link">
              Sign in here
            </Link>
          </p>
          <p>
            <Link to="/" className="link">
              ← Back to Home
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterPage;