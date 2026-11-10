import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminService } from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const AdminVerifications = () => {
  useAuth();
  const [drivers, setDrivers] = useState([]);
  const [filteredDrivers, setFilteredDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const normalizeDriver = (driver) => {
    // Ensure vehiclePhoto shows backend upload
    if (driver.vehicleImage && !driver.vehiclePhoto) driver.vehiclePhoto = driver.vehicleImage;
    // Map backend field names if they differ from what the UI expects
    if (driver.insuranceDocument && !driver.insuranceImage) driver.insuranceImage = driver.insuranceDocument;
    if (driver.registrationDocument && !driver.registrationImage) driver.registrationImage = driver.registrationDocument;
    return driver;
  };

  const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `http://localhost:5000${path}`;
  };

  const fetchVerifications = useCallback(async () => {
    try {
      const response = await adminService.getVerifications(statusFilter);

      const normalized = response.data.map(d => normalizeDriver(d));
      setDrivers(normalized);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching verifications:', error);
      setLoading(false);
    }
  }, [statusFilter]);

  const filterDrivers = useCallback(() => {
    let filtered = [...drivers];

    if (searchTerm) {
      filtered = filtered.filter(driver =>
        driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        driver.licenseNo?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(driver => driver.verificationStatus === statusFilter);
    }

    setFilteredDrivers(filtered);
  }, [drivers, searchTerm, statusFilter]);

  useEffect(() => {
    fetchVerifications();
  }, [fetchVerifications]);

  useEffect(() => {
    filterDrivers();
  }, [filterDrivers]);

  const handleViewDriver = (driver) => {
    const normalized = normalizeDriver(driver);
    setSelectedDriver(normalized);
    setVerificationNotes(normalized.verificationNotes || '');
  };

  const handleUpdateVerification = async (status) => {
    if (!selectedDriver) return;

    setIsUpdating(true);
    try {
      await adminService.updateVerification(selectedDriver._id, {
        status,
        notes: verificationNotes
      });

      // Refresh the list from server to ensure correct state
      fetchVerifications();
      setSelectedDriver(null);
      setVerificationNotes('');

      alert(`Driver verification ${status} successfully!`);
    } catch (error) {
      console.error('Error updating verification:', error);
      alert('Failed to update verification');
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'approved': return 'success';
      case 'rejected': return 'danger';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'approved': return '✅';
      case 'rejected': return '❌';
      default: return '📋';
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading driver verifications...</p>
      </div>
    );
  }

  return (
    <div className="admin-verifications">
      <div className="container">
        <header className="page-header">
          <div className="header-content">
            <div>
              <h1>Driver Verifications</h1>
              <p>Review and manage driver verification requests</p>
            </div>
            <div className="header-stats">
              <span className="stat-badge pending">
                {drivers.filter(d => d.verificationStatus === 'pending').length} Pending
              </span>
              <span className="stat-badge total">
                {drivers.length} Total
              </span>
            </div>
          </div>
        </header>

        {/* Filters */}
        <div className="filters-section">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search drivers by name, email, or license..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button className="search-btn">🔍</button>
          </div>

          <div className="filter-buttons">
            <button className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
              All Drivers
            </button>
            <button className={`filter-btn ${statusFilter === 'pending' ? 'active' : ''}`} onClick={() => setStatusFilter('pending')}>
              Pending Review
            </button>
            <button className={`filter-btn ${statusFilter === 'approved' ? 'active' : ''}`} onClick={() => setStatusFilter('approved')}>
              Approved
            </button>
            <button className={`filter-btn ${statusFilter === 'rejected' ? 'active' : ''}`} onClick={() => setStatusFilter('rejected')}>
              Rejected
            </button>
          </div>
        </div>

        {/* Driver Cards */}
        <div className="drivers-list-section">
          {filteredDrivers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">👤</div>
              <h3>No drivers found</h3>
              <p>{searchTerm || statusFilter !== 'all' ? 'Try adjusting your search.' : 'No pending verifications.'}</p>
            </div>
          ) : (
            <div className="drivers-grid">
              {filteredDrivers.map((driver, index) => (
                <motion.div
                  key={driver._id}
                  className="driver-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleViewDriver(driver)}
                >
                  <div className="driver-card-header">
                    <div className="driver-avatar">
                      {driver.avatar ? (
                        <img src={getImageUrl(driver.avatar)} alt={driver.name} />
                      ) : (
                        <span className="avatar-placeholder">{driver.name.charAt(0)}</span>
                      )}
                    </div>

                    <div className="driver-info">
                      <h4>{driver.name}</h4>
                      <p className="driver-email">{driver.email}</p>
                      <p className="driver-phone">{driver.phone}</p>
                    </div>

                    <div className={`status-badge ${getStatusColor(driver.verificationStatus)}`}>
                      <span className="status-icon">{getStatusIcon(driver.verificationStatus)}</span>
                      <span className="status-text">{driver.verificationStatus}</span>
                    </div>
                  </div>

                  <div className="driver-card-body">
                    <div className="driver-details">
                      <div className="detail-item">
                        <span className="detail-label">License:</span>
                        <span className="detail-value">{driver.licenseNo || 'Not provided'}</span>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label">Vehicle:</span>
                        <span className="detail-value">
                          {driver.vehicleDetails?.make || ''} {driver.vehicleDetails?.model || ''}
                        </span>
                      </div>
                    </div>

                    <div className="document-item">
                      <span className="document-icon" title="License Photo">📄</span>
                      <span className="document-text">
                        {driver.licenseImage ? '✅' : '❌'}
                      </span>
                    </div>
                    <div className="document-item">
                      <span className="document-icon" title="ID Proof">🪪</span>
                      <span className="document-text">
                        {driver.idProofImage ? '✅' : '❌'}
                      </span>
                    </div>
                    <div className="document-item">
                      <span className="document-icon" title="Vehicle Photo">🚗</span>
                      <span className="document-text">
                        {driver.vehiclePhoto ? '✅' : '❌'}
                      </span>
                    </div>
                    <div className="document-item">
                      <span className="document-icon" title="Insurance">🛡️</span>
                      <span className="document-text">
                        {driver.insuranceDocument ? '✅' : '❌'}
                      </span>
                    </div>
                    <div className="document-item">
                      <span className="document-icon" title="Registration">📋</span>
                      <span className="document-text">
                        {driver.registrationDocument ? '✅' : '❌'}
                      </span>
                    </div>
                  </div>

                  <div className="driver-card-footer">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDriver(driver);
                      }}
                    >
                      Review Details
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* MODAL */}
        <AnimatePresence>
          {selectedDriver && (
            <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedDriver(null)}>
              <motion.div
                className="modal-content large"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2>Review Driver Verification</h2>
                  <button className="close-btn" onClick={() => setSelectedDriver(null)}>✕</button>
                </div>

                <div className="modal-body">
                  {/* Driver Info */}
                  <div className="section">
                    <h3>Driver Information</h3>
                    <div className="info-grid">
                      <div className="info-item"><label>Name</label><div>{selectedDriver.name}</div></div>
                      <div className="info-item"><label>Email</label><div>{selectedDriver.email}</div></div>
                      <div className="info-item"><label>Phone</label><div>{selectedDriver.phone}</div></div>
                      <div className="info-item"><label>License Number</label><div>{selectedDriver.licenseNo || 'Not provided'}</div></div>
                      <div className="info-item"><label>Verification Status</label><div><span className={`stat-badge ${getStatusColor(selectedDriver.verificationStatus)}`}>{selectedDriver.verificationStatus}</span></div></div>
                    </div>
                  </div>

                  {/* Expiry Dates */}
                  <div className="section">
                    <h3>Document Expiry Dates</h3>
                    <div className="info-grid">
                      <div className="info-item">
                        <label>License Expiry</label>
                        <div className="info-value">
                          {selectedDriver.licenseExpiryDate ? new Date(selectedDriver.licenseExpiryDate).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                      <div className="info-item">
                        <label>Insurance Expiry</label>
                        <div className="info-value">
                          {selectedDriver.insuranceExpiryDate ? new Date(selectedDriver.insuranceExpiryDate).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                      <div className="info-item">
                        <label>Registration Expiry</label>
                        <div className="info-value">
                          {selectedDriver.registrationExpiryDate ? new Date(selectedDriver.registrationExpiryDate).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Vehicle Section */}
                  <div className="section">
                    <h3>Vehicle Information</h3>
                    <div className="vehicle-info">
                      <div className="vehicle-image-preview">
                        {selectedDriver.vehiclePhoto ? (
                          <img src={getImageUrl(selectedDriver.vehiclePhoto)} alt="Vehicle" className="vehicle-image" />
                        ) : (
                          <div className="no-image">No vehicle photo</div>
                        )}
                      </div>

                      <div className="vehicle-details">
                        <div><strong>Company:</strong> {selectedDriver.vehicleDetails?.make || 'Not specified'}</div>
                        <div><strong>Model:</strong> {selectedDriver.vehicleDetails?.model || 'Not specified'}</div>
                        <div><strong>Year:</strong> {selectedDriver.vehicleDetails?.year || 'Not specified'}</div>
                        <div><strong>Color:</strong> {selectedDriver.vehicleDetails?.color || 'Not specified'}</div>
                        <div><strong>Plate No:</strong> {selectedDriver.vehicleDetails?.plateNo || 'Not specified'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Documents */}
                  <div className="section">
                    <h3>Uploaded Documents</h3>
                    <div className="documents-grid">
                      <div className="document-preview">
                        <h4>Driver License</h4>
                        {selectedDriver.licenseImage ? (
                          <img src={getImageUrl(selectedDriver.licenseImage)} alt="License" className="document-image" />
                        ) : <div className="no-document">No license uploaded</div>}
                      </div>

                      <div className="document-preview">
                        <h4>ID Proof</h4>
                        {selectedDriver.idProofImage ? (
                          <img src={getImageUrl(selectedDriver.idProofImage)} alt="ID Proof" className="document-image" />
                        ) : <div className="no-document">No ID uploaded</div>}
                      </div>

                      <div className="document-preview">
                        <h4>Vehicle Photo</h4>
                        {selectedDriver.vehiclePhoto ? (
                          <img src={getImageUrl(selectedDriver.vehiclePhoto)} alt="Vehicle" className="document-image" />
                        ) : <div className="no-document">No vehicle photo</div>}
                      </div>

                      <div className="document-preview">
                        <h4>Insurance Document</h4>
                        {selectedDriver.insuranceDocument ? (
                          <img src={getImageUrl(selectedDriver.insuranceDocument)} alt="Insurance" className="document-image" />
                        ) : <div className="no-document">No insurance uploaded</div>}
                      </div>

                      <div className="document-preview">
                        <h4>Registration Document</h4>
                        {selectedDriver.registrationDocument ? (
                          <img src={getImageUrl(selectedDriver.registrationDocument)} alt="Registration" className="document-image" />
                        ) : <div className="no-document">No registration uploaded</div>}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="section">
                    <h3>Verification Notes</h3>
                    <textarea
                      value={verificationNotes}
                      onChange={(e) => setVerificationNotes(e.target.value)}
                      className="notes-textarea"
                      rows={4}
                      placeholder="These notes will be shown to the driver if rejected."
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="btn btn-danger" disabled={isUpdating} onClick={() => handleUpdateVerification('rejected')}>
                    {isUpdating ? 'Processing...' : 'Reject'}
                  </button>
                  <button className="btn btn-success" disabled={isUpdating} onClick={() => handleUpdateVerification('approved')}>
                    {isUpdating ? 'Processing...' : 'Approve'}
                  </button>
                </div>

              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminVerifications;
