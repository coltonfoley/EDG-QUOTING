import { db } from "./db";
import { products, pricingTables } from "@shared/schema";
import insectMatrix from "../client/src/features/screens/data/insect_matrix.json";
import solarMatrix from "../client/src/features/screens/data/solar_matrix.json";
import vinylMatrix from "../client/src/features/screens/data/vinyl_matrix.json";
import { eq } from "drizzle-orm";

interface Matrix {
  meta: {
    heightMax: number;
    notes: string[];
  };
  table: Record<string, Record<string, number>>;
  housingRules: Array<{
    maxW: number;
    maxH: number;
    housing: string;
    roller: string;
  }>;
  adders: {
    remote: number;
    uChannelPerLf: number | null;
    colorUpchargePct: number;
    fabricUpcharges: Record<string, number>;
  };
  specialQuoteFlags: {
    fabrics: string[];
  };
}

async function migrateScreenProducts() {
  console.log("Starting screen products migration...");

  const screenProducts = [
    {
      name: "Insect Screen (Gaposa)",
      matrix: insectMatrix as Matrix,
      type: "INSECT",
    },
    {
      name: "Solar Screen (Gaposa)",
      matrix: solarMatrix as Matrix,
      type: "SOLAR",
    },
    {
      name: "Vinyl Window Screen (Gaposa)",
      matrix: vinylMatrix as Matrix,
      type: "VINYL",
    },
  ];

  for (const screen of screenProducts) {
    console.log(`\nMigrating ${screen.name}...`);
    
    // Calculate dimensional bounds from the pricing table
    const widths = Object.keys(screen.matrix.table).map(Number);
    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);
    
    // Get all heights from the table
    const allHeights: number[] = [];
    Object.values(screen.matrix.table).forEach((widthBand) => {
      Object.keys(widthBand).forEach((height) => {
        allHeights.push(Number(height));
      });
    });
    const minHeight = Math.min(...allHeights);
    const maxHeight = screen.matrix.meta.heightMax;

    // Check if product already exists
    const existing = await db
      .select()
      .from(products)
      .where(eq(products.name, screen.name))
      .limit(1);

    let productId: number;

    if (existing.length > 0) {
      console.log(`  Product already exists (ID: ${existing[0].id}), updating...`);
      
      // Update existing product
      await db
        .update(products)
        .set({
          description: screen.matrix.meta.notes.join(". "),
          manufacturer: "Gaposa",
          productType: "configurable",
          defaultUnitPrice: "0", // Base price comes from dimensional pricing
          defaultMarkupType: "percentage",
          defaultMarkupValue: "25",
          defaultDiscountType: "percentage",
          defaultDiscountValue: "0",
          unit: "each",
          minLength: minHeight.toString(),
          maxLength: maxHeight.toString(),
          minWidth: minWidth.toString(),
          maxWidth: maxWidth.toString(),
          adderPricing: screen.matrix.adders,
          housingRules: screen.matrix.housingRules,
        })
        .where(eq(products.id, existing[0].id));
      
      productId = existing[0].id;
    } else {
      console.log(`  Creating new product...`);
      
      // Create new product
      const [newProduct] = await db
        .insert(products)
        .values({
          name: screen.name,
          description: screen.matrix.meta.notes.join(". "),
          manufacturer: "Gaposa",
          productType: "configurable",
          defaultUnitPrice: "0", // Base price comes from dimensional pricing
          defaultMarkupType: "percentage",
          defaultMarkupValue: "25",
          defaultDiscountType: "percentage",
          defaultDiscountValue: "0",
          unit: "each",
          minLength: minHeight.toString(),
          maxLength: maxHeight.toString(),
          minWidth: minWidth.toString(),
          maxWidth: maxWidth.toString(),
          adderPricing: screen.matrix.adders,
          housingRules: screen.matrix.housingRules,
        })
        .returning();
      
      productId = newProduct.id;
    }

    console.log(`  Product ID: ${productId}`);
    console.log(`  Dimensions: W ${minWidth}-${maxWidth}" x H ${minHeight}-${maxHeight}"`);
    console.log(`  Adders: Remote $${screen.matrix.adders.remote}, Color upcharge ${screen.matrix.adders.colorUpchargePct * 100}%`);
    console.log(`  Housing rules: ${screen.matrix.housingRules.length} rules stored`);

    // Migrate pricing table in next step (task 4)
    console.log(`  Pricing table migration will be done in next step`);
  }

  console.log("\nScreen products migration completed!");
}

// Run migration
migrateScreenProducts()
  .then(() => {
    console.log("\nMigration successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration failed:", error);
    process.exit(1);
  });
