import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { parseError, isAuthError, isNetworkError, ERROR_MESSAGES } from "./error-utils";

export class ApiError extends Error {
  statusCode: number;
  details?: any;
  
  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorDetails: any;
    let errorMessage = res.statusText;
    
    try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        errorDetails = await res.json();
        errorMessage = errorDetails.message || errorDetails.error || res.statusText;
      } else {
        errorMessage = await res.text() || res.statusText;
      }
    } catch {
      // If parsing fails, use the status text
      errorMessage = res.statusText;
    }
    
    throw new ApiError(res.status, errorMessage, errorDetails);
  }
}

export class NavigationAbortError extends Error {
  constructor(message = 'Request cancelled due to navigation') {
    super(message);
    this.name = 'NavigationAbortError';
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { timeout?: number; signal?: AbortSignal; headers?: Record<string, string> },
): Promise<Response> {
  // Handle FormData differently - don't set Content-Type and don't stringify
  const isFormData = data instanceof FormData;
  
  // Track timeout state to distinguish timeout vs navigation aborts
  let timeoutId: number | undefined;
  let didTimeout = false;
  const timeoutMs = options?.timeout || 30000;
  
  // Create abort controller that combines external signal with timeout
  const controller = new AbortController();
  
  // Set up timeout
  timeoutId = window.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  
  // Listen to external signal (from React Query or component unmount)
  if (options?.signal) {
    options.signal.addEventListener('abort', () => {
      controller.abort();
    }, { once: true });
  }
  
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(isFormData ? {} : (data ? { "Content-Type": "application/json" } : {})),
        ...options?.headers,
      },
      body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
      credentials: "include",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    await throwIfResNotOk(res);
    return res;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // Handle abort errors
    if (error.name === 'AbortError') {
      // If it was a timeout, throw timeout error
      if (didTimeout) {
        throw new Error(ERROR_MESSAGES.NETWORK_TIMEOUT);
      }
      // If it was navigation/unmount, throw navigation error (will be silenced)
      throw new NavigationAbortError();
    }
    
    // Handle offline
    if (!navigator.onLine) {
      throw new Error(ERROR_MESSAGES.NETWORK_OFFLINE);
    }
    
    // Re-throw other errors
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    try {
      const res = await fetch(queryKey[0] as string, {
        credentials: "include",
        signal, // Support query cancellation
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      const data = await res.json();
      return data;
    } catch (error: any) {
      // Handle network errors
      if (error.name === 'AbortError') {
        throw error; // Let React Query handle cancellation
      }
      
      // Handle auth errors specifically  
      if (isAuthError(error) && unauthorizedBehavior === "returnNull") {
        return null;
      }
      
      // Re-throw for React Query to handle
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error: any) => {
        // Don't retry auth errors
        if (isAuthError(error)) {
          return false;
        }
        
        // Don't retry validation errors
        if (error instanceof ApiError && error.statusCode === 400) {
          return false;
        }
        
        // Retry network errors up to 3 times
        if (isNetworkError(error) && failureCount < 3) {
          return true;
        }
        
        // Retry server errors once
        if (error instanceof ApiError && error.statusCode >= 500 && failureCount < 1) {
          return true;
        }
        
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: (failureCount, error: any) => {
        // Don't retry navigation aborts
        if (error instanceof NavigationAbortError) {
          return false;
        }
        
        // Don't retry auth or validation errors
        if (isAuthError(error) || (error instanceof ApiError && error.statusCode === 400)) {
          return false;
        }
        
        // Retry network and server errors once
        return failureCount < 1;
      },
      retryDelay: 1000,
      onError: (error: any) => {
        // Silently ignore navigation aborts (user navigated away)
        if (error instanceof NavigationAbortError) {
          return;
        }
        
        // Global mutation error handler
        const appError = parseError(error);
        
        // Handle authentication errors globally
        if (isAuthError(error)) {
          // Let the auth context handle redirection
          return;
        }
        
        // For other errors, they should be handled by individual mutations
        // This is just a fallback
        if (process.env.NODE_ENV === 'development') {
          console.error('Unhandled mutation error:', error);
        }
      },
    },
  },
});
