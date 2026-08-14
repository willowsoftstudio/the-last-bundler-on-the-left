# QA & Testing Guide — Shopify Cart Transform Bundle App

This document outlines the comprehensive test scenarios required to achieve **100% full-coverage assurance** for the Shopify Cart Transform Bundle App. It covers automated unit testing, manual verification, security auditing, and includes an end-to-end (E2E) testing blueprint using **Playwright**.

---

## 1. Test Scenarios Matrix

| ID | Category | Component | Scenario Description | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Unit (Vitest) | Cart Transform | Empty active bundle metafield on shop. | Returns empty operations (no transformation). |
| **TC-02** | Unit (Vitest) | Cart Transform | Corrupted JSON value in metafield. | Gracefully returns empty operations without crashing. |
| **TC-03** | Unit (Vitest) | Cart Transform | Store has active bundle A (requires items X + Y), but cart only has item X. | Returns empty operations (bundle condition not met). |
| **TC-04** | Unit (Vitest) | Cart Transform | Cart contains exactly the components needed for bundle A (1x X + 1x Y). | Outputs a `linesMerge` operation combining lines X & Y into parent variant bundle A. |
| **TC-05** | Unit (Vitest) | Cart Transform | Cart has overlapping bundles (Greedy Match check). | Largest bundle (by quantity of parts) merges first, remaining items merge into smaller deals if eligible. |
| **TC-06** | Unit (Vitest) | Cart Transform | Mix & Match bundle with dynamic `validVariantIds` list. | Merges qualifying items of different variants correctly according to the mix & match group rules. |
| **TC-07** | Integration | REST API | `POST /api/bundles` with missing fields. | Returns `400 Bad Request` with error details. |
| **TC-08** | Integration | REST API | `POST /api/bundles` with valid payload. | 1. Creates unlisted Shopify product.<br>2. Sets `requiresComponents: true` on variant.<br>3. **Claims active app ownership** (`claimOwnership`).<br>4. Saves metadata in Shopify metafields.<br>5. Creates row in DB (Postgres) with selected `salesChannels`. |
| **TC-09** | Integration | REST API | `GET /api/bundles/:id/analytics` for new bundle. | Returns zeroed analytics, empty transaction log, and real-time stock levels of components. |
| **TC-10** | Webhook | Security | `POST /api/webhooks` with invalid HMAC header. | Returns `401 Unauthorized` (prevents signature spoofing). |
| **TC-11** | Webhook | Event Ingest | `POST /api/webhooks` with `orders/create` payload containing parent bundle. | 1. Queries Shopify via offline session for component prices.<br>2. Computes discount/savings dynamically.<br>3. Inserts detailed record in `BundleOrder`.<br>4. Increments `BundleAnalytics` stats (Revenue, Sold, Orders, Savings).<br>5. Updates global `Analytics`. |
| **TC-12** | Webhook | Event Ingest | `POST /api/webhooks` with `app/uninstalled`. | Cleans up local database rows for the uninstalled shop. |
| **TC-13** | UI / UX | Accordion | Click active deal in dashboard. | Card border highlights in green, opens statistics panel, loads stats via loader, fetches live component stock. |
| **TC-14** | UI / UX | Stock Watcher | Component has inventory <= 5. | Displays red warning badge: `⚠️ Low stock (X)`. |
| **TC-15** | UI / UX | Stock Watcher | Component has inventory > 5. | Displays green indicator: `🟢 X in stock`. |

---

## 2. Implementing Playwright for E2E Testing

Yes, **Playwright** is the industry standard for testing Shopify apps. Because our app is embedded in an `iframe` inside the Shopify Admin UI, E2E testing has specific architectural challenges:
1. **Shopify OAuth Redirection:** Playwright needs to bypass or handle the multi-factor authentication (MFA) and login screen of Shopify.
2. **Iframe Context Switching:** The app resides in an iframe hosted on our server but loaded inside `admin.shopify.com`.
3. **App Bridge Handshake:** The frontend expects `app-bridge.js` to handshake with the parent frame.

### 2.1 E2E Architecture Blueprint

To bypass logging into Shopify on every test run (which triggers bot detection / recaptcha), we use **Session Storage Preservation** and **API-level Mocking**:

```
                  ┌──────────────────────────────┐
                  │ Playwright Browser Instance │
                  └──────────────┬───────────────┘
                                 │ Load /
                                 ▼
                  ┌──────────────────────────────┐
                  │  Shopify Admin Parent Page   │
                  │   (admin.shopify.com/store)  │
                  └──────────────┬───────────────┘
                                 │
                        [Switches Context]
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │      Embedded Iframe         │
                  │    (our-app-url.vercel.app)  │
                  └──────────────────────────────┘
```

### 2.2 Playwright Setup Guide

#### Step 1: Install Playwright
Install Playwright and TypeScript helper types in your dev dependencies:
```bash
npm install -D @playwright/test
npx playwright install --with-deps
```

#### Step 2: Create Playwright Config (`playwright.config.ts`)
Create this file in your root folder:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.SHOPIFY_APP_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    // Preserve authentication state across tests
    storageState: 'tests/e2e/.auth/user.json',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

#### Step 3: Write E2E Login & Iframe Interactivity Test (`tests/e2e/bundle-flow.spec.ts`)
```typescript
import { test, expect } from '@playwright/test';

test.describe('Shopify Embedded Bundle App E2E Tests', () => {
  test('should load App Dashboard, create a bundle, and verify it in the Active Deals list', async ({ page }) => {
    // 1. Navigate to the Shopify Admin App URL (Replace with your development store details)
    const storeName = 'my-development-store';
    const appId = process.env.SHOPIFY_API_KEY;
    await page.goto(`https://admin.shopify.com/store/${storeName}/apps/bundle-deals-app`);

    // 2. Wait for Shopify Admin layout to mount
    await page.waitForSelector('#AppFrame');

    // 3. Switch context to the embedded app iframe
    const iframeElement = await page.waitForSelector('iframe[name="app-iframe"]');
    const appFrame = await iframeElement.contentFrame();
    if (!appFrame) {
      throw new Error("Could not acquire App Iframe context!");
    }

    // 4. Verify Dashboard Header is visible inside the iframe
    const dashboardHeader = appFrame.locator('h1:has-text("Bundles & Deals")');
    await expect(dashboardHeader).toBeVisible();

    // 5. Fill out the "Create a New Deal" Form
    await appFrame.fill('input[placeholder*="Ultimate Summer Outfit"]', 'E2E Test Bundle');
    await appFrame.fill('input[type="number"][required]', '49.99');

    // 6. Select Components (Mocking Shopify Resource Picker interaction)
    // In E2E, window.shopify.resourcePicker can be mocked or triggered:
    await appFrame.click('text="+ Add another item"');
    
    // 7. Click Save
    await appFrame.click('button:has-text("Save and Activate Deal")');

    // 8. Confirm Toast Message
    const toast = appFrame.locator('text="Bundle created successfully!"');
    await expect(toast).toBeVisible();

    // 9. Click on the newly created bundle in "Your Active Deals" list
    const activeDealCard = appFrame.locator('div:has-text("E2E Test Bundle")').first();
    await activeDealCard.click();

    // 10. Verify that detailed analytics sections expand
    const analyticsHeader = appFrame.locator('h5:has-text("Performance Analytics")');
    await expect(analyticsHeader).toBeVisible();
    
    const stockHeader = appFrame.locator('h5:has-text("Component Stock Levels")');
    await expect(stockHeader).toBeVisible();
  });
});
```

#### Step 4: Automate Webhook Simulation inside Playwright E2E
To test your `orders/create` webhook end-to-end, your Playwright script can trigger a post request directly to your webhook route with a mock payload and then assert that the expanded analytics card updates in real-time on the browser:

```typescript
test('should dynamically update bundle stats inside the card upon receiving an orders/create webhook', async ({ page, request }) => {
  const storeName = 'my-development-store';
  await page.goto(`https://admin.shopify.com/store/${storeName}/apps/bundle-deals-app`);

  const iframeElement = await page.waitForSelector('iframe[name="app-iframe"]');
  const appFrame = await iframeElement.contentFrame();
  if (!appFrame) throw new Error("Could not acquire App Iframe context!");

  // Expand the card
  const activeDealCard = appFrame.locator('div:has-text("E2E Test Bundle")').first();
  await activeDealCard.click();

  // Retrieve previous revenue value
  const initialRevenueText = await appFrame.locator('p:has-text("Revenue") + h4').textContent();
  const initialRevenue = parseFloat(initialRevenueText?.replace('$', '') || '0.00');

  // Trigger a mock Webhook call using Playwright's API Request client
  const webhookResponse = await request.post('http://localhost:3000/api/webhooks', {
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': `${storeName}.myshopify.com`,
      'x-shopify-hmac-sha256': 'valid-mocked-hmac-signature-here' // (Your webhook verification function can have test un-bypass or a test mock key)
    },
    data: {
      id: 999999,
      line_items: [
        {
          variant_id: 45822507352243, // your bundle parent variant numeric ID
          price: '49.99',
          quantity: 1
        }
      ],
      customer: {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@example.com'
      }
    }
  });

  expect(webhookResponse.ok()).toBeTruthy();

  // Wait for the UI card to poll and dynamically update the stats
  const expectedNewRevenue = `$${(initialRevenue + 49.99).toFixed(2)}`;
  await expect(appFrame.locator('p:has-text("Revenue") + h4')).toHaveText(expectedNewRevenue, { timeout: 10000 });
});
```
