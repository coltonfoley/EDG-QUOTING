import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SundanceCatalogConfigurator } from './sundance-catalog-configurator';

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
  const handleClose = () => {
    onOpenChange(false);
  };

  const handleConfigInserted = () => {
    onConfigInserted();
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        handleClose();
      }
    }}>
      <DialogContent className="flex max-h-[92vh] max-w-[calc(100vw-2rem)] flex-col overflow-hidden xl:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Sundance Builder</DialogTitle>
          <DialogDescription>
            Build a Sundance louvered roof package from approved parts, colors, and quantities.
          </DialogDescription>
        </DialogHeader>
        <SundanceCatalogConfigurator
          quoteId={quoteId}
          onInsert={handleConfigInserted}
          onCancel={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}
