// src/pages/passenger/PassengerRateRide.js
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { rideService } from "../../services/api";
import ReportModal from "../../components/Common/ReportModal";

const PassengerRateRide = () => {
  const { rideId } = useParams();
  const navigate = useNavigate();

  const [ride, setRide] = useState(null);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Load ride details
  useEffect(() => {
    const loadRide = async () => {
      try {
        const res = await rideService.getRide(rideId);
        const r = res.data;

        // 🚫 Prevent rating if ride not completed
        if (r.status !== "completed") {
          alert("You can rate only after the ride is completed.");
          navigate(`/passenger/ride/${rideId}`);
          return;
        }

        setRide(r);

        // ✅ If already rated
        if (r.passengerRating) {
          setRating(r.passengerRating);
          setReview(r.passengerReview || r.notes || "");
        }
      } catch (err) {
        console.error("Failed to load ride:", err);
        alert("Ride not found");
        navigate("/passenger");
      } finally {
        setLoading(false);
      }
    };

    loadRide();
  }, [rideId, navigate]);

  // Submit rating
  const submitRating = async () => {
    if (!rating) {
      alert("Please select a rating");
      return;
    }

    setSubmitting(true);
    try {
      await rideService.rateRide(rideId, {
        rating,
        review
      });

      alert("Thanks for your feedback!");
      navigate(`/passenger/ride/${rideId}`);
    } catch (err) {
      console.error("Rating failed:", err);
      alert("Unable to submit rating");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading-rating">Loading...</div>;

  return (
    <div className="rate-ride-page">
      <div className="rate-container">
        <h2>Rate Your Ride</h2>

        <p>
          Ride #{String(rideId).slice(-6).toUpperCase()} with{" "}
          <strong>{ride?.driver?.name || "Driver"}</strong>
        </p>

        {/* ⭐ Rating stars */}
        <div className="rating-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`star ${rating >= n ? "filled" : ""}`}
              onClick={() => !ride?.passengerRating && setRating(n)}
              style={{ cursor: ride?.passengerRating ? "not-allowed" : "pointer" }}
            >
              ★
            </span>
          ))}
        </div>

        {/* ✍️ Review */}
        <textarea
          className="review-box"
          placeholder="Write a review (optional)..."
          value={review}
          disabled={!!ride?.passengerRating}
          onChange={(e) => setReview(e.target.value)}
        />

        <div className="rate-actions" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
          {!ride?.passengerRating && (
            <button
              className="btn btn-primary submit-rating"
              onClick={submitRating}
              disabled={submitting}
            >
              {submitting ? "Submitting..." : "Submit Rating"}
            </button>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-outline"
              style={{ flex: 1 }}
              onClick={() => navigate(`/passenger/ride/${rideId}`)}
            >
              Back to Details
            </button>
            <button
              className="btn btn-outline btn-danger"
              style={{ flex: 1, color: '#dc3545', borderColor: '#dc3545' }}
              onClick={() => setShowReportModal(true)}
            >
              🚩 Report Issue
            </button>
          </div>
        </div>
      </div>

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        reportedUser={ride?.driver}
        rideId={rideId}
      />
    </div>
  );
};

export default PassengerRateRide;
