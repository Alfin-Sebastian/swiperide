import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/api';
import { motion } from 'framer-motion';

const AdminUsers = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await adminService.getAllUsers();
            setUsers(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching users:', error);
            setLoading(false);
        }
    };

    const handleToggleStatus = async (userId, currentStatus) => {
        try {
            await adminService.updateUserStatus(userId, !currentStatus);
            setUsers(users.map(u => u._id === userId ? { ...u, isActive: !currentStatus } : u));
        } catch (error) {
            console.error('Error updating user status:', error);
            alert('Failed to update user status');
        }
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = filterRole === 'all' || user.role === filterRole;
        return matchesSearch && matchesRole;
    });

    if (loading) return <div className="loading">Loading users...</div>;

    return (
        <div className="admin-users-page container">
            <header className="page-header">
                <h1>User Management</h1>
                <p>View and manage all system users</p>
            </header>

            <div className="filters-card card">
                <div className="search-bar">
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-control"
                    />
                </div>
                <div className="role-filter">
                    <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="form-control"
                    >
                        <option value="all">All Roles</option>
                        <option value="passenger">Passengers</option>
                        <option value="driver">Drivers</option>
                        <option value="admin">Admins</option>
                    </select>
                </div>
            </div>

            <div className="users-table-container card">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Role</th>
                            <th>Phone</th>
                            <th>Status</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(user => (
                            <motion.tr
                                key={user._id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                <td>
                                    <div className="user-info-cell">
                                        <div className="user-avatar-sm">
                                            {user.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="user-name-bold">{user.name}</div>
                                            <div className="user-email-text">{user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={`role-badge ${user.role}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td>{user.phone}</td>
                                <td>
                                    <span className={`status-dot ${user.isActive ? 'active' : 'inactive'}`}></span>
                                    {user.isActive ? 'Active' : 'Inactive'}
                                </td>
                                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                                <td>
                                    <button
                                        className={`btn btn-sm ${user.isActive ? 'btn-danger' : 'btn-success'}`}
                                        onClick={() => handleToggleStatus(user._id, user.isActive)}
                                    >
                                        {user.isActive ? 'Deactivate' : 'Activate'}
                                    </button>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
                {filteredUsers.length === 0 && (
                    <div className="empty-table">No users found matching your criteria.</div>
                )}
            </div>
        </div>
    );
};

export default AdminUsers;
