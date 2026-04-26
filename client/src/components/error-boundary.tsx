import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isDynamicImportError } from "@/lib/lazy-with-reload";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface ErrorInfo {
  componentStack: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for debugging
    console.error("Error Boundary caught:", error, errorInfo);
    
    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Send to error tracking service like Sentry
      // logErrorToService(error, errorInfo);
    }
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDevelopment = process.env.NODE_ENV === 'development';
      const errorMessage = this.state.error?.message || "An unexpected error occurred";
      const isAppUpdateError = isDynamicImportError(this.state.error);
      
      // Determine error type and provide user-friendly message
      let userFriendlyMessage = "Something went wrong while loading this page.";
      let actionMessage = "We've been notified and are working to fix it.";
      
      if (isAppUpdateError) {
        userFriendlyMessage = "Rainmaker was updated while this browser tab was open.";
        actionMessage = "Refresh this page to load the latest version.";
      } else if (errorMessage.includes("Network") || errorMessage.includes("fetch")) {
        userFriendlyMessage = "Unable to connect to the server.";
        actionMessage = "Please check your internet connection and try again.";
      } else if (errorMessage.includes("404")) {
        userFriendlyMessage = "The requested page or resource was not found.";
        actionMessage = "It might have been moved or deleted.";
      } else if (errorMessage.includes("401") || errorMessage.includes("403") || errorMessage.includes("Unauthorized")) {
        userFriendlyMessage = "You don't have permission to access this page.";
        actionMessage = "Please log in again or contact support if you believe this is an error.";
      } else if (errorMessage.includes("500") || errorMessage.includes("Internal Server Error")) {
        userFriendlyMessage = "Our servers encountered an error.";
        actionMessage = "Please try again in a few moments.";
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <Card className="max-w-2xl w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 text-red-500">
                <AlertTriangle className="h-full w-full" />
              </div>
              <CardTitle className="text-2xl font-bold">Oops! Something went wrong</CardTitle>
              <CardDescription className="text-lg mt-2">
                {userFriendlyMessage}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <Alert>
                <AlertTitle>What happened?</AlertTitle>
                <AlertDescription>
                  {actionMessage}
                </AlertDescription>
              </Alert>

              {isDevelopment && this.state.error && (
                <Alert className="bg-red-50 border-red-200">
                  <Bug className="h-4 w-4" />
                  <AlertTitle>Developer Information</AlertTitle>
                  <AlertDescription>
                    <details className="mt-2">
                      <summary className="cursor-pointer font-medium">
                        Error Details (Development Mode)
                      </summary>
                      <div className="mt-2 space-y-2">
                        <div className="p-2 bg-gray-100 rounded text-xs font-mono overflow-auto">
                          <strong>Error:</strong> {this.state.error.message}
                        </div>
                        {this.state.error.stack && (
                          <div className="p-2 bg-gray-100 rounded text-xs font-mono overflow-auto max-h-48">
                            <strong>Stack Trace:</strong>
                            <pre>{this.state.error.stack}</pre>
                          </div>
                        )}
                        {this.state.errorInfo && (
                          <div className="p-2 bg-gray-100 rounded text-xs font-mono overflow-auto max-h-48">
                            <strong>Component Stack:</strong>
                            <pre>{this.state.errorInfo.componentStack}</pre>
                          </div>
                        )}
                      </div>
                    </details>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  onClick={this.handleReset}
                  className="flex items-center gap-2"
                  data-testid="button-retry-error"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
                <Button 
                  variant="outline" 
                  onClick={this.handleGoHome}
                  className="flex items-center gap-2"
                  data-testid="button-go-home"
                >
                  <Home className="h-4 w-4" />
                  Go to Homepage
                </Button>
              </div>
              
              <div className="text-center text-sm text-gray-500 pt-4 border-t">
                <p>If this problem persists, please contact support with error code:</p>
                <code className="bg-gray-100 px-2 py-1 rounded mt-1 inline-block">
                  {new Date().toISOString()}-{Math.random().toString(36).substr(2, 9)}
                </code>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
