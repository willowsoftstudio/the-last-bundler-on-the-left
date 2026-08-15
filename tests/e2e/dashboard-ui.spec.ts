import { test, expect } from "@playwright/test";

test.describe("Shopify Bundle App — Dashboard UI E2E Tests (Mocked API)", () => {
  let mockBundlesList = [
    {
      id: "bundle-1",
      title: "Summer outfit deal",
      parentVariantId: "gid://shopify/ProductVariant/Parent123",
      components: [
        { variantId: "gid://shopify/ProductVariant/ComponentA", quantity: 2, title: "Summer Tee" },
        { variantId: "gid://shopify/ProductVariant/ComponentB", quantity: 1, title: "Summer Shorts" }
      ],
      salesChannels: ["gid://shopify/Publication/1"],
      status: "ACTIVE"
    }
  ];

  test.beforeEach(async ({ page }) => {
    // 1. Intercept GET /api/bundles to return mock bundles list
    await page.route("**/api/bundles", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockBundlesList)
      });
    });

    // Intercept PATCH /api/bundles/bundle-1 to update the status in mockBundlesList
    await page.route("**/api/bundles/bundle-1", async (route) => {
      if (route.request().method() === "PATCH") {
        const payload = JSON.parse(route.request().postData() || "{}");
        mockBundlesList[0].status = payload.status;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, bundle: mockBundlesList[0] })
        });
      } else {
        await route.fallback();
      }
    });

    // 2. Intercept GET /api/analytics to return mock global analytics
    await page.route("**/api/analytics", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totalRevenue: 1540.50,
          totalOrdersWithBundles: 35,
          totalBundlesSold: 42
        })
      });
    });

    // 3. Intercept GET /api/publications to return mock sales channels
    await page.route("**/api/publications", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "gid://shopify/Publication/1", name: "Online Store" },
          { id: "gid://shopify/Publication/2", name: "Shop App" }
        ])
      });
    });

    // 4. Intercept GET /api/bundles/bundle-1/analytics to return mock detailed stats
    await page.route("**/api/bundles/bundle-1/analytics", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          analytics: {
            bundleId: "bundle-1",
            totalRevenue: 249.95,
            totalUnitsSold: 5,
            totalOrders: 5,
            totalDiscounts: 50.00
          },
          recentOrders: [
            { customerName: "Marla Singer", customerEmail: "marla@example.com" },
            { customerName: "Robert Paulson", customerEmail: "bob@example.com" }
          ],
          inventory: [
            { id: "gid://shopify/ProductVariant/ComponentA", title: "Summer Tee", inventory: 42 },
            { id: "gid://shopify/ProductVariant/ComponentB", title: "Summer Shorts", inventory: 2 } // Triggers low-stock warn!
          ]
        })
      });
    });

    // 5. Intercept and mock Shopify App Bridge script to bypass iframe check
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
  });

  test("should load the dashboard and render high-level overview analytics", async ({ page }) => {
    // Navigate directly to the app home page
    await page.goto("/?shop=test-store.myshopify.com");

    // Check dashboard headers
    await expect(page.locator('h1:has-text("Bundles & Deals")')).toBeVisible();

    // Check overview cards are rendered with mock data
    await expect(page.locator('p:has-text("Extra Money Made") + h2')).toHaveText("$1540.50");
    await expect(page.locator('p:has-text("Orders with Deals") + h2')).toHaveText("35");
    await expect(page.locator('p:has-text("Deals Sold") + h2')).toHaveText("42");
  });

  test("should render the Active Deals list and expand to show detailed stats, transaction log, and inventory indicators", async ({ page }) => {
    await page.goto("/?shop=test-store.myshopify.com");

    // Verify bundle title renders in the active list
    const bundleCard = page.locator('h4:has-text("Summer outfit deal")');
    await expect(bundleCard).toBeVisible();

    // Click on the bundle card to trigger expansion
    await page.locator('h4:has-text("Summer outfit deal")').click();

    // Verify detailed analytics panel expands
    await expect(page.locator('h5:has-text("Performance Analytics")')).toBeVisible();

    // Verify specific metrics are fetched and displayed
    await expect(page.locator('p:has-text("Revenue") + h4')).toHaveText("$249.95");
    await expect(page.locator('p:has-text("Customer Savings") + h4')).toHaveText("$50.00");

    // Verify low inventory stock warning and safe green stock indicators are displayed correctly
    await expect(page.locator('span:has-text("Summer Tee") + span')).toHaveText("🟢 42 in stock");
    await expect(page.locator('span:has-text("Summer Shorts") + span')).toHaveText("⚠️ Low stock (2)");

    // Verify the recent transactions log list displays recent buyers
    await expect(page.locator('span:has-text("Marla Singer")')).toBeVisible();
    await expect(page.locator('span:has-text("Robert Paulson")')).toBeVisible();
  });

  test("should show and hide standalone product form fields as expected when checked/unchecked", async ({ page }) => {
    await page.goto("/?shop=test-store.myshopify.com");

    const standaloneCheckbox = page.locator('label:has-text("Display as a standalone product") input');
    const descriptionLabel = page.locator('label:has-text("Deal Description")');
    const imageUrlLabel = page.locator('label:has-text("Product Image URL")');

    // Initially, because isVisible starts false, these fields should be hidden/non-existent
    await expect(descriptionLabel).toBeHidden();
    await expect(imageUrlLabel).toBeHidden();

    // Check the box to unhide fields
    await standaloneCheckbox.check();

    // Assert that the fields are now visible
    await expect(descriptionLabel).toBeVisible();
    await expect(imageUrlLabel).toBeVisible();

    // Fill them out to verify interactivity
    await page.locator('textarea[placeholder*="Describe why this deal is awesome"]').fill("Perfect outfit for warm weather!");
    await page.locator('input[placeholder*="my-bundle-image.jpg"]').fill("https://example.com/summer.jpg");

    // Uncheck to hide them again
    await standaloneCheckbox.uncheck();

    // Assert they are hidden once more
    await expect(descriptionLabel).toBeHidden();
    await expect(imageUrlLabel).toBeHidden();
  });

  test("should display and allow selection of mocked sales channels / publications", async ({ page }) => {
    await page.goto("/?shop=test-store.myshopify.com");

    const publishHeader = page.locator('label:has-text("Where should we publish this deal?")');
    await expect(publishHeader).toBeVisible();

    const onlineStoreCheckbox = page.locator('label:has-text("Online Store") input');
    const shopAppCheckbox = page.locator('label:has-text("Shop App") input');

    // Verify they render
    await expect(onlineStoreCheckbox).toBeVisible();
    await expect(shopAppCheckbox).toBeVisible();

    // Verify initial checked state
    await expect(onlineStoreCheckbox).toBeChecked();
    await expect(shopAppCheckbox).toBeChecked();

    // Untoggle Online Store
    await onlineStoreCheckbox.uncheck();
    await expect(onlineStoreCheckbox).not.toBeChecked();
    await expect(shopAppCheckbox).toBeChecked(); // should remain checked

    // Untoggle Shop App
    await shopAppCheckbox.uncheck();
    await expect(shopAppCheckbox).not.toBeChecked();
  });

  test("should submit the bundle with only the checked sales channels in the payload (confirming unchecked channels do not publish/merge)", async ({ page }) => {
    let capturedPayload: any = null;

    // Intercept POST /api/bundles specifically for this test
    await page.route("**/api/bundles", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        capturedPayload = JSON.parse(request.postData() || "{}");
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            bundle: {
              id: "bundle-e2e-channel-id",
              title: capturedPayload.title,
              price: capturedPayload.price,
              parentVariantId: "gid://shopify/ProductVariant/MockParentId",
              maxOrderLimit: capturedPayload.maxOrderLimit,
              maxCustomerLimit: capturedPayload.maxCustomerLimit,
              components: capturedPayload.components
            }
          })
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto("/?shop=test-store.myshopify.com");

    // 1. Fill Title
    await page.locator('input[placeholder*="Ultimate Summer Outfit"]').fill("E2E Custom Channel Deal");

    // 2. Select Component (clicks mock resourcePicker populated above)
    const pickerButton = page.locator('button:has-text("Choose an item")');
    await pickerButton.click();

    // Verify component variant selection populated correctly
    await expect(page.locator('button:has-text("Mock Component Product")')).toBeVisible();

    // 3. Fill Price
    await page.locator('input[placeholder*="29.99"]').fill("24.99");

    // 3b. Fill Limitations (Per-Order and Per-Customer limits)
    await page.locator('label:has-text("Max Bundles Per Checkout") + input').fill("3");
    await page.locator('label:has-text("Max Bundles Per Customer Lifetime") + input').fill("1");

    // 4. Sales Channels: By default they are both checked, so we uncheck "Shop App" explicitly!
    const onlineStoreCheckbox = page.locator('label:has-text("Online Store") input');
    const shopAppCheckbox = page.locator('label:has-text("Shop App") input');

    await expect(onlineStoreCheckbox).toBeChecked();
    await expect(shopAppCheckbox).toBeChecked();

    await shopAppCheckbox.uncheck();
    await expect(shopAppCheckbox).not.toBeChecked();

    // 5. Submit Form
    const submitButton = page.locator('button:has-text("Save and Activate Deal")');
    await submitButton.click();

    // 6. Assert that the captured POST request payload contains correct publications and limitations
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.title).toBe("E2E Custom Channel Deal");
    expect(capturedPayload.price).toBe("24.99");
    expect(capturedPayload.maxOrderLimit).toBe("3");
    expect(capturedPayload.maxCustomerLimit).toBe("1");

    // "Online Store" is checked, "Shop App" is unchecked.
    // Asserting Online Store Publication GID is included, and Shop App Publication GID is excluded!
    expect(capturedPayload.publications).toContain("gid://shopify/Publication/1");
    expect(capturedPayload.publications).not.toContain("gid://shopify/Publication/2");
  });

  test("should allow toggling active status of a bundle via the Deactivate/Activate button in the UI", async ({ page }) => {
    await page.goto("/?shop=test-store.myshopify.com");

    // 1. Initially, verify it has an "Active" badge and "Deactivate" action button
    const statusBadge = page.locator('span:has-text("Active")');
    await expect(statusBadge).toBeVisible();

    const deactivateButton = page.locator('button:has-text("Deactivate")');
    await expect(deactivateButton).toBeVisible();

    // 2. Click "Deactivate"
    await deactivateButton.click();

    // 3. Verify it transitions to "Draft" badge and "Activate" action button
    const draftBadge = page.locator('span:has-text("Draft")');
    await expect(draftBadge).toBeVisible();

    const activateButton = page.getByRole("button", { name: "Activate", exact: true });
    await expect(activateButton).toBeVisible();

    // 4. Click "Activate" to toggle it back on
    await activateButton.click();

    // 5. Verify it transitions back to "Active"
    await expect(statusBadge).toBeVisible();
    await expect(deactivateButton).toBeVisible();
  });
});
