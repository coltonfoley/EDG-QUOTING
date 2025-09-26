import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global handler for unhandled promise rejections to suppress abort errors
window.addEventListener('unhandledrejection', (event) => {
  // Check if this is an abort error from React Query or DOMException
  const reason = event.reason;
  if (reason?.name === 'AbortError' || 
      reason?.name === 'DOMException' ||
      reason?.message?.includes('aborted') || 
      reason?.message?.includes('signal is aborted') ||
      reason?.message?.includes('operation was aborted')) {
    // Prevent the error from showing in the console and stop event propagation
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  
  // Let other errors through normally
});

createRoot(document.getElementById("root")!).render(<App />);
