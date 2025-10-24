import { useState } from "react";
import { Plus, Trash2, Edit2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import type { SecondaryContact } from "@shared/schema";
import { nanoid } from "nanoid";

interface SecondaryContactsManagerProps {
  contacts: SecondaryContact[];
  onChange: (contacts: SecondaryContact[]) => void;
}

export function SecondaryContactsManager({ contacts, onChange }: SecondaryContactsManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<SecondaryContact>>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "",
  });

  const handleAdd = () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.phone) {
      return;
    }

    const newContact: SecondaryContact = {
      id: nanoid(),
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      role: formData.role || undefined,
      isPrimary: false,
    };

    onChange([...contacts, newContact]);
    setFormData({ firstName: "", lastName: "", email: "", phone: "", role: "" });
    setIsAdding(false);
  };

  const handleEdit = (contact: SecondaryContact) => {
    setEditingId(contact.id);
    setFormData(contact);
  };

  const handleUpdate = () => {
    if (!editingId || !formData.firstName || !formData.lastName || !formData.email || !formData.phone) {
      return;
    }

    const updatedContacts = contacts.map((c) =>
      c.id === editingId
        ? {
            ...c,
            firstName: formData.firstName!,
            lastName: formData.lastName!,
            email: formData.email!,
            phone: formData.phone!,
            role: formData.role || undefined,
          }
        : c
    );

    onChange(updatedContacts);
    setEditingId(null);
    setFormData({ firstName: "", lastName: "", email: "", phone: "", role: "" });
  };

  const handleDelete = (id: string) => {
    onChange(contacts.filter((c) => c.id !== id));
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ firstName: "", lastName: "", email: "", phone: "", role: "" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Additional Contacts</Label>
        {!isAdding && !editingId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
            data-testid="button-add-contact"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        )}
      </div>

      {/* Existing Contacts List */}
      <div className="space-y-2">
        {contacts.map((contact) => (
          <Card key={contact.id} className="p-4">
            {editingId === contact.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`edit-firstName-${contact.id}`}>First Name</Label>
                    <Input
                      id={`edit-firstName-${contact.id}`}
                      value={formData.firstName || ""}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      data-testid={`input-edit-firstname-${contact.id}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`edit-lastName-${contact.id}`}>Last Name</Label>
                    <Input
                      id={`edit-lastName-${contact.id}`}
                      value={formData.lastName || ""}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      data-testid={`input-edit-lastname-${contact.id}`}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`edit-email-${contact.id}`}>Email</Label>
                    <Input
                      id={`edit-email-${contact.id}`}
                      type="email"
                      value={formData.email || ""}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      data-testid={`input-edit-email-${contact.id}`}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`edit-phone-${contact.id}`}>Phone</Label>
                    <Input
                      id={`edit-phone-${contact.id}`}
                      value={formData.phone || ""}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      data-testid={`input-edit-phone-${contact.id}`}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor={`edit-role-${contact.id}`}>Role/Title (Optional)</Label>
                  <Input
                    id={`edit-role-${contact.id}`}
                    value={formData.role || ""}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="e.g., Operations Manager"
                    data-testid={`input-edit-role-${contact.id}`}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    data-testid={`button-cancel-edit-${contact.id}`}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleUpdate}
                    data-testid={`button-save-edit-${contact.id}`}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-medium">
                    {contact.firstName} {contact.lastName}
                    {contact.role && <span className="text-sm text-muted-foreground ml-2">({contact.role})</span>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    <div>{contact.email}</div>
                    <div>{contact.phone}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(contact)}
                    data-testid={`button-edit-contact-${contact.id}`}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(contact.id)}
                    data-testid={`button-delete-contact-${contact.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Add New Contact Form */}
      {isAdding && (
        <Card className="p-4 border-2 border-dashed">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="new-firstName">First Name *</Label>
                <Input
                  id="new-firstName"
                  value={formData.firstName || ""}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  data-testid="input-new-firstname"
                />
              </div>
              <div>
                <Label htmlFor="new-lastName">Last Name *</Label>
                <Input
                  id="new-lastName"
                  value={formData.lastName || ""}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  data-testid="input-new-lastname"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="new-email">Email *</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="input-new-email"
                />
              </div>
              <div>
                <Label htmlFor="new-phone">Phone *</Label>
                <Input
                  id="new-phone"
                  value={formData.phone || ""}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  data-testid="input-new-phone"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="new-role">Role/Title (Optional)</Label>
              <Input
                id="new-role"
                value={formData.role || ""}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g., Operations Manager"
                data-testid="input-new-role"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                data-testid="button-cancel-add"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAdd}
                disabled={!formData.firstName || !formData.lastName || !formData.email || !formData.phone}
                data-testid="button-save-add"
              >
                <Check className="h-4 w-4 mr-1" />
                Add Contact
              </Button>
            </div>
          </div>
        </Card>
      )}

      {contacts.length === 0 && !isAdding && (
        <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
          No additional contacts. Click "Add Contact" to add one.
        </div>
      )}
    </div>
  );
}
