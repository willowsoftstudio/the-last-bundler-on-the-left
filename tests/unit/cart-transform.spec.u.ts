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
      title: "Mock Bundle 1",
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
        title: "Mix Match Bundle",
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
        title: "Scaled Mix Match Bundle",
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

  it("should skip merging if limitOne is true and the parent variant is already in the cart (preventing recursive double-merging)", () => {
    const limitedBundles: BundleDefinition[] = [
      {
        id: "bundle-limited",
        title: "Test Limited Bundle",
        parentVariantId: "gid://shopify/ProductVariant/ParentBundle1",
        limitOne: true, // Quantity capping enabled!
        components: [
          { variantId: "gid://shopify/ProductVariant/ComponentA", quantity: 1 }
        ]
      }
    ];

    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/Component",
            quantity: 1,
            merchandise: { id: "gid://shopify/ProductVariant/ComponentA", title: "Component Product", product: { id: "p1", title: "Comp" } }
          },
          {
            id: "gid://shopify/CartLine/ParentInCart",
            quantity: 1,
            // The parent variant is ALREADY in the cart from a previous merge!
            merchandise: { id: "gid://shopify/ProductVariant/ParentBundle1", title: "Parent Product", product: { id: "pParent", title: "Parent" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(limitedBundles)
        }
      }
    };

    const output = run(input);
    // Should output empty operations because the parent variant is already in the cart and limitOne is true!
    expect(output.operations).toHaveLength(0);
  });

  it("should cap bundle creation to maxOrderLimit when components in the cart exceed the limit", () => {
    const limitedOrderBundles: BundleDefinition[] = [
      {
        id: "bundle-order-limit",
        title: "Test Order Limit Bundle",
        parentVariantId: "gid://shopify/ProductVariant/ParentBundle1",
        maxOrderLimit: 2, // Max of 2 bundles per order!
        components: [
          { variantId: "gid://shopify/ProductVariant/ComponentA", quantity: 1 }
        ]
      }
    ];

    const input: RunInput = {
      cart: {
        lines: [
          {
            id: "gid://shopify/CartLine/Component",
            quantity: 5, // We have 5 components in the cart (enough to form 5 bundles, but should cap to 2!)
            merchandise: { id: "gid://shopify/ProductVariant/ComponentA", title: "Component Product", product: { id: "p1", title: "Comp" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(limitedOrderBundles)
        }
      }
    };

    const output = run(input);
    expect(output.operations).toHaveLength(1);
    expect(output.operations[0].linesMerge.cartLines[0].quantity).toEqual(2); // strictly capped to 2!
  });

  it("should block bundle creation if customer purchasedDeals count meets or exceeds maxCustomerLimit", () => {
    const limitedCustBundles: BundleDefinition[] = [
      {
        id: "bundle-cust-limit",
        title: "Test Customer Limit Bundle",
        parentVariantId: "gid://shopify/ProductVariant/ParentBundle1",
        maxCustomerLimit: 1, // Max of 1 bundle per customer lifetime!
        components: [
          { variantId: "gid://shopify/ProductVariant/ComponentA", quantity: 1 }
        ]
      }
    ];

    const input: RunInput = {
      cart: {
        buyerIdentity: {
          customer: {
            purchasedDeals: {
              // The customer has ALREADY purchased 1 bundle of this type!
              value: JSON.stringify({ "bundle-cust-limit": 1 })
            }
          }
        },
        lines: [
          {
            id: "gid://shopify/CartLine/Component",
            quantity: 1,
            merchandise: { id: "gid://shopify/ProductVariant/ComponentA", title: "Component Product", product: { id: "p1", title: "Comp" } }
          }
        ]
      },
      shop: {
        bundleMetafields: {
          value: JSON.stringify(limitedCustBundles)
        }
      }
    };

    const output = run(input);
    // Should block bundle merging because the customer lifetime purchase limit has been reached!
    expect(output.operations).toHaveLength(0);
  });
});
