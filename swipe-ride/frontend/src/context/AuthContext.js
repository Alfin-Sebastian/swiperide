import React, { createContext, useState, useContext, useEffect } from "react";
import api from "../services/api";
import { useSocket } from "./SocketContext";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const socket = useSocket();   // safe because provider order = Option A

  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [loading, setLoading] = useState(true);

  /* --------------------------------------------------
      LOAD USER ON APP START
  ---------------------------------------------------- */
  useEffect(() => {
    const loadUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get("/users/profile");

        // ensure availability is preserved after refresh
        setUser({
          ...response.data,
          availability: response.data.availability ?? false,
        });

      } catch (error) {
        console.log("Auth load failed:", error);
        localStorage.removeItem("token");
        setToken(null);
      }

      setLoading(false);
    };

    loadUser();
  }, [token]);

  /* --------------------------------------------------
      SOCKET VERIFICATION UPDATES
  ---------------------------------------------------- */
  useEffect(() => {
    if (!socket || !user) return;

    const handleVerification = async () => {
      console.log("Verification event received → refreshing user...");
      await refreshUser();
    };

    socket.on("verification-updated", handleVerification);
    socket.on("verification-update", handleVerification);

    return () => {
      socket.off("verification-updated", handleVerification);
      socket.off("verification-update", handleVerification);
    };
  }, [socket, user]);

  /* --------------------------------------------------
      REFRESH USER PROFILE
  ---------------------------------------------------- */
  const refreshUser = async () => {
    try {
      const response = await api.get("/users/profile");
      setUser({
        ...response.data,
        availability: response.data.availability ?? false,
      });
    } catch (error) {
      console.log("Failed to refresh user:", error);
    }
  };

  /* --------------------------------------------------
      LOGIN
  ---------------------------------------------------- */
  const login = async (email, password) => {
    try {
      const response = await api.post("/auth/login", { email, password });

      const { token, user } = response.data;

      localStorage.setItem("token", token);
      setToken(token);

      // keep availability persistent
      setUser({
        ...user,
        availability: user.availability ?? false,
      });

      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Login failed",
      };
    }
  };

  /* --------------------------------------------------
      REGISTER
  ---------------------------------------------------- */
  const register = async (userData) => {
    try {
      const response = await api.post("/auth/register", userData);

      const { token, user } = response.data;

      localStorage.setItem("token", token);
      setToken(token);

      setUser({
        ...user,
        availability: false,
      });

      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Registration failed",
      };
    }
  };

  /* --------------------------------------------------
      UPDATE PROFILE
  ---------------------------------------------------- */
  const updateProfile = async (profileData) => {
    try {
      const response = await api.put("/users/profile", profileData);

      setUser({
        ...response.data.user,
        availability: response.data.user.availability ?? user.availability,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Update failed",
      };
    }
  };

  /* --------------------------------------------------
      LOGOUT
  ---------------------------------------------------- */
  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        token,
        login,
        register,
        logout,
        updateProfile,
        refreshUser,
        setUser, // useful when updating availability live
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
