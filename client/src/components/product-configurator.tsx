import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { SundanceCatalogConfigurator } from './sundance-catalog-configurator';
import { Loader2 } from 'lucide-react';

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
            {selectedManufacturer === 'Sundance' && (
              <SundanceCatalogConfigurator
                quoteId={quoteId}
                onInsert={handleConfigInserted}
                onCancel={handleClose}
              />
            )}
            {selectedManufacturer !== 'Sundance' && (
              <div className="text-center py-12 text-muted-foreground">
                <p>Configurator for {selectedManufacturer} coming soon.</p>
                <p className="text-sm mt-2">Currently only Sundance catalog-style configurator is available.</p>
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
