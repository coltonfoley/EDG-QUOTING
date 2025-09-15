import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { ContactForm } from "@/components/forms/contact-form";
import { RoleManager } from "@/components/forms/role-manager";
import { ActivityFeed } from "@/components/forms/activity-feed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { 
  Plus, 
  Search, 
  Users, 
  Building2, 
  Target,
  Phone, 
  Mail, 
  MapPin, 
  Eye,
  Edit,
  UserCheck,
  Briefcase,
  Trash2
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useAuth } from "@/hooks/useAuth";
import type { Contact, Account, Opportunity, InsertContact } from "@shared/schema";

interface ContactWithDetails extends Contact {
  account?: Account;
  roles: string[];
  opportunityCount?: number;
  totalValue?: number;
}

export default function ContactsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterByAccount, setFilterByAccount] = useState<string>("all");
  const [filterByRole, setFilterByRole] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Fetch contacts
  const { data: contacts = [], isLoading: contactsLoading, error: contactsError } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: isAuthenticated,
  });

  // Fetch accounts for relationship data and filtering
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    enabled: isAuthenticated,
  });

  // Fetch opportunities for relationship data
  const { data: opportunities = [] } = useQuery<Opportunity[]>({
    queryKey: ["/api/opportunities"],
    enabled: isAuthenticated,
  });

  // Fetch contact roles for each contact
  const { data: contactRoles = [] } = useQuery<{contactId: number, roles: string[]}[]>({
    queryKey: ["/api/contacts/roles"],
    queryFn: async () => {
      if (!contacts.length) return [];
      const rolePromises = contacts.map(async (contact) => {
        try {
          const response = await apiRequest("GET", `/api/contacts/${contact.id}/roles`);
          const roles = await response.json();
          return { contactId: contact.id, roles: roles.map((r: any) => r.role) };
        } catch (error) {
          console.error(`Failed to fetch roles for contact ${contact.id}:`, error);
          return { contactId: contact.id, roles: [] };
        }
      });
      return Promise.all(rolePromises);
    },
    enabled: isAuthenticated && contacts.length > 0,
  });

  // Enrich contacts with additional data
  const enrichedContacts: ContactWithDetails[] = useMemo(() => {
    return contacts.map(contact => {
      const account = accounts.find(a => a.id === contact.accountId);
      const contactOpportunities = opportunities.filter(o => o.primaryContactId === contact.id);
      const totalValue = contactOpportunities.reduce((sum, opp) => {
        return sum + (opp.amount ? parseFloat(opp.amount.toString()) : 0);
      }, 0);

      // Find roles for this contact
      const contactRoleData = contactRoles.find(cr => cr.contactId === contact.id);
      const roles = contactRoleData ? contactRoleData.roles : [];

      return {
        ...contact,
        account,
        roles,
        opportunityCount: contactOpportunities.length,
        totalValue,
      };
    });
  }, [contacts, accounts, opportunities, contactRoles]);

  // Create contact mutation
  const createContactMutation = useMutation({
    mutationFn: async (contactData: InsertContact) => {
      return await apiRequest("POST", "/api/contacts", contactData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contact created",
        description: "New contact has been successfully created.",
      });
      setCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create contact. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update contact mutation
  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertContact> }) => {
      return await apiRequest("PUT", `/api/contacts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contact updated",
        description: "Contact has been successfully updated.",
      });
      setEditDialogOpen(false);
      setSelectedContact(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update contact. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete contact mutation
  const deleteContactMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/roles"] });
      toast({
        title: "Contact deleted",
        description: "Contact has been successfully deleted.",
      });
      setDeleteDialogOpen(false);
      setContactToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete contact. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Filter contacts based on search and filters
  const filteredContacts = useMemo(() => {
    let filtered = enrichedContacts;

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(contact =>
        `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(term) ||
        (contact.email && contact.email.toLowerCase().includes(term)) ||
        (contact.phone && contact.phone.toLowerCase().includes(term)) ||
        (contact.title && contact.title.toLowerCase().includes(term)) ||
        (contact.account && contact.account.name.toLowerCase().includes(term))
      );
    }

    // Account filter
    if (filterByAccount !== "all") {
      filtered = filtered.filter(contact => contact.accountId.toString() === filterByAccount);
    }

    // Role filter
    if (filterByRole !== "all") {
      filtered = filtered.filter(contact => contact.roles.includes(filterByRole));
    }

    return filtered;
  }, [enrichedContacts, searchTerm, filterByAccount, filterByRole]);

  const handleCreateContact = (data: InsertContact) => {
    createContactMutation.mutate(data);
  };

  const handleUpdateContact = (data: Partial<InsertContact>) => {
    if (selectedContact) {
      updateContactMutation.mutate({ id: selectedContact.id, data });
    }
  };

  const handleViewContact = (contact: Contact) => {
    setSelectedContact(contact);
    setDetailSheetOpen(true);
  };

  const handleEditContact = (contact: Contact) => {
    setSelectedContact(contact);
    setEditDialogOpen(true);
  };

  const handleDeleteContact = (contact: Contact) => {
    setContactToDelete(contact);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteContact = () => {
    if (contactToDelete) {
      deleteContactMutation.mutate(contactToDelete.id);
    }
  };

  // Handle authentication errors
  if (contactsError && isUnauthorizedError(contactsError as Error)) {
    toast({
      title: "Unauthorized",
      description: "You are logged out. Redirecting to login...",
      variant: "destructive",
    });
    setTimeout(() => {
      window.location.href = "/api/login";
    }, 1500);
    return null;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edg-teal"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start mb-8 space-y-4 lg:space-y-0">
          <div>
            <h2 className="text-3xl font-bold text-edg-black">Contact Management</h2>
            <p className="text-edg-grey mt-2">Manage individual contacts and their relationships</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            {/* View Mode Toggle */}
            <div className="flex border rounded-lg p-1">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="px-3"
                data-testid="button-grid-view"
              >
                Grid
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="px-3"
                data-testid="button-list-view"
              >
                List
              </Button>
            </div>

            {/* Create Contact Button */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-edg-black hover:bg-edg-grey text-edg-white" data-testid="button-create-contact">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Contact
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Contact</DialogTitle>
                </DialogHeader>
                <ContactForm
                  onSubmit={handleCreateContact}
                  onCancel={() => setCreateDialogOpen(false)}
                  isLoading={createContactMutation.isPending}
                  submitLabel="Create Contact"
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-edg-grey h-4 w-4" />
                <Input
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-contacts"
                />
              </div>

              {/* Account Filter */}
              <Select value={filterByAccount} onValueChange={setFilterByAccount}>
                <SelectTrigger className="w-full md:w-64" data-testid="select-filter-account">
                  <SelectValue placeholder="Filter by account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Role Filter */}
              <Select value={filterByRole} onValueChange={setFilterByRole}>
                <SelectTrigger className="w-full md:w-48" data-testid="select-filter-role">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Contact List */}
        {contactsLoading ? (
          <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredContacts.length > 0 ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredContacts.map((contact) => (
                <Card key={contact.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-blue-100 text-blue-600 font-medium">
                            {contact.firstName[0]}{contact.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold text-lg">
                            {contact.firstName} {contact.lastName}
                          </h3>
                          {contact.title && (
                            <p className="text-sm text-gray-600">{contact.title}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewContact(contact)}
                          data-testid={`button-view-contact-${contact.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditContact(contact)}
                          data-testid={`button-edit-contact-${contact.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteContact(contact)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          data-testid={`button-delete-contact-${contact.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      {contact.account && (
                        <div className="flex items-center space-x-2">
                          <Building2 className="h-4 w-4" />
                          <Link href="/accounts" className="hover:text-edg-teal">
                            {contact.account.name}
                          </Link>
                        </div>
                      )}
                      {contact.email && (
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4" />
                          <span className="truncate">{contact.email}</span>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4" />
                          <span>{contact.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Role Badges */}
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex flex-wrap gap-1 mb-3">
                        {contact.roles.length > 0 ? contact.roles.map(role => {
                          const roleColors = {
                            lead: "bg-blue-500 text-white",
                            client: "bg-green-500 text-white", 
                            vendor: "bg-purple-500 text-white",
                            contractor: "bg-orange-500 text-white",
                            supplier: "bg-teal-500 text-white"
                          };
                          return (
                            <Badge 
                              key={role} 
                              className={`text-xs ${roleColors[role as keyof typeof roleColors] || 'bg-gray-500 text-white'}`}
                              data-testid={`badge-contact-role-${role}`}
                            >
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </Badge>
                          );
                        }) : (
                          <Badge variant="secondary" className="text-xs text-gray-500">
                            No roles
                          </Badge>
                        )}
                      </div>
                    
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Target className="h-4 w-4" />
                            <span>{contact.opportunityCount || 0}</span>
                          </div>
                        </div>
                        {contact.totalValue && contact.totalValue > 0 && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            ${contact.totalValue.toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {filteredContacts.map((contact) => (
                    <div key={contact.id} className="p-6 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-blue-100 text-blue-600 font-medium">
                              {contact.firstName[0]}{contact.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="font-semibold">
                              {contact.firstName} {contact.lastName}
                            </h3>
                            <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                              {contact.title && <span>{contact.title}</span>}
                              <div className="flex flex-wrap gap-1">
                                {contact.roles.length > 0 ? contact.roles.map(role => {
                                  const roleColors = {
                                    lead: "bg-blue-500 text-white",
                                    client: "bg-green-500 text-white",
                                    vendor: "bg-purple-500 text-white", 
                                    contractor: "bg-orange-500 text-white",
                                    supplier: "bg-teal-500 text-white"
                                  };
                                  return (
                                    <Badge 
                                      key={role} 
                                      className={`text-xs ${roleColors[role as keyof typeof roleColors] || 'bg-gray-500 text-white'}`}
                                      data-testid={`badge-contact-role-${role}`}
                                    >
                                      {role.charAt(0).toUpperCase() + role.slice(1)}
                                    </Badge>
                                  );
                                }) : null}
                              </div>
                              {contact.account && (
                                <Link href="/accounts" className="flex items-center space-x-1 hover:text-edg-teal">
                                  <Building2 className="h-3 w-3" />
                                  <span>{contact.account.name}</span>
                                </Link>
                              )}
                              {contact.email && <span>{contact.email}</span>}
                              {contact.phone && <span>{contact.phone}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <div className="flex items-center space-x-1">
                              <Target className="h-4 w-4" />
                              <span>{contact.opportunityCount || 0}</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewContact(contact)}
                              data-testid={`button-view-contact-${contact.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditContact(contact)}
                              data-testid={`button-edit-contact-${contact.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteContact(contact)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              data-testid={`button-delete-contact-${contact.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts found</h3>
              <p className="text-gray-500 mb-6">
                {searchTerm || filterByAccount !== "all" || filterByRole !== "all"
                  ? "Try adjusting your search or filters"
                  : "Get started by adding your first contact"
                }
              </p>
              {!searchTerm && filterByAccount === "all" && filterByRole === "all" && (
                <Button
                  onClick={() => setCreateDialogOpen(true)}
                  className="bg-edg-black hover:bg-edg-grey"
                  data-testid="button-create-first-contact"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Contact
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Contact Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
          </DialogHeader>
          {selectedContact && (
            <ContactForm
              initialData={selectedContact}
              onSubmit={handleUpdateContact}
              onCancel={() => {
                setEditDialogOpen(false);
                setSelectedContact(null);
              }}
              isLoading={updateContactMutation.isPending}
              submitLabel="Update Contact"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Contact Detail Sheet */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center space-x-3">
              {selectedContact && (
                <>
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-blue-100 text-blue-600 font-medium">
                      {selectedContact.firstName[0]}{selectedContact.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold">
                      {selectedContact.firstName} {selectedContact.lastName}
                    </div>
                    {selectedContact.title && (
                      <div className="text-sm text-gray-600">{selectedContact.title}</div>
                    )}
                  </div>
                </>
              )}
            </SheetTitle>
          </SheetHeader>

          {selectedContact && (
            <div className="mt-6 space-y-6">
              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedContact.email && (
                    <div className="flex items-center space-x-3">
                      <Mail className="h-5 w-5 text-gray-400" />
                      <span>{selectedContact.email}</span>
                    </div>
                  )}
                  {selectedContact.phone && (
                    <div className="flex items-center space-x-3">
                      <Phone className="h-5 w-5 text-gray-400" />
                      <span>{selectedContact.phone}</span>
                    </div>
                  )}
                  {selectedContact.title && (
                    <div className="flex items-center space-x-3">
                      <Briefcase className="h-5 w-5 text-gray-400" />
                      <span>{selectedContact.title}</span>
                    </div>
                  )}
                  {/* Account Information */}
                  {enrichedContacts.find(c => c.id === selectedContact.id)?.account && (
                    <div className="flex items-center space-x-3">
                      <Building2 className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium">Account</p>
                        <Link 
                          href="/accounts" 
                          className="text-edg-teal hover:underline"
                        >
                          {enrichedContacts.find(c => c.id === selectedContact.id)?.account?.name}
                        </Link>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Tabs defaultValue="roles" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="roles">Roles</TabsTrigger>
                  <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
                  <TabsTrigger value="activities">Activities</TabsTrigger>
                </TabsList>

                <TabsContent value="roles">
                  <RoleManager
                    entityType="contact"
                    entityId={selectedContact.id}
                    entityName={`${selectedContact.firstName} ${selectedContact.lastName}`}
                    currentRoles={enrichedContacts.find(c => c.id === selectedContact.id)?.roles || []}
                    onRolesUpdated={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/contacts/roles"] });
                    }}
                  />
                </TabsContent>

                <TabsContent value="opportunities">
                  <Card>
                    <CardHeader>
                      <CardTitle>Opportunities</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {opportunities.filter(o => o.primaryContactId === selectedContact.id).length > 0 ? (
                        <div className="space-y-3">
                          {opportunities
                            .filter(o => o.primaryContactId === selectedContact.id)
                            .map((opportunity) => (
                              <div key={opportunity.id} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex items-center space-x-3">
                                  <div className="p-2 bg-green-100 rounded-full">
                                    <Target className="h-4 w-4 text-green-600" />
                                  </div>
                                  <div>
                                    <p className="font-medium">{opportunity.name}</p>
                                    <p className="text-sm text-gray-500">
                                      {opportunity.amount ? `$${parseFloat(opportunity.amount.toString()).toLocaleString()}` : 'No amount set'}
                                    </p>
                                  </div>
                                </div>
                                <Badge variant="secondary">
                                  {opportunity.stage.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </Badge>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Target className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-gray-500">No opportunities assigned</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="activities">
                  <ActivityFeed
                    entityType="contact"
                    entityId={selectedContact.id}
                    entityName={`${selectedContact.firstName} ${selectedContact.lastName}`}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete{" "}
              <span className="font-semibold">
                {contactToDelete ? `${contactToDelete.firstName} ${contactToDelete.lastName}` : "this contact"}
              </span>
              ? This action cannot be undone.
            </p>
          </div>
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteContact}
              disabled={deleteContactMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteContactMutation.isPending ? "Deleting..." : "Delete Contact"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}