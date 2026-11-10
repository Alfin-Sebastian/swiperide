import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userService, rideService } from '../../services/api';
import { motion } from 'framer-motion';

const DriverProfile = () => {
  const { user, updateProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [showQR, setShowQR] = useState(false);
  const [qrImage, setQrImage] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  // UPDATED: added "type" inside vehicleDetails
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    avatar: '',
    upiId: '', // NEW FIELD
    vehicleDetails: {
      make: '',
      model: '',
      year: '',
      color: '',
      plateNo: '',
      type: 'Sedan'
    },
    emergencyContacts: []
  });

  const [newEmergencyContact, setNewEmergencyContact] = useState({
    name: '',
    phone: '',
    relationship: '',
    systemUserId: ''
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [rides, setRides] = useState([]);
  const [stats, setStats] = useState({
    completionRate: 100,
    earnings: 0
  });

  const fetchProfile = async () => {
    try {
      const response = await userService.getProfile();
      setProfile(response.data);

      // Fetch ride history for stats
      const historyRes = await rideService.getRideHistory();
      const allRides = historyRes.data || [];
      setRides(allRides);

      const completed = allRides.filter(r => r.status === "completed");
      const cancelledByDriver = allRides.filter(r => r.status === "cancelled" && r.cancelReason === "driver");
      const totalAttempted = completed.length + cancelledByDriver.length;
      const completionRate = totalAttempted > 0 ? (completed.length / totalAttempted) * 100 : 100;
      const totalEarnings = completed.reduce((sum, r) => sum + (r.fare || 0) + (r.tipAmount || 0), 0);

      setStats({
        completionRate: Math.round(completionRate),
        earnings: totalEarnings
      });

      // Ensure vehicleDetails.type exists in formData
      setFormData({
        name: response.data.name,
        phone: response.data.phone,
        avatar: response.data.avatar || '',
        upiId: response.data.upiId || '',
        vehicleDetails: response.data.vehicleDetails || {
          make: '',
          model: '',
          year: '',
          color: '',
          plateNo: '',
          type: 'Sedan'
        },
        emergencyContacts: response.data.emergencyContacts || []
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching profile:', error);
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
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

  const handleAddEmergencyContact = () => {
    if (!newEmergencyContact.name || !newEmergencyContact.phone) {
      alert('Please fill in name and phone number');
      return;
    }

    setFormData({
      ...formData,
      emergencyContacts: [...formData.emergencyContacts, newEmergencyContact]
    });

    setNewEmergencyContact({ name: '', phone: '', relationship: '', systemUserId: '' });
  };

  const handleRemoveEmergencyContact = (index) => {
    const updatedContacts = [...formData.emergencyContacts];
    updatedContacts.splice(index, 1);
    setFormData({ ...formData, emergencyContacts: updatedContacts });
  };

  const handleSaveProfile = async () => {
    try {
      const result = await updateProfile(formData);
      if (result.success) {
        setEditing(false);
        fetchProfile();
        alert('Profile updated successfully!');
      } else {
        alert(result.message || 'Update failed');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Max 5MB.');
      return;
    }

    const data = new FormData();
    data.append('avatar', file);

    try {
      setLoading(true);
      const res = await userService.uploadAvatar(data);
      if (res.data?.avatar) {
        setFormData(prev => ({ ...prev, avatar: res.data.avatar }));
        setProfile(prev => ({ ...prev, avatar: res.data.avatar }));
        alert('Avatar updated!');
      }
      setLoading(false);
    } catch (err) {
      console.error('Avatar upload failed', err);
      alert('Failed to upload avatar.');
      setLoading(false);
    }
  };

  const handleShowQR = async () => {
    if (qrImage) {
      setShowQR(true);
      return;
    }
    try {
      setQrLoading(true);
      const res = await userService.getUserQR(user._id);
      setQrImage(res.data.qrImage);
      setShowQR(true);
    } catch (err) {
      console.error('Failed to fetch QR:', err);
      alert('Failed to generate QR code');
    } finally {
      setQrLoading(false);
    }
  };

  const renderVerificationStatus = () => {
    if (!profile) return null;

    const status = profile.verificationStatus;
    const statusConfig = {
      none: { color: '#64748b', icon: '📄', text: 'Not Started' },
      pending: { color: '#f59e0b', icon: '⏳', text: 'Pending Verification' },
      approved: { color: '#10b981', icon: '✅', text: 'Verified Driver' },
      rejected: { color: '#ef4444', icon: '❌', text: 'Verification Rejected' }
    };

    const config = statusConfig[status] || statusConfig.pending;

    return (
      <div className="verification-badge" style={{ backgroundColor: config.color + '20' }}>
        <span className="badge-icon">{config.icon}</span>
        <span className="badge-text" style={{ color: config.color }}>
          {config.text}
        </span>
        {profile.verificationNotes && (
          <small className="badge-notes">{profile.verificationNotes}</small>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="driver-profile">
      <div className="container">
        <header className="page-header">
          <h1>Driver Profile</h1>
          <p>Manage your driver account and vehicle information</p>
        </header>

        {/* Profile Header */}
        <motion.div
          className="profile-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="profile-avatar-section">
            <div className="avatar-container">
              {profile.avatar ? (
                <img src={profile.avatar} alt={profile.name} className="profile-avatar" />
              ) : (
                <div className="avatar-placeholder large">
                  {profile.name?.charAt(0)}
                </div>
              )}

              {editing && (
                <div className="avatar-upload" style={{ marginTop: 10 }}>
                  <label htmlFor="driver-avatar-upload" className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    📷 Upload Photo
                  </label>
                  <input
                    id="driver-avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
            </div>

            <div className="profile-info">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {profile.name}
                {profile.verificationStatus === 'approved' && (
                  <span title="Verified Driver" style={{ color: '#3b82f6', fontSize: '1.2rem', cursor: 'help' }}>💎</span>
                )}
              </h2>
              <div className="profile-meta">
                <span className="meta-item">🚖 Driver</span>
                <span className="meta-item">
                  Member since {new Date(profile.createdAt).toLocaleDateString()}
                </span>
                <span className="meta-item">
                  ⭐ Rating: {profile.rating || 'New'}
                </span>
              </div>
              {renderVerificationStatus()}

              <div className="referral-id-section" style={{ marginTop: 20, padding: '15px 20px', background: '#f0f9ff', borderRadius: 12, border: '1px solid #bae6fd', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, width: 'fit-content' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0369a1', textTransform: 'uppercase' }}>User ID:</span>
                  <code style={{ fontSize: 14, color: '#0c4a6e', fontWeight: 700 }}>{profile._id}</code>
                </div>
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      navigator.clipboard.writeText(profile._id);
                      alert('Referral ID copied to clipboard!');
                    }}
                    style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
                  >
                    Copy ID
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleShowQR}
                    style={{ flex: 1, padding: '8px 12px', fontSize: 13, background: '#0369a1', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                  >
                    <span>🔳</span> My QR
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="profile-actions">
            <button
              onClick={() => setEditing(!editing)}
              className="btn btn-primary"
            >
              {editing ? 'Cancel Editing' : 'Edit Profile'}
            </button>

            {editing && (
              <button
                onClick={handleSaveProfile}
                className="btn btn-success"
              >
                Save Changes
              </button>
            )}
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="profile-tabs">
          <button
            className={`tab-btn ${activeTab === 'personal' ? 'active' : ''}`}
            onClick={() => setActiveTab('personal')}
          >
            Personal Info
          </button>
          <button
            className={`tab-btn ${activeTab === 'vehicle' ? 'active' : ''}`}
            onClick={() => setActiveTab('vehicle')}
          >
            Vehicle Details
          </button>
          <button
            className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            Documents
          </button>
          <button
            className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            Statistics
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">

          {/* PERSONAL TAB */}
          {activeTab === 'personal' && (
            <motion.div
              className="tab-pane"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="card">
                <h3>Personal Information</h3>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      disabled={!editing}
                      placeholder="Enter your full name"
                    />
                  </div>

                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={profile.email}
                      disabled
                      className="disabled-input"
                    />
                    <small>Email cannot be changed</small>
                  </div>

                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      disabled={!editing}
                      placeholder="Enter your phone number"
                    />
                  </div>

                  <div className="form-group">
                    <label>UPI ID (for payments)</label>
                    <input
                      type="text"
                      name="upiId"
                      value={formData.upiId}
                      onChange={handleInputChange}
                      disabled={!editing}
                      placeholder="e.g., driver@okaxis"
                    />
                    <small>Used for generating dynamic payment QR codes</small>
                  </div>

                  <div className="form-group">
                    <label>License Number</label>
                    <input
                      type="text"
                      value={profile.licenseNo || 'Not provided'}
                      disabled
                      className="disabled-input"
                    />
                    <small>Contact support to change license number</small>
                  </div>
                </div>

                <div className="emergency-info">
                  <h4>Emergency Contacts</h4>
                  {formData.emergencyContacts?.length > 0 ? (
                    <div className="contacts-list" style={{ marginBottom: 20 }}>
                      {formData.emergencyContacts.map((contact, index) => (
                        <div key={index} className="contact-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #eee' }}>
                          <div className="contact-info">
                            <div className="contact-name" style={{ fontWeight: 'bold' }}>{contact.name}</div>
                            <div className="contact-phone" style={{ fontSize: '0.9rem', color: '#666' }}>{contact.phone}</div>
                            <div className="contact-relationship" style={{ fontSize: '0.8rem', color: '#888' }}>
                              {contact.relationship} {contact.systemUserId && `(Linked: ${contact.systemUserId})`}
                            </div>
                          </div>
                          {editing && (
                            <button
                              onClick={() => handleRemoveEmergencyContact(index)}
                              className="btn btn-sm btn-danger"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-contacts" style={{ textAlign: 'center', padding: '20px', background: '#f9fafb', borderRadius: 8, marginBottom: 20 }}>
                      <p>No emergency contacts added</p>
                    </div>
                  )}

                  {editing && (
                    <div className="add-contact-form" style={{ background: '#f8fafc', padding: 15, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <h5 style={{ marginBottom: 15 }}>Add Emergency Contact</h5>
                      <div className="form-grid" style={{ marginBottom: 15 }}>
                        <div className="form-group">
                          <label>Name</label>
                          <input
                            type="text"
                            value={newEmergencyContact.name}
                            onChange={(e) => setNewEmergencyContact({ ...newEmergencyContact, name: e.target.value })}
                            placeholder="Full Name"
                          />
                        </div>
                        <div className="form-group">
                          <label>Phone</label>
                          <input
                            type="tel"
                            value={newEmergencyContact.phone}
                            onChange={(e) => setNewEmergencyContact({ ...newEmergencyContact, phone: e.target.value })}
                            placeholder="Phone Number"
                          />
                        </div>
                        <div className="form-group">
                          <label>Relationship</label>
                          <input
                            type="text"
                            value={newEmergencyContact.relationship}
                            onChange={(e) => setNewEmergencyContact({ ...newEmergencyContact, relationship: e.target.value })}
                            placeholder="e.g. Sister, Friend"
                          />
                        </div>
                        <div className="form-group">
                          <label>System User ID (Optional)</label>
                          <input
                            type="text"
                            value={newEmergencyContact.systemUserId}
                            onChange={(e) => setNewEmergencyContact({ ...newEmergencyContact, systemUserId: e.target.value })}
                            placeholder="Friend's Unique ID"
                          />
                        </div>
                      </div>
                      <button
                        className="btn btn-secondary btn-block"
                        onClick={handleAddEmergencyContact}
                        disabled={!newEmergencyContact.name || !newEmergencyContact.phone}
                      >
                        Add Contact
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* VEHICLE TAB */}
          {activeTab === 'vehicle' && (
            <motion.div
              className="tab-pane"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="card">
                <h3>Vehicle Information</h3>

                <div className="vehicle-display">
                  <div className="vehicle-image-section">
                    {profile.vehiclePhoto ? (
                      <img
                        src={profile.vehiclePhoto}
                        alt="Vehicle"
                        className="vehicle-image"
                      />
                    ) : (
                      <div className="vehicle-placeholder large">
                        <span className="placeholder-icon">🚗</span>
                        <p>No vehicle photo uploaded</p>
                      </div>
                    )}

                    {editing && (
                      <div className="vehicle-upload">
                        <input
                          type="text"
                          value={formData.vehiclePhoto || ''}
                          onChange={(e) =>
                            setFormData({ ...formData, vehiclePhoto: e.target.value })
                          }
                          placeholder="Vehicle photo URL"
                          className="vehicle-input"
                        />
                        <small>Enter image URL for vehicle photo</small>
                      </div>
                    )}
                  </div>

                  <div className="vehicle-details-section">
                    <div className="form-grid">

                      <div className="form-group">
                        <label>Vehicle Company</label>
                        <input
                          type="text"
                          name="vehicle.make"
                          value={formData.vehicleDetails.make}
                          onChange={handleInputChange}
                          disabled={!editing}
                          placeholder="e.g., Toyota, Maruti"
                        />
                      </div>

                      <div className="form-group">
                        <label>Vehicle Model</label>
                        <input
                          type="text"
                          name="vehicle.model"
                          value={formData.vehicleDetails.model}
                          onChange={handleInputChange}
                          disabled={!editing}
                          placeholder="e.g., Camry"
                        />
                      </div>

                      <div className="form-group">
                        <label>Year</label>
                        <input
                          type="number"
                          name="vehicle.year"
                          value={formData.vehicleDetails.year}
                          onChange={handleInputChange}
                          disabled={!editing}
                          placeholder="e.g., 2020"
                          min="2000"
                          max={new Date().getFullYear()}
                        />
                      </div>

                      <div className="form-group">
                        <label>Color</label>
                        <input
                          type="text"
                          name="vehicle.color"
                          value={formData.vehicleDetails.color}
                          onChange={handleInputChange}
                          disabled={!editing}
                          placeholder="e.g., Red"
                        />
                      </div>

                      <div className="form-group">
                        <label>License Plate</label>
                        <input
                          type="text"
                          name="vehicle.plateNo"
                          value={formData.vehicleDetails.plateNo}
                          onChange={handleInputChange}
                          disabled={!editing}
                          placeholder="e.g., ABC123"
                        />
                      </div>

                      {/* NEW VEHICLE TYPE FIELD */}
                      <div className="form-group">
                        <label>Vehicle Type</label>
                        <select
                          name="vehicle.type"
                          value={formData.vehicleDetails.type}
                          onChange={handleInputChange}
                          disabled={!editing}
                        >
                          <option value="Sedan">Sedan</option>
                          <option value="SUV">SUV</option>
                          <option value="Hatchback">Hatchback</option>
                          <option value="Van">Van</option>
                          <option value="Luxury">Luxury</option>
                        </select>
                      </div>

                    </div>

                    {/* SHOW TYPE IN DISPLAY MODE */}
                    {!editing && (
                      <p className="vehicle-type-display"><strong>Type:</strong> {profile.vehicleDetails?.type || 'Not set'}</p>
                    )}

                  </div>
                </div>

                <div className="vehicle-notes">
                  <h4>⚠️ Important Notes</h4>
                  <ul>
                    <li>Vehicle information must match your registration documents</li>
                    <li>Keep your vehicle clean and well-maintained</li>
                    <li>Ensure all vehicle documents are up to date</li>
                    <li>Commercial insurance is required for ride-sharing</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          )}

          {/* DOCUMENTS TAB */}
          {activeTab === 'documents' && (
            <motion.div
              className="tab-pane"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="card">
                <h3>Document Verification</h3>

                <div className="documents-grid">
                  <div className="document-item">
                    <div className="document-header">
                      <div className="document-icon">📄</div>
                      <div className="document-info">
                        <h4>Driver's License</h4>
                        <p>Required for verification</p>
                      </div>
                    </div>

                    <div className="document-status">
                      {profile.licenseImage ? (
                        <div className="status-uploaded">
                          <span className="status-icon">✅</span>
                          <span className="status-text">Uploaded</span>
                        </div>
                      ) : (
                        <div className="status-missing">
                          <span className="status-icon">❌</span>
                          <span className="status-text">Missing</span>
                        </div>
                      )}
                    </div>

                    {profile.licenseImage && (
                      <div className="document-actions">
                        <button className="btn btn-sm btn-outline" onClick={() => window.open(profile.licenseImage.startsWith('http') ? profile.licenseImage : `http://localhost:5000${profile.licenseImage}`, '_blank')}>
                          View
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="document-item">
                    <div className="document-header">
                      <div className="document-icon">🪪</div>
                      <div className="document-info">
                        <h4>ID Proof</h4>
                        <p>Passport or National ID</p>
                      </div>
                    </div>

                    <div className="document-status">
                      {profile.idProofImage ? (
                        <div className="status-uploaded">
                          <span className="status-icon">✅</span>
                          <span className="status-text">Uploaded</span>
                        </div>
                      ) : (
                        <div className="status-missing">
                          <span className="status-icon">❌</span>
                          <span className="status-text">Missing</span>
                        </div>
                      )}
                    </div>

                    {profile.idProofImage && (
                      <div className="document-actions">
                        <button className="btn btn-sm btn-outline" onClick={() => window.open(profile.idProofImage.startsWith('http') ? profile.idProofImage : `http://localhost:5000${profile.idProofImage}`, '_blank')}>
                          View
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="document-item">
                    <div className="document-header">
                      <div className="document-icon">🚗</div>
                      <div className="document-info">
                        <h4>Vehicle Registration</h4>
                        <p>Current registration document</p>
                      </div>
                    </div>

                    <div className="document-status">
                      {profile.registrationDocument ? (
                        <div className="status-uploaded">
                          <span className="status-icon">✅</span>
                          <span className="status-text">Uploaded</span>
                        </div>
                      ) : (
                        <div className="status-pending">
                          <span className="status-icon">⏳</span>
                          <span className="status-text">Not Required</span>
                        </div>
                      )}
                    </div>

                    {profile.registrationDocument && (
                      <div className="document-actions">
                        <button className="btn btn-sm btn-outline" onClick={() => window.open(profile.registrationDocument.startsWith('http') ? profile.registrationDocument : `http://localhost:5000${profile.registrationDocument}`, '_blank')}>
                          View
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="document-item">
                    <div className="document-header">
                      <div className="document-icon">📋</div>
                      <div className="document-info">
                        <h4>Insurance Certificate</h4>
                        <p>Commercial ride-sharing insurance</p>
                      </div>
                    </div>

                    <div className="document-status">
                      {profile.insuranceDocument ? (
                        <div className="status-uploaded">
                          <span className="status-icon">✅</span>
                          <span className="status-text">Uploaded</span>
                        </div>
                      ) : (
                        <div className="status-pending">
                          <span className="status-icon">⏳</span>
                          <span className="status-text">Not Required</span>
                        </div>
                      )}
                    </div>

                    {profile.insuranceDocument && (
                      <div className="document-actions">
                        <button className="btn btn-sm btn-outline" onClick={() => window.open(profile.insuranceDocument.startsWith('http') ? profile.insuranceDocument : `http://localhost:5000${profile.insuranceDocument}`, '_blank')}>
                          View
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="verification-process">
                  <h4>Verification Status</h4>
                  <div className="process-steps">
                    <div className={`process-step ${profile.licenseImage && profile.idProofImage ? 'completed' : ''}`}>
                      <div className="step-number">1</div>
                      <div className="step-content">
                        <h5>Document Upload</h5>
                        <p>Upload required documents</p>
                      </div>
                    </div>

                    <div className="process-connector"></div>

                    <div className={`process-step ${profile.verificationStatus !== 'pending' ? 'completed' : ''}`}>
                      <div className="step-number">2</div>
                      <div className="step-content">
                        <h5>Admin Review</h5>
                        <p>Documents under review</p>
                      </div>
                    </div>

                    <div className="process-connector"></div>

                    <div className={`process-step ${profile.verificationStatus === 'approved' ? 'completed' : ''}`}>
                      <div className="step-number">3</div>
                      <div className="step-content">
                        <h5>Approval</h5>
                        <p>Start driving</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STATS TAB */}
          {activeTab === 'stats' && (
            <motion.div
              className="tab-pane"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="card">
                <h3>Driver Statistics</h3>

                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon">🚖</div>
                    <div className="stat-content">
                      <div className="stat-value">{profile.totalRides || 0}</div>
                      <div className="stat-label">Total Rides</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">⭐</div>
                    <div className="stat-content">
                      <div className="stat-value">{profile.rating || 'N/A'}</div>
                      <div className="stat-label">Average Rating</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">✅</div>
                    <div className="stat-content">
                      <div className="stat-value">{stats.completionRate}%</div>
                      <div className="stat-label">Completion Rate</div>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon">💰</div>
                    <div className="stat-content">
                      <div className="stat-value">₹{stats.earnings.toFixed(2)}</div>
                      <div className="stat-label">Total Earnings</div>
                    </div>
                  </div>
                </div>

                <div className="recent-activity">
                  <h4>Recent Activity</h4>
                  <div className="activity-list">
                    {rides.slice(0, 5).map(ride => (
                      <div key={ride._id} className="activity-item">
                        <div className="activity-icon">
                          {ride.status === 'completed' ? '✅' :
                            ride.status === 'cancelled' ? '❌' : '⏳'}
                        </div>
                        <div className="activity-content">
                          <div className="activity-text">
                            {ride.status === 'completed' ? `Completed ride with ${ride.passenger?.name || 'Passenger'}` :
                              ride.status === 'cancelled' ? `Ride with ${ride.passenger?.name || 'Passenger'} was cancelled` :
                                `Active ride with ${ride.passenger?.name || 'Passenger'}`}
                          </div>
                          <div className="activity-time">
                            {new Date(ride.requestedAt).toLocaleDateString()} {new Date(ride.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))}
                    {rides.length === 0 && <p className="text-muted">No recent activity</p>}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </div>
      </div>

      {showQR && (
        <div className="modal-overlay" onClick={() => setShowQR(false)} style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)' }}>
          <motion.div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{ textAlign: 'center', maxWidth: '350px', background: '#fff', padding: '30px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <h3 style={{ marginBottom: '10px', color: '#1e293b' }}>Scan my QR</h3>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>Others can scan this to start a chat with you</p>

            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', width: '220px', height: '220px', border: '1px solid #e2e8f0' }}>
              {qrLoading ? (
                <div className="loading-spinner"></div>
              ) : (
                <img src={qrImage} alt="My QR Code" style={{ width: '100%', height: '100%', borderRadius: '10px' }} />
              )}
            </div>

            <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', marginBottom: '20px' }}>
              ID: {user?._id}
            </div>

            <button className="btn btn-primary w-100" onClick={() => setShowQR(false)}>
              Close
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default DriverProfile;
