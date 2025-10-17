import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { SundanceCatalogConfigurator } from './sundance-catalog-configurator';
import { TemplateBasedConfigurator } from './template-based-configurator';
import { Loader2 } from 'lucide-react';
import type { ConfiguratorTemplate } from '@shared/schema';

interface ProductConfiguratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: number;
  onConfigInserted: () => void;
}

export function ProductConfigurator({ 
  open, 
  onOpenChange, 
  quoteId,
  onConfigInserted 
}: ProductConfiguratorProps) {
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('');

  const { data: manufacturers, isLoading } = useQuery<string[]>({
    queryKey: ['/api/products/manufacturers'],
    enabled: open,
  });

  // Load configurator templates to check if template-based configurator exists
  const { data: templates } = useQuery<ConfiguratorTemplate[]>({
    queryKey: ['/api/configurator-templates'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/configurator-templates');
      return response.json();
    },
    enabled: open && !!selectedManufacturer,
  });

  // Check if selected manufacturer has an active template
  const hasTemplate = templates?.some(
    t => t.manufacturer === selectedManufacturer && t.isActive
  );

  const handleClose = () => {
    setSelectedManufacturer('');
    onOpenChange(false);
  };

  const handleConfigInserted = () => {
    onConfigInserted();
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Configure Product</DialogTitle>
          <DialogDescription>
            Select a manufacturer and configure product options for your quote
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !selectedManufacturer ? (
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Manufacturer</label>
              <Select value={selectedManufacturer} onValueChange={setSelectedManufacturer}>
                <SelectTrigger data-testid="select-manufacturer">
                  <SelectValue placeholder="Choose a manufacturer..." />
                </SelectTrigger>
                <SelectContent>
                  {manufacturers?.map((manufacturer) => (
                    <SelectItem key={manufacturer} value={manufacturer}>
                      {manufacturer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <>
            {/* Use template-based configurator if template exists */}
            {hasTemplate ? (
              <TemplateBasedConfigurator
                manufacturer={selectedManufacturer}
                quoteId={quoteId}
                onInsert={handleConfigInserted}
                onCancel={handleClose}
              />
            ) : selectedManufacturer === 'Sundance' ? (
              /* Fallback to legacy Sundance configurator */
              <SundanceCatalogConfigurator
                quoteId={quoteId}
                onInsert={handleConfigInserted}
                onCancel={handleClose}
              />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>Configurator for {selectedManufacturer} coming soon.</p>
                <p className="text-sm mt-2">No template configured for this manufacturer yet.</p>
                <Button onClick={handleClose} className="mt-4" data-testid="button-close-placeholder">
                  Close
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
