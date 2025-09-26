import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global handler for unhandled promise rejections to suppress abort errors
window.addEventListener('unhandledrejection', (event) => {
  // Check if this is an abort error from React Query
  if (event.reason?.name === 'AbortError' || 
      event.reason?.message?.includes('aborted') || 
      event.reason?.message?.includes('signal is aborted')) {
    // Prevent the error from showing in the console
    event.preventDefault();
    return;
  }
  
  // Let other errors through normally
});

createRoot(document.getElementById("root")!).render(<App />);
