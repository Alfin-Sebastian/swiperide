import React, { useState } from 'react';
import { reportService } from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const ReportModal = ({ isOpen, onClose, reportedUser, rideId }) => {
    const [type, setType] = useState('safety');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!description.trim()) return alert('Please provide a description');

        setSubmitting(true);
        try {
            await reportService.submitReport({
                reportedUser: reportedUser._id,
                ride: rideId,
                type,
                description
            });
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                onClose();
                setDescription('');
            }, 2000);
        } catch (error) {
            console.error('Error submitting report:', error);
            alert('Failed to submit report. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen && !success) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <div className="modal-backdrop" onClick={onClose} />
                <motion.div
                    className="modal-content"
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                >
                    {success ? (
                        <div className="success-state">
                            <div className="success-icon">✅</div>
                            <h3>Report Submitted</h3>
                            <p>Thank you for letting us know. We will investigate this matter.</p>
                        </div>
                    ) : (
                        <>
                            <div className="modal-header">
                                <h2>Report User</h2>
                                <button className="close-btn" onClick={onClose}>✕</button>
                            </div>
                            <form onSubmit={handleSubmit} className="report-form">
                                <p className="report-hint">
                                    Reporting: <strong>{reportedUser?.name}</strong>
                                </p>

                                <div className="form-group">
                                    <label>Type of Issue</label>
                                    <select
                                        className="form-control"
                                        value={type}
                                        onChange={(e) => setType(e.target.value)}
                                    >
                                        <option value="safety">Safety Concern</option>
                                        <option value="behavior">Unprofessional Behavior</option>
                                        <option value="payment">Payment Issue</option>
                                        <option value="vehicle">Vehicle Condition</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        className="form-control"
                                        rows="4"
                                        placeholder="Tell us what happened..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="modal-footer">
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={onClose}
                                        disabled={submitting}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-danger"
                                        disabled={submitting}
                                    >
                                        {submitting ? 'Submitting...' : 'Submit Report'}
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                </motion.div>
            </motion.div>

            <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
        }
        .modal-backdrop {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
        }
        .modal-content {
          background: white;
          width: 100%;
          max-width: 450px;
          border-radius: 16px;
          padding: 24px;
          position: relative;
          z-index: 2001;
          box-shadow: 0 20px 50px rgba(0,0,0,0.2);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .modal-header h2 {
          margin: 0;
          font-size: 20px;
          color: #1a1a1a;
        }
        .close-btn {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #6b7280;
        }
        .report-hint {
          background: #f3f4f6;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 14px;
          color: #4b5563;
          margin-bottom: 20px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
          color: #374151;
        }
        .form-control {
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s;
        }
        .form-control:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
        }
        .success-state {
          text-align: center;
          padding: 40px 0;
        }
        .success-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        .success-state h3 {
          margin: 0 0 8px 0;
          color: #10b981;
        }
        .success-state p {
          color: #6b7280;
          margin: 0;
        }
      `}</style>
        </AnimatePresence>
    );
};

export default ReportModal;
