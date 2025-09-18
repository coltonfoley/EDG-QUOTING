import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "wouter";
import { LoadingSpinner } from "@/components/loading-spinner";
import { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

export function ProtectedRoute({ children, redirectTo = "/auth" }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, error } = useAuth();

  // Show loading spinner while auth is being checked
  if (isLoading) {
    return <LoadingSpinner fullScreen text="Verifying authentication..." />;
  }

  // If error occurred during auth check and user is not authenticated, redirect to login
  if ((error || !isAuthenticated) && !isLoading) {
    return <Redirect to={redirectTo} />;
  }

  // User is authenticated, render the protected content
  return <>{children}</>;
}