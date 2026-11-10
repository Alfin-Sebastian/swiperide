import React, { createContext, useContext, useEffect, useState } from "react";
import io from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext();
export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // No user → no socket connection
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // Create socket connection
    const newSocket = io(process.env.REACT_APP_SOCKET_URL, {
      transports: ["websocket", "polling"],
    });

    setSocket(newSocket);

    /* ---------------------------------------------------------
       On Connect
    ----------------------------------------------------------- */
    newSocket.on("connect", () => {
      const roomId = user._id || user.id;

      // Join user room (passenger / driver / admin)
      newSocket.emit("join-user", roomId);
      console.log("🟢 Socket connected, joined user room:", roomId);

      // If DRIVER → notify backend for Smart Match
      if (user.role === "driver") {
        newSocket.emit("driver-online", roomId);
        console.log("🚗 Driver online event sent:", roomId);
      }
    });

    /* ---------------------------------------------------------
       SMART MATCH: Driver receives Smart Ride Request
    ----------------------------------------------------------- */
    newSocket.on("smart-ride-request", (data) => {
      console.log("✨ SMART MATCH REQUEST RECEIVED:", data);
      // Save for UI popup
      window.dispatchEvent(new CustomEvent("smartRideRequest", { detail: data }));
    });

    /* ---------------------------------------------------------
       RIDE ACCEPTED EVENT (Passenger receives update)
    ----------------------------------------------------------- */
    newSocket.on("ride-accepted", (data) => {
      console.log("🎉 Ride accepted:", data);
      window.dispatchEvent(new CustomEvent("rideAccepted", { detail: data }));
    });

    /* ---------------------------------------------------------
       RIDE STATUS UPDATE EVENTS
    ----------------------------------------------------------- */
    newSocket.on("ride-status-update", (data) => {
      console.log("🚗 Ride status updated:", data);
      window.dispatchEvent(new CustomEvent("rideStatusUpdated", { detail: data }));
    });

    /* ---------------------------------------------------------
       CHAT MESSAGE EVENT
    ----------------------------------------------------------- */
    newSocket.on("new-message", (message) => {
      window.dispatchEvent(new CustomEvent("rideMessage", { detail: message }));
    });

    /* ---------------------------------------------------------
       Verification events
    ----------------------------------------------------------- */
    newSocket.on("verification-updated", (data) => {
      console.log("🔔 Verification updated:", data);
    });

    newSocket.on("verification-update", (data) => {
      console.log("🔔 Driver verification update:", data);
    });

    /* ---------------------------------------------------------
       Reconnect handling
    ----------------------------------------------------------- */
    newSocket.on("reconnect", () => {
      const roomId = user._id || user.id;
      newSocket.emit("join-user", roomId);

      if (user.role === "driver") {
        newSocket.emit("driver-online", roomId);
      }

      console.log("🔁 Reconnected and rejoined:", roomId);
    });

    return () => {
      newSocket.disconnect();
      console.log("🔴 Socket disconnected");
    };
  }, [user]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
