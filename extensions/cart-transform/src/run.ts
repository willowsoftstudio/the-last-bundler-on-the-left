export interface RunInput {
  cart: {
    lines: Array<{
      id: string;
      quantity: number;
      cost?: {
        amountPerQuantity: {
          amount: string;
        };
      } | null;
      merchandise: {
        id: string;
        title: string;
        sku?: string;
        product: {
          id: string;
          title: string;
        };
      };
      attribute?: {
        value: string;
      } | null;
    }>;
  };
  shop: {
    bundleMetafields?: {
      value: string;
    } | null;
  };
}

export interface MergeLineInput {
  cartLineId: string;
  quantity: number;
}

export interface MergeOperation {
  linesMerge: {
    parentVariantId: string;
    cartLines: MergeLineInput[];
    price?: {
      percentageDecrease: {
        value: number;
      };
    };
  };
}

export interface RunOutput {
  operations: MergeOperation[];
}

export interface BundleDefinition {
  id: string; // e.g. "bundle-123"
  title: string;
  price?: string; // Stored as a string with exactly 2 decimal places e.g. "29.99"
  parentVariantId: string; // e.g. "gid://shopify/ProductVariant/Parent"
  components: Array<{
    variantId?: string; // e.g. "gid://shopify/ProductVariant/A"
    validVariantIds?: string[]; // e.g. ["gid://shopify/ProductVariant/A", "gid://shopify/ProductVariant/B"]
    quantity: number;  // required quantity per bundle (e.g. 1)
  }>;
}

const NO_OPERATIONS: RunOutput = { operations: [] };

export function run(input: RunInput): RunOutput {
  const cartLines = input.cart.lines;
  const metafieldValue = input.shop.bundleMetafields?.value;

  if (!metafieldValue) {
    return NO_OPERATIONS;
  }

  let activeBundles: BundleDefinition[] = [];
  try {
    activeBundles = JSON.parse(metafieldValue) as BundleDefinition[];
  } catch (e) {
    // Return empty operations if mapping metadata is corrupted
    return NO_OPERATIONS;
  }

  const operations: MergeOperation[] = [];

  // Group cart lines by variant ID to handle cases where there are multiple lines with same variant
  const cartLinesByVariant: Record<string, typeof cartLines> = {};
  for (const line of cartLines) {
    const variantId = line.merchandise.id;
    if (!cartLinesByVariant[variantId]) {
      cartLinesByVariant[variantId] = [];
    }
    cartLinesByVariant[variantId].push(line);
  }

  // Iterate over each active bundle configuration to see if it can be formed
  for (const bundle of activeBundles) {
    const componentMatches: Array<{
      component: typeof bundle.components[0];
      matchingLines: typeof cartLines;
      totalAvailableQty: number;
    }> = [];

    let isBundleFullySatisfied = true;

    for (const component of bundle.components) {
      let lines: typeof cartLines = [];
      if (component.variantId) {
        lines = cartLinesByVariant[component.variantId] || [];
      } else if (component.validVariantIds) {
        for (const validId of component.validVariantIds) {
          const matchingLines = cartLinesByVariant[validId];
          if (matchingLines) {
            lines.push(...matchingLines);
          }
        }
      }

      // Sum total available quantity of this component in the cart
      const totalAvailableQty = lines.reduce((sum, line) => sum + line.quantity, 0);
      if (totalAvailableQty < component.quantity) {
        isBundleFullySatisfied = false;
        break;
      }

      componentMatches.push({
        component,
        matchingLines: lines,
        totalAvailableQty,
      });
    }

    if (!isBundleFullySatisfied || componentMatches.length === 0) {
      continue;
    }

    // Calculate how many bundles can be formed
    const totalBundlesCreated = Math.min(
      ...componentMatches.map((m) => Math.floor(m.totalAvailableQty / m.component.quantity))
    );

    if (totalBundlesCreated > 0) {
      const linesPayload: MergeLineInput[] = [];

      for (const match of componentMatches) {
        let neededQty = match.component.quantity * totalBundlesCreated;
        for (const line of match.matchingLines) {
          if (neededQty <= 0) break;

          // Fetch actual remaining quantity dynamically in-place since line might be mutated in previous steps
          const actualLine = cartLines.find((l) => l.id === line.id);
          if (!actualLine || actualLine.quantity <= 0) continue;

          const consumeQty = Math.min(actualLine.quantity, neededQty);
          linesPayload.push({
            cartLineId: line.id,
            quantity: consumeQty, // Revert to mathematically consumed quantities
          });

          // Decrement actual cart line quantity in place to prevent double-consumption
          actualLine.quantity -= consumeQty;
          neededQty -= consumeQty;
        }
      }

      if (linesPayload.length > 0) {
        // Calculate the sum of the original individual component prices currently in checkout
        let originalComponentsSum = 0;
        for (const match of componentMatches) {
          const matchedLine = match.matchingLines[0];
          const unitPrice = parseFloat(matchedLine?.cost?.amountPerQuantity?.amount || "0.00");
          originalComponentsSum += unitPrice * match.component.quantity;
        }

        // Parse target bundle price
        const targetBundlePrice = parseFloat(bundle.price || "0.00");

        // Calculate the percentage decrease required to reach the target bundle price
        let percentageValue = 0;
        if (originalComponentsSum > targetBundlePrice && originalComponentsSum > 0) {
          percentageValue = ((originalComponentsSum - targetBundlePrice) / originalComponentsSum) * 100;
        }

        // Bound check: Ensure percentage is valid (between 0 and 100)
        percentageValue = Math.min(Math.max(percentageValue, 0), 100);

        operations.push({
          linesMerge: {
            parentVariantId: bundle.parentVariantId,
            cartLines: linesPayload,
            price: {
              percentageDecrease: {
                value: parseFloat(percentageValue.toFixed(4)) // Precision bounding
              }
            }
          },
        });
      }
    }
  }

  return { operations };
}
