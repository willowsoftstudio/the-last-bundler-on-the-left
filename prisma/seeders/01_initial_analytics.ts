import { PrismaClient } from "@prisma/client";

export async function up(prisma: PrismaClient) {
  await prisma.analytics.upsert({
    where: { id: "global_analytics" },
    update: {},
    create: {
      id: "global_analytics",
      totalRevenue: 0,
      totalOrdersWithBundles: 0,
      totalBundlesSold: 0
    }
  });
}
