type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  markupType: string;
  markupValue: number;
  discountType?: string;
  discountValue?: number;
  isTaxable?: boolean;
  configData?: Record<string, any>;
};

export function addConfiguredItemToQuote(item: LineItem) {
  // This is a temporary logging function
  // The actual integration will be done in the ScreenConfigurator page
  // by calling the createLineItemMutation with the quoteId
  console.log("ADD-LINE-ITEM →", item);
}
