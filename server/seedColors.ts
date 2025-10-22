import { storage } from "./storage";

const defaultColors = [
  { name: "White", hexCode: "#FFFFFF" },
  { name: "Black", hexCode: "#000000" },
  { name: "Bronze", hexCode: "#8C7853" },
  { name: "Almond", hexCode: "#EED9C4" },
  { name: "Gray", hexCode: "#808080" },
  { name: "Charcoal", hexCode: "#36454F" },
];

async function seedColors() {
  console.log("Seeding default colors...");
  
  for (const color of defaultColors) {
    try {
      await storage.createColor(color);
      console.log(`Created color: ${color.name}`);
    } catch (error) {
      console.log(`Color ${color.name} may already exist, skipping...`);
    }
  }
  
  console.log("Color seeding complete!");
}

seedColors().catch(console.error);
