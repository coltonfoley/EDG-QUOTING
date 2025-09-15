import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Zap, 
  Plus, 
  Search, 
  Calendar, 
  Mail, 
  Phone, 
  FileText, 
  DollarSign,
  Building2,
  Users,
  Target,
  Download,
  Upload,
  Settings,
  Clock,
  CheckSquare
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Account, Contact, Opportunity } from "@shared/schema";

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  category: 'create' | 'search' | 'reports' | 'utilities';
}

interface QuickActionsMenuProps {
  onCreateAccount?: () => void;
  onCreateContact?: () => void;
  onCreateOpportunity?: () => void;
  onCreateQuote?: () => void;
  onGlobalSearch?: () => void;
}

export function QuickActionsMenu({
  onCreateAccount,
  onCreateContact, 
  onCreateOpportunity,
  onCreateQuote,
  onGlobalSearch
}: QuickActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Quick stats for context
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { data: contacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: opportunities = [] } = useQuery<Opportunity[]>({ queryKey: ["/api/opportunities"] });
  
  const quickActions: QuickAction[] = [
    // Create Actions
    {
      id: 'create-account',
      label: 'Create Account',
      description: 'Add a new company or individual account',
      icon: <Building2 className="h-4 w-4" />,
      shortcut: 'Ctrl+Shift+A',
      action: () => {
        onCreateAccount?.();
        setOpen(false);
      },
      category: 'create'
    },
    {
      id: 'create-contact',
      label: 'Create Contact',
      description: 'Add a new contact person',
      icon: <Users className="h-4 w-4" />,
      shortcut: 'Ctrl+Shift+C',
      action: () => {
        onCreateContact?.();
        setOpen(false);
      },
      category: 'create'
    },
    {
      id: 'create-opportunity',
      label: 'Create Opportunity',
      description: 'Start tracking a new deal',
      icon: <Target className="h-4 w-4" />,
      shortcut: 'Ctrl+Shift+O',
      action: () => {
        onCreateOpportunity?.();
        setOpen(false);
      },
      category: 'create'
    },
    {
      id: 'create-quote',
      label: 'Create Quote',
      description: 'Generate a new quote',
      icon: <FileText className="h-4 w-4" />,
      shortcut: 'Ctrl+Shift+Q',
      action: () => {
        onCreateQuote?.();
        setOpen(false);
      },
      category: 'create'
    },
    
    // Search Actions
    {
      id: 'global-search',
      label: 'Global Search',
      description: 'Search across all CRM data',
      icon: <Search className="h-4 w-4" />,
      shortcut: 'Ctrl+K',
      action: () => {
        onGlobalSearch?.();
        setOpen(false);
      },
      category: 'search'
    },
    
    // Reports Actions
    {
      id: 'dashboard',
      label: 'View Dashboard',
      description: 'Go to analytics dashboard',
      icon: <DollarSign className="h-4 w-4" />,
      shortcut: 'Ctrl+D',
      action: () => {
        window.location.href = '/dashboard';
        setOpen(false);
      },
      category: 'reports'
    },
    {
      id: 'export-data',
      label: 'Export Data',
      description: 'Download CRM data as CSV',
      icon: <Download className="h-4 w-4" />,
      action: () => {
        // Trigger export functionality
        setOpen(false);
      },
      category: 'utilities'
    },
    
    // Utilities
    {
      id: 'schedule-follow-up',
      label: 'Schedule Follow-up',
      description: 'Set a reminder for follow-up',
      icon: <Calendar className="h-4 w-4" />,
      action: () => {
        // Open follow-up scheduler
        setOpen(false);
      },
      category: 'utilities'
    },
    {
      id: 'bulk-email',
      label: 'Bulk Email',
      description: 'Send email to multiple contacts',
      icon: <Mail className="h-4 w-4" />,
      action: () => {
        // Open bulk email composer
        setOpen(false);
      },
      category: 'utilities'
    }
  ];
  
  const filteredActions = quickActions.filter(action =>
    action.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    action.description.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const groupedActions = filteredActions.reduce((acc, action) => {
    if (!acc[action.category]) {
      acc[action.category] = [];
    }
    acc[action.category].push(action);
    return acc;
  }, {} as Record<string, QuickAction[]>);
  
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'create': return <Plus className="h-4 w-4" />;
      case 'search': return <Search className="h-4 w-4" />;
      case 'reports': return <DollarSign className="h-4 w-4" />;
      case 'utilities': return <Settings className="h-4 w-4" />;
      default: return <CheckSquare className="h-4 w-4" />;
    }
  };
  
  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'create': return 'Create';
      case 'search': return 'Search';
      case 'reports': return 'Reports';
      case 'utilities': return 'Utilities';
      default: return 'Other';
    }
  };
  
  // Keyboard shortcut handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const action = quickActions.find(a => {
      if (!a.shortcut) return false;
      const keys = a.shortcut.toLowerCase().split('+');
      const isCtrl = keys.includes('ctrl') && e.ctrlKey;
      const isShift = keys.includes('shift') && e.shiftKey;
      const key = keys[keys.length - 1];
      return isCtrl && isShift && e.key.toLowerCase() === key;
    });
    
    if (action) {
      e.preventDefault();
      action.action();
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2" 
          data-testid="button-quick-actions"
          onKeyDown={handleKeyDown}
        >
          <Zap className="h-4 w-4" />
          Quick Actions
          <Badge variant="outline" className="text-xs px-1">Ctrl+Space</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Quick Actions
          </DialogTitle>
        </DialogHeader>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{accounts.length}</div>
              <div className="text-sm text-gray-500">Accounts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{contacts.length}</div>
              <div className="text-sm text-gray-500">Contacts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{opportunities.length}</div>
              <div className="text-sm text-gray-500">Opportunities</div>
            </CardContent>
          </Card>
        </div>
        
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search actions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-actions"
          />
        </div>
        
        {/* Actions List */}
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {Object.entries(groupedActions).map(([category, actions]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-600">
                {getCategoryIcon(category)}
                {getCategoryLabel(category)}
              </div>
              <div className="space-y-1">
                {actions.map((action) => (
                  <Button
                    key={action.id}
                    variant="ghost"
                    className="w-full justify-start h-auto p-3 text-left"
                    onClick={action.action}
                    data-testid={`button-action-${action.id}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        {action.icon}
                        <div>
                          <div className="font-medium">{action.label}</div>
                          <div className="text-sm text-gray-500">{action.description}</div>
                        </div>
                      </div>
                      {action.shortcut && (
                        <Badge variant="outline" className="text-xs">
                          {action.shortcut}
                        </Badge>
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        {filteredActions.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Zap className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No actions found for "{searchQuery}"</p>
            <p className="text-sm">Try a different search term</p>
          </div>
        )}
        
        {/* Footer */}
        <div className="pt-4 border-t text-xs text-gray-500">
          <div className="flex justify-between">
            <span>💡 Tip: Use keyboard shortcuts for faster access</span>
            <span>Press Ctrl+Space to open this menu</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default QuickActionsMenu;