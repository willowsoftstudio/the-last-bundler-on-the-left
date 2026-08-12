import express, { Request, Response } from "express";
import crypto from "crypto";
import { shopify, prisma } from "./shopify.js";

const app = express();
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Middleware to verify Shopify Webhook HMAC signatures
function verifyShopifyWebhook(req: Request, res: Response, next: any) {
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
  if (!hmacHeader) {
    console.warn("Webhook validation failed: Missing x-shopify-hmac-sha256 header");
    return res.status(401).send("Webhook verification failed: Missing HMAC header");
  }

  const rawBody = (req as any).rawBody;
  if (!rawBody) {
    console.warn("Webhook validation failed: Missing raw body buffer");
    return res.status(400).send("Webhook verification failed: Missing raw body");
  }

  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiSecret) {
    console.error("Missing SHOPIFY_API_SECRET environment variable");
    return res.status(500).send("Server configuration error");
  }

  const generatedHash = crypto
    .createHmac("sha256", apiSecret)
    .update(rawBody)
    .digest("base64");

  // Prevent timing attacks using crypto.timingSafeEqual
  try {
    const hmacBuffer = Buffer.from(hmacHeader, "base64");
    const generatedBuffer = Buffer.from(generatedHash, "base64");

    if (hmacBuffer.length !== generatedBuffer.length || !crypto.timingSafeEqual(hmacBuffer, generatedBuffer)) {
      console.warn("Unauthorized webhook request: HMAC signature verification failed");
      return res.status(401).send("Webhook verification failed: Invalid HMAC signature");
    }
  } catch (error: any) {
    console.error("HMAC comparison error:", error.message);
    return res.status(401).send("Webhook verification failed: Invalid HMAC signature");
  }

  next();
}

// GET endpoint to retrieve active bundles
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  async (req, res, next) => {
    // Automatically register the Cart Transform function!
    const session = res.locals.shopify.session;
    try {
      const client = new shopify.api.clients.Graphql({ session });
      const functionId = process.env.SHOPIFY_CART_TRANSFORM_ID;
      
      if (functionId) {
        await client.request(`
          mutation {
            cartTransformCreate(functionId: "${functionId}") {
              cartTransform {
                id
              }
            }
          }
        `);
        console.log("Successfully registered Cart Transform function on install.");
      }
    } catch (e: any) {
      console.error("Error auto-registering Cart Transform:", e.message);
    }
    next();
  },
  shopify.redirectToShopifyOrAppRoot()
);

// GET endpoint to retrieve active bundles
app.get("/api/bundles", async (req: Request, res: Response) => {
  return res.json(await prisma.bundle.findMany());
});

// GET endpoint to retrieve analytics
app.get("/api/analytics", async (req: Request, res: Response) => {
  const analytics = await prisma.analytics.findUnique({ where: { id: "global_analytics" } });
  return res.json(analytics || { totalRevenue: 0, totalOrdersWithBundles: 0, totalBundlesSold: 0 });
});

// GET endpoint to retrieve active sales channels (publications) from Shopify
app.get("/api/publications", shopify.validateAuthenticatedSession(), async (req: Request, res: Response) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) {
      return res.status(401).send("Unauthorized");
    }
    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.request(`
      query GetPublications {
        publications(first: 20, catalogType: APP) {
          nodes {
            id
            name
          }
        }
      }
    `);
    const nodes = (response as any).data?.publications?.nodes || [];
    return res.json(nodes);
  } catch (e: any) {
    console.error("Failed to fetch publications from Shopify:", e.message);
    return res.status(500).json({ error: "Failed to fetch sales channels" });
  }
});

// Express Endpoint to create a bundle (secured with Shopify's session validation middleware)
app.post("/api/bundles", shopify.validateAuthenticatedSession(), async (req: Request, res: Response) => {
  try {
    const { title, components, price, status, publications, isVisible, description, imageUrl } = req.body;

    if (!title || !components || components.length === 0 || !price) {
      return res.status(400).json({ error: "Missing required bundle fields" });
    }

    // Initialize Shopify Session (mocked or retrieved from context in actual runtime)
    const session = res.locals.shopify?.session || { shop: "test-shop.myshopify.com", accessToken: "mock-token" };
    const client = new shopify.api.clients.Graphql({ session });

    // Self-Healing Check: Ensure Cart Transform function is active on this store using modern 'functionHandle'
    // This allows us to bypass the need for an environment variable completely!
    try {
      const checkTransformsQuery = `
        query {
          cartTransforms(first: 10) {
            edges {
              node {
                id
                functionId
              }
            }
          }
        }
      `;
      const checkRes = await client.request(checkTransformsQuery);
      
      // If there are no cartTransforms active on the store at all, attempt to register via handle
      const existingTransforms = (checkRes as any).data?.cartTransforms?.edges || [];
      if (existingTransforms.length === 0) {
        console.log("No Cart Transforms registered yet. Attempting registration using functionHandle: 'cart-transform'");
        const createTransformMutation = `
          mutation {
            cartTransformCreate(functionHandle: "cart-transform") {
              cartTransform {
                id
                functionId
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const createTransformRes = await client.request(createTransformMutation);
        console.log("Cart Transform Registration Response:", JSON.stringify(createTransformRes, null, 2));
      }
    } catch (e: any) {
      console.error("Failed to dynamically check/register Cart Transform:", e.message);
    }

    // Step 1: Create a hidden "Shell Product" representing the parent bundle item.
    // Candace's Audit: We explicitly disable inventory tracking on the Parent SKU to ensure Shopify delegates inventory decrements down to child components.
    const productCreateMutation = `
      mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
        productCreate(product: $product, media: $media) {
          product {
            id
            variants(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const productPayload: any = {
      title: title,
      productType: "Bundle",
      status: status || "ACTIVE"
    };

    if (isVisible) {
      if (description) productPayload.descriptionHtml = description;
    } else {
      productPayload.metafields = [
        {
          namespace: "seo",
          key: "hidden",
          type: "integer",
          value: "1"
        }
      ];
    }

    const mediaPayload: any[] = [];
    if (isVisible && imageUrl) {
      mediaPayload.push({
        originalSource: imageUrl,
        mediaContentType: "IMAGE"
      });
    }

    const productResponse = await client.request(productCreateMutation, {
      variables: {
        product: productPayload,
        media: mediaPayload.length > 0 ? mediaPayload : null
      }
    });

    const productData = (productResponse as any).data?.productCreate;
    if (productData?.userErrors && productData.userErrors.length > 0) {
      return res.status(422).json({ error: "Shopify product creation failed", details: productData.userErrors });
    }

    const productId = productData?.product?.id;
    const parentVariantId = productData?.product?.variants?.edges?.[0]?.node?.id;
    if (!productId || !parentVariantId) {
      return res.status(500).json({ error: "Could not retrieve parent product or variant ID" });
    }

    // Step 1b: Update the default variant to set its price and disable inventory tracking (Parent Shell) using modern bulk update
    const productVariantsBulkUpdateMutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            id
          }
          productVariants {
            id
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variantResponse = await client.request(productVariantsBulkUpdateMutation, {
      variables: {
        productId: productId,
        variants: [
          {
            id: parentVariantId,
            price: price,
            inventoryPolicy: "CONTINUE", // Explicitly allow selling when untracked (prevents "Sold out" on storefront)
            inventoryItem: {
              tracked: false
            }
          }
        ]
      }
    });

    const variantData = (variantResponse as any).data?.productVariantsBulkUpdate;
    if (variantData?.userErrors && variantData.userErrors.length > 0) {
      return res.status(422).json({ error: "Shopify variant configuration failed", details: variantData.userErrors });
    }

    // Step 1c: If any sales channels were selected, publish the product to them
    if (publications && publications.length > 0) {
      const publishMutation = `
        mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable {
              ... on Product {
                id
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      
      const publishInput = publications.map((pubId: string) => ({ publicationId: pubId }));
      const publishResponse = await client.request(publishMutation, {
        variables: {
          id: productId,
          input: publishInput
        }
      });

      const publishData = (publishResponse as any).data?.publishablePublish;
      if (publishData?.userErrors && publishData.userErrors.length > 0) {
        console.error("Publishing product failed:", publishData.userErrors);
        // Note: We don't fail the whole request because the bundle product is already created successfully.
      }
    }

    // Step 2: Fetch current active bundles metafield to append the new definition (and get the Shop's GID)
    const getMetafieldQuery = `
      query getMetafield {
        shop {
          id
          metafield(namespace: "bundle_app", key: "active_bundles") {
            value
          }
        }
      }
    `;

    const getMetafieldResponse = await client.request(getMetafieldQuery);
    const shopId = (getMetafieldResponse as any).data?.shop?.id;
    const existingMetafieldVal = (getMetafieldResponse as any).data?.shop?.metafield?.value;
    let currentBundles: any[] = [];
    if (existingMetafieldVal) {
      try {
        currentBundles = JSON.parse(existingMetafieldVal);
      } catch (e) {
        currentBundles = [];
      }
    }

    const newBundleId = `bundle_${Date.now()}`;
    const formattedPrice = parseFloat(price).toFixed(2);
    const newBundleDefinition = {
      id: newBundleId,
      title,
      price: formattedPrice,
      parentVariantId,
      components: components.map((c: any) => ({
        variantId: c.variantId,
        quantity: parseInt(c.quantity, 10) || 1,
        title: c.title || ""
      }))
    };

    currentBundles.push(newBundleDefinition);

    // Step 3: Write the updated bundle array back to Shopify Metafields
    const setMetafieldMutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const metafieldSetResponse = await client.request(setMetafieldMutation, {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: "bundle_app",
            key: "active_bundles",
            value: JSON.stringify(currentBundles),
            type: "json"
          }
        ]
      }
    });

    const setMetafieldData = (metafieldSetResponse as any).data?.metafieldsSet;
    if (setMetafieldData?.userErrors && setMetafieldData.userErrors.length > 0) {
      return res.status(422).json({ error: "Shopify metafield sync failed", details: setMetafieldData.userErrors });
    }

    // Save copy in app database
    await prisma.bundle.create({ data: { id: newBundleId, title, parentVariantId, components: components } });

    return res.status(201).json({
      success: true,
      bundle: newBundleDefinition
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message || "An unexpected error occurred" });
  }
});

// DELETE endpoint to securely delete a bundle from the database, metafields, and Shopify catalog
app.delete("/api/bundles/:id", shopify.validateAuthenticatedSession(), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = res.locals.shopify?.session;
    if (!session) {
      return res.status(401).send("Unauthorized");
    }

    // 1. Fetch the bundle from the local database
    const bundle = await prisma.bundle.findUnique({ where: { id } });
    if (!bundle) {
      return res.status(444).json({ error: "Bundle not found in database" });
    }

    const client = new shopify.api.clients.Graphql({ session });

    // 2. Safely attempt to delete the parent product in Shopify (if it wasn't already deleted manually)
    if (bundle.parentVariantId) {
      try {
        const getProductQuery = `
          query getProductByVariant($id: ID!) {
            productVariant(id: $id) {
              product {
                id
              }
            }
          }
        `;
        const productRes = await client.request(getProductQuery, { variables: { id: bundle.parentVariantId } });
        const productId = (productRes as any).data?.productVariant?.product?.id;

        if (productId) {
          const productDeleteMutation = `
            mutation productDelete($input: ProductDeleteInput!) {
              productDelete(input: $input) {
                deletedProductId
                userErrors {
                  field
                  message
                }
              }
            }
          `;
          const delRes = await client.request(productDeleteMutation, { variables: { input: { id: productId } } });
          const delData = (delRes as any).data?.productDelete;
          if (delData?.userErrors?.length > 0) {
            console.error("Failed to delete Shopify product:", delData.userErrors);
          } else {
            console.log("Successfully deleted parent product:", productId);
          }
        }
      } catch (e: any) {
        console.warn("Could not delete Shopify product (it may have been manually deleted already):", e.message);
      }
    }

    // 3. Update active_bundles Metafields by removing this bundle
    try {
      const getMetafieldQuery = `
        query getMetafield {
          shop {
            id
            metafield(namespace: "bundle_app", key: "active_bundles") {
              value
            }
          }
        }
      `;
      const getMetafieldResponse = await client.request(getMetafieldQuery);
      const shopId = (getMetafieldResponse as any).data?.shop?.id;
      const existingMetafieldVal = (getMetafieldResponse as any).data?.shop?.metafield?.value;

      if (existingMetafieldVal) {
        let currentBundles = JSON.parse(existingMetafieldVal);
        currentBundles = currentBundles.filter((b: any) => b.id !== id);

        const setMetafieldMutation = `
          mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors {
                field
                message
              }
            }
          }
        `;
        await client.request(setMetafieldMutation, {
          variables: {
            metafields: [
              {
                ownerId: shopId,
                namespace: "bundle_app",
                key: "active_bundles",
                value: JSON.stringify(currentBundles),
                type: "json"
              }
            ]
          }
        });
      }
    } catch (e: any) {
      console.error("Failed to sync deleted bundle back to Metafields:", e.message);
    }

    // 4. Delete the bundle from the local PostgreSQL database
    await prisma.bundle.delete({ where: { id } });

    return res.json({ success: true, message: "Bundle deleted successfully" });
  } catch (error: any) {
    console.error("Delete bundle error:", error.message);
    return res.status(500).json({ error: error.message || "An unexpected error occurred" });
  }
});

// Endpoint for webhooks
app.post("/api/webhooks", verifyShopifyWebhook, async (req: Request, res: Response) => {
  const topic = req.headers["x-shopify-topic"] as string;
  const shop = req.headers["x-shopify-shop-domain"] as string;

  if (topic === "app/uninstalled") {
    console.log(`Deactivating active bundle configurations for shop ${shop}`);
    await prisma.bundle.deleteMany({});
    return res.status(200).send("Uninstall webhook processed and local DB cleaned successfully");
  }

  if (topic === "orders/create") {
    const order = req.body;
    let hasBundle = false;
    let orderRevenue = 0;
    let orderBundlesCount = 0;

    if (order?.line_items) {
      const activeBundles = await prisma.bundle.findMany();
      for (const item of order.line_items) {
        const itemVariantId = item.variant_id; // Numeric variant ID (e.g. 888888)
        
        // Search activeBundles to see if this matches a parent variant ID
        const matchingBundle = activeBundles.find((b: any) => {
          // Extract numeric ID from parentVariantId (e.g. "gid://shopify/ProductVariant/888888" or just "888888")
          const match = b.parentVariantId.match(/\/Variant\/(\d+)$/);
          const numericId = match ? parseInt(match[1], 10) : parseInt(b.parentVariantId, 10);
          return numericId === itemVariantId || b.parentVariantId === `gid://shopify/ProductVariant/${itemVariantId}`;
        });

        if (matchingBundle) {
          hasBundle = true;
          const price = parseFloat(item.price) || 0;
          const qty = parseInt(item.quantity, 10) || 0;
          orderRevenue += price * qty;
          orderBundlesCount += qty;
        }
      }
    }

    if (hasBundle) {
      await prisma.analytics.upsert({
        where: { id: "global_analytics" },
        create: { id: "global_analytics", totalRevenue: orderRevenue, totalOrdersWithBundles: 1, totalBundlesSold: orderBundlesCount },
        update: { totalRevenue: { increment: orderRevenue }, totalOrdersWithBundles: { increment: 1 }, totalBundlesSold: { increment: orderBundlesCount } }
      });
    }

    return res.status(200).send("Order webhook processed successfully");
  }

  return res.status(200).send("Webhook received");
});

// Serve beautiful Shopify Polaris embedded App Dashboard
app.get("/", (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  if (shop && shop.endsWith(".myshopify.com")) {
    const sanitizedShop = encodeURIComponent(shop);
    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors https://${sanitizedShop} https://admin.shopify.com;`
    );
  } else {
    res.setHeader(
      "Content-Security-Policy",
      "frame-ancestors https://admin.shopify.com https://*.myshopify.com;"
    );
  }
  res.removeHeader("X-Frame-Options");

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bundle & Volume Discounts Admin</title>
  <meta name="shopify-api-key" content="${process.env.SHOPIFY_API_KEY}" />
  <!-- Load Shopify Polaris CSS for official merchant look & feel -->
  <link rel="stylesheet" href="https://unpkg.com/@shopify/polaris@12.0.0/build/esm/styles.css">
  <style>
    body {
      background-color: #f6f6f7;
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .grid-container {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 20px;
    }
    @media (max-width: 768px) {
      .grid-container {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div id="app"></div>

  <!-- Load App Bridge first, then React and ReactDOM -->
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>

  <script>
    const e = React.createElement;

    function App() {
      const [title, setTitle] = React.useState("");
      const [price, setPrice] = React.useState("");
      const [components, setComponents] = React.useState([
        { variantId: "", quantity: 1, title: "", image: "" }
      ]);
      const [bundles, setBundles] = React.useState([]);
      const [analytics, setAnalytics] = React.useState({ totalRevenue: 0, totalOrdersWithBundles: 0, totalBundlesSold: 0 });
      const [loading, setLoading] = React.useState(false);
      const [toastMessage, setToastMessage] = React.useState(null);
      const [status, setStatus] = React.useState("ACTIVE");
      const [availablePublications, setAvailablePublications] = React.useState([]);
      const [selectedPubs, setSelectedPubs] = React.useState([]);
      const [isVisible, setIsVisible] = React.useState(false);
      const [description, setDescription] = React.useState("");
      const [imageUrl, setImageUrl] = React.useState("");

      // Fetch active bundles from server
      const fetchData = async () => {
        try {
          const resBundles = await fetch("/api/bundles");
          const bundlesData = await resBundles.json();
          setBundles(bundlesData);

          const resAnalytics = await fetch("/api/analytics");
          const analyticsData = await resAnalytics.json();
          setAnalytics(analyticsData);

          const resPubs = await fetch("/api/publications");
          if (resPubs.ok) {
            const pubsData = await resPubs.json();
            setAvailablePublications(pubsData);
          }
        } catch (err) {
          console.error("Failed to fetch data:", err);
        }
      };

      React.useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000); // Poll every 5s
        return () => clearInterval(interval);
      }, []);

      const handleAddComponent = () => {
        setComponents([...components, { variantId: "", quantity: 1, title: "", image: "" }]);
      };

      const handleSelectVariant = async (index) => {
        try {
          const selection = await window.shopify.resourcePicker({
            type: "product",
            multiple: false,
            action: "select",
            filter: {
              draft: true,
              archived: true,
              hidden: true
            }
          });
          if (selection && selection.length > 0) {
            const product = selection[0];
            const variant = product.variants?.[0] || { id: "" };
            const titleText = (!variant.title || variant.title === "Default Title")
              ? product.title
              : (product.title + " - " + variant.title);
            
            // Get product image, fallback to variant image, fallback to empty string
            const imageSrc = product.images?.[0]?.originalSrc || variant.image?.originalSrc || "";

            handleComponentChange(index, "variantId", variant.id);
            handleComponentChange(index, "title", titleText);
            handleComponentChange(index, "image", imageSrc);
          }
        } catch (error) {
          console.error("Resource picker error:", error);
        }
      };

      const handleComponentChange = (index, field, value) => {
        const updated = [...components];
        updated[index][field] = value;
        setComponents(updated);
      };

      const handleRemoveComponent = (index) => {
        setComponents(components.filter((_, i) => i !== index));
      };

      const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);
        try {
          const res = await fetch("/api/bundles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, price, components, status, publications: selectedPubs, isVisible, description, imageUrl })
          });
          const data = await res.json();
          if (res.ok) {
            setTitle("");
            setPrice("");
            setComponents([{ variantId: "", quantity: 1, title: "", image: "" }]);
            setStatus("ACTIVE");
            setSelectedPubs([]);
            setIsVisible(false);
            setDescription("");
            setImageUrl("");
            setToastMessage("Bundle created successfully!");
            fetchData();
          } else {
            alert("Error creating bundle: " + (data.error || "Unknown error"));
          }
        } catch (err) {
          alert("Network error creating bundle.");
        } finally {
          setLoading(false);
        }
      };

      const handleDeleteBundle = async (id) => {
        if (!confirm("Are you sure you want to delete this deal? This will permanently remove its rules and delete the placeholder product.")) {
          return;
        }
        setLoading(true);
        try {
          const res = await fetch('/api/bundles/' + id, {
            method: 'DELETE'
          });
          if (res.ok) {
            setToastMessage("Deal deleted successfully!");
            fetchData();
          } else {
            alert("Error deleting deal.");
          }
        } catch (err) {
          alert("Network error deleting deal.");
        } finally {
          setLoading(false);
        }
      };

      return e("div", { style: { maxWidth: "1100px", margin: "0 auto" } }, [
        // Page Header
        e("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" } }, [
          e("div", null, [
            e("h1", { style: { fontSize: "28px", fontWeight: "bold", margin: 0, color: "#1a1c1d" } }, "📦 Bundles & Deals"),
            e("p", { style: { color: "#6d7175", marginTop: "4px" } }, "Combine your products to sell more and delight your customers.")
          ]),
          e("div", { style: { backgroundColor: "#e2f1eb", color: "#108043", padding: "6px 12px", borderRadius: "16px", fontSize: "14px", fontWeight: "600" } }, "Live on Storefront")
        ]),

        // Analytics Cards Overview
        e("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "24px" } }, [
          e("div", { className: "Polaris-Card", style: { padding: "20px", backgroundColor: "#ffffff", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" } }, [
            e("p", { style: { color: "#6d7175", fontSize: "13px", fontWeight: "500", margin: "0 0 4px 0" } }, "Extra Money Made"),
            e("h2", { style: { fontSize: "24px", fontWeight: "bold", color: "#108043", margin: 0 } }, \`$\${analytics.totalRevenue.toFixed(2)}\`)
          ]),
          e("div", { className: "Polaris-Card", style: { padding: "20px", backgroundColor: "#ffffff", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" } }, [
            e("p", { style: { color: "#6d7175", fontSize: "13px", fontWeight: "500", margin: "0 0 4px 0" } }, "Orders with Deals"),
            e("h2", { style: { fontSize: "24px", fontWeight: "bold", color: "#202223", margin: 0 } }, analytics.totalOrdersWithBundles)
          ]),
          e("div", { className: "Polaris-Card", style: { padding: "20px", backgroundColor: "#ffffff", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" } }, [
            e("p", { style: { color: "#6d7175", fontSize: "13px", fontWeight: "500", margin: "0 0 4px 0" } }, "Deals Sold"),
            e("h2", { style: { fontSize: "24px", fontWeight: "bold", color: "#202223", margin: 0 } }, analytics.totalBundlesSold)
          ])
        ]),

        // Grid Layout
        e("div", { className: "grid-container" }, [
          
          // Form Section
          e("div", null, [
            e("form", { onSubmit: handleSubmit }, [
              e("div", { className: "Polaris-Card", style: { padding: "24px", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", backgroundColor: "#ffffff" } }, [
                e("h2", { style: { fontSize: "18px", fontWeight: "600", marginBottom: "16px" } }, "Create a New Deal"),
                
                // Form Fields
                e("div", { style: { marginBottom: "16px" } }, [
                  e("label", { style: { fontWeight: "500", display: "block", marginBottom: "4px" } }, "What should we call this deal?"),
                  e("input", {
                    type: "text",
                    placeholder: "e.g., The Ultimate Summer Outfit",
                    value: title,
                    onChange: (ev) => setTitle(ev.target.value),
                    required: true,
                    style: { width: "97%", padding: "10px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "15px" }
                  })
                ]),

                e("div", { style: { marginBottom: "20px" } }, [
                  e("label", { style: { display: "flex", alignItems: "center", cursor: "pointer", fontWeight: "500", color: "#202223" } }, [
                    e("input", {
                      type: "checkbox",
                      checked: isVisible,
                      onChange: (ev) => setIsVisible(ev.target.checked),
                      style: { marginRight: "10px", width: "18px", height: "18px", cursor: "pointer" }
                    }),
                    "Display as a standalone product on my storefront?"
                  ]),
                  e("p", { style: { fontSize: "12px", color: "#6d7175", marginLeft: "28px", marginTop: "4px" } }, "If unchecked, the deal will merge magically at checkout but won't be visible in search.")
                ]),

                isVisible && e("div", { style: { padding: "16px", backgroundColor: "#fafbfb", border: "1px solid #e1e3e5", borderRadius: "6px", marginBottom: "20px" } }, [
                  e("div", { style: { marginBottom: "16px" } }, [
                    e("label", { style: { fontWeight: "500", display: "block", marginBottom: "4px" } }, "Deal Description"),
                    e("textarea", {
                      placeholder: "Describe why this deal is awesome...",
                      value: description,
                      onChange: (ev) => setDescription(ev.target.value),
                      required: true,
                      rows: 3,
                      style: { width: "97%", padding: "10px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "14px", fontFamily: "inherit", resize: "vertical" }
                    })
                  ]),
                  e("div", null, [
                    e("label", { style: { fontWeight: "500", display: "block", marginBottom: "4px" } }, "Product Image URL"),
                    e("input", {
                      type: "url",
                      placeholder: "https://example.com/my-bundle-image.jpg",
                      value: imageUrl,
                      onChange: (ev) => setImageUrl(ev.target.value),
                      required: true,
                      style: { width: "97%", padding: "10px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "14px" }
                    })
                  ])
                ]),

                e("div", { style: { marginBottom: "20px" } }, [
                  e("label", { style: { fontWeight: "500", display: "block", marginBottom: "4px" } }, "How much will the customer pay? ($)"),
                  e("input", {
                    type: "number",
                    step: "0.01",
                    placeholder: "e.g., 29.99",
                    value: price,
                    onChange: (ev) => setPrice(ev.target.value),
                    required: true,
                    style: { width: "97%", padding: "10px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "15px" }
                  })
                ]),

                e("div", { style: { marginBottom: "20px" } }, [
                  e("label", { style: { fontWeight: "500", display: "block", marginBottom: "4px" } }, "Deal Status"),
                  e("select", {
                    value: status,
                    onChange: (ev) => setStatus(ev.target.value),
                    style: { width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #c9cccf", fontSize: "15px", backgroundColor: "#ffffff" }
                  }, [
                    e("option", { value: "ACTIVE" }, "Active (Ready to Sell)"),
                    e("option", { value: "DRAFT" }, "Draft (Hidden/Setup Mode)")
                  ])
                ]),

                availablePublications.length > 0 && e("div", { style: { marginBottom: "20px" } }, [
                  e("label", { style: { fontWeight: "500", display: "block", marginBottom: "6px" } }, "Where should we publish this deal?"),
                  e("div", { style: { border: "1px solid #c9cccf", borderRadius: "6px", padding: "10px", maxHeight: "120px", overflowY: "auto", backgroundColor: "#fafbfb" } }, 
                    availablePublications.map((pub) => {
                      const isChecked = selectedPubs.includes(pub.id);
                      return e("label", { key: pub.id, style: { display: "flex", alignItems: "center", marginBottom: "8px", cursor: "pointer", fontSize: "14px" } }, [
                        e("input", {
                          type: "checkbox",
                          checked: isChecked,
                          onChange: () => {
                            if (isChecked) {
                              setSelectedPubs(selectedPubs.filter(id => id !== pub.id));
                            } else {
                              setSelectedPubs([...selectedPubs, pub.id]);
                            }
                          },
                          style: { marginRight: "8px" }
                        }),
                        pub.name
                      ]);
                    })
                  )
                ]),

                // Components Dynamic Table
                e("h3", { style: { fontSize: "15px", fontWeight: "600", marginBottom: "12px", color: "#202223" } }, "What's included in this deal?"),
                components.map((comp, index) => 
                  e("div", { key: index, style: { display: "grid", gridTemplateColumns: "auto 3fr 1fr auto", gap: "10px", marginBottom: "10px", alignItems: "center" } }, [
                    // Product image preview (uses Shopify's official default image fallback if none is returned)
                    e("img", {
                      src: comp.image || "https://cdn.shopify.com/s/assets/no-image-2048-5e88c1b20e087fb7bbe9a3771824e743c244f437e4f8ba93bbf7b11b53f7824c.gif",
                      alt: "thumbnail",
                      style: { width: "32px", height: "32px", borderRadius: "4px", border: "1px solid #c9cccf", objectFit: "cover" }
                    }),
                    e("button", {
                      type: "button",
                      onClick: () => handleSelectVariant(index),
                      style: { padding: "8px", borderRadius: "6px", border: "1px solid #c9cccf", background: "#fdfdfd", cursor: "pointer", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                    }, comp.title ? comp.title : (comp.variantId.includes("ProductVariant/") && comp.variantId.length > 25 ? "..."+comp.variantId.split("ProductVariant/")[1] : "🔍 Choose an item")),
                    e("input", {
                      type: "number",
                      min: "1",
                      value: comp.quantity,
                      onChange: (ev) => handleComponentChange(index, "quantity", ev.target.value),
                      required: true,
                      style: { padding: "8px", borderRadius: "6px", border: "1px solid #c9cccf" }
                    }),
                    components.length > 1 && e("button", {
                      type: "button",
                      onClick: () => handleRemoveComponent(index),
                      style: { padding: "8px 12px", backgroundColor: "#fbeae5", color: "#8a2212", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "500" }
                    }, "✕")
                  ])
                ),

                e("button", {
                  type: "button",
                  onClick: handleAddComponent,
                  style: { marginTop: "12px", display: "block", width: "100%", padding: "10px", backgroundColor: "#f1f2f4", color: "#202223", border: "1px solid #c9cccf", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }
                }, "+ Add another item"),

                e("hr", { style: { border: "0", borderTop: "1px solid #e1e3e5", margin: "20px 0" } }),

                // Submit Button
                e("button", {
                  type: "submit",
                  disabled: loading,
                  style: { display: "block", width: "100%", padding: "12px", backgroundColor: "#008060", color: "#ffffff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "16px", fontWeight: "600" }
                }, loading ? "Saving to your store..." : "Save and Activate Deal")
              ])
            ])
          ]),

          // Active Bundles List
          e("div", null, [
            e("div", { className: "Polaris-Card", style: { padding: "20px", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", backgroundColor: "#ffffff" } }, [
              e("h2", { style: { fontSize: "16px", fontWeight: "600", marginBottom: "12px" } }, "Your Active Deals"),
              bundles.length === 0 ? e("p", { style: { color: "#6d7175" } }, "You haven't created any deals yet. Let's make one!") : 
              bundles.map((b) => 
                e("div", { key: b.id, style: { padding: "12px", border: "1px solid #e1e3e5", borderRadius: "6px", marginBottom: "10px", backgroundColor: "#fafbfb" } }, [
                  // Header Row with Title & Delete Button
                  e("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" } }, [
                    e("h4", { style: { fontWeight: "600", color: "#008060", margin: 0 } }, b.title),
                    e("button", {
                      onClick: () => handleDeleteBundle(b.id),
                      disabled: loading,
                      style: { background: "none", border: "none", color: "#bf0711", cursor: "pointer", fontSize: "12px", fontWeight: "600", padding: 0 }
                    }, "Delete")
                  ]),
                  e("p", { style: { fontSize: "12px", margin: "0 0 6px 0", wordBreak: "break-all", color: "#6d7175" } }, "Tracking ID: " + b.parentVariantId),
                  e("p", { style: { fontSize: "13px", fontWeight: "500", margin: "0 0 2px 0" } }, "Includes:"),
                  b.components.map((c, idx) =>
                   e("div", { key: idx, style: { fontSize: "12px", color: "#202223", paddingLeft: "8px" } }, "• " + c.quantity + "x " + (c.title || ("..." + c.variantId.substring(c.variantId.length - 8))))
                  )
                ])
              )
            ])
          ])
        ]),

        // Toast success message popup
        toastMessage && e("div", {
          style: { position: "fixed", bottom: "20px", right: "20px", padding: "12px 24px", backgroundColor: "#303030", color: "#ffffff", borderRadius: "4px", fontSize: "14px", fontWeight: "500", zIndex: "9999", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
        }, [
          toastMessage,
          e("button", { onClick: () => setToastMessage(null), style: { marginLeft: "12px", border: "none", background: "none", color: "#a0a0a0", cursor: "pointer", fontWeight: "bold" } }, "✕")
        ])
      ]);
    }

    ReactDOM.render(e(App), document.getElementById("app"));
  </script>
</body>
</html>
  `);
});

export default app;
export { app };

// If executed directly (e.g. via tsx/node), boot up the standalone server on PORT
const isDirectRun = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("index.ts");
if (isDirectRun) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Standalone Shopify App server listening on port ${PORT}`);
  });
}
