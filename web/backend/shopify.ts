import { shopifyApp } from "@shopify/shopify-app-express";
import { LATEST_API_VERSION } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// We construct a mock-friendly Shopify App setup so that tests can easily inject spies/mocks
export const shopify = shopifyApp({
  sessionStorage: new PrismaSessionStorage(prisma),
  api: {
    apiVersion: LATEST_API_VERSION,
    apiKey: process.env.SHOPIFY_API_KEY || "mock-api-key",
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "mock-secret-key",
    scopes: ["write_products", "read_products", "write_cart_transforms", "read_cart_transforms"],
    hostName: process.env.HOST || "example.com",
    isEmbeddedApp: true,
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
});

export default shopify;
