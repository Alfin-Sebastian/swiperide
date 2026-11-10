import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/api';
import { motion } from 'framer-motion';

const PassengerProfile = () => {
  const { user, updateProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [showQR, setShowQR] = useState(false);
  const [qrImage, setQrImage] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    avatar: '',
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

  const fetchProfile = async () => {
    try {
      const response = await userService.getProfile();
      const favRes = await userService.getFavoriteDrivers();
      setProfile({ ...response.data, favoriteDrivers: favRes.data });
      setFormData({
        name: response.data.name,
        phone: response.data.phone,
        avatar: response.data.avatar || '',
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
    setFormData({ ...formData, [name]: value });
  };

  const handleSaveProfile = async () => {
    try {
      const result = await updateProfile(formData);
      if (result.success) {
        setEditing(false);
        fetchProfile();
        alert('Profile updated successfully!');
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
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
        // Also update local profile state to reflect change immediately in UI if needed
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

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="driver-profile"> {/* Reusing driver-profile class for layout */}
      <div className="container">
        <header className="page-header">
          <h1>My Profile</h1>
          <p>Manage your personal information and emergency contacts</p>
        </header>

        {/* Profile Header */}
        <motion.div
          className="profile-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="profile-avatar-section">
            <div className="avatar-container">
              {formData.avatar ? (
                <img src={formData.avatar} alt={formData.name} className="profile-avatar" />
              ) : (
                <div className="avatar-placeholder large">
                  {formData.name?.charAt(0) || 'U'}
                </div>
              )}

              {editing && (
                <div className="avatar-upload" style={{ marginTop: 10 }}>
                  <label htmlFor="avatar-upload-input" className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    📷 Upload Photo
                  </label>
                  <input
                    id="avatar-upload-input"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
            </div>

            <div className="profile-info">
              <h2>{formData.name}</h2>
              <div className="profile-meta">
                <span className="meta-item">👤 Passenger</span>
                <span className="meta-item">
                  Member since {new Date(user?.createdAt).toLocaleDateString()}
                </span>
                <span className="meta-item">
                  ⭐ Rating: {profile?.rating || 'N/A'}
                </span>
                <div className="meta-item" style={{ background: '#e0f2fe', color: '#0369a1', padding: '10px 15px', borderRadius: '12px', border: '1px solid #bae6fd', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '13px' }}>🆔 ID: {user?._id}</span>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={handleShowQR}
                      style={{ padding: '4px 12px', fontSize: '12px', background: '#0369a1', border: 'none', borderRadius: '8px' }}
                    >
                      🔳 MY QR
                    </button>
                  </div>
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

            <button
              onClick={handleShowQR}
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '10px' }}
            >
              <span>🔳</span> My QR Code
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
            className={`tab-btn ${activeTab === 'contacts' ? 'active' : ''}`}
            onClick={() => setActiveTab('contacts')}
          >
            Emergency Contacts
          </button>
          <button
            className={`tab-btn ${activeTab === 'favorites' ? 'active' : ''}`}
            onClick={() => setActiveTab('favorites')}
          >
            Favorite Drivers
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
                      value={user?.email}
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
                </div>
              </div>
            </motion.div>
          )}

          {/* EMERGENCY CONTACTS TAB */}
          {activeTab === 'contacts' && (
            <motion.div
              className="tab-pane"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="card">
                <div className="card-header" style={{ marginBottom: 15 }}>
                  <h3>Emergency Contacts</h3>
                  <div className="header-note">
                    ⚠️ These contacts will be notified in case of SOS
                  </div>
                </div>

                <div className="contacts-list">
                  {formData.emergencyContacts.length === 0 ? (
                    <div className="empty-contacts">
                      <div className="empty-icon">👤</div>
                      <p>No emergency contacts added</p>
                      <p className="small">Add contacts for SOS alerts</p>
                    </div>
                  ) : (
                    formData.emergencyContacts.map((contact, index) => (
                      <div key={index} className="contact-item">
                        <div className="contact-info">
                          <div className="contact-name">{contact.name}</div>
                          <div className="contact-phone">{contact.phone}</div>
                          {contact.relationship && (
                            <div className="contact-relationship">
                              {contact.relationship} {contact.systemUserId && `(Linked System User: ${contact.systemUserId})`}
                            </div>
                          )}
                        </div>
                        {editing && (
                          <button
                            onClick={() => handleRemoveEmergencyContact(index)}
                            className="btn btn-danger btn-sm"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {editing && (
                  <div className="add-contact-form" style={{ marginTop: 25, borderTop: '1px solid #eee', paddingTop: 20 }}>
                    <h4>Add New Emergency Contact</h4>

                    <div className="form-group">
                      <label>Name</label>
                      <input
                        type="text"
                        value={newEmergencyContact.name}
                        onChange={(e) => setNewEmergencyContact({
                          ...newEmergencyContact,
                          name: e.target.value
                        })}
                        placeholder="Contact name"
                      />
                    </div>

                    <div className="form-row" style={{ display: 'flex', gap: 15 }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Phone Number</label>
                        <input
                          type="tel"
                          value={newEmergencyContact.phone}
                          onChange={(e) => setNewEmergencyContact({
                            ...newEmergencyContact,
                            phone: e.target.value
                          })}
                          placeholder="Phone number"
                        />
                      </div>

                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Relationship</label>
                        <input
                          type="text"
                          value={newEmergencyContact.relationship}
                          onChange={(e) => setNewEmergencyContact({
                            ...newEmergencyContact,
                            relationship: e.target.value
                          })}
                          placeholder="e.g., Family, Friend"
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>System User ID (Optional)</label>
                      <input
                        type="text"
                        value={newEmergencyContact.systemUserId}
                        onChange={(e) => setNewEmergencyContact({
                          ...newEmergencyContact,
                          systemUserId: e.target.value
                        })}
                        placeholder="Friend's User ID for direct in-app SOS"
                      />
                      <small style={{ color: '#666' }}>If they use SwipeRide, enter their ID to send them in-app SOS alerts.</small>
                    </div>

                    <button
                      onClick={handleAddEmergencyContact}
                      className="btn btn-secondary btn-block"
                      style={{ marginTop: 10 }}
                      disabled={!newEmergencyContact.name || !newEmergencyContact.phone}
                    >
                      Add Contact
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* FAVORITE DRIVERS TAB */}
          {activeTab === 'favorites' && (
            <motion.div
              className="tab-pane"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="card">
                <h3>My Favorite Drivers</h3>
                <p className="small" style={{ marginBottom: '20px' }}>Quickly access and book your preferred drivers.</p>

                {profile?.favoriteDrivers?.length === 0 ? (
                  <div className="empty-state" style={{ padding: '40px 0' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>❤️</div>
                    <p>You haven't added any favorite drivers yet.</p>
                    <p className="small">Heart a driver from the home screen to see them here.</p>
                  </div>
                ) : (
                  <div className="favorites-list">
                    {profile?.favoriteDrivers?.map(driver => (
                      <div key={driver._id} className="fav-driver-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px', borderBottom: '1px solid #eee' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <div className="fav-avatar" style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {driver.avatar ? <img src={driver.avatar} alt={driver.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{driver.name?.charAt(0)}</span>}
                          </div>
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{driver.name}</div>
                            <div style={{ fontSize: '12px', color: '#666' }}>{driver.vehicleDetails?.make} {driver.vehicleDetails?.model} • ⭐ {driver.rating || 'N/A'}</div>
                          </div>
                        </div>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={async () => {
                            try {
                              await userService.removeFavoriteDriver(driver._id);
                              fetchProfile();
                            } catch (err) {
                              alert("Failed to remove favorite");
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

export default PassengerProfile;