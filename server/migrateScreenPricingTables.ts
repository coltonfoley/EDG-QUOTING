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
  housingRules: any[];
  adders: any;
  specialQuoteFlags: any;
}

async function migrateScreenPricingTables() {
  console.log("Starting screen pricing tables migration...");

  const screenConfigs = [
    {
      name: "Insect Screen (Gaposa)",
      matrix: insectMatrix as Matrix,
    },
    {
      name: "Solar Screen (Gaposa)",
      matrix: solarMatrix as Matrix,
    },
    {
      name: "Vinyl Window Screen (Gaposa)",
      matrix: vinylMatrix as Matrix,
    },
  ];

  for (const config of screenConfigs) {
    console.log(`\nMigrating pricing for ${config.name}...`);
    
    // Find the product
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.name, config.name))
      .limit(1);

    if (!product) {
      console.error(`  ERROR: Product not found! Skipping.`);
      continue;
    }

    console.log(`  Product ID: ${product.id}`);

    // Delete existing pricing tables for this product
    const deleteResult = await db
      .delete(pricingTables)
      .where(eq(pricingTables.productId, product.id));
    console.log(`  Deleted ${deleteResult.rowCount || 0} existing pricing records`);

    // Convert the matrix table to pricing table bands
    const widthKeys = Object.keys(config.matrix.table).map(Number).sort((a, b) => a - b);
    
    const pricingRecords: Array<{
      productId: number;
      lengthMin: string;
      lengthMax: string;
      widthMin: string;
      widthMax: string;
      retailPrice: string;
      basePrice: string;
    }> = [];

    for (let i = 0; i < widthKeys.length; i++) {
      const widthMin = widthKeys[i];
      const widthMax = widthKeys[i + 1] || config.matrix.meta.heightMax; // Use heightMax as upper bound for last band
      
      const heightPrices = config.matrix.table[widthMin];
      const heightKeys = Object.keys(heightPrices).map(Number).sort((a, b) => a - b);

      for (let j = 0; j < heightKeys.length; j++) {
        const heightMin = heightKeys[j];
        const heightMax = heightKeys[j + 1] || config.matrix.meta.heightMax; // Use heightMax as upper bound for last band
        const retailPrice = heightPrices[heightMin];

        // Calculate base price (retail price with discount applied)
        // Using the product's default discount settings
        const discountType = product.defaultDiscountType;
        const discountValue = parseFloat(product.defaultDiscountValue);
        let basePrice: number;

        if (discountType === "percentage") {
          basePrice = retailPrice * (1 - discountValue / 100);
        } else {
          basePrice = retailPrice - discountValue;
        }

        pricingRecords.push({
          productId: product.id,
          lengthMin: heightMin.toString(),
          lengthMax: heightMax.toString(),
          widthMin: widthMin.toString(),
          widthMax: widthMax.toString(),
          retailPrice: retailPrice.toString(),
          basePrice: basePrice.toFixed(2),
        });
      }
    }

    // Insert all pricing records
    if (pricingRecords.length > 0) {
      await db.insert(pricingTables).values(pricingRecords);
      console.log(`  Created ${pricingRecords.length} pricing table records`);
      
      // Show sample
      console.log(`  Sample bands:`);
      pricingRecords.slice(0, 3).forEach(record => {
        console.log(`    W ${record.widthMin}-${record.widthMax}" x H ${record.lengthMin}-${record.lengthMax}": $${record.retailPrice} (base: $${record.basePrice})`);
      });
    }
  }

  console.log("\nScreen pricing tables migration completed!");
}

// Run migration
migrateScreenPricingTables()
  .then(() => {
    console.log("\nMigration successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration failed:", error);
    process.exit(1);
  });
