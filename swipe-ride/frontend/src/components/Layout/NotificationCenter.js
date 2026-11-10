import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationService } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';

const NotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const socket = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('new-notification', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      // Optional: Show a toast here
    });

    return () => socket.off('new-notification');
  }, [socket]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await notificationService.getNotifications();
      const data = response.data || [];
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.isRead).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const markAsRead = async (id) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications(prev =>
        prev.map(n => n._id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.isRead) {
      markAsRead(notification._id);
    }
    setIsOpen(false);
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'ride': return '🚗';
      case 'sos': return '🚨';
      case 'verification': return '✅';
      case 'message': return '💬';
      default: return '🔔';
    }
  };

  return (
    <div className="notification-center" ref={dropdownRef}>
      <button className="nav-icon-btn" onClick={() => setIsOpen(!isOpen)} title="Notifications">
        <span className="icon">🔔</span>
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="notification-dropdown"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <div className="dropdown-header">
              <h3>Notifications</h3>
              {unreadCount > 0 && (
                <button className="text-btn" onClick={markAllAsRead}>Mark all read</button>
              )}
            </div>

            <div className="notification-list">
              {notifications.length === 0 ? (
                <div className="empty-state">No notifications yet</div>
              ) : (
                notifications.map(notification => (
                  <div
                    key={notification._id}
                    className={`notification-item ${notification.isRead ? 'read' : 'unread'}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="notif-icon">{getIcon(notification.type)}</div>
                    <div className="notif-content">
                      <div className="notif-title">{notification.title}</div>
                      <div className="notif-message">{notification.message}</div>
                      <div className="notif-time">
                        {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {!notification.isRead && <div className="unread-dot"></div>}
                  </div>
                ))
              )}
            </div>
            {notifications.length > 0 && (
              <div className="dropdown-footer">
                <button className="view-all-btn">View All</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationCenter;
