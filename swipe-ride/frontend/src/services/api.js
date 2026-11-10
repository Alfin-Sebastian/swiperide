import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

/* --------------------------------------
   AUTH SERVICES
--------------------------------------- */
export const authService = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data)
};

/* --------------------------------------
   USER SERVICES
--------------------------------------- */
export const userService = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
  uploadAvatar: (formData) => api.post('/users/profile/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updateLocation: (lat, lng) => api.post('/users/location', { lat, lng }),
  getAvailableDrivers: () => api.get('/users/drivers/available'),
  updateAvailability: (availability) =>
    api.post('/users/availability', { availability }),

  // ✅ Upload verification documents
  uploadVerificationDocs: (formData, onUploadProgress) =>
    api.post('/users/upload-docs', formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress
    }),

  // ✅ Remove a document (license / idProof / vehicle)
  removeDoc: (data) => api.post('/users/remove-doc', data),

  // ✅ Submit verification (lock editing)
  submitVerification: () => api.post('/users/submit-verification'),

  // ✅ Upload insurance document
  uploadInsurance: (formData) => api.post('/users/profile/insurance', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),

  // ✅ Upload registration document
  uploadRegistration: (formData) => api.post('/users/profile/registration', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),

  // ✅ Update expiry dates
  updateExpiryDates: (data) => api.post('/users/profile/expiry-dates', data),

  // ✅ Search (General or Driver)
  search: (query) => api.get(`/users/search?query=${query}`),
  searchDriver: (query) => api.get(`/users/search-driver?query=${query}`),

  getFavorites: () => api.get('/users/favorites'),
  addFavorite: (data) => api.post('/users/favorites', data),
  removeFavorite: (id) => api.delete(`/users/favorites/${id}`),
  addRecent: (data) => api.post('/users/recents', data),

  // ✅ Favorite Drivers
  addFavoriteDriver: (driverId) => api.post(`/users/favorite-drivers/${driverId}`),
  removeFavoriteDriver: (driverId) => api.delete(`/users/favorite-drivers/${driverId}`),
  getFavoriteDrivers: () => api.get('/users/favorite-drivers'),
  getUserQR: (userId) => api.get(`/users/${userId}/qr`)
};


/* --------------------------------------
   RIDE SERVICES
--------------------------------------- */
export const rideService = {
  requestRide: (data) => api.post('/rides/request', data),
  getAvailableRides: () => api.get('/rides/available'),
  getAvailableScheduledRides: () => api.get('/rides/available-scheduled'),
  acceptRide: (rideId) => api.post(`/rides/${rideId}/accept`),
  updateRideStatus: (rideId, status, currentLocation, otp) =>
    api.post(`/rides/${rideId}/status`, { status, currentLocation, otp }),
  getRide: (rideId) => api.get(`/rides/${rideId}`),
  getRideHistory: () => api.get('/rides/history/user'),

  /* ⭐ ADD THIS — RATE RIDE */
  rateRide: (rideId, data) => api.post(`/rides/${rideId}/rate`, data),

  /* ⭐ CANCEL RIDE */
  cancelRide: (rideId, reason) => api.post(`/rides/${rideId}/cancel`, { reason }),

  /* ⭐ REJECT RIDE (DRIVER) */
  rejectRide: (rideId) => api.post(`/rides/${rideId}/reject`),

  sendMessage: (rideId, text) => api.post(`/messages/${rideId}`, { text }),
  getMessages: (rideId) => api.get(`/messages/${rideId}`),
  getPaymentQR: (rideId, tip = 0, method = 'upi') => api.get(`/rides/${rideId}/payment-qr?tip=${tip}&method=${method}`),
  payConfirm: (rideId) => api.post(`/rides/${rideId}/pay-confirm`),
  confirmPayment: (rideId) => api.post(`/rides/${rideId}/payment-confirm`)
};

/* --------------------------------------
   ADMIN SERVICES
--------------------------------------- */
export const adminService = {
  getDashboard: () => api.get('/admin/dashboard'),
  getVerifications: (status = 'all') => api.get(`/admin/verifications?status=${status}`),
  updateVerification: (driverId, data) =>
    api.post(`/admin/verifications/${driverId}/update`, data),
  getAllUsers: () => api.get('/admin/users'),
  updateUserStatus: (userId, isActive) =>
    api.post(`/admin/users/${userId}/status`, { isActive }),
  getActiveRides: () => api.get('/admin/rides/active'),
  getAllRides: (params) => api.get('/admin/rides', { params }),
  getAnalytics: () => api.get('/admin/analytics'),
  getDemandCoords: () => api.get('/admin/demand-coords'),
  getSettings: () => api.get('/admin/settings'),
  updateSetting: (data) => api.post('/admin/settings', data),
  getBusyAreas: () => api.get('/admin/analytics/busy-areas')
};

/* --------------------------------------
   SOS SERVICES
--------------------------------------- */
export const sosService = {
  triggerSOS: (data) => api.post('/sos/trigger', data),
  getActiveSOS: () => api.get('/sos/active'),
  resolveSOS: (sosId, notes) => api.post(`/sos/${sosId}/resolve`, { notes }),
  getSOSHistory: () => api.get('/sos/history'),

  // ✅ SOS Recording & Guest Chat
  uploadRecording: (sosId, audioBase64) => api.post(`/sos/${sosId}/recording`, { audio: audioBase64 })
};

/* --------------------------------------
   NOTIFICATION SERVICES
--------------------------------------- */
export const notificationService = {
  getNotifications: () => api.get('/notifications'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  deleteNotification: (id) => api.delete(`/notifications/${id}`)
};

/* --------------------------------------
   REPORT SERVICES
--------------------------------------- */
export const reportService = {
  submitReport: (data) => api.post('/reports', data),
  getAdminReports: () => api.get('/reports/admin/all'),
  resolveReport: (id, data) => api.put(`/reports/admin/${id}/resolve`, data)
};

/* --------------------------------------
   CONVERSATION & CHAT REQUEST SERVICES
--------------------------------------- */
export const chatService = {
  // Chat Requests
  sendRequest: (recipientId) => api.post('/chat-requests/send', { recipientId }),
  respondToRequest: (requestId, status) => api.post(`/chat-requests/${requestId}/respond`, { status }),
  getPendingRequests: () => api.get('/chat-requests/pending'),

  // Conversations
  getConversations: () => api.get('/conversations'),
  getConversation: (id) => api.get(`/conversations/${id}`),
  getMessages: (conversationId) => api.get(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId, text) => api.post(`/conversations/${conversationId}/messages`, { text })
};

export default api;
