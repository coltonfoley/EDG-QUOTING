import { toast } from "@/hooks/use-toast";

export enum ErrorType {
  NETWORK = "NETWORK",
  VALIDATION = "VALIDATION", 
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  NOT_FOUND = "NOT_FOUND",
  SERVER = "SERVER",
  FILE_UPLOAD = "FILE_UPLOAD",
  PDF_GENERATION = "PDF_GENERATION",
  DATABASE = "DATABASE",
  UNKNOWN = "UNKNOWN"
}

export interface AppError {
  type: ErrorType;
  message: string;
  details?: string;
  statusCode?: number;
  field?: string; // For validation errors
  retryable?: boolean;
  action?: () => void; // Recovery action
}

// Error message templates for consistency
export const ERROR_MESSAGES = {
  // Network errors
  NETWORK_OFFLINE: "You appear to be offline. Please check your internet connection.",
  NETWORK_TIMEOUT: "The request took too long. Please try again.",
  NETWORK_GENERAL: "Unable to connect to the server. Please check your connection and try again.",
  
  // Authentication/Authorization
  AUTH_UNAUTHORIZED: "Your session has expired. Please log in again.",
  AUTH_FORBIDDEN: "You don't have permission to perform this action.",
  AUTH_INVALID_CREDENTIALS: "Invalid username or password. Please try again.",
  AUTH_SESSION_EXPIRED: "Your session has expired for security reasons. Please log in again.",
  
  // Resource errors
  RESOURCE_NOT_FOUND: "The requested item could not be found. It may have been deleted or moved.",
  QUOTE_NOT_FOUND: "This quote could not be found. It may have been deleted.",
  PRODUCT_NOT_FOUND: "This product could not be found. It may have been removed.",
  
  // Server errors
  SERVER_ERROR: "Something went wrong on our end. Please try again later.",
  SERVER_MAINTENANCE: "We're performing maintenance. Please try again in a few minutes.",
  
  // File operations
  FILE_TOO_LARGE: "The file is too large. Please choose a file under {size}.",
  FILE_INVALID_TYPE: "Invalid file type. Please upload {types} files only.",
  FILE_UPLOAD_FAILED: "Failed to upload the file. Please try again.",
  FILE_CORRUPT: "The file appears to be corrupted or invalid.",
  
  // PDF operations
  PDF_GENERATION_FAILED: "Failed to generate PDF. Please try again.",
  PDF_PARSE_FAILED: "Unable to read the PDF file. The file may be corrupted or password-protected.",
  PDF_NO_DATA: "No quote data could be extracted from the PDF. Please check the file format.",
  
  // Database operations
  DB_CONNECTION_FAILED: "Failed to connect to the database. Please try again.",
  DB_SAVE_FAILED: "Failed to save changes. Please try again.",
  DB_DELETE_FAILED: "Failed to delete the item. It may be in use.",
  DB_DUPLICATE: "This item already exists. Please use a different name or identifier.",
  
  // Validation errors
  VALIDATION_REQUIRED: "This field is required.",
  VALIDATION_EMAIL: "Please enter a valid email address.",
  VALIDATION_PHONE: "Please enter a valid phone number.",
  VALIDATION_MIN_LENGTH: "Must be at least {min} characters.",
  VALIDATION_MAX_LENGTH: "Must be no more than {max} characters.",
  VALIDATION_NUMBER: "Must be a valid number.",
  VALIDATION_DATE: "Please enter a valid date.",
  
  // Business logic errors
  QUOTE_EMPTY_ITEMS: "Please add at least one line item to the quote.",
  QUOTE_INVALID_CUSTOMER: "Please select or create a customer for this quote.",
  PRODUCT_INVALID_PRICE: "Please enter a valid price greater than 0.",
  IMPORT_NO_DATA: "No valid data found in the imported file.",
  
  // Success messages (for consistency)
  SUCCESS_SAVED: "Changes saved successfully!",
  SUCCESS_CREATED: "Created successfully!",
  SUCCESS_DELETED: "Deleted successfully!",
  SUCCESS_IMPORTED: "Imported successfully!",
  SUCCESS_EXPORTED: "Exported successfully!",
  SUCCESS_UPLOADED: "Uploaded successfully!"
};

/**
 * Parse error response and return appropriate user-friendly message
 */
export function parseError(error: any): AppError {
  // Handle null/undefined
  if (!error) {
    return {
      type: ErrorType.UNKNOWN,
      message: ERROR_MESSAGES.SERVER_ERROR,
      retryable: true
    };
  }

  // Handle Error instances
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Network errors
    if (message.includes('network') || message.includes('fetch')) {
      return {
        type: ErrorType.NETWORK,
        message: navigator.onLine ? ERROR_MESSAGES.NETWORK_GENERAL : ERROR_MESSAGES.NETWORK_OFFLINE,
        details: error.message,
        retryable: true
      };
    }
    
    // Authentication errors
    if (message.includes('401') || message.includes('unauthorized')) {
      return {
        type: ErrorType.AUTHENTICATION,
        message: ERROR_MESSAGES.AUTH_UNAUTHORIZED,
        statusCode: 401,
        retryable: false
      };
    }
    
    if (message.includes('403') || message.includes('forbidden')) {
      return {
        type: ErrorType.AUTHORIZATION,
        message: ERROR_MESSAGES.AUTH_FORBIDDEN,
        statusCode: 403,
        retryable: false
      };
    }
    
    // Not found errors
    if (message.includes('404') || message.includes('not found')) {
      return {
        type: ErrorType.NOT_FOUND,
        message: ERROR_MESSAGES.RESOURCE_NOT_FOUND,
        statusCode: 404,
        retryable: false
      };
    }
    
    // Server errors
    if (message.includes('500') || message.includes('internal server')) {
      return {
        type: ErrorType.SERVER,
        message: ERROR_MESSAGES.SERVER_ERROR,
        statusCode: 500,
        retryable: true
      };
    }
    
    // File errors
    if (message.includes('file') || message.includes('upload')) {
      return {
        type: ErrorType.FILE_UPLOAD,
        message: ERROR_MESSAGES.FILE_UPLOAD_FAILED,
        details: error.message,
        retryable: true
      };
    }
    
    // PDF errors
    if (message.includes('pdf')) {
      return {
        type: ErrorType.PDF_GENERATION,
        message: message.includes('parse') ? ERROR_MESSAGES.PDF_PARSE_FAILED : ERROR_MESSAGES.PDF_GENERATION_FAILED,
        details: error.message,
        retryable: true
      };
    }
    
    // Database errors
    if (message.includes('database') || message.includes('db')) {
      return {
        type: ErrorType.DATABASE,
        message: ERROR_MESSAGES.DB_SAVE_FAILED,
        details: error.message,
        retryable: true
      };
    }
  }

  // Handle API response errors
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    
    switch (status) {
      case 400:
        return {
          type: ErrorType.VALIDATION,
          message: data?.message || "Invalid request. Please check your input.",
          details: data?.errors ? JSON.stringify(data.errors) : undefined,
          statusCode: status,
          retryable: false
        };
      case 401:
        return {
          type: ErrorType.AUTHENTICATION,
          message: ERROR_MESSAGES.AUTH_UNAUTHORIZED,
          statusCode: status,
          retryable: false
        };
      case 403:
        return {
          type: ErrorType.AUTHORIZATION,
          message: ERROR_MESSAGES.AUTH_FORBIDDEN,
          statusCode: status,
          retryable: false
        };
      case 404:
        return {
          type: ErrorType.NOT_FOUND,
          message: data?.message || ERROR_MESSAGES.RESOURCE_NOT_FOUND,
          statusCode: status,
          retryable: false
        };
      case 500:
      case 502:
      case 503:
        return {
          type: ErrorType.SERVER,
          message: ERROR_MESSAGES.SERVER_ERROR,
          statusCode: status,
          retryable: true
        };
      default:
        return {
          type: ErrorType.UNKNOWN,
          message: data?.message || ERROR_MESSAGES.SERVER_ERROR,
          statusCode: status,
          retryable: true
        };
    }
  }

  // Default fallback
  return {
    type: ErrorType.UNKNOWN,
    message: error.message || ERROR_MESSAGES.SERVER_ERROR,
    retryable: true
  };
}

/**
 * Display error to user via toast with appropriate styling
 */
export function showError(error: any, customMessage?: string) {
  const appError = parseError(error);
  
  toast({
    title: "Error",
    description: customMessage || appError.message,
    variant: "destructive",
    duration: appError.retryable ? 5000 : 7000,
  });
  
  // Log for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error('Error details:', error);
  }
}

/**
 * Display success message
 */
export function showSuccess(message: string) {
  toast({
    title: "Success",
    description: message,
    duration: 3000,
  });
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: any): string {
  if (Array.isArray(errors)) {
    return errors.map(err => err.message || err).join(', ');
  }
  if (typeof errors === 'object') {
    return Object.entries(errors)
      .map(([field, messages]: [string, any]) => {
        if (Array.isArray(messages)) {
          return `${field}: ${messages.join(', ')}`;
        }
        return `${field}: ${messages}`;
      })
      .join('; ');
  }
  return String(errors);
}

/**
 * Retry helper for retryable operations
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  delay = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const appError = parseError(error);
      
      // Don't retry if not retryable
      if (!appError.retryable) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        throw error;
      }
      
      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
    }
  }
  
  throw lastError;
}

/**
 * Check if error is network related
 */
export function isNetworkError(error: any): boolean {
  const appError = parseError(error);
  return appError.type === ErrorType.NETWORK;
}

/**
 * Check if error is authentication related
 */
export function isAuthError(error: any): boolean {
  const appError = parseError(error);
  return appError.type === ErrorType.AUTHENTICATION || appError.type === ErrorType.AUTHORIZATION;
}

/**
 * Get user action for error recovery
 */
export function getErrorRecoveryAction(error: any): (() => void) | undefined {
  const appError = parseError(error);
  
  switch (appError.type) {
    case ErrorType.AUTHENTICATION:
      return () => window.location.href = '/auth';
    case ErrorType.NETWORK:
      if (!navigator.onLine) {
        return () => window.location.reload();
      }
      break;
  }
  
  return undefined;
}