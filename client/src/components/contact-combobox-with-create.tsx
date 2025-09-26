import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Plus, User } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  accountId: number;
  accountName: string;
}

interface Account {
  id: number;
  name: string;
  email: string;
  phone: string;
}

interface ContactComboboxWithCreateProps {
  value?: number | null;
  onValueChange: (contactId: number | null | undefined) => void;
  placeholder?: string;
}

export function ContactComboboxWithCreate({
  value,
  onValueChange,
  placeholder = "Search contacts...",
}: ContactComboboxWithCreateProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number>();
  
  // Form state for new contact
  const [newContact, setNewContact] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  
  // Form state for new account
  const [newAccount, setNewAccount] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for searching contacts
  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["/api/contacts", { search: debouncedSearchQuery }],
    queryFn: async () => {
      if (!debouncedSearchQuery.trim()) return [];
      const response = await apiRequest("GET", `/api/contacts?search=${encodeURIComponent(debouncedSearchQuery)}`);
      return response.json();
    },
    enabled: debouncedSearchQuery.trim().length > 0,
  });

  // Query for searching accounts (when creating contact)
  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["/api/accounts", { search: debouncedSearchQuery }],
    queryFn: async () => {
      if (!debouncedSearchQuery.trim()) return [];
      const response = await apiRequest("GET", `/api/accounts?search=${encodeURIComponent(debouncedSearchQuery)}`);
      return response.json();
    },
    enabled: showCreateDialog && !showCreateAccount && debouncedSearchQuery.trim().length > 0,
  });

  // Mutation for creating contact (and account if needed)
  const createContactMutation = useMutation({
    mutationFn: async (data: { 
      contact: typeof newContact; 
      accountId?: number; 
      account?: typeof newAccount;
    }) => {
      const response = await apiRequest("POST", "/api/contacts/quick-create", data);
      return response.json();
    },
    onSuccess: (data) => {
      onValueChange(data.contact.id);
      setShowCreateDialog(false);
      setShowCreateAccount(false);
      setSelectedAccountId(undefined);
      setNewContact({ firstName: "", lastName: "", email: "", phone: "" });
      setNewAccount({ name: "", email: "", phone: "" });
      toast({
        title: "Contact created successfully",
        description: `${data.contact.firstName} ${data.contact.lastName} has been added.`,
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create contact",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const selectedContact = contacts.find((contact: Contact) => contact.id === value);

  const handleCreateContact = () => {
    if (!newContact.firstName || !newContact.lastName || !newContact.email) {
      toast({
        title: "Missing required fields",
        description: "Please fill in first name, last name, and email.",
        variant: "destructive",
      });
      return;
    }

    if (showCreateAccount) {
      if (!newAccount.name || !newAccount.email) {
        toast({
          title: "Missing account information",
          description: "Please fill in account name and email.",
          variant: "destructive",
        });
        return;
      }
      createContactMutation.mutate({
        contact: newContact,
        account: newAccount,
      });
    } else if (selectedAccountId) {
      createContactMutation.mutate({
        contact: newContact,
        accountId: selectedAccountId,
      });
    } else {
      toast({
        title: "Please select or create an account",
        description: "Contacts must be associated with an account.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            data-testid="contact-combobox-trigger"
          >
            {selectedContact
              ? `${selectedContact.firstName} ${selectedContact.lastName} — ${selectedContact.accountName}`
              : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" data-testid="contact-combobox-content">
          <Command>
            <CommandInput
              placeholder="Search contacts..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              data-testid="contact-search-input"
            />
            <CommandList>
              <CommandEmpty>
                {contactsLoading ? "Searching..." : "No contacts found."}
              </CommandEmpty>
              {contacts.length > 0 && (
                <CommandGroup heading="Contacts">
                  {contacts.map((contact: Contact) => (
                    <CommandItem
                      key={contact.id}
                      value={`${contact.firstName} ${contact.lastName} ${contact.accountName}`}
                      onSelect={() => {
                        onValueChange(contact.id === value ? undefined : contact.id);
                        setOpen(false);
                        setSearchQuery("");
                      }}
                      data-testid={`contact-option-${contact.id}`}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === contact.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <div>
                          <div className="font-medium">
                            {contact.firstName} {contact.lastName}
                          </div>
                          <div className="text-sm text-gray-500">
                            {contact.accountName} • {contact.email}
                          </div>
                        </div>
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
                    setSearchQuery("");
                  }}
                  data-testid="create-contact-option"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create new contact
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]" data-testid="create-contact-dialog">
          <DialogHeader>
            <DialogTitle>Create New Contact</DialogTitle>
            <DialogDescription>
              Add a new contact to your system. Contacts must be associated with an account.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Contact Information */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Contact Information</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={newContact.firstName}
                    onChange={(e) => setNewContact(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="John"
                    data-testid="input-firstName"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={newContact.lastName}
                    onChange={(e) => setNewContact(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Doe"
                    data-testid="input-lastName"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newContact.email}
                  onChange={(e) => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="john.doe@company.com"
                  data-testid="input-email"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={newContact.phone}
                  onChange={(e) => setNewContact(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                  data-testid="input-phone"
                />
              </div>
            </div>

            {/* Account Selection */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Account Association</h4>
              {!showCreateAccount ? (
                <div className="space-y-3">
                  <div>
                    <Label>Select Account</Label>
                    <Command>
                      <CommandInput
                        placeholder="Search accounts..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        data-testid="account-search-input"
                      />
                      <CommandList className="max-h-32">
                        <CommandEmpty>
                          {accountsLoading ? "Searching..." : "No accounts found."}
                        </CommandEmpty>
                        {accounts.length > 0 && (
                          <CommandGroup>
                            {accounts.map((account: Account) => (
                              <CommandItem
                                key={account.id}
                                onSelect={() => setSelectedAccountId(account.id)}
                                data-testid={`account-option-${account.id}`}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedAccountId === account.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div>
                                  <div className="font-medium">{account.name}</div>
                                  <div className="text-sm text-gray-500">{account.email}</div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateAccount(true)}
                    className="w-full"
                    data-testid="button-create-account"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Account
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="font-medium text-sm">New Account Information</h5>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCreateAccount(false)}
                      data-testid="button-cancel-account"
                    >
                      Cancel
                    </Button>
                  </div>
                  <div>
                    <Label htmlFor="accountName">Account Name *</Label>
                    <Input
                      id="accountName"
                      value={newAccount.name}
                      onChange={(e) => setNewAccount(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Company Name"
                      data-testid="input-accountName"
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountEmail">Account Email *</Label>
                    <Input
                      id="accountEmail"
                      type="email"
                      value={newAccount.email}
                      onChange={(e) => setNewAccount(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="info@company.com"
                      data-testid="input-accountEmail"
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountPhone">Account Phone</Label>
                    <Input
                      id="accountPhone"
                      value={newAccount.phone}
                      onChange={(e) => setNewAccount(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="(555) 123-4567"
                      data-testid="input-accountPhone"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setShowCreateAccount(false);
                  setSelectedAccountId(undefined);
                  setNewContact({ firstName: "", lastName: "", email: "", phone: "" });
                  setNewAccount({ name: "", email: "", phone: "" });
                }}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateContact}
                disabled={createContactMutation.isPending}
                data-testid="button-create"
              >
                {createContactMutation.isPending ? "Creating..." : "Create Contact"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}