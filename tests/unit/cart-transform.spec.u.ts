import { describe, it, expect } from "vitest";
import { run, RunInput, BundleDefinition } from "../../extensions/cart-transform/src/run.js";

describe("Cart Transform Function - run() Unit Tests", () => {
  const mockComponents = [
    { variantId: "gid://shopify/ProductVariant/A", quantity: 2 },
    { variantId: "gid://shopify/ProductVariant/B", quantity: 1 }
  ];

  const mockActiveBundles: BundleDefinition[] = [
    {
      id: "bundle-1",
      parentVariantId: "gid://shopify/ProductVariant/ParentBundle1",
      components: mockComponents
    }
  ];

  it("should return empty operations when shop active_bundles metafield is missing", () => {
    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 2,
            merchandise: { id: "gid://shopify/ProductVariant/A", title: "Product A", product: { id: "p1", title: "A" } },
            cost: { amountPerQuantity: { amount: "10.00" } }
          }
        ]
      },
      shop: {
        bundleMetafields: null
      }
    };

    const output = run(input);
    expect(output).toEqual({ operations: [] });
  });

  it("should return empty operations when shop active_bundles metafield value is corrupted", () => {
    const input: RunInput = {
      cart: {
        lines: []
      },
      shop: {
        bundleMetafields: {
          value: "invalid-json-data-here"
        }
      }
    };

    const output = run(input);
    expect(output).toEqual({ operations: [] });
  });

  it("should return empty operations when cart does not contain any required component variants", () => {
    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/X",
            quantity: 5,
            merchandise: { id: "gid://shopify/ProductVariant/X", title: "Product X", product: { id: "px", title: "X" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(mockActiveBundles)
        }
      }
    };

    const output = run(input);
    expect(output).toEqual({ operations: [] });
  });

  it("should return empty operations when cart contains some components but insufficient quantities", () => {
    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 1, // Requires 2
            merchandise: { id: "gid://shopify/ProductVariant/A", title: "Product A", product: { id: "p1", title: "A" } },
            cost: { amountPerQuantity: { amount: "10.00" } }
          },
          {
            id: "gid://shopify/CartLine/2",
            quantity: 1, // Requires 1
            merchandise: { id: "gid://shopify/ProductVariant/B", title: "Product B", product: { id: "p2", title: "B" } },
            cost: { amountPerQuantity: { amount: "15.00" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(mockActiveBundles)
        }
      }
    };

    const output = run(input);
    expect(output).toEqual({ operations: [] });
  });

  it("should correctly merge single bundle when exact component quantity matches are present", () => {
    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 2,
            merchandise: { id: "gid://shopify/ProductVariant/A", title: "Product A", product: { id: "p1", title: "A" } },
            cost: { amountPerQuantity: { amount: "10.00" } }
          },
          {
            id: "gid://shopify/CartLine/2",
            quantity: 1,
            merchandise: { id: "gid://shopify/ProductVariant/B", title: "Product B", product: { id: "p2", title: "B" } },
            cost: { amountPerQuantity: { amount: "15.00" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(mockActiveBundles)
        }
      }
    };

    const output = run(input);
    expect(output.operations).toHaveLength(1);
    expect(output.operations[0].linesMerge).toEqual({
      parentVariantId: "gid://shopify/ProductVariant/ParentBundle1",
      cartLines: [
        { cartLineId: "gid://shopify/CartLine/1", quantity: 2 },
        { cartLineId: "gid://shopify/CartLine/2", quantity: 1 }
      ],
      price: {
        percentageDecrease: {
          value: 100
        }
      }
    });
  });

  it("should scale bundle merge quantities when multiple bundles of the same type can be formed", () => {
    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 4, // Enough for 2 bundles
            merchandise: { id: "gid://shopify/ProductVariant/A", title: "Product A", product: { id: "p1", title: "A" } },
            cost: { amountPerQuantity: { amount: "10.00" } }
          },
          {
            id: "gid://shopify/CartLine/2",
            quantity: 2, // Enough for 2 bundles
            merchandise: { id: "gid://shopify/ProductVariant/B", title: "Product B", product: { id: "p2", title: "B" } },
            cost: { amountPerQuantity: { amount: "15.00" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(mockActiveBundles)
        }
      }
    };

    const output = run(input);
    expect(output.operations).toHaveLength(1);
    expect(output.operations[0].linesMerge).toEqual({
      parentVariantId: "gid://shopify/ProductVariant/ParentBundle1",
      cartLines: [
        { cartLineId: "gid://shopify/CartLine/1", quantity: 4 },
        { cartLineId: "gid://shopify/CartLine/2", quantity: 2 }
      ],
      price: {
        percentageDecrease: {
          value: 100
        }
      }
    });
  });

  it("should handle leftover component quantities correctly when more items are in cart than needed for bundle", () => {
    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1",
            quantity: 5, // 5 A's (Requires 2 per bundle -> can form 2 bundles, leaving 1 leftover)
            merchandise: { id: "gid://shopify/ProductVariant/A", title: "Product A", product: { id: "p1", title: "A" } },
            cost: { amountPerQuantity: { amount: "10.00" } }
          },
          {
            id: "gid://shopify/CartLine/2",
            quantity: 2, // 2 B's (Requires 1 per bundle -> can form 2 bundles, leaving 0 leftover)
            merchandise: { id: "gid://shopify/ProductVariant/B", title: "Product B", product: { id: "p2", title: "B" } },
            cost: { amountPerQuantity: { amount: "15.00" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(mockActiveBundles)
        }
      }
    };

    const output = run(input);
    expect(output.operations).toHaveLength(1);
    expect(output.operations[0].linesMerge).toEqual({
      parentVariantId: "gid://shopify/ProductVariant/ParentBundle1",
      cartLines: [
        { cartLineId: "gid://shopify/CartLine/1", quantity: 4 },
        { cartLineId: "gid://shopify/CartLine/2", quantity: 2 }
      ],
      price: {
        percentageDecrease: {
          value: 100
        }
      }
    });
  });

  it("should successfully sum component variants distributed across multiple distinct cart lines", () => {
    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/1a",
            quantity: 1, // Variant A line 1
            merchandise: { id: "gid://shopify/ProductVariant/A", title: "Product A", product: { id: "p1", title: "A" } },
            cost: { amountPerQuantity: { amount: "10.00" } }
          },
          {
            id: "gid://shopify/CartLine/1b",
            quantity: 1, // Variant A line 2 (Total = 2)
            merchandise: { id: "gid://shopify/ProductVariant/A", title: "Product A", product: { id: "p1", title: "A" } },
            cost: { amountPerQuantity: { amount: "10.00" } }
          },
          {
            id: "gid://shopify/CartLine/2",
            quantity: 1, // Variant B
            merchandise: { id: "gid://shopify/ProductVariant/B", title: "Product B", product: { id: "p2", title: "B" } },
            cost: { amountPerQuantity: { amount: "15.00" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(mockActiveBundles)
        }
      }
    };

    const output = run(input);
    expect(output.operations).toHaveLength(1);
    expect(output.operations[0].linesMerge.parentVariantId).toEqual("gid://shopify/ProductVariant/ParentBundle1");
    expect(output.operations[0].linesMerge.cartLines).toEqual([
      { cartLineId: "gid://shopify/CartLine/1a", quantity: 1 },
      { cartLineId: "gid://shopify/CartLine/1b", quantity: 1 },
      { cartLineId: "gid://shopify/CartLine/2", quantity: 1 }
    ]);
  });

  it("should successfully merge dynamic Mix & Match bundles using validVariantIds rules", () => {
    const mixAndMatchBundles: BundleDefinition[] = [
      {
        id: "bundle-mix-and-match",
        parentVariantId: "gid://shopify/ProductVariant/MixMatchParent",
        components: [
          {
            validVariantIds: [
              "gid://shopify/ProductVariant/ShirtRed",
              "gid://shopify/ProductVariant/ShirtBlue"
            ],
            quantity: 3
          }
        ]
      }
    ];

    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/Red",
            quantity: 2,
            merchandise: { id: "gid://shopify/ProductVariant/ShirtRed", title: "Red Shirt", product: { id: "pRed", title: "Shirt" } }
          },
          {
            id: "gid://shopify/CartLine/Blue",
            quantity: 1,
            merchandise: { id: "gid://shopify/ProductVariant/ShirtBlue", title: "Blue Shirt", product: { id: "pBlue", title: "Shirt" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(mixAndMatchBundles)
        }
      }
    };

    const output = run(input);
    expect(output.operations).toHaveLength(1);
    expect(output.operations[0].linesMerge.parentVariantId).toEqual("gid://shopify/ProductVariant/MixMatchParent");
    expect(output.operations[0].linesMerge.cartLines).toEqual([
      { cartLineId: "gid://shopify/CartLine/Red", quantity: 2 },
      { cartLineId: "gid://shopify/CartLine/Blue", quantity: 1 }
    ]);
  });

  it("should scale Mix & Match bundles correctly without exceeding line item capacities", () => {
    const mixAndMatchBundles: BundleDefinition[] = [
      {
        id: "bundle-mix-and-match-scaled",
        parentVariantId: "gid://shopify/ProductVariant/MixMatchParent",
        components: [
          {
            validVariantIds: [
              "gid://shopify/ProductVariant/ShirtRed",
              "gid://shopify/ProductVariant/ShirtBlue"
            ],
            quantity: 3
          }
        ]
      }
    ];

    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/Red",
            quantity: 5, // We have 5 Red Shirts and 2 Blue Shirts (Total = 7. Fits 2 bundles (6 items), leaving 1 Red Shirt leftover)
            merchandise: { id: "gid://shopify/ProductVariant/ShirtRed", title: "Red Shirt", product: { id: "pRed", title: "Shirt" } }
          },
          {
            id: "gid://shopify/CartLine/Blue",
            quantity: 2,
            merchandise: { id: "gid://shopify/ProductVariant/ShirtBlue", title: "Blue Shirt", product: { id: "pBlue", title: "Shirt" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(mixAndMatchBundles)
        }
      }
    };

    const output = run(input);
    expect(output.operations).toHaveLength(1);
    expect(output.operations[0].linesMerge.parentVariantId).toEqual("gid://shopify/ProductVariant/MixMatchParent");
    expect(output.operations[0].linesMerge.cartLines).toEqual([
      { cartLineId: "gid://shopify/CartLine/Red", quantity: 5 }, // Greedily consumes all 5 Red
      { cartLineId: "gid://shopify/CartLine/Blue", quantity: 1 }  // Consumes 1 Blue to reach 6 total items (2 bundles)
    ]);
  });
});
