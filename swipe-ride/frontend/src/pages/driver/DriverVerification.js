import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { userService } from "../../services/api";
import { useSocket } from "../../context/SocketContext";
import { motion } from "framer-motion";

const DriverVerification = () => {
  useAuth();
  const socket = useSocket();

  const [loading, setLoading] = useState(true);
  const [driverInfo, setDriverInfo] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [uploading, setUploading] = useState({
    license: false,
    idProof: false,
    vehicle: false,
    insurance: false,
    registration: false,
  });

  const [uploadProgress, setUploadProgress] = useState({
    license: 0,
    idProof: 0,
    vehicle: 0,
    insurance: 0,
    registration: 0,
  });

  const [expiryDates, setExpiryDates] = useState({
    license: '',
    insurance: '',
    registration: ''
  });

  /* ---------------------------------------------------
     LOAD DRIVER PROFILE
  ---------------------------------------------------- */
  useEffect(() => {
    fetchDriverInfo();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on("verification-update", () => {
      fetchDriverInfo();
    });

    return () => socket.off("verification-update");
  }, [socket]);

  const fetchDriverInfo = async () => {
    try {
      const response = await userService.getProfile();

      if (response.data.vehicleImage)
        response.data.vehiclePhoto = response.data.vehicleImage;

      const {
        licenseExpiryDate,
        insuranceExpiryDate,
        registrationExpiryDate
      } = response.data;

      // Initialize expiry dates from profile data
      setExpiryDates({
        license: licenseExpiryDate ? new Date(licenseExpiryDate).toISOString().split('T')[0] : '',
        insurance: insuranceExpiryDate ? new Date(insuranceExpiryDate).toISOString().split('T')[0] : '',
        registration: registrationExpiryDate ? new Date(registrationExpiryDate).toISOString().split('T')[0] : ''
      });

      setDriverInfo(response.data);
      setLoading(false);
    } catch (error) {
      console.error("Profile load error:", error);
      setLoading(false);
    }
  };

  /* ---------------------------------------------------
     UPLOAD DOCUMENT
  ---------------------------------------------------- */
  const handleFileUpload = async (fileType, file) => {
    if (!file) return;
    const isCurrentlyApproved = driverInfo.verificationStatus === 'approved';
    if (isCurrentlyApproved && !window.confirm("Changing your verified documents will reset your status to 'Pending' and you will be unable to accept rides until re-approved. Continue?")) {
      return;
    }

    setUploading((prev) => ({ ...prev, [fileType]: true }));

    try {
      const formData = new FormData();
      if (fileType === "license") formData.append("license", file);
      if (fileType === "idProof") formData.append("idProof", file);
      if (fileType === "vehicle") formData.append("vehicleImage", file);

      await userService.uploadVerificationDocs(formData, (event) => {
        const percent = Math.round((event.loaded * 100) / event.total);
        setUploadProgress((prev) => ({ ...prev, [fileType]: percent }));
      });

      setUploading((prev) => ({ ...prev, [fileType]: false }));
      setUploadProgress((prev) => ({ ...prev, [fileType]: 0 }));

      fetchDriverInfo();
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed.");
    }
  };

  /* ---------------------------------------------------
     REMOVE DOCUMENT
  ---------------------------------------------------- */
  const handleRemoveDoc = async (type) => {
    const isCurrentlyApproved = driverInfo.verificationStatus === 'approved';
    if (isCurrentlyApproved && !window.confirm("Removing documents will reset your status to 'Pending'. Continue?")) {
      return;
    }

    if (!window.confirm("Remove this document?")) return;

    try {
      await userService.removeDoc({ type });
      fetchDriverInfo();
    } catch (error) {
      alert("Failed to remove document.");
    }
  };

  /* ---------------------------------------------------
     SUBMIT DOCUMENTS FOR VERIFICATION
  ---------------------------------------------------- */
  const handleSubmitVerification = async () => {
    // 1. Check if everything is uploaded
    const missingDocs = [];
    if (!driverInfo.licenseImage) missingDocs.push("License Photo");
    if (!driverInfo.idProofImage) missingDocs.push("ID Proof");
    if (!driverInfo.vehicleImage) missingDocs.push("Vehicle Photo");
    if (!driverInfo.insuranceDocument) missingDocs.push("Insurance Document");
    if (!driverInfo.registrationDocument) missingDocs.push("Registration Document");

    const missingDates = [];
    if (!expiryDates.license) missingDates.push("License Expiry");
    if (!expiryDates.insurance) missingDates.push("Insurance Expiry");
    if (!expiryDates.registration) missingDates.push("Registration Expiry");

    const missingProfile = [];
    if (!driverInfo.licenseNo) missingProfile.push("License Number");
    if (!driverInfo.vehicleDetails?.make) missingProfile.push("Vehicle Make");
    if (!driverInfo.vehicleDetails?.model) missingProfile.push("Vehicle Model");
    if (!driverInfo.vehicleDetails?.year) missingProfile.push("Vehicle Year");
    if (!driverInfo.vehicleDetails?.color) missingProfile.push("Vehicle Color");
    if (!driverInfo.vehicleDetails?.plateNo) missingProfile.push("Plate Number");
    if (!driverInfo.vehicleType) missingProfile.push("Vehicle Type");

    if (missingDocs.length > 0 || missingDates.length > 0 || missingProfile.length > 0) {
      let msg = "Cannot submit yet:\n";
      if (missingDocs.length > 0) msg += `- Missing docs: ${missingDocs.join(", ")}\n`;
      if (missingDates.length > 0) msg += `- Missing dates: ${missingDates.join(", ")}\n`;
      if (missingProfile.length > 0) msg += `- Missing profile: ${missingProfile.join(", ")}\n\nPlease go to your Profile page to fill in these missing details first.`;
      return alert(msg);
    }

    if (!window.confirm("Submit all documents for verification? You won't be able to edit them until review is complete.")) {
      return;
    }

    setIsSubmitting(true);
    try {
      // 2. Auto-save dates first (mapping to backend fields)
      await userService.updateExpiryDates({
        licenseExpiryDate: expiryDates.license,
        insuranceExpiryDate: expiryDates.insurance,
        registrationExpiryDate: expiryDates.registration
      });

      // 3. Final submission
      await userService.submitVerification();

      alert("Verification successfully submitted for review!");
      await fetchDriverInfo();
    } catch (error) {
      console.error("Submission error:", error);
      alert(error.response?.data?.message || "Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------------------------------------------------
     ALLOW RESUBMISSION AFTER REJECTION
  ---------------------------------------------------- */
  const handleResubmitUnlock = async () => {
    alert(
      "Editing unlocked. You may now re-upload documents and submit again."
    );

    await fetchDriverInfo();
  };

  /* ---------------------------------------------------
     UPLOAD INSURANCE DOCUMENT
  ---------------------------------------------------- */
  const handleInsuranceUpload = async (file) => {
    if (!file) return;
    setUploading((prev) => ({ ...prev, insurance: true }));
    try {
      const formData = new FormData();
      formData.append('insurance', file);
      await userService.uploadInsurance(formData);
      alert('Insurance document uploaded! Click "Submit for Verification" when you are ready to send your profile for review.');
      fetchDriverInfo();
    } catch (error) {
      console.error('Insurance upload error:', error);
      alert('Upload failed.');
    } finally {
      setUploading((prev) => ({ ...prev, insurance: false }));
    }
  };

  const handleRegistrationUpload = async (file) => {
    if (!file) return;
    setUploading((prev) => ({ ...prev, registration: true }));
    try {
      const formData = new FormData();
      formData.append('registration', file);
      await userService.uploadRegistration(formData);
      alert('Registration document uploaded! Click "Submit for Verification" when you are ready to send your profile for review.');
      fetchDriverInfo();
    } catch (error) {
      console.error('Registration upload error:', error);
      alert('Upload failed.');
    } finally {
      setUploading((prev) => ({ ...prev, registration: false }));
    }
  };

  /* ---------------------------------------------------
     UPDATE EXPIRY DATES
  ---------------------------------------------------- */
  const handleUpdateExpiryDates = async () => {
    const isLockedState = driverInfo.verificationStatus === 'pending';
    if (isLockedState)
      return alert("Documents are locked while awaiting review.");

    try {
      await userService.updateExpiryDates({
        licenseExpiryDate: expiryDates.license,
        insuranceExpiryDate: expiryDates.insurance,
        registrationExpiryDate: expiryDates.registration
      });
      alert('Expiry dates updated!');
      fetchDriverInfo();
    } catch (error) {
      console.error('Expiry update error:', error);
      alert('Update failed.');
    }
  };

  const getVerificationStatus = () => {
    if (!driverInfo) return null;

    return {
      none: {
        title: "Not Started",
        description: "Please upload your documents and set expiry dates to begin verification.",
        icon: "📄",
        color: "#64748b",
        bgColor: "#f1f5f9",
      },
      pending: {
        title: "Pending Verification",
        description: "Your documents are under review.",
        icon: "⏳",
        color: "#f59e0b",
        bgColor: "#fffbeb",
      },
      approved: {
        title: "Verified Driver",
        description: "You can now accept rides.",
        icon: "✅",
        color: "#10b981",
        bgColor: "#d1fae5",
      },
      rejected: {
        title: "Verification Rejected",
        description:
          driverInfo.verificationNotes ||
          "Please upload correct documents and re-submit.",
        icon: "❌",
        color: "#ef4444",
        bgColor: "#fee2e2",
      },
    }[driverInfo.verificationStatus || 'none'];
  };

  if (loading || !driverInfo) return <p>Loading…</p>;

  const statusInfo = getVerificationStatus();
  // Lock edits ONLY if currently pending review
  const isLocked = driverInfo.verificationStatus === "pending";
  const isApproved = driverInfo.verificationStatus === "approved";
  const isRejected = driverInfo.verificationStatus === "rejected";

  const allDocsUploaded =
    driverInfo.licenseImage &&
    driverInfo.idProofImage &&
    driverInfo.vehicleImage &&
    driverInfo.insuranceDocument &&
    driverInfo.registrationDocument &&
    driverInfo.licenseExpiryDate &&
    driverInfo.insuranceExpiryDate &&
    driverInfo.registrationExpiryDate;

  return (
    <div className="driver-verification">
      <div className="container">

        {/* STATUS BANNER */}
        <motion.div
          className="verification-status-banner"
          style={{
            backgroundColor: statusInfo.bgColor,
            borderColor: statusInfo.color,
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="status-content">
            <span className="status-icon">{statusInfo.icon}</span>
            <div>
              <h3 style={{ color: statusInfo.color }}>
                {statusInfo.title}
              </h3>
              <p>{statusInfo.description}</p>

              {isRejected && driverInfo.verificationNotes && (
                <p style={{ marginTop: 8, color: "#b91c1c" }}>
                  <strong>Admin Notes:</strong> {driverInfo.verificationNotes}
                </p>
              )}
            </div>
          </div>

          {/* RE-SUBMIT BUTTON (ONLY IN REJECTED STATE) */}
          {isRejected && (
            <button
              className="btn btn-primary"
              onClick={handleResubmitUnlock}
            >
              Re-submit Documents
            </button>
          )}
        </motion.div>

        <div className="verification-grid">

          {/* DOCUMENT SECTION */}
          <div className="document-section">
            <motion.div className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h3>Required Documents</h3>

              <DocumentCard
                title="Driver License"
                description="Government issued license"
                image={driverInfo.licenseImage}
                uploading={uploading.license}
                progress={uploadProgress.license}
                disabled={isLocked}
                onUpload={(f) => handleFileUpload("license", f)}
                onRemove={() => handleRemoveDoc("license")}
              />

              <DocumentCard
                title="ID Proof"
                description="Aadhaar, Passport, etc"
                image={driverInfo.idProofImage}
                uploading={uploading.idProof}
                progress={uploadProgress.idProof}
                disabled={isLocked}
                onUpload={(f) => handleFileUpload("idProof", f)}
                onRemove={() => handleRemoveDoc("idProof")}
              />

              <DocumentCard
                title="Vehicle Photo"
                description="Clear picture of vehicle"
                image={driverInfo.vehicleImage}
                uploading={uploading.vehicle}
                progress={uploadProgress.vehicle}
                disabled={isLocked}
                onUpload={(f) => handleFileUpload("vehicle", f)}
                onRemove={() => handleRemoveDoc("vehicle")}
              />

              {/* Insurance Document - Always show for existing drivers */}
              <DocumentCard
                title="Insurance Document"
                description="Valid insurance certificate (Required)"
                image={driverInfo.insuranceDocument}
                uploading={uploading.insurance}
                progress={uploadProgress.insurance}
                disabled={isLocked}
                onUpload={handleInsuranceUpload}
                onRemove={() => handleRemoveDoc("insurance")}
              />

              {/* Registration Document - Always show for existing drivers */}
              <DocumentCard
                title="Registration Document"
                description="Vehicle registration certificate (Required)"
                image={driverInfo.registrationDocument}
                uploading={uploading.registration}
                progress={uploadProgress.registration}
                disabled={isLocked}
                onUpload={handleRegistrationUpload}
                onRemove={() => handleRemoveDoc("registration")}
              />

              {/* Expiry Dates Section */}
              <motion.div className="upload-card" style={{ background: '#f8f9fa', padding: '20px' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h3>📅 Document Expiry Dates</h3>
                <div style={{ display: 'grid', gap: '15px', marginTop: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>License Expiry</label>
                    <input
                      type="date"
                      value={expiryDates.license}
                      onChange={(e) => setExpiryDates({ ...expiryDates, license: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      disabled={isLocked}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                    {driverInfo.licenseExpiryDate && (
                      <small style={{ color: '#666' }}>Current: {new Date(driverInfo.licenseExpiryDate).toLocaleDateString()}</small>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Insurance Expiry</label>
                    <input
                      type="date"
                      value={expiryDates.insurance}
                      onChange={(e) => setExpiryDates({ ...expiryDates, insurance: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      disabled={isLocked}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                    {driverInfo.insuranceExpiryDate && (
                      <small style={{ color: '#666' }}>Current: {new Date(driverInfo.insuranceExpiryDate).toLocaleDateString()}</small>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>Registration Expiry</label>
                    <input
                      type="date"
                      value={expiryDates.registration}
                      onChange={(e) => setExpiryDates({ ...expiryDates, registration: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      disabled={isLocked}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                    {driverInfo.registrationExpiryDate && (
                      <small style={{ color: '#666' }}>Current: {new Date(driverInfo.registrationExpiryDate).toLocaleDateString()}</small>
                    )}
                  </div>
                </div>
                {!isLocked && (
                  <button onClick={handleUpdateExpiryDates} className="btn btn-primary" style={{ marginTop: '15px', width: '100%' }}>
                    Save Expiry Dates
                  </button>
                )}
              </motion.div>

              {/* Document Checklist */}
              <motion.div className="upload-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '20px' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h3 style={{ color: 'white' }}>✅ Document Checklist</h3>
                <div style={{ marginTop: '15px' }}>
                  {[
                    { label: 'License Photo', field: 'licenseImage' },
                    { label: 'Vehicle Photo', field: 'vehicleImage' },
                    { label: 'ID Proof', field: 'idProofImage' },
                    { label: 'Insurance Document', field: 'insuranceDocument' },
                    { label: 'Registration Document', field: 'registrationDocument' },
                  ].map(doc => (
                    <div key={doc.field} style={{
                      padding: '10px 15px',
                      margin: '8px 0',
                      borderRadius: '6px',
                      background: driverInfo[doc.field] ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                      borderLeft: `4px solid ${driverInfo[doc.field] ? '#4caf50' : '#ff9800'}`
                    }}>
                      {driverInfo[doc.field] ? '✅' : '⚠️'} {doc.label}
                    </div>
                  ))}
                  <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                    {[
                      { label: 'License Expiry Date', field: 'licenseExpiryDate' },
                      { label: 'Insurance Expiry Date', field: 'insuranceExpiryDate' },
                      { label: 'Registration Expiry Date', field: 'registrationExpiryDate' },
                    ].map(doc => (
                      <div key={doc.field} style={{
                        padding: '10px 15px',
                        margin: '8px 0',
                        borderRadius: '6px',
                        background: driverInfo[doc.field] ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                        borderLeft: `4px solid ${driverInfo[doc.field] ? '#4caf50' : '#ff9800'}`
                      }}>
                        {driverInfo[doc.field] ? '✅' : '⚠️'} {doc.label}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* SUBMIT BUTTON */}
              {!isApproved && (
                <button
                  className="btn btn-primary btn-block"
                  onClick={handleSubmitVerification}
                  disabled={isLocked || isSubmitting}
                  style={{
                    height: '50px',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    opacity: (isLocked || isSubmitting) ? 0.7 : 1,
                    cursor: (isLocked || isSubmitting) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSubmitting ? "Submitting..." : isLocked ? "Verification Pending" : "Submit for Verification"}
                </button>
              )}

              {isLocked && (
                <p style={{ marginTop: 10, color: "#555" }}>
                  🚫 Documents locked while awaiting admin review.
                </p>
              )}
            </motion.div>
          </div>

          {/* DRIVER INFO PANEL */}
          <motion.div className="info-section card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h3>Your Information</h3>
            <Info label="Name" value={driverInfo.name} />
            <Info label="Email" value={driverInfo.email} />
            <Info label="Phone" value={driverInfo.phone} />
            <Info label="License Number" value={driverInfo.licenseNo || "Not provided"} />

            <h3 style={{ marginTop: 20 }}>Vehicle Details</h3>
            <Info label="Company" value={driverInfo.vehicleDetails?.make || "N/A"} />
            <Info label="Model" value={driverInfo.vehicleDetails?.model || "N/A"} />
            <Info label="Year" value={driverInfo.vehicleDetails?.year || "N/A"} />
            <Info label="Color" value={driverInfo.vehicleDetails?.color || "N/A"} />
            <Info label="Plate" value={driverInfo.vehicleDetails?.plateNo || "N/A"} />
          </motion.div>
        </div>
      </div>
    </div>
  );
};

/* ---------------------------------------------------
   SUB COMPONENTS
---------------------------------------------------- */
const DocumentCard = ({
  title,
  description,
  image,
  uploading,
  progress,
  disabled,
  onUpload,
  onRemove,
}) => {
  const inputId = `upload-${title.replace(/\s+/g, "")}`;

  return (
    <div className="document-card">
      <div className="document-header">
        <h4>{title}</h4>
        <p>{description}</p>
      </div>

      {image ? (
        <div className="document-preview">
          <img src={image.startsWith('http') ? image : `http://localhost:5000${image}`} alt={title} className="document-img" />

          {!disabled && (
            <button
              className="btn btn-danger btn-sm mt-1"
              onClick={onRemove}
            >
              Remove
            </button>
          )}
        </div>
      ) : (
        <div className="document-upload">
          <input
            type="file"
            id={inputId}
            accept="image/*,.pdf"
            onChange={(e) => onUpload(e.target.files[0])}
            disabled={disabled || uploading}
          />
          <label htmlFor={inputId} className="btn btn-primary">
            {uploading ? "Uploading…" : "Upload"}
          </label>

          {uploading && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <span>{progress}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Info = ({ label, value }) => (
  <div className="info-item">
    <label>{label}</label>
    <div className="info-value">{value}</div>
  </div>
);

export default DriverVerification;
