import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminService } from '../../services/api';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { motion } from 'framer-motion';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

const AdminDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState([]);
  const [timeRange, setTimeRange] = useState('week');
  const [settings, setSettings] = useState([]);
  const [busyAreas, setBusyAreas] = useState([]);

  const fetchDashboardData = useCallback(async () => {
    try {
      const response = await adminService.getDashboard();
      setStats(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  }, []);

  const fetchRecentActivity = useCallback(() => {
    // Recent activity is now fetched along with dashboard stats
    if (stats?.recentActivity) {
      setRecentActivity(stats.recentActivity);
    }
  }, [stats]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await adminService.getSettings();
      setSettings(res.data || []);
    } catch (err) {
      console.error('Error fetching settings', err);
    }
  }, []);

  const fetchBusyAreas = useCallback(async () => {
    try {
      const res = await adminService.getBusyAreas();
      setBusyAreas(res.data || []);
    } catch (err) {
      console.error('Error fetching busy areas', err);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    fetchRecentActivity();
    fetchSettings();
    fetchBusyAreas();

    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [timeRange, fetchDashboardData, fetchRecentActivity, fetchSettings, fetchBusyAreas]);

  useEffect(() => {
    fetchRecentActivity();
  }, [stats, fetchRecentActivity]);

  const handleToggleSetting = async (key, currentValue) => {
    try {
      await adminService.updateSetting({ key, value: !currentValue });
      fetchSettings();
    } catch (err) {
      console.error('Error updating setting', err);
    }
  };

  const prepareWeeklyRidesChart = () => {
    if (!stats?.weeklyRides) return null;

    const labels = stats.weeklyRides.map(item => item._id);
    const data = stats.weeklyRides.map(item => item.count);

    return {
      labels,
      datasets: [
        {
          label: 'Rides per Day',
          data,
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgb(59, 130, 246)',
          borderWidth: 2,
          borderRadius: 5
        }
      ]
    };
  };

  const prepareUserDistributionChart = () => {
    if (!stats) return null;

    return {
      labels: ['Passengers', 'Drivers', 'Admins'],
      datasets: [
        {
          data: [stats.totalPassengers, stats.totalDrivers, stats.totalAdmins],
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)',
            'rgba(139, 92, 246, 0.8)',
            'rgba(239, 68, 68, 0.8)'
          ],
          borderColor: [
            'rgb(59, 130, 246)',
            'rgb(139, 92, 246)',
            'rgb(239, 68, 68)'
          ],
          borderWidth: 1
        }
      ]
    };
  };

  const prepareVerificationChart = () => {
    if (!stats) return null;

    return {
      labels: ['Pending', 'Approved', 'Rejected'],
      datasets: [
        {
          label: 'Driver Verifications',
          data: [stats.pendingVerifications, stats.approvedVerifications, stats.rejectedVerifications],
          backgroundColor: [
            'rgba(245, 158, 11, 0.8)',
            'rgba(16, 185, 129, 0.8)',
            'rgba(239, 68, 68, 0.8)'
          ],
          borderColor: [
            'rgb(245, 158, 11)',
            'rgb(16, 185, 129)',
            'rgb(239, 68, 68)'
          ],
          borderWidth: 1
        }
      ]
    };
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'verification': return '✅';
      case 'ride': return '🚗';
      case 'sos': return '🚨';
      case 'user': return '👤';
      default: return '📋';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
      case 'completed':
      case 'resolved':
        return 'success';
      case 'pending':
        return 'warning';
      case 'rejected':
      case 'blocked':
      case 'cancelled':
        return 'danger';
      default:
        return 'info';
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading admin dashboard...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <div className="container">
        <header className="page-header">
          <div className="header-content">
            <div>
              <h1>Admin Dashboard</h1>
              <p>Welcome back, {user?.name}</p>
            </div>
            <div className="time-range-selector">
              <button
                className={`time-btn ${timeRange === 'day' ? 'active' : ''}`}
                onClick={() => setTimeRange('day')}
              >
                Today
              </button>
              <button
                className={`time-btn ${timeRange === 'week' ? 'active' : ''}`}
                onClick={() => setTimeRange('week')}
              >
                This Week
              </button>
              <button
                className={`time-btn ${timeRange === 'month' ? 'active' : ''}`}
                onClick={() => setTimeRange('month')}
              >
                This Month
              </button>
            </div>
          </div>
        </header>

        {/* Quick Stats */}
        <div className="quick-stats">
          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="stat-header">
              <div className="stat-icon">👥</div>
              <h3>Total Users</h3>
            </div>
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-breakdown">
              <span className="breakdown-item">
                {stats.totalPassengers} passengers
              </span>
              <span className="breakdown-item">
                {stats.totalDrivers} drivers
              </span>
            </div>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="stat-header">
              <div className="stat-icon">🚖</div>
              <h3>Rides</h3>
            </div>
            <div className="stat-value">{stats.totalRides}</div>
            <div className="stat-breakdown">
              <span className="breakdown-item">
                {stats.activeRides} active
              </span>
              <span className="breakdown-item">
                Daily: {stats.weeklyRides?.[stats.weeklyRides.length - 1]?.count || 0}
              </span>
            </div>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="stat-header">
              <div className="stat-icon">🔄</div>
              <h3>Active Drivers</h3>
            </div>
            <div className="stat-value">{stats.activeDrivers}</div>
            <div className="stat-breakdown">
              <span className="breakdown-item">
                {stats.pendingVerifications} pending
              </span>
              <span className="breakdown-item">
                Availability: {((stats.activeDrivers / stats.totalDrivers) * 100).toFixed(1)}%
              </span>
            </div>
          </motion.div>

          <motion.div
            className="stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="stat-header">
              <div className="stat-icon">🚨</div>
              <h3>SOS Alerts</h3>
            </div>
            <div className="stat-value">{stats.activeSOS}</div>
            <div className="stat-breakdown">
              <span className="breakdown-item">
                Pending Reports: {stats.pendingReports || 0}
              </span>
              <span className="breakdown-item">
                Immediate attention needed
              </span>
            </div>
          </motion.div>
        </div>

        {/* Charts Section */}
        <div className="charts-section">
          <motion.div
            className="chart-card"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="chart-header">
              <h3>Weekly Ride Activity</h3>
              <a href="/admin/analytics" className="btn btn-sm btn-outline">
                View Details
              </a>
            </div>
            <div className="chart-container">
              {prepareWeeklyRidesChart() && (
                <Bar
                  data={prepareWeeklyRidesChart()}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: {
                        display: false
                      }
                    }
                  }}
                />
              )}
            </div>
          </motion.div>

          <div className="chart-sidebar">
            <motion.div
              className="mini-chart-card"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h4>User Distribution</h4>
              <div className="mini-chart-container">
                {prepareUserDistributionChart() && (
                  <Pie
                    data={prepareUserDistributionChart()}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: 'bottom'
                        }
                      }
                    }}
                  />
                )}
              </div>
            </motion.div>

            <motion.div
              className="mini-chart-card"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h4>Verification Status</h4>
              <div className="mini-chart-container">
                {prepareVerificationChart() && (
                  <Pie
                    data={prepareVerificationChart()}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: 'bottom'
                        }
                      }
                    }}
                  />
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Recent Activity & Quick Actions */}
        <div className="activity-actions-section">
          <motion.div
            className="recent-activity-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="card-header">
              <h3>Recent Activity</h3>
              <button
                onClick={fetchRecentActivity}
                className="btn btn-sm btn-outline"
              >
                Refresh
              </button>
            </div>

            <div className="activity-list">
              {recentActivity.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  className="activity-item"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <div className="activity-icon">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="activity-content">
                    <div className="activity-title">
                      {activity.type === 'verification' && 'Driver Verification'}
                      {activity.type === 'ride' && 'Ride Completed'}
                      {activity.type === 'sos' && 'SOS Alert'}
                      {activity.type === 'user' && 'User Management'}
                    </div>
                    <div className="activity-details">
                      <span className="activity-user">{activity.user}</span>
                      <span className={`activity-status ${getStatusColor(activity.status)}`}>
                        {activity.status}
                      </span>
                    </div>
                  </div>
                  <div className="activity-time">
                    {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <div className="quick-actions-sidebar">
            <motion.div
              className="actions-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h3>Quick Actions</h3>
              <div className="actions-list">
                <a href="/admin/verifications" className="action-item">
                  <div className="action-icon">✅</div>
                  <div className="action-content">
                    <div className="action-title">Driver Verifications</div>
                    <div className="action-subtitle">
                      {stats.pendingVerifications} pending
                    </div>
                  </div>
                  <div className="action-arrow">→</div>
                </a>

                <a href="/admin/rides" className="action-item">
                  <div className="action-icon">🚗</div>
                  <div className="action-content">
                    <div className="action-title">Active Rides</div>
                    <div className="action-subtitle">
                      {stats.activeRides} in progress
                    </div>
                  </div>
                  <div className="action-arrow">→</div>
                </a>

                <a href="/admin/sos" className="action-item">
                  <div className="action-icon">🚨</div>
                  <div className="action-content">
                    <div className="action-title">SOS Alerts</div>
                    <div className="action-subtitle">
                      {stats.activeSOS} active alerts
                    </div>
                  </div>
                  <div className="action-arrow">→</div>
                </a>

                <a href="/admin/users" className="action-item">
                  <div className="action-icon">👥</div>
                  <div className="action-content">
                    <div className="action-title">User Management</div>
                    <div className="action-subtitle">
                      {stats.totalUsers} total users
                    </div>
                  </div>
                  <div className="action-arrow">→</div>
                </a>

                <a href="/admin/analytics" className="action-item">
                  <div className="action-icon">📊</div>
                  <div className="action-content">
                    <div className="action-title">Analytics</div>
                    <div className="action-subtitle">
                      View detailed reports
                    </div>
                  </div>
                  <div className="action-arrow">→</div>
                </a>

                <a href="/admin/reports" className="action-item">
                  <div className="action-icon">📋</div>
                  <div className="action-content">
                    <div className="action-title">User Reports</div>
                    <div className="action-subtitle">
                      {stats.pendingReports || 0} pending complaints
                    </div>
                  </div>
                  <div className="action-arrow">→</div>
                </a>
              </div>
            </motion.div>

            <motion.div
              className="system-status-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h3>System Status</h3>
              <div className="status-list">
                <div className="status-item online">
                  <div className="status-indicator"></div>
                  <div className="status-content">
                    <div className="status-title">API Server</div>
                    <div className="status-subtitle">Operational</div>
                  </div>
                </div>

                <div className="status-item online">
                  <div className="status-indicator"></div>
                  <div className="status-content">
                    <div className="status-title">Database</div>
                    <div className="status-subtitle">Connected</div>
                  </div>
                </div>

                <div className="status-item online">
                  <div className="status-indicator"></div>
                  <div className="status-content">
                    <div className="status-title">WebSocket</div>
                    <div className="status-subtitle">Active</div>
                  </div>
                </div>

                <div className="status-item online">
                  <div className="status-indicator"></div>
                  <div className="status-content">
                    <div className="status-title">Payment Gateway</div>
                    <div className="status-subtitle">Operational</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* SYSTEM TOGGLES & DEMAND INSIGHTS */}
        <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h3>System Settings</h3>
            <div className="settings-controls" style={{ marginTop: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                <span>Allow New Driver Signups:</span>
                <button
                  className={`btn btn-sm ${settings.find(s => s.key === 'driverRegistrationEnabled')?.value !== false ? 'btn-success' : 'btn-danger'}`}
                  onClick={() => handleToggleSetting('driverRegistrationEnabled', settings.find(s => s.key === 'driverRegistrationEnabled')?.value !== false)}
                >
                  {settings.find(s => s.key === 'driverRegistrationEnabled')?.value !== false ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h3>Demand Insights (24h)</h3>
            <div className="busy-areas" style={{ marginTop: '15px' }}>
              {busyAreas.length === 0 ? <p>No data</p> : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {busyAreas.slice(0, 5).map((area, idx) => (
                    <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < 4 ? '1px solid #eee' : 'none' }}>
                      <span style={{ fontSize: '0.9rem' }}>{area._id?.length > 30 ? area._id.substring(0, 30) + '...' : area._id}</span>
                      <span className="badge badge-info">{area.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </div>

        <div className="bottom-stats">
          <motion.div
            className="bottom-stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <div className="stat-label">Total Revenue</div>
              <div className="stat-value">₹{stats.totalRevenue?.toLocaleString() || '0.00'}</div>
            </div>
          </motion.div>

          <motion.div
            className="bottom-stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="stat-icon">⭐</div>
            <div className="stat-content">
              <div className="stat-label">Avg. Driver Rating</div>
              <div className="stat-value">{stats.avgRating?.toFixed(1) || 'N/A'}</div>
            </div>
          </motion.div>

          <motion.div
            className="bottom-stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="stat-icon">⏱️</div>
            <div className="stat-content">
              <div className="stat-label">Live SOS Alerts</div>
              <div className="stat-value">{stats.activeSOS}</div>
            </div>
          </motion.div>

          <motion.div
            className="bottom-stat-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="stat-icon">📈</div>
            <div className="stat-content">
              <div className="stat-label">Verified Drivers</div>
              <div className="stat-value">{stats.approvedVerifications}</div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;