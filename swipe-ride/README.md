# SwipeRide: Ride Sharing Platform

SwipeRide is a full-stack ride-sharing web application built with the MERN stack. It connects passengers and drivers through an online booking system, with real-time updates, in-app chat, and safety features such as an SOS alert with audio recording.

> Major project for BCA (2023-2026), Kristu Jyothi College of Management and Technology, MG University.

## Features

- **Three user roles:** passenger, driver, and admin, each with its own dashboard
- **Authentication:** secure registration and login with JWT
- **Ride lifecycle:** request, driver acceptance, start (OTP verified), and completion, with live status tracking
- **Swipe Match:** passengers can browse and choose a preferred driver
- **Real-time updates:** ride status, notifications, and driver live location using Socket.IO
- **In-app messaging:** chat between passenger and driver
- **SOS emergency alert:** sends an alert and records audio during a ride
- **Driver verification:** drivers upload documents for admin review
- **Admin tools:** user management, ride monitoring, verifications, SOS monitoring, reports, and analytics charts
- **Ratings and reports:** passengers can rate rides and report issues
- **Payments:** UPI QR code generation for fares
- **Maps:** pickup and destination selection using Leaflet

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 18, React Router, Axios, Socket.IO Client, Leaflet, Chart.js, Framer Motion |
| Backend | Node.js, Express, Socket.IO, JWT, bcryptjs, Multer |
| Database | MongoDB with Mongoose |
| Storage | AWS S3 |

## Project Structure

```
swipe-ride/
├── backend/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── scripts/
│   ├── utils/
│   └── server.js
└── frontend/
    ├── public/
    └── src/
        ├── components/
        ├── context/
        ├── pages/      (admin, driver, passenger, public, shared)
        └── services/
```

## Getting Started

### Prerequisites

- Node.js 18 or later
- A MongoDB database (local or MongoDB Atlas)
- An AWS S3 bucket (for file uploads)

### 1. Clone the repository

```bash
git clone https://github.com/Alfin-Sebastian/swipe-ride.git
cd swipe-ride
```

### 2. Set up the backend

```bash
cd backend
npm install
cp .env.example .env     # then fill in your own values
npm run dev
```

### 3. Set up the frontend

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

The frontend runs on `http://localhost:3000` and the backend on `http://localhost:5000`.

### 4. Create an admin account

The backend includes a script for this: `backend/scripts/createAdmin.js`.

## Environment Variables

Copy `backend/.env.example` and `frontend/.env.example` and fill in your own values. Never commit real `.env` files.

## Author

**Alfin Sebastian**
[LinkedIn](https://linkedin.com/in/alfin-sebastian-049390300) | [GitHub](https://github.com/Alfin-Sebastian)
