import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { useLocation } from "wouter";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { showError, ERROR_MESSAGES, parseError } from "@/lib/error-utils";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [hasTimedOut, setHasTimedOut] = useState(false);
  
  const {
    data: user,
    error,
    isLoading,
    isError,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: async ({ queryKey, signal }) => {
      try {
        // Create a timeout promise that rejects after 5 seconds
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error(ERROR_MESSAGES.NETWORK_TIMEOUT));
          }, 5000);
          
          // Clean up timeout if signal aborts
          signal?.addEventListener('abort', () => clearTimeout(timeoutId));
        });
        
        // Race between the actual fetch and timeout
        const fetchPromise = fetch(queryKey[0] as string, {
          credentials: "include",
          signal,
        });
        
        const res = await Promise.race([fetchPromise, timeoutPromise]) as Response;
        
        // Handle 401 by returning null (user not authenticated)
        if (res.status === 401) {
          return null;
        }
        
        // Handle other non-ok responses
        if (!res.ok) {
          let errorMessage = res.statusText;
          try {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const errorData = await res.json();
              errorMessage = errorData.message || errorData.error || res.statusText;
            }
          } catch {
            // Use status text if can't parse JSON
          }
          throw new Error(errorMessage);
        }
        
        return await res.json();
      } catch (error: any) {
        // Check if offline
        if (!navigator.onLine) {
          throw new Error(ERROR_MESSAGES.NETWORK_OFFLINE);
        }
        
        // Check if timeout
        if (error.message === ERROR_MESSAGES.NETWORK_TIMEOUT) {
          console.error('Authentication check timed out after 5 seconds');
          setHasTimedOut(true);
        }
        
        throw error;
      }
    },
    retry: false, // Don't retry auth queries
    staleTime: 0, // Always check fresh auth status
    gcTime: 0, // Don't cache auth status
  });
  
  // Handle timeout and error states
  useEffect(() => {
    if (hasTimedOut || (isError && error?.message === ERROR_MESSAGES.NETWORK_TIMEOUT)) {
      toast({
        title: "Connection timeout",
        description: "Unable to verify authentication. Please refresh the page or login again.",
        variant: "destructive",
      });
    } else if (isError && !hasTimedOut) {
      const errorMessage = error?.message || "Authentication check failed";
      if (!errorMessage.includes('401')) { // Don't show error for normal 401s
        toast({
          title: "Authentication error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
  }, [isError, error, hasTimedOut, toast]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      try {
        const res = await apiRequest("POST", "/api/login", credentials);
        return await res.json();
      } catch (error: any) {
        // Handle specific authentication errors
        if (error instanceof ApiError) {
          if (error.statusCode === 401) {
            throw new Error(ERROR_MESSAGES.AUTH_INVALID_CREDENTIALS);
          }
          if (error.statusCode === 429) {
            throw new Error("Too many login attempts. Please try again later.");
          }
        }
        throw error;
      }
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Welcome back!",
        description: "Successfully logged in.",
      });
      // Navigate to homepage after successful login
      setLocation("/");
    },
    onError: (error: Error) => {
      const appError = parseError(error);
      toast({
        title: "Login failed",
        description: appError.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      try {
        const res = await apiRequest("POST", "/api/register", credentials);
        return await res.json();
      } catch (error: any) {
        // Handle specific registration errors
        if (error instanceof ApiError) {
          if (error.statusCode === 409) {
            throw new Error("An account with this username already exists. Please choose a different username.");
          }
          if (error.statusCode === 400 && error.details?.errors) {
            // Parse validation errors
            const validationMessages = error.details.errors.map((err: any) => 
              err.message || err
            ).join(", ");
            throw new Error(validationMessages);
          }
        }
        throw error;
      }
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Account created!",
        description: "Successfully registered and logged in.",
      });
      // Navigate to homepage after successful registration
      setLocation("/");
    },
    onError: (error: Error) => {
      const appError = parseError(error);
      toast({
        title: "Registration failed",
        description: appError.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        await apiRequest("POST", "/api/logout");
      } catch (error: any) {
        // Logout should rarely fail, but handle it gracefully
        console.error("Logout error:", error);
        // Even if logout fails on server, clear local state
        throw new Error("Failed to complete logout. You may need to refresh the page.");
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear(); // Clear all cached data on logout
      toast({
        title: "Logged out",
        description: "Successfully logged out.",
      });
      // Router will handle redirect to auth page automatically
    },
    onError: (error: Error) => {
      // Clear local auth state even if server logout fails
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: "Logout warning",
        description: error.message,
        variant: "destructive",
      });
      // Router will handle redirect to auth page automatically
    },
  });

  // Determine effective loading state - stop loading if timed out or errored
  const effectiveIsLoading = isLoading && !hasTimedOut && !isError;
  
  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading: effectiveIsLoading,
        error: (hasTimedOut || isError) ? error : null,
        isAuthenticated: !!user,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}