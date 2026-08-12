// Bulletproof mapping of Vercel/Neon Postgres env vars to the DATABASE_URL expected by Prisma
// Surgically forces the schema query parameter to 'the_last_bundler' to isolate this app's tables from others!
let rawDatabaseUrl = process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.PRISMA_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (rawDatabaseUrl) {
  try {
    const parsedUrl = new URL(rawDatabaseUrl);
    parsedUrl.searchParams.set("schema", "the_last_bundler");
    process.env.DATABASE_URL = parsedUrl.toString();
  } catch (e) {
    process.env.DATABASE_URL = rawDatabaseUrl;
  }
}

import { shopifyApp } from "@shopify/shopify-app-express";
import { LATEST_API_VERSION } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

const resolvedHostName = (process.env.HOST || process.env.VERCEL_URL || "example.com")
  .replace(/^https?:\/\//, "");

// We construct a mock-friendly Shopify App setup so that tests can easily inject spies/mocks
export const shopify = shopifyApp({
  sessionStorage: new PrismaSessionStorage(prisma),
  api: {
    apiVersion: LATEST_API_VERSION,
    apiKey: process.env.SHOPIFY_API_KEY || "mock-api-key",
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "mock-secret-key",
    scopes: process.env.SCOPES ? process.env.SCOPES.split(",") : ["write_products", "read_products", "write_cart_transforms", "read_cart_transforms"],
    hostName: resolvedHostName,
    hostScheme: resolvedHostName.includes("localhost") ? "http" : "https",
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
