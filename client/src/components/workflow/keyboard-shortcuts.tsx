import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  description: string;
}

interface KeyboardShortcutsProps {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

export function KeyboardShortcuts({ shortcuts, enabled = true }: KeyboardShortcutsProps) {
  const { toast } = useToast();
  
  useEffect(() => {
    if (!enabled) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      const matchingShortcut = shortcuts.find(shortcut => {
        return (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          event.ctrlKey === (shortcut.ctrlKey || false) &&
          event.shiftKey === (shortcut.shiftKey || false) &&
          event.altKey === (shortcut.altKey || false)
        );
      });
      
      if (matchingShortcut) {
        event.preventDefault();
        event.stopPropagation();
        
        // Show toast for feedback
        toast({
          title: "Shortcut activated",
          description: matchingShortcut.description,
          duration: 1000,
        });
        
        matchingShortcut.action();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled, toast]);
  
  return null; // This component doesn't render anything
}

// Common keyboard shortcuts for CRM
export const useCommonShortcuts = () => {
  return [
    {
      key: 'k',
      ctrlKey: true,
      action: () => {
        // Trigger global search
        const searchButton = document.querySelector('[data-testid="button-global-search"]') as HTMLButtonElement;
        searchButton?.click();
      },
      description: 'Open global search'
    },
    {
      key: 'd',
      ctrlKey: true,
      action: () => {
        window.location.href = '/dashboard';
      },
      description: 'Go to dashboard'
    },
    {
      key: 'a',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        window.location.href = '/accounts';
      },
      description: 'Go to accounts'
    },
    {
      key: 'c',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        window.location.href = '/contacts';
      },
      description: 'Go to contacts'
    },
    {
      key: 'o',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        window.location.href = '/opportunities';
      },
      description: 'Go to opportunities'
    },
    {
      key: 'q',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        window.location.href = '/quotes';
      },
      description: 'Go to quotes'
    },
    {
      key: ' ',
      ctrlKey: true,
      action: () => {
        // Trigger quick actions menu
        const quickActionsButton = document.querySelector('[data-testid="button-quick-actions"]') as HTMLButtonElement;
        quickActionsButton?.click();
      },
      description: 'Open quick actions menu'
    }
  ];
};

export default KeyboardShortcuts;