import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { reportService } from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const AdminReports = () => {
    const { user } = useAuth();
    const [reports, setReports] = useState([]);
    const [filteredReports, setFilteredReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState(null);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [resolveNotes, setResolveNotes] = useState('');
    const [isResolving, setIsResolving] = useState(false);

    const fetchReports = useCallback(async () => {
        try {
            setLoading(true);
            const response = await reportService.getAdminReports();
            setReports(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching reports:', error);
            setLoading(false);
        }
    }, []);

    const filterReports = useCallback(() => {
        let filtered = [...reports];
        if (statusFilter !== 'all') {
            filtered = filtered.filter(r => r.status === statusFilter);
        }
        setFilteredReports(filtered);
    }, [reports, statusFilter]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    useEffect(() => {
        filterReports();
    }, [filterReports]);

    const handleResolveReport = async (status = 'resolved') => {
        if (!selectedReport) return;
        setIsResolving(true);
        try {
            await reportService.resolveReport(selectedReport._id, {
                status,
                adminNotes: resolveNotes
            });

            // Update local state
            setReports(prev => prev.map(r =>
                r._id === selectedReport._id
                    ? { ...r, status, adminNotes: resolveNotes, resolvedAt: new Date(), resolvedBy: user }
                    : r
            ));

            setSelectedReport(null);
            setResolveNotes('');
            alert(`Report marked as ${status}`);
        } catch (error) {
            console.error('Error resolving report:', error);
            alert('Failed to update report status');
        } finally {
            setIsResolving(false);
        }
    };

    const getStatusBadgeClass = (status) => {
        switch (status) {
            case 'pending': return 'badge-warning';
            case 'resolved': return 'badge-success';
            case 'investigating': return 'badge-info';
            case 'dismissed': return 'badge-danger';
            default: return 'badge-outline';
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading reports...</p>
            </div>
        );
    }

    return (
        <div className="admin-reports">
            <div className="container" style={{ padding: '20px' }}>
                <header className="page-header" style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', color: '#1e293b' }}>User Reports</h1>
                        <p style={{ color: '#64748b' }}>Manage and resolve complaints from users</p>
                    </div>
                    <div className="header-stats" style={{ display: 'flex', gap: '15px' }}>
                        <span className="badge badge-warning" style={{ padding: '8px 15px', borderRadius: '20px' }}>
                            {reports.filter(r => r.status === 'pending').length} Pending
                        </span>
                        <button onClick={fetchReports} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            🔄 Refresh
                        </button>
                    </div>
                </header>

                <div className="filters-bar" style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                    {['pending', 'investigating', 'resolved', 'dismissed', 'all'].map(f => (
                        <button
                            key={f}
                            className={`btn ${statusFilter === f ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setStatusFilter(f)}
                            style={{ textTransform: 'capitalize' }}
                        >
                            {f}
                        </button>
                    ))}
                </div>

                <div className="reports-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                    {filteredReports.length === 0 ? (
                        <div className="empty-state" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '50px', background: '#f8fafc', borderRadius: '12px' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📋</div>
                            <h3>No {statusFilter} reports found</h3>
                            <p>Everything looks clear!</p>
                        </div>
                    ) : (
                        filteredReports.map((report, idx) => (
                            <motion.div
                                key={report._id}
                                className="report-card"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                style={{
                                    background: '#fff',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                    cursor: 'pointer',
                                    borderLeft: `5px solid ${report.status === 'pending' ? '#f59e0b' : '#10b981'}`
                                }}
                                onClick={() => setSelectedReport(report)}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <span className={`badge ${getStatusBadgeClass(report.status)}`} style={{ fontSize: '0.75rem' }}>
                                        {report.status.toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                        {new Date(report.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>{report.type} Issue</h4>
                                <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '15px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {report.description}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
                                    <strong>Reporter:</strong> {report.reporter?.name}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', marginTop: '5px' }}>
                                    <strong>Reported User:</strong> {report.reportedUser?.name}
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>

                <AnimatePresence>
                    {selectedReport && (
                        <motion.div
                            className="modal-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
                            onClick={() => setSelectedReport(null)}
                        >
                            <motion.div
                                className="modal-content"
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.9, y: 20 }}
                                style={{ background: '#fff', padding: '30px', borderRadius: '16px', maxWidth: '600px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
                                onClick={e => e.stopPropagation()}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                                    <h2>Report Details</h2>
                                    <button onClick={() => setSelectedReport(null)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                                </div>

                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                        <div>
                                            <strong>Reporter:</strong>
                                            <p>{selectedReport.reporter?.name} ({selectedReport.reporter?.email})</p>
                                        </div>
                                        <div>
                                            <strong>Reported User:</strong>
                                            <p>{selectedReport.reportedUser?.name} ({selectedReport.reportedUser?.email})</p>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '15px' }}>
                                        <strong>Report Type:</strong>
                                        <p>{selectedReport.type}</p>
                                    </div>
                                    <div style={{ marginBottom: '15px' }}>
                                        <strong>Description:</strong>
                                        <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '8px', marginTop: '5px', color: '#334155' }}>
                                            {selectedReport.description}
                                        </div>
                                    </div>
                                    {selectedReport.ride && (
                                        <div style={{ marginBottom: '15px' }}>
                                            <strong>Ride ID:</strong>
                                            <p style={{ fontFamily: 'monospace' }}>{selectedReport.ride._id || selectedReport.ride}</p>
                                        </div>
                                    )}
                                </div>

                                {selectedReport.status === 'resolved' || selectedReport.status === 'dismissed' ? (
                                    <div style={{ padding: '15px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                                        <strong>Status: {selectedReport.status.toUpperCase()}</strong>
                                        <p style={{ margin: '5px 0' }}>Resolved at: {new Date(selectedReport.resolvedAt).toLocaleString()}</p>
                                        {selectedReport.adminNotes && (
                                            <p><strong>Admin Notes:</strong> {selectedReport.adminNotes}</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="resolution-section">
                                        <label style={{ display: 'block', marginBottom: '10px' }}><strong>Admin Notes:</strong></label>
                                        <textarea
                                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', minHeight: '100px', marginBottom: '20px' }}
                                            value={resolveNotes}
                                            onChange={e => setResolveNotes(e.target.value)}
                                            placeholder="Enter actions taken or internal notes..."
                                        />
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button
                                                className="btn btn-primary"
                                                disabled={isResolving}
                                                onClick={() => handleResolveReport('resolved')}
                                                style={{ flex: 1 }}
                                            >
                                                {isResolving ? 'Processing...' : '✅ Mark Resolved'}
                                            </button>
                                            <button
                                                className="btn btn-outline"
                                                disabled={isResolving}
                                                onClick={() => handleResolveReport('investigating')}
                                            >
                                                🔍 Investigating
                                            </button>
                                            <button
                                                className="btn btn-danger"
                                                disabled={isResolving}
                                                onClick={() => handleResolveReport('dismissed')}
                                            >
                                                🚫 Dismiss
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default AdminReports;
