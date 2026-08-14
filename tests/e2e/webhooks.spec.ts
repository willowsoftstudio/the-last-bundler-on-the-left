import { test, expect } from "@playwright/test";
import crypto from "crypto";

test.describe("Shopify Webhook Processor — HMAC Security and Event Ingestion Integration Tests", () => {
  const webhookSecret = process.env.SHOPIFY_API_SECRET || "mock-secret-key";

  test("should reject webhook requests that have an invalid or missing HMAC signature", async ({ request }) => {
    const response = await request.post("/api/webhooks", {
      headers: {
        "x-shopify-topic": "orders/create",
        "x-shopify-shop-domain": "test-shop.myshopify.com",
        "x-shopify-hmac-sha256": "invalid-hmac-signature-here"
      },
      data: {
        id: 12345
      }
    });

    // Expecting 401 Unauthorized because the signature is incorrect
    expect(response.status()).toBe(401);
    const bodyText = await response.text();
    expect(bodyText).toContain("Webhook verification failed: Invalid HMAC signature");
  });

  test("should successfully verify HMAC signature and process app/uninstalled webhook", async ({ request }) => {
    const payload = {
      shop: "test-shop.myshopify.com"
    };
    const rawBody = JSON.stringify(payload);

    // Dynamically calculate valid HMAC signature using the app's secret key
    const computedHmac = crypto
      .createHmac("sha256", webhookSecret)
      .update(Buffer.from(rawBody))
      .digest("base64");

    const response = await request.post("/api/webhooks", {
      headers: {
        "x-shopify-topic": "app/uninstalled",
        "x-shopify-shop-domain": "test-shop.myshopify.com",
        "x-shopify-hmac-sha256": computedHmac,
        "content-type": "application/json"
      },
      data: payload
    });

    // Should return 200 OK and successfully process uninstallation cleanup
    expect(response.status()).toBe(200);
    const bodyText = await response.text();
    expect(bodyText).toContain("Uninstall webhook processed");
  });
});
