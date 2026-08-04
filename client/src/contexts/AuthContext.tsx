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
  getAuthToken,
} from '@/lib/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (name: string, email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
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
    const initializeAuth = async () => {
      const token = getAuthToken();
      const storedUser = getStoredUser();
      
      console.log('[AuthContext] Initializing auth:', { 
        hasToken: !!token, 
        hasStoredUser: !!storedUser,
        tokenLength: token?.length 
      });
      
      // Only proceed if we have both token and user
      if (token && storedUser) {
        // Set user optimistically for better UX (prevents redirect during verification)
        setUser(storedUser);
        console.log('[AuthContext] Set user optimistically, verifying token...');
        
        // Verify token is still valid
        try {
          const freshUser = await authApi.getMe();
          console.log('[AuthContext] Token verification successful', {
            user: freshUser.username,
            notion_api_key_configured: freshUser.notion_api_key_configured
          });
          setUser(freshUser);
          setStoredUser(freshUser);
        } catch (e) {
          // Only clear auth state if token is actually invalid (401)
          // For other errors (network, server issues), keep user logged in
          const isUnauthorized = e instanceof ApiClientError && e.isUnauthorized;
          const isNetworkError = e instanceof TypeError || (e instanceof Error && e.message.includes('fetch'));
          
          console.log('[AuthContext] Token verification error:', {
            isUnauthorized,
            isNetworkError,
            errorType: e instanceof ApiClientError ? 'ApiClientError' : e?.constructor?.name,
            status: e instanceof ApiClientError ? e.status : undefined,
            message: e instanceof Error ? e.message : String(e)
          });
          
          if (isUnauthorized) {
            console.error('[AuthContext] Token is invalid (401) - clearing auth state');
            clearAuthToken();
            setUser(null);
          } else {
            // For network errors, server errors, etc., keep the user logged in
            console.warn('[AuthContext] Non-critical error during token verification - keeping user logged in');
            // User stays logged in with stored data - don't clear anything
          }
        } finally {
          setIsLoading(false);
        }
      } else {
        // No token or user, clear any stale data
        console.log('[AuthContext] No token or user found');
        if (storedUser && !token) {
          console.log('[AuthContext] Clearing stale user data (no token)');
          clearAuthToken();
        }
        setUser(null);
        setIsLoading(false);
      }
    };
    
    initializeAuth();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await authApi.login({ username, password });
      // Set token and user synchronously before anything else
      setAuthToken(response.access_token, response.refresh_token);
      setStoredUser(response.user);
      setUser(response.user);
      // Small delay to ensure state propagation
      await new Promise(resolve => setTimeout(resolve, 50));
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
      setAuthToken(response.access_token, response.refresh_token);
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

  const refreshUser = useCallback(async () => {
    try {
      const updatedUser = await authApi.getMe();
      setUser(updatedUser);
      setStoredUser(updatedUser);
      console.log('[AuthContext] User refreshed:', { 
        notion_api_key_configured: updatedUser.notion_api_key_configured 
      });
    } catch (e) {
      // If refresh fails, user might be logged out
      console.error('[AuthContext] Failed to refresh user:', e);
      // Don't clear auth state on refresh failure - might be temporary network issue
    }
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
        refreshUser,
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

