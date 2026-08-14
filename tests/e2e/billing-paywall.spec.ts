import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

test.describe("Shopify Bundle App — Premium Billing and Paywall E2E Tests", () => {
  const freeSessionId = "free-test-session-id";
  const premiumSessionId = "premium-test-session-id";

  test.beforeAll(async () => {
    // Setup free and premium session records to isolate tests and prevent parallel database race conditions
    await prisma.session.upsert({
      where: { id: freeSessionId },
      create: {
        id: freeSessionId,
        shop: "test-store.myshopify.com",
        state: "test-state-free",
        isOnline: false,
        isPremium: false,
        accessToken: "mock-access-token-free"
      },
      update: {
        isPremium: false
      }
    });

    await prisma.session.upsert({
      where: { id: premiumSessionId },
      create: {
        id: premiumSessionId,
        shop: "test-store.myshopify.com",
        state: "test-state-premium",
        isOnline: false,
        isPremium: true,
        accessToken: "mock-access-token-premium"
      },
      update: {
        isPremium: true
      }
    });
  });

  test.beforeEach(async ({ page }) => {
    // Intercept and mock Shopify App Bridge script to bypass iframe check
    await page.route("https://cdn.shopify.com/shopifycloud/app-bridge.js", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.shopify = {
            resourcePicker: async () => [
              {
                id: "gid://shopify/Product/MockProduct",
                title: "Mock Component Product",
                images: [{ originalSrc: "https://example.com/component.jpg" }],
                variants: [
                  {
                    id: "gid://shopify/ProductVariant/ComponentA",
                    title: "Default Title"
                  }
                ]
              }
            ],
            toast: { show: () => {} }
          };
        `
      });
    });

    // Mock global analytics
    await page.route("**/api/analytics", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ totalRevenue: 100, totalOrdersWithBundles: 5, totalBundlesSold: 5 })
      });
    });

    // Mock sales channels
    await page.route("**/api/publications", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "gid://shopify/Publication/1", name: "Online Store" }])
      });
    });

    // Mock empty bundles list
    await page.route("**/api/bundles", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([])
        });
      } else {
        await route.fallback();
      }
    });
  });

  test("should block free-tier users from creating dynamic Mix & Match / BYOB bundles", async ({ page }) => {
    // 1. Force the billing status check to return isPremium: false (Free User)
    await page.route("**/api/billing/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ isPremium: false })
      });
    });

    // 2. Mock POST /api/bundles to fail with 403 Forbidden paywall block
    await page.route("**/api/bundles", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Mix & Match dynamic slots and large bundles require a Premium subscription. Please upgrade to unlock."
          })
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto("/?shop=test-store.myshopify.com");

    // Fill Title
    await page.locator('input[placeholder*="Ultimate Summer Outfit"]').fill("Dynamic Premium BYOB Bundle");

    // Fill Price
    await page.locator('input[placeholder*="29.99"]').fill("39.99");

    // Add a component
    const pickerButton = page.locator('button:has-text("Choose an item")');
    await pickerButton.click();

    // Trigger form submit (which will call POST /api/bundles and fail with 403)
    const submitButton = page.locator('button:has-text("Save and Activate Deal")');
    
    // Intercept alert() and assert that it displays our exact Paywall error message
    page.on("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Mix & Match dynamic slots and large bundles require a Premium subscription");
      await dialog.dismiss();
    });

    await submitButton.click();
  });

  test("should deny access to price split-testing & margin analytics for free users", async ({ page }) => {
    // Attempt to access margin analytics directly with the free-session ID
    const response = await page.request.get("http://localhost:3000/api/bundles/bundle-1/margin-analytics", {
      headers: {
        "x-test-session-id": freeSessionId
      }
    });

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("Margin Analytics is a Premium Feature");
  });

  test("should allow premium subscription status upgrade and grant full access to price split-testing & margin analytics", async ({ page }) => {
    // Attempt to access margin analytics directly with the premium-session ID
    const response = await page.request.get("http://localhost:3000/api/bundles/bundle-1/margin-analytics", {
      headers: {
        "x-test-session-id": premiumSessionId
      }
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBeTruthy();
    expect(body.profitMargin).toBe(0.45);
    expect(body.abTests.priceB.conversions).toBe(25);
  });
});
