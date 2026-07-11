import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User as SelectUser } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ERROR_MESSAGES } from "@/lib/error-utils";

const AUTH_CHECK_FALLBACK = "Unable to verify authentication status. Please check your connection and try again.";

function safeAuthErrorMessage(value: unknown): string {
  if (typeof value !== "string") return AUTH_CHECK_FALLBACK;
  const message = value.trim();
  if (
    !message
    || message.length > 240
    || /<\/?(?:html|body|head|script)|<!doctype/i.test(message)
    || /unexpected token|json at position|syntaxerror/i.test(message)
  ) {
    return AUTH_CHECK_FALLBACK;
  }
  return message;
}

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  retryAuth: () => Promise<void>;
  dismissAuthError: () => void;
  logoutMutation: UseMutationResult<void, Error, void>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [authErrorDismissed, setAuthErrorDismissed] = useState(false);
  
  const {
    data: user,
    error,
    isLoading,
    isError,
    refetch,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: async ({ queryKey, signal }) => {
      try {
        const res = await fetch(queryKey[0] as string, {
          credentials: "include",
          signal,
        });
        
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
              errorMessage = safeAuthErrorMessage(errorData.message || errorData.error || res.statusText);
            }
          } catch {
            // Use status text if can't parse JSON
          }
          throw new Error(safeAuthErrorMessage(errorMessage));
        }
        
        return await res.json();
      } catch (error: any) {
        // Check if offline
        if (!navigator.onLine) {
          throw new Error(ERROR_MESSAGES.NETWORK_OFFLINE);
        }
        
        // Let React Query handle abort errors properly
        if (error.name === 'AbortError') {
          throw error;
        }
        
        throw error;
      }
    },
    retry: false, // Don't retry auth queries
    staleTime: 0, // Always check fresh auth status
    gcTime: 0, // Don't cache auth status
  });
  
  // Handle error states
  useEffect(() => {
    if (isError && error && !authErrorDismissed) {
      const errorMessage = error?.message || "Authentication check failed";
      // Don't show errors for 401s (normal unauthenticated state) or AbortErrors (normal cancellation)
      if (!errorMessage.includes('401') && error.name !== 'AbortError') {
        toast({
          title: "Authentication error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
  }, [isError, error, authErrorDismissed, toast]);

  const retryAuth = async () => {
    setAuthErrorDismissed(false);
    await refetch();
  };

  const dismissAuthError = () => {
    setAuthErrorDismissed(true);
  };

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

  // Determine effective loading state - stop loading if errored
  const effectiveIsLoading = isLoading && !isError;
  
  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading: effectiveIsLoading,
        error: isError && !authErrorDismissed ? error : null,
        isAuthenticated: !!user,
        retryAuth,
        dismissAuthError,
        logoutMutation,
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
