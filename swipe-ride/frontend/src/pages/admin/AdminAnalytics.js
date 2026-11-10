import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/api';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
} from 'chart.js';
import { motion } from 'framer-motion';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
);

const AdminAnalytics = () => {
    const [analytics, setAnalytics] = useState(null);
    const [busyAreas, setBusyAreas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('30days'); // eslint-disable-line no-unused-vars

    useEffect(() => {
        fetchData();
    }, [timeRange]);

    const fetchData = async () => {
        try {
            const [analyticsRes, busyAreasRes] = await Promise.all([
                adminService.getAnalytics(),
                adminService.getBusyAreas()
            ]);
            setAnalytics(analyticsRes.data);
            setBusyAreas(busyAreasRes.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching analytics:', error);
            setLoading(false);
        }
    };

    if (loading) return <div className="loading">Loading analytics...</div>;
    if (!analytics) return <div className="error">Failed to load analytics data.</div>;

    const rideData = {
        labels: analytics.dailyRides.map(r => r._id),
        datasets: [
            {
                label: 'Daily Rides',
                data: analytics.dailyRides.map(r => r.count),
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4
            }
        ]
    };

    // Revenue summary used for KPI display above
    const totalRevenue = analytics.revenue.totalRevenue;
    const avgFare = analytics.revenue.avgFare;

    return (
        <div className="admin-analytics-page container">
            <header className="page-header">
                <h1>System Analytics</h1>
                <p>Detailed performance insights and trends</p>
            </header>

            <div className="analytics-grid">
                {/* KPI Cards */}
                <motion.div className="kpi-card card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="kpi-label">Total Revenue</div>
                    <div className="kpi-value">₹{totalRevenue.toLocaleString()}</div>
                </motion.div>
                <motion.div className="kpi-card card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <div className="kpi-label">Average Fare</div>
                    <div className="kpi-value">₹{avgFare.toFixed(2)}</div>
                </motion.div>
                <motion.div className="kpi-card card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <div className="kpi-label">Total Completed Rides</div>
                    <div className="kpi-value">{analytics.revenue.count}</div>
                </motion.div>
            </div>

            <div className="charts-container">
                <div className="main-chart card">
                    <h3>Ride Volume Trend (Last 30 Days)</h3>
                    <Line data={rideData} options={{ responsive: true, maintainAspectRatio: false }} height={300} />
                </div>

                <div className="side-charts">
                    <div className="mini-chart card">
                        <h3>Top Busiest Pickup Areas</h3>
                        <div className="busy-areas-list">
                            {busyAreas.map((area, idx) => (
                                <div key={idx} className="area-item">
                                    <span className="area-name">{area._id}</span>
                                    <span className="area-count badge badge-info">{area.count} rides</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminAnalytics;
