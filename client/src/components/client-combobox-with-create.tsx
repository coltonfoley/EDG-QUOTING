import { useState } from "react";
import { Check, ChevronsUpDown, Plus, User, X } from "lucide-react";
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

interface Client {
  id: number;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  company?: string;
  accountType: string;
}

interface ClientComboboxWithCreateProps {
  value?: number | null;
  onValueChange: (clientId: number | null | undefined) => void;
  placeholder?: string;
}

export function ClientComboboxWithCreate({
  value,
  onValueChange,
  placeholder = "Search clients...",
}: ClientComboboxWithCreateProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
  // Form state for new client
  const [newClient, setNewClient] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    accountType: "homeowner" as "homeowner" | "general_contractor" | "commercial",
  });

  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for searching clients
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["/api/clients", { search: debouncedSearchQuery }],
    queryFn: async () => {
      if (!debouncedSearchQuery.trim()) return [];
      const response = await apiRequest("GET", `/api/clients?search=${encodeURIComponent(debouncedSearchQuery)}`);
      const result = await response.json();
      console.log("Client search results for", debouncedSearchQuery, ":", result);
      return result;
    },
    enabled: debouncedSearchQuery.trim().length > 0,
  });

  // Query for getting current client if value is set
  const { data: currentClient } = useQuery({
    queryKey: [`/api/clients/${value}`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/clients/${value}`);
      return response.json();
    },
    enabled: !!value,
  });

  // Mutation for creating client
  const createClientMutation = useMutation({
    mutationFn: async (data: typeof newClient) => {
      // Build the client data - compute the name field from firstName/lastName
      const clientData = {
        ...data,
        name: `${data.firstName} ${data.lastName}`.trim() || data.company || 'Unnamed Client',
      };
      const response = await apiRequest("POST", "/api/clients", clientData);
      return response.json();
    },
    onSuccess: (data) => {
      onValueChange(data.id);
      setShowCreateDialog(false);
      setNewClient({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        company: "",
        accountType: "homeowner",
      });
      toast({
        title: "Client created successfully",
        description: `${data.name} has been added.`,
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create client",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const selectedClient = currentClient || clients.find((client: Client) => client.id === value);

  // Helper function to get a meaningful label for a client
  const getClientLabel = (client: Client | undefined): string => {
    if (!client) return "";
    
    const name = client.name?.trim();
    const company = client.company?.trim();
    const email = client.email?.trim();
    
    if (name) return company ? `${name} (${company})` : name;
    if (company) return company;
    if (email) return email;
    
    return `Client #${client.id}`;
  };

  const handleCreateClient = () => {
    // Require at least firstName OR company
    const hasName = newClient.firstName.trim() || newClient.lastName.trim();
    const hasCompany = newClient.company.trim();
    
    if (!hasName && !hasCompany) {
      toast({
        title: "Missing required fields",
        description: "Please provide at least a name or company name.",
        variant: "destructive",
      });
      return;
    }
    
    if (!newClient.email || !newClient.phone) {
      toast({
        title: "Missing required fields",
        description: "Please fill in email and phone number.",
        variant: "destructive",
      });
      return;
    }

    createClientMutation.mutate(newClient);
  };

  const handleSelectClient = (clientId: number) => {
    onValueChange(clientId);
    setOpen(false);
    setSearchQuery("");
  };

  const displayName = selectedClient 
    ? getClientLabel(selectedClient) || placeholder
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
            data-testid="client-combobox-trigger"
          >
            {displayName}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" data-testid="client-combobox-content">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search clients..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              data-testid="client-search-input"
            />
            <CommandList>
              <CommandEmpty>
                {clientsLoading ? "Searching..." : "No clients found."}
              </CommandEmpty>
              {clients.length > 0 && (
                <CommandGroup heading="Clients">
                  {clients.map((client: Client) => (
                    <CommandItem
                      key={client.id}
                      value={client.id.toString()}
                      onSelect={() => handleSelectClient(client.id)}
                      data-testid={`client-option-${client.id}`}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === client.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{getClientLabel(client)}</span>
                        <span className="text-xs text-gray-400">{client.email}</span>
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
                  data-testid="create-client-option"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create new client
                </CommandItem>
              </CommandGroup>
              {value && (
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      console.log("🗑️ Removing client link - calling onValueChange(null)");
                      onValueChange(null);
                      setOpen(false);
                      toast({
                        title: "Client unlinked",
                        description: "Click 'Save Quote' to persist changes",
                      });
                    }}
                    data-testid="clear-client-option"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Remove client link
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]" data-testid="create-client-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <User className="mr-2 h-5 w-5" />
              Create New Client
            </DialogTitle>
            <DialogDescription>
              Add a new client to your system. Provide either a person's name or company name.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="client-first-name">First Name</Label>
                <Input
                  id="client-first-name"
                  value={newClient.firstName}
                  onChange={(e) =>
                    setNewClient({ ...newClient, firstName: e.target.value })
                  }
                  placeholder="John"
                  data-testid="new-client-first-name"
                />
              </div>
              
              <div>
                <Label htmlFor="client-last-name">Last Name</Label>
                <Input
                  id="client-last-name"
                  value={newClient.lastName}
                  onChange={(e) =>
                    setNewClient({ ...newClient, lastName: e.target.value })
                  }
                  placeholder="Doe"
                  data-testid="new-client-last-name"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="client-company">Company</Label>
              <Input
                id="client-company"
                value={newClient.company}
                onChange={(e) =>
                  setNewClient({ ...newClient, company: e.target.value })
                }
                placeholder="Acme Construction (optional)"
                data-testid="new-client-company"
              />
            </div>
            
            <div>
              <Label htmlFor="client-email">Email *</Label>
              <Input
                id="client-email"
                type="email"
                value={newClient.email}
                onChange={(e) =>
                  setNewClient({ ...newClient, email: e.target.value })
                }
                placeholder="john@example.com"
                data-testid="new-client-email"
              />
            </div>
            
            <div>
              <Label htmlFor="client-phone">Phone *</Label>
              <Input
                id="client-phone"
                value={newClient.phone}
                onChange={(e) =>
                  setNewClient({ ...newClient, phone: e.target.value })
                }
                placeholder="(555) 123-4567"
                data-testid="new-client-phone"
              />
            </div>
            
            <div>
              <Label htmlFor="client-type">Client Type</Label>
              <Select
                value={newClient.accountType}
                onValueChange={(value) =>
                  setNewClient({ 
                    ...newClient, 
                    accountType: value as "homeowner" | "general_contractor" | "commercial" 
                  })
                }
              >
                <SelectTrigger data-testid="new-client-type">
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
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              data-testid="cancel-create-client"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateClient}
              disabled={createClientMutation.isPending}
              data-testid="confirm-create-client"
            >
              {createClientMutation.isPending ? "Creating..." : "Create Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
