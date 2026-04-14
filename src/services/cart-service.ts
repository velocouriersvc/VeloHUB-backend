import { AppDataSource } from "../db/data-source";
import { Cart } from "../models/cart";
import { CartItem } from "../models/cart-item";
import { Product } from "../models/product";
import { CustomizationOption } from "../models/customization-option";
import { ProductCustomization } from "../models/product-customization";
import { MerchantProfile } from "../models/merchant-profile";
import { createServiceLogger } from "../utils/logger";
import { cartEventsTotal } from "../utils/metrics";

const log = createServiceLogger("CartService");

// ── Input Types ─────────────────────────────────────────────────────

export interface AddToCartInput {
    productId: string;
    quantity: number;
    selectedOptions?: Array<{
        customizationId: string;
        optionId: string;
    }>;
}

export interface CartResponse {
    id: string;
    merchantId: string | null;
    merchant: {
        businessName: string;
        category: string;
    } | null;
    merchantLocation?: {
        address: string;
        latitude: number | null;
        longitude: number | null;
    } | null;
    items: CartItemResponse[];
    subtotal: number;
    itemCount: number;
}

export interface CartItemResponse {
    id: string;
    productId: string;
    productName: string;
    productImage: string | null;
    quantity: number;
    unitPrice: number;
    selectedOptions: Array<{
        customizationId: string;
        optionId: string;
        optionName: string;
        price: number;
    }> | null;
    itemTotal: number;
}

// ── Service ─────────────────────────────────────────────────────────

export class CartService {
    private cartRepo = AppDataSource.getRepository(Cart);
    private cartItemRepo = AppDataSource.getRepository(CartItem);
    private productRepo = AppDataSource.getRepository(Product);
    private optionRepo = AppDataSource.getRepository(CustomizationOption);
    private customizationRepo = AppDataSource.getRepository(ProductCustomization);
    private merchantRepo = AppDataSource.getRepository(MerchantProfile);

    // ── Get Cart ────────────────────────────────────────────────────

    /**
     * Get or create the user's cart, returned as a rich response with product details.
     * Always fetches directly from Postgres — no Redis cache.
     */
    async getCart(userId: string): Promise<CartResponse> {
        let cart = await this.cartRepo.findOne({
            where: { userId },
            relations: {
                items: { product: true },
                merchant: { merchantProfile: true },
            },
        });

        if (!cart) {
            cart = this.cartRepo.create({ userId, merchantId: null, subtotal: 0 });
            cart = await this.cartRepo.save(cart);
            cart.items = [];
        }

        return this.buildCartResponse(cart);
    }

    /**
     * @deprecated Use getCart() — Redis cache has been removed.
     */
    async getCartFresh(userId: string): Promise<CartResponse> {
        return this.getCart(userId);
    }

    // ── Add Item ────────────────────────────────────────────────────

    /**
     * Add an item to the cart.
     *
     * Enforces single-merchant rule: all items must be from the same merchant.
     * If the cart already has items from a different merchant, returns a 409 conflict.
     */
    async addItem(
        userId: string,
        input: AddToCartInput
    ): Promise<{ cart: CartResponse; conflict?: { currentMerchant: string; newMerchant: string } }> {
        // 1. Load product with merchant info
        const product = await this.productRepo.findOne({
            where: { id: input.productId, isActive: true },
            relations: { merchant: { merchantProfile: true } },
        });

        if (!product) {
            throw new Error("Product not found or is inactive");
        }

        // 2. Check stock
        if (product.stockQuantity < input.quantity) {
            throw new Error(
                `Insufficient stock for "${product.name}". Available: ${product.stockQuantity}`
            );
        }

        // 3. Get or create cart (load items separately to avoid cascade issues)
        let cart = await this.cartRepo.findOne({
            where: { userId },
        });

        if (!cart) {
            cart = this.cartRepo.create({ userId, merchantId: null, subtotal: 0 });
            cart = await this.cartRepo.save(cart);
        }

        // Load items separately (not on the cart entity)
        const cartItems = await this.cartItemRepo.find({
            where: { cartId: cart.id },
        });

        // 4. Single-merchant enforcement
        if (cart.merchantId && cart.merchantId !== product.merchantId && cartItems.length > 0) {
            const currentMerchant = await this.merchantRepo.findOne({
                where: { userId: cart.merchantId },
            });
            const newMerchant = product.merchant?.merchantProfile;

            return {
                cart: await this.buildCartResponse(cart),
                conflict: {
                    currentMerchant: currentMerchant?.businessName || "Unknown",
                    newMerchant: newMerchant?.businessName || "Unknown",
                },
            };
        }

        // 5. Resolve selected options → full option details
        let resolvedOptions: CartItem["selectedOptions"] = null;
        let optionsTotal = 0;

        if (input.selectedOptions?.length) {
            resolvedOptions = [];

            for (const so of input.selectedOptions) {
                const option = await this.optionRepo.findOne({
                    where: { id: so.optionId, customizationId: so.customizationId },
                });

                if (!option) {
                    throw new Error(`Option ${so.optionId} not found for customization ${so.customizationId}`);
                }

                resolvedOptions.push({
                    customizationId: so.customizationId,
                    optionId: so.optionId,
                    optionName: option.name,
                    price: Number(option.price),
                });

                optionsTotal += Number(option.price);
            }
        }

        // 6. Validate required customizations
        await this.validateRequiredCustomizations(product.id, input.selectedOptions || []);

        // 7. Calculate item total
        const unitPrice = Number(product.price);
        const itemTotal = Math.round((unitPrice + optionsTotal) * input.quantity * 100) / 100;

        // 8. Check if this exact product+options combo already exists in cart → update qty
        const existingItem = this.findExistingCartItem(cartItems, input.productId, resolvedOptions);

        if (existingItem) {
            existingItem.quantity += input.quantity;
            existingItem.itemTotal = Math.round(
                (Number(existingItem.unitPrice) + this.sumOptionsPrices(existingItem.selectedOptions)) *
                existingItem.quantity * 100
            ) / 100;
            await this.cartItemRepo.save(existingItem);
        } else {
            const cartItem = this.cartItemRepo.create({
                cartId: cart.id,
                productId: product.id,
                quantity: input.quantity,
                unitPrice,
                selectedOptions: resolvedOptions,
                itemTotal,
            });
            await this.cartItemRepo.save(cartItem);
        }

        // 9. Update cart merchant + subtotal
        cart.merchantId = product.merchantId;
        cart.subtotal = await this.calculateSubtotal(cart.id);
        await this.cartRepo.save(cart);

        // 10. Return fresh cart from Postgres
        cartEventsTotal.inc({ action: "add_item" });

        const response = await this.getCart(userId);
        return { cart: response };
    }

    // ── Update Item Quantity ────────────────────────────────────────

    /**
     * Update the quantity of a cart item.
     */
    async updateItemQuantity(
        userId: string,
        itemId: string,
        quantity: number
    ): Promise<CartResponse> {
        if (quantity < 1) {
            throw new Error("Quantity must be at least 1. Use remove endpoint to delete.");
        }

        // Load cart WITHOUT items to avoid cascade issues
        const cart = await this.cartRepo.findOne({
            where: { userId },
        });

        if (!cart) throw new Error("Cart not found");

        // Load item directly
        const item = await this.cartItemRepo.findOne({
            where: { id: itemId, cartId: cart.id },
        });
        if (!item) throw new Error("Cart item not found");

        // Check stock
        const product = await this.productRepo.findOne({ where: { id: item.productId } });
        if (product && product.stockQuantity < quantity) {
            throw new Error(
                `Insufficient stock for this item. Available: ${product.stockQuantity}`
            );
        }

        // Recalculate item total
        const optionsTotal = this.sumOptionsPrices(item.selectedOptions);
        item.quantity = quantity;
        item.itemTotal = Math.round((Number(item.unitPrice) + optionsTotal) * quantity * 100) / 100;
        await this.cartItemRepo.save(item);

        // Update subtotal (no items loaded on cart = no cascade)
        cart.subtotal = await this.calculateSubtotal(cart.id);
        await this.cartRepo.save(cart);

        // Fresh query from Postgres
        return this.getCart(userId);
    }

    // ── Remove Item ─────────────────────────────────────────────────

    /**
     * Remove an item from the cart.
     */
    async removeItem(userId: string, itemId: string): Promise<CartResponse> {
        // Load cart WITHOUT items relation to avoid cascade re-insert
        const cart = await this.cartRepo.findOne({
            where: { userId },
        });

        if (!cart) throw new Error("Cart not found");

        // Verify the item exists and belongs to this cart
        const item = await this.cartItemRepo.findOne({
            where: { id: itemId, cartId: cart.id },
        });
        if (!item) throw new Error("Cart item not found");

        // Delete the item
        await this.cartItemRepo.delete(itemId);

        // Check if any items remain
        const remainingCount = await this.cartItemRepo.count({
            where: { cartId: cart.id },
        });
        if (remainingCount === 0) {
            cart.merchantId = null;
        }

        // Update subtotal and save cart (no items loaded = no cascade re-insert)
        cart.subtotal = await this.calculateSubtotal(cart.id);
        await this.cartRepo.save(cart);

        cartEventsTotal.inc({ action: "remove_item" });

        // Fresh query from Postgres
        return this.getCart(userId);
    }

    // ── Clear Cart ──────────────────────────────────────────────────

    /**
     * Clear the entire cart (remove all items, reset merchantId).
     */
    async clearCart(userId: string): Promise<CartResponse> {
        const cart = await this.cartRepo.findOne({
            where: { userId },
            relations: { items: true },
        });

        if (!cart) throw new Error("Cart not found");

        // Delete all items
        if (cart.items.length > 0) {
            await this.cartItemRepo.delete({ cartId: cart.id });
        }

        cart.merchantId = null;
        cart.subtotal = 0;
        await this.cartRepo.save(cart);

        cartEventsTotal.inc({ action: "clear" });

        // Fresh query from Postgres
        return this.getCart(userId);
    }

    // ── Cart For Checkout ───────────────────────────────────────────

    /**
     * Get cart with full product details for checkout validation.
     * Returns raw Cart entity with items + product relations loaded.
     */
    async getCartForCheckout(userId: string): Promise<Cart | null> {
        return this.cartRepo.findOne({
            where: { userId },
            relations: {
                items: { product: true },
            },
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /**
     * Build the rich cart response with product names/images from loaded relations.
     */
    private async buildCartResponse(cart: Cart): Promise<CartResponse> {
        // Always load items with product details from DB
        let items = cart.items || [];
        if (items.length === 0 || (items.length > 0 && !items[0].product)) {
            items = await this.cartItemRepo.find({
                where: { cartId: cart.id },
                relations: { product: true },
            });
        }

        // Load merchant info
        let merchant: { businessName: string; category: string } | null = null;
        let merchantLocation: { address: string; latitude: number | null; longitude: number | null } | null = null;
        if (cart.merchantId) {
            const profile = await this.merchantRepo.findOne({
                where: { userId: cart.merchantId },
            });
            if (profile) {
                merchant = {
                    businessName: profile.businessName,
                    category: profile.category,
                };
                merchantLocation = {
                    address: profile.address,
                    latitude: profile.latitude,
                    longitude: profile.longitude,
                };
            }
        }

        const cartItems: CartItemResponse[] = items.map((item) => ({
            id: item.id,
            productId: item.productId,
            productName: item.product?.name || "Unknown Product",
            productImage: item.product?.images?.[0] || null,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            selectedOptions: item.selectedOptions,
            itemTotal: Number(item.itemTotal),
        }));

        const itemCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

        return {
            id: cart.id,
            merchantId: cart.merchantId,
            merchant,
            merchantLocation,
            items: cartItems,
            subtotal: Number(cart.subtotal),
            itemCount,
        };
    }

    /**
     * Calculate cart subtotal from all item totals.
     */
    private async calculateSubtotal(cartId: string): Promise<number> {
        const result = await this.cartItemRepo
            .createQueryBuilder("item")
            .select("COALESCE(SUM(item.itemTotal), 0)", "total")
            .where("item.cartId = :cartId", { cartId })
            .getRawOne();

        return Math.round(Number(result?.total || 0) * 100) / 100;
    }

    /**
     * Find an existing cart item with the same product + same options combo.
     */
    private findExistingCartItem(
        items: CartItem[],
        productId: string,
        options: CartItem["selectedOptions"]
    ): CartItem | undefined {
        return items.find((item) => {
            if (item.productId !== productId) return false;

            // Compare options (order-independent)
            const itemOpts = (item.selectedOptions || []).map((o) => o.optionId).sort();
            const newOpts = (options || []).map((o) => o.optionId).sort();

            if (itemOpts.length !== newOpts.length) return false;
            return itemOpts.every((id, idx) => id === newOpts[idx]);
        });
    }

    /**
     * Sum the prices of selected options.
     */
    private sumOptionsPrices(
        options: CartItem["selectedOptions"]
    ): number {
        if (!options || options.length === 0) return 0;
        return options.reduce((sum, opt) => sum + Number(opt.price), 0);
    }

    /**
     * Validate that all required customizations have at least one option selected.
     */
    private async validateRequiredCustomizations(
        productId: string,
        selectedOptions: Array<{ customizationId: string; optionId: string }>
    ): Promise<void> {
        const customizations = await this.customizationRepo.find({
            where: { productId, isRequired: true },
        });

        const selectedCustomizationIds = new Set(
            selectedOptions.map((o) => o.customizationId)
        );

        const missing = customizations.filter(
            (c) => !selectedCustomizationIds.has(c.id)
        );

        if (missing.length > 0) {
            const names = missing.map((c) => `"${c.title}"`).join(", ");
            throw new Error(`Required customization(s) not selected: ${names}`);
        }
    }

    // ── Cache (no-op — all reads go directly to Postgres) ──

    async invalidateCache(_userId: string): Promise<void> {
        // No-op: Redis cache removed, all reads go to Postgres directly
    }
}
