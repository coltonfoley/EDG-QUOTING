import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface LoadingBarProps {
  isLoading: boolean;
  progress?: number;
  className?: string;
}

export function LoadingBar({ isLoading, progress, className }: LoadingBarProps) {
  const [internalProgress, setInternalProgress] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isLoading && !progress) {
      // Auto-increment progress for indeterminate loading
      setInternalProgress(10);
      interval = setInterval(() => {
        setInternalProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 500);
    } else if (!isLoading) {
      // Complete the animation
      setInternalProgress(100);
      setTimeout(() => setInternalProgress(0), 500);
    }

    return () => clearInterval(interval);
  }, [isLoading, progress]);

  const displayProgress = progress ?? internalProgress;

  if (!isLoading && displayProgress === 0) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 h-1 bg-transparent",
        className
      )}
    >
      <div
        className="h-full bg-primary transition-all duration-300 ease-out"
        style={{
          width: `${displayProgress}%`,
          opacity: displayProgress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}

// Global network activity indicator
let activeRequests = 0;
let updateCallback: ((isLoading: boolean) => void) | null = null;

export function trackNetworkActivity(isActive: boolean) {
  if (isActive) {
    activeRequests++;
  } else {
    activeRequests = Math.max(0, activeRequests - 1);
  }

  if (updateCallback) {
    updateCallback(activeRequests > 0);
  }
}

export function useNetworkActivity() {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    updateCallback = setIsActive;
    return () => {
      updateCallback = null;
    };
  }, []);

  return isActive;
}