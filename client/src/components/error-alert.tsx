import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home, HelpCircle } from "lucide-react";
import { parseError, getErrorRecoveryAction, ErrorType } from "@/lib/error-utils";

interface ErrorAlertProps {
  error: any;
  onRetry?: () => void;
  onClose?: () => void;
  title?: string;
  className?: string;
}

export function ErrorAlert({ error, onRetry, onClose, title, className = "" }: ErrorAlertProps) {
  const appError = parseError(error);
  const recoveryAction = getErrorRecoveryAction(error);
  
  // Determine icon and color based on error type
  const getAlertVariant = () => {
    switch (appError.type) {
      case ErrorType.AUTHENTICATION:
      case ErrorType.AUTHORIZATION:
        return "destructive";
      case ErrorType.NETWORK:
        return "default";
      case ErrorType.VALIDATION:
        return "default";
      default:
        return "destructive";
    }
  };
  
  const getIcon = () => {
    switch (appError.type) {
      case ErrorType.NETWORK:
        return <RefreshCw className="h-4 w-4" />;
      case ErrorType.NOT_FOUND:
        return <HelpCircle className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };
  
  return (
    <Alert variant={getAlertVariant()} className={`mb-4 ${className}`}>
      {getIcon()}
      <AlertTitle>{title || "Error"}</AlertTitle>
      <AlertDescription>
        <p className="mb-3">{appError.message}</p>
        
        {appError.details && process.env.NODE_ENV === 'development' && (
          <details className="mb-3">
            <summary className="cursor-pointer text-sm font-medium">Technical Details</summary>
            <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
              {appError.details}
            </pre>
          </details>
        )}
        
        <div className="flex gap-2">
          {appError.retryable && onRetry && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={onRetry}
              data-testid="button-retry-error"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          )}
          
          {recoveryAction && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={recoveryAction}
              data-testid="button-recover-error"
            >
              {appError.type === ErrorType.AUTHENTICATION ? "Log In" : "Recover"}
            </Button>
          )}
          
          {onClose && (
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={onClose}
              data-testid="button-close-error"
            >
              Dismiss
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

interface InlineErrorProps {
  error: any;
  className?: string;
}

export function InlineError({ error, className = "" }: InlineErrorProps) {
  const appError = parseError(error);
  
  return (
    <div className={`text-sm text-red-600 mt-1 ${className}`}>
      <span className="font-medium">Error: </span>
      {appError.message}
    </div>
  );
}

export function PageLoadError({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Alert variant="destructive" role="alert" data-testid="page-load-error">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p className="mb-4">{description}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry} data-testid="button-retry-page-load">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Try Again
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  );
}
