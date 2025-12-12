'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  User, 
  authApi, 
  setAuthToken, 
  clearAuthToken, 
  getStoredUser,
  setStoredUser,
  ApiClientError,
} from '@/lib/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (name: string, email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser) {
      setUser(storedUser);
      // Verify token is still valid
      authApi.getMe()
        .then(user => {
          setUser(user);
          setStoredUser(user);
        })
        .catch(() => {
          // Token invalid, clear everything
          clearAuthToken();
          setUser(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await authApi.login({ username, password });
      setAuthToken(response.access_token);
      setStoredUser(response.user);
      setUser(response.user);
    } catch (e) {
      const message = e instanceof ApiClientError 
        ? e.message 
        : 'An unexpected error occurred';
      setError(message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(async (
    name: string,
    email: string,
    username: string,
    password: string
  ) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await authApi.signup({ name, email, username, password });
      setAuthToken(response.access_token);
      setStoredUser(response.user);
      setUser(response.user);
    } catch (e) {
      const message = e instanceof ApiClientError 
        ? e.message 
        : 'An unexpected error occurred';
      setError(message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

