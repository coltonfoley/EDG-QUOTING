import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Plus, Building } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";

interface Account {
  id: number;
  name: string;
  email: string;
  phone: string;
  company?: string;
  accountType: string;
}

interface AccountComboboxWithCreateProps {
  value?: number;
  onValueChange: (accountId: number | undefined) => void;
  placeholder?: string;
}

export function AccountComboboxWithCreate({
  value,
  onValueChange,
  placeholder = "Search accounts...",
}: AccountComboboxWithCreateProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  // Form state for new account
  const [newAccount, setNewAccount] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    accountType: "homeowner" as "homeowner" | "general_contractor" | "commercial",
  });

  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for searching accounts
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["/api/accounts", { search: debouncedSearchQuery }],
    queryFn: async () => {
      if (!debouncedSearchQuery.trim()) return [];
      const response = await apiRequest("GET", `/api/accounts?search=${encodeURIComponent(debouncedSearchQuery)}`);
      return response.json();
    },
    enabled: debouncedSearchQuery.trim().length > 0,
  });

  // Query for getting current account if value is set
  const { data: currentAccount } = useQuery({
    queryKey: [`/api/accounts/${value}`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/accounts/${value}`);
      return response.json();
    },
    enabled: !!value,
  });

  // Mutation for creating account
  const createAccountMutation = useMutation({
    mutationFn: async (data: typeof newAccount) => {
      const response = await apiRequest("POST", "/api/accounts", data);
      return response.json();
    },
    onSuccess: (data) => {
      onValueChange(data.id);
      setShowCreateDialog(false);
      setNewAccount({
        name: "",
        email: "",
        phone: "",
        company: "",
        accountType: "homeowner",
      });
      toast({
        title: "Account created successfully",
        description: `${data.name} has been added.`,
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create account",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const selectedAccount = currentAccount || accounts.find((account: Account) => account.id === value);

  // Helper function to get a meaningful label for an account
  const getAccountLabel = (account: Account | undefined): string => {
    if (!account) return "";
    
    const name = account.name?.trim();
    const company = account.company?.trim();
    const email = account.email?.trim();
    
    if (name) return company ? `${name} (${company})` : name;
    if (company) return company;
    if (email) return email;
    
    return `Account #${account.id}`;
  };

  const handleCreateAccount = () => {
    if (!newAccount.name || !newAccount.email || !newAccount.phone) {
      toast({
        title: "Missing required fields",
        description: "Please fill in name, email, and phone number.",
        variant: "destructive",
      });
      return;
    }

    createAccountMutation.mutate(newAccount);
  };

  const handleSelectAccount = (accountId: number) => {
    onValueChange(accountId);
    setOpen(false);
    setSearchQuery("");
  };

  const displayName = selectedAccount 
    ? getAccountLabel(selectedAccount) || placeholder
    : placeholder;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            data-testid="account-combobox-trigger"
          >
            {displayName}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" data-testid="account-combobox-content">
          <Command>
            <CommandInput
              placeholder="Search accounts..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              data-testid="account-search-input"
            />
            <CommandList>
              <CommandEmpty>
                {accountsLoading ? "Searching..." : "No accounts found."}
              </CommandEmpty>
              {accounts.length > 0 && (
                <CommandGroup heading="Accounts">
                  {accounts.map((account: Account) => (
                    <CommandItem
                      key={account.id}
                      value={account.id.toString()}
                      onSelect={() => handleSelectAccount(account.id)}
                      data-testid={`account-option-${account.id}`}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === account.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{getAccountLabel(account)}</span>
                        <span className="text-xs text-gray-400">{account.email}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setShowCreateDialog(true);
                    setOpen(false);
                  }}
                  data-testid="create-account-option"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create new account
                </CommandItem>
              </CommandGroup>
              {value && (
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      onValueChange(undefined);
                      setOpen(false);
                    }}
                    data-testid="clear-account-option"
                  >
                    <span className="text-red-500">Clear selection</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]" data-testid="create-account-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Building className="mr-2 h-5 w-5" />
              Create New Account
            </DialogTitle>
            <DialogDescription>
              Add a new account to your system. All fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="account-name">Name *</Label>
                <Input
                  id="account-name"
                  value={newAccount.name}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, name: e.target.value })
                  }
                  placeholder="Enter account name"
                  data-testid="new-account-name"
                />
              </div>
              
              <div>
                <Label htmlFor="account-email">Email *</Label>
                <Input
                  id="account-email"
                  type="email"
                  value={newAccount.email}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, email: e.target.value })
                  }
                  placeholder="Enter email address"
                  data-testid="new-account-email"
                />
              </div>
              
              <div>
                <Label htmlFor="account-phone">Phone *</Label>
                <Input
                  id="account-phone"
                  value={newAccount.phone}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, phone: e.target.value })
                  }
                  placeholder="Enter phone number"
                  data-testid="new-account-phone"
                />
              </div>
              
              <div>
                <Label htmlFor="account-company">Company</Label>
                <Input
                  id="account-company"
                  value={newAccount.company}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, company: e.target.value })
                  }
                  placeholder="Enter company name (optional)"
                  data-testid="new-account-company"
                />
              </div>
              
              <div>
                <Label htmlFor="account-type">Account Type</Label>
                <Select
                  value={newAccount.accountType}
                  onValueChange={(value) =>
                    setNewAccount({ 
                      ...newAccount, 
                      accountType: value as "homeowner" | "general_contractor" | "commercial" 
                    })
                  }
                >
                  <SelectTrigger data-testid="new-account-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homeowner">Homeowner</SelectItem>
                    <SelectItem value="general_contractor">General Contractor</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              data-testid="cancel-create-account"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateAccount}
              disabled={createAccountMutation.isPending}
              data-testid="confirm-create-account"
            >
              {createAccountMutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}