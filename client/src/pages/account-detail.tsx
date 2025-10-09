import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Users, Briefcase, Plus, Edit, Trash2, Phone, Mail, ChevronLeft, Star, User, FolderPlus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AccountForm } from "@/components/forms/account-form";
import { ContactForm } from "@/components/forms/contact-form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Account, Contact, Quote } from "@shared/schema";
import { format } from "date-fns";
import { getDealStageColor, getDealStageLabel } from "@shared/dealStageConstants";

interface AccountDetails extends Account {
  contacts: Contact[];
  quotes: Quote[];
  contactCount: number;
  projectCount: number;
}

export default function AccountDetail() {
  const [match, params] = useRoute("/accounts/:id");
  const accountId = match ? parseInt(params.id) : null;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  
  const [editAccountOpen, setEditAccountOpen] = useState(false);
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const { data: account, isLoading, error } = useQuery<AccountDetails>({
    queryKey: [`/api/accounts/${accountId}/details`],
    enabled: isAuthenticated && accountId !== null,
  });

  // Delete contact mutation
  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      return await apiRequest("DELETE", `/api/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/details`] });
      toast({
        title: "Team member deleted",
        description: "The team member has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete team member. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAccountUpdated = () => {
    setEditAccountOpen(false);
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/details`] });
    toast({
      title: "Client updated",
      description: "The client has been successfully updated.",
    });
  };

  const handleContactSaved = () => {
    setCreateContactOpen(false);
    setEditContact(null);
    queryClient.invalidateQueries({ queryKey: [`/api/accounts/${accountId}/details`] });
    toast({
      title: editContact ? "Team member updated" : "Team member added",
      description: `The team member has been successfully ${editContact ? 'updated' : 'added'}.`,
    });
  };

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case "general_contractor":
        return "bg-blue-100 text-blue-800";
      case "homeowner":
        return "bg-green-100 text-green-800";
      case "commercial":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatAccountType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };


  if (!accountId) {
    navigate("/accounts");
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-10 w-32 mb-8" />
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-56" />
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-gray-500">Client not found or you don't have permission to view it.</p>
              <Button 
                className="mt-4"
                onClick={() => navigate("/accounts")}
                data-testid="button-back-to-clients"
              >
                Back to Clients
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/accounts")}
          className="mb-6"
          data-testid="button-back"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Clients
        </Button>

        {/* Client Information Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Building2 className="h-8 w-8 text-gray-600" />
                  <div>
                    <CardTitle className="text-2xl">
                      {account.company || account.name}
                    </CardTitle>
                    {(account.firstName || account.lastName) && (
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {account.firstName} {account.lastName}
                      </p>
                    )}
                    <p className="text-gray-600">{account.email} • {account.phone}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge className={getAccountTypeColor(account.accountType)}>
                  {formatAccountType(account.accountType)}
                </Badge>
                <Button
                  onClick={() => setEditAccountOpen(true)}
                  size="sm"
                  data-testid="button-edit-client"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Client
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Payment Terms</p>
                <p className="font-medium">{account.paymentTerms?.replace('_', ' ').toUpperCase() || 'NET 30'}</p>
              </div>
              {account.billingAddress && (
                <div>
                  <p className="text-sm text-gray-500">Billing Address</p>
                  <p className="font-medium">{account.billingAddress}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="font-medium">
                  {account.createdAt ? format(new Date(account.createdAt), 'MMM d, yyyy') : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Two Column Layout for Contacts and Quotes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Members Section */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Team Members
                  </CardTitle>
                  <CardDescription>
                    {account.contactCount} team member{account.contactCount !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setCreateContactOpen(true)}
                  data-testid="button-new-team-member"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Team Member
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {account.contacts.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">
                    No team members yet. Add your first team member to get started.
                  </p>
                ) : (
                  account.contacts.map(contact => (
                    <div 
                      key={contact.id}
                      className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                      data-testid={`card-team-member-${contact.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">
                              {contact.firstName} {contact.lastName}
                            </p>
                            {contact.isPrimary && (
                              <Badge className="bg-yellow-100 text-yellow-800">
                                <Star className="h-3 w-3 mr-1" />
                                Primary
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{contact.role}</p>
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {contact.email}
                            </span>
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditContact(contact);
                              setCreateContactOpen(true);
                            }}
                            data-testid={`button-edit-team-member-${contact.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                data-testid={`button-delete-team-member-${contact.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Team Member</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {contact.firstName} {contact.lastName}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteContactMutation.mutate(contact.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                  data-testid="button-confirm-delete"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quotes Section */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Quotes
                  </CardTitle>
                  <CardDescription>
                    {account.quotes?.length || 0} quote{account.quotes?.length !== 1 ? 's' : ''} for this client
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate("/quotes")}
                  data-testid="button-new-quote"
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New Quote
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {account.quotes.length === 0 ? (
                  <p className="text-center py-8 text-gray-500">
                    No quotes yet. Create your first quote to get started.
                  </p>
                ) : (
                  account.quotes.map(quote => (
                    <div 
                      key={quote.id}
                      className="p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/quotes/${quote.id}/edit`)}
                      data-testid={`card-quote-${quote.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">
                            {quote.projectName || quote.quoteNumber}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            {quote.projectAddress || 'No address specified'}
                          </p>
                          <p className="text-sm text-gray-600 mt-2">
                            Created {quote.createdAt ? format(new Date(quote.createdAt), 'MMM d, yyyy') : 'N/A'}
                          </p>
                        </div>
                        <Badge className={getDealStageColor(quote.dealStage || 'new_lead')}>
                          {getDealStageLabel(quote.dealStage || 'new_lead')}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Client Dialog */}
      <Dialog open={editAccountOpen} onOpenChange={setEditAccountOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <AccountForm 
            account={account}
            onSuccess={handleAccountUpdated}
            onCancel={() => setEditAccountOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Create/Edit Team Member Dialog */}
      <Dialog open={createContactOpen} onOpenChange={(open) => {
        setCreateContactOpen(open);
        if (!open) setEditContact(null);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editContact ? 'Edit Team Member' : 'Add Team Member'}</DialogTitle>
          </DialogHeader>
          <ContactForm 
            accountId={accountId}
            contact={editContact}
            onSuccess={handleContactSaved}
            onCancel={() => {
              setCreateContactOpen(false);
              setEditContact(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}