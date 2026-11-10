# SwipeRide: Ride Sharing Platform

SwipeRide is a full-stack ride-sharing web application built with the MERN stack. It connects passengers and drivers through an online booking system, with real-time updates, in-app chat, and safety features such as an SOS alert with audio recording.

> Major project for BCA (2023-2026), Kristu Jyothi College of Management and Technology, MG University.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [How to Use the App](#how-to-use-the-app)
- [Ride Lifecycle](#ride-lifecycle)
- [API Overview](#api-overview)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [What Changed in This Release](#what-changed-in-this-release)
- [Author](#author)

## Features

- **Three user roles:** passenger, driver, and admin, each with its own dashboard
- **Authentication:** registration and login secured with JWT and hashed passwords
- **Three ways to book:** Quick, Swipe Match (browse and pick a driver), and Smart Match (filtered by vehicle type)
- **Scheduled rides:** book a ride for a later time
- **Ride lifecycle:** request, accept, arrive, start, and complete, with live status tracking
- **Real-time updates:** ride status, notifications, and driver live location using Socket.IO
- **In-app messaging:** chat between passenger and driver
- **SOS emergency alert:** sends an alert and records audio during a ride
- **Guest tracking link:** share a ride with someone who does not have an account
- **Driver verification:** drivers upload documents, and an admin approves or rejects them
- **Payments:** UPI QR code generation or cash, confirmed by the driver
- **Ratings and reports:** passengers rate rides and report issues
- **Favorites and recents:** save favorite places and drivers
- **Admin tools:** user management, ride monitoring, verifications, SOS monitoring, reports, and analytics charts
- **Maps:** pickup and destination selection using Leaflet
- **Background jobs:** automatic cancellation of expired ride requests

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
│   ├── controllers/      request handlers
│   ├── middleware/       auth and file upload
│   ├── models/           Mongoose schemas (User, Ride, SOS, Message, ...)
│   ├── routes/           API routes
│   ├── services/         notification service
│   ├── scripts/          admin creation and database helpers
│   ├── utils/            payments, S3 config, cleanup jobs
│   └── server.js         app entry point
└── frontend/
    ├── public/
    └── src/
        ├── components/   shared UI (navbar, notifications, modals)
        ├── context/      auth and socket providers
        ├── pages/        admin, driver, passenger, public, shared
        └── services/     API client
```

## Getting Started

### Prerequisites

- Node.js 18 or later
- A MongoDB database (local or MongoDB Atlas)
- An AWS S3 bucket for file uploads

### 1. Clone the repository

```bash
git clone https://github.com/Alfin-Sebastian/swipe-ride.git
cd swipe-ride
```

### 2. Start the backend

```bash
cd backend
npm install
cp .env.example .env      # then fill in your own values
npm run dev               # development, with auto-restart
# or: npm start           # normal start
```

### 3. Start the frontend (in a second terminal)

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

The frontend runs at `http://localhost:3000` and the backend at `http://localhost:5000`.

### 4. Create the admin account

```bash
cd backend
node scripts/createAdmin.js
```

This creates a default admin so you can log in and approve drivers. **Open the script to see the default credentials and change the password straight after your first login.**

## Environment Variables

Copy each `.env.example` to `.env` and fill in your own values. Never commit a real `.env` file.

**backend/.env**

| Variable | Purpose |
| --- | --- |
| `PORT` | Port the API runs on (default 5000) |
| `NODE_ENV` | `development` or `production` |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random string used to sign login tokens |
| `AWS_ACCESS_KEY_ID` | AWS access key for S3 uploads |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for S3 uploads |
| `AWS_REGION` | Region of your S3 bucket |
| `AWS_BUCKET_NAME` | Name of your S3 bucket |

**frontend/.env**

| Variable | Purpose |
| --- | --- |
| `REACT_APP_API_URL` | Backend API base URL (e.g. `http://localhost:5000/api`) |
| `REACT_APP_SOCKET_URL` | Socket.IO server URL (e.g. `http://localhost:5000`) |

## How to Use the App

### Passenger

1. Open the app and choose **Register**, then pick the **Passenger** role.
2. Log in and open the passenger home screen.
3. Set your pickup and destination on the map.
4. Choose how to book:
   - **Quick:** the request goes to available drivers.
   - **Swipe Match:** browse nearby drivers and swipe to pick one.
   - **Smart Match:** filter by vehicle type (Sedan, SUV, Hatchback, Van, Luxury).
5. Follow your driver on the ride screen and use the chat if you need to talk to them.
6. Pay by UPI (scan the QR code) or cash. The driver confirms the payment.
7. Rate the ride afterwards. Your past trips are in **History**.

**Safety:** during a ride, use the **SOS** button to alert admins and record audio. You can also share the guest tracking link (`/tracking/<rideId>`) with someone you trust.

### Driver

1. Register with the **Driver** role and enter your license number and vehicle details.
2. Go to **Verification** and upload your documents. An admin must approve you before you can take rides.
3. Once approved, switch your availability to online on the driver home screen.
4. Accept or reject incoming requests, then update the ride status as the trip progresses.
5. For UPI payments, confirm that the payment has arrived.

### Admin

1. Log in with the admin account.
2. **Verifications:** review driver documents and approve or reject them.
3. **Users:** view users and activate or suspend accounts.
4. **Rides:** monitor active and past rides.
5. **SOS:** watch active alerts, listen to recordings, and mark alerts resolved.
6. **Reports:** review issues submitted by users.
7. **Analytics:** view charts for ride activity and busy areas.

## Ride Lifecycle

```
requested (or scheduled) -> accepted -> arrived -> in_progress -> completed
                                    \-> cancelled (by passenger, driver, or system)
```

Requests that no driver accepts before they expire are cancelled automatically by a background job. An OTP check is used when the trip starts.

## API Overview

All routes are under `/api`. Protected routes need a JWT in the `Authorization` header.

| Area | Example endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login` |
| Rides | `POST /rides/request`, `GET /rides/available`, `POST /rides/:id/accept`, `POST /rides/:id/status`, `POST /rides/:id/cancel`, `POST /rides/:id/rate`, `GET /rides/:id/payment-qr` |
| SOS | `POST /sos/trigger`, `POST /sos/:id/recording`, `POST /sos/:id/resolve`, `GET /sos/active` |
| Users | `GET/PUT /users/profile`, `POST /users/submit-verification`, `GET /users/drivers/available`, `GET /users/favorites` |
| Admin | `GET /admin/dashboard`, `GET /admin/verifications`, `POST /admin/verifications/:driverId/update`, `GET /admin/analytics` |
| Messages | `/messages` routes for chat |

Real-time events (Socket.IO) include `join-user`, `join-ride`, `join-chat`, `driver-online`, and `location-update`.

## Security Notes

- Do not commit `.env` files. Use the `.env.example` files as a template.
- `backend/uploads/` is excluded from the repository because it holds personal documents (ID proofs, licenses, photos) and SOS recordings.
- The admin script creates a default account. Change that password immediately, and do not run it with the default password on a public deployment.
- If a secret was ever shared or committed by mistake, rotate it (AWS keys, database password, JWT secret).
- For production, restrict CORS to your own domain.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Backend cannot connect to the database | Check `MONGODB_URI`, your network access list in MongoDB Atlas, and your internet or DNS |
| Frontend cannot reach the API | Make sure the backend is running and `REACT_APP_API_URL` is correct |
| Live updates or tracking do not work | Check `REACT_APP_SOCKET_URL` and that the backend is running |
| Uploads fail | Check the four `AWS_` variables and the S3 bucket permissions |
| SOS recordings fail to save | Create the folders `backend/uploads/documents` and `backend/uploads/recordings` |
| Driver cannot receive rides | The driver must be approved by an admin and set to online |

## What Changed in This Release

This is the first GitHub release, prepared from the original project folder.

**Added**
- `README.md` with setup, usage, and documentation
- `.gitignore` for dependencies, secrets, build output, and uploads
- `backend/.env.example` and `frontend/.env.example`
- `CHANGELOG.md`

**Removed from the repository (not deleted from the app)**
- `backend/.env` and `frontend/.env` (real secrets and local settings)
- `backend/uploads/` (user documents and SOS recordings)
- `node_modules/` and `frontend/build/` (re-created by `npm install` and `npm run build`)

No application source code was modified.

## Author

**Alfin Sebastian**
[LinkedIn](https://linkedin.com/in/alfin-sebastian-049390300) | [GitHub](https://github.com/Alfin-Sebastian)
