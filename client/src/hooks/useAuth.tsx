import React, { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
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
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

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
      // Redirect to homepage after successful login
      window.location.href = "/";
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
      // Redirect to homepage after successful registration
      window.location.href = "/";
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
      window.location.href = "/";
      toast({
        title: "Logged out",
        description: "Successfully logged out.",
      });
    },
    onError: (error: Error) => {
      // Clear local auth state even if server logout fails
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: "Logout warning",
        description: error.message,
        variant: "destructive",
      });
      // Still redirect after a delay
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
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