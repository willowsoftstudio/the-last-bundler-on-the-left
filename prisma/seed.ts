import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedersDir = path.join(__dirname, "seeders");

async function main() {
  console.log("🌱 Starting Prisma Database Seeder Engine...");
  
  const files = fs.readdirSync(seedersDir).filter(f => f.endsWith(".ts") || f.endsWith(".js")).sort();

  for (const file of files) {
    const seedId = file;

    // Check if seeder has already been run
    const existing = await prisma.seederMigration.findUnique({
      where: { id: seedId }
    });

    if (existing) {
      console.log(`✅ Skipping [${seedId}] (Already Applied)`);
      continue;
    }

    console.log(`⏳ Running [${seedId}]...`);
    const seederModule = await import(path.join(seedersDir, file));
    
    if (typeof seederModule.up !== "function") {
      console.error(`❌ Seeder [${seedId}] is missing the exported 'up' function!`);
      process.exit(1);
    }

    try {
      await seederModule.up(prisma);
      await prisma.seederMigration.create({ data: { id: seedId } });
      console.log(`✅ Successfully applied [${seedId}]`);
    } catch (e) {
      console.error(`❌ Failed to apply [${seedId}]:`, e);
      process.exit(1);
    }
  }

  console.log("🌲 All seeders applied successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
