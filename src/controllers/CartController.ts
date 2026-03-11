import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { CartService, AddToCartInput } from "../services/cart-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("CartController");

export class CartController {
    private cartService = new CartService();

    // ── Get Cart ────────────────────────────────────────────────────

    /**
     * GET /cart — Get the user's cart with items and merchant info.
     */
    getCart = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const cart = await this.cartService.getCart(userId);
            return res.status(200).json({ cart });
        } catch (error) {
            log.error("Error getting cart", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Add Item ────────────────────────────────────────────────────

    /**
     * POST /cart/add — Add an item to the cart.
     */
    addItem = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { productId, quantity, selectedOptions } = req.body;

            if (!productId) {
                return res.status(400).json({ message: "productId is required" });
            }

            if (!quantity || quantity < 1) {
                return res.status(400).json({ message: "quantity must be at least 1" });
            }

            const input: AddToCartInput = {
                productId,
                quantity: Number(quantity),
                selectedOptions,
            };

            const result = await this.cartService.addItem(userId, input);

            // Check for merchant conflict
            if (result.conflict) {
                return res.status(409).json({
                    success: false,
                    message: "You can only order from one merchant at a time",
                    currentMerchant: result.conflict.currentMerchant,
                    newMerchant: result.conflict.newMerchant,
                });
            }

            return res.status(200).json({
                message: "Item added to cart",
                cart: result.cart,
            });
        } catch (error) {
            const message = (error as Error).message;

            if (message.includes("not found") || message.includes("inactive")) {
                return res.status(404).json({ message });
            }
            if (message.includes("Insufficient stock") || message.includes("Required customization")) {
                return res.status(400).json({ message });
            }

            log.error("Error adding to cart", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Update Quantity ─────────────────────────────────────────────

    /**
     * PATCH /cart/items/:itemId — Update quantity of a cart item.
     */
    updateItemQuantity = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { itemId } = req.params;
            const { quantity } = req.body;

            if (quantity === undefined || quantity === null) {
                return res.status(400).json({ message: "quantity is required" });
            }

            if (Number(quantity) < 1) {
                return res.status(400).json({
                    message: "Quantity must be at least 1. Use DELETE to remove item.",
                });
            }

            const cart = await this.cartService.updateItemQuantity(userId, itemId, Number(quantity));
            return res.status(200).json({ message: "Quantity updated", cart });
        } catch (error) {
            const message = (error as Error).message;

            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            if (message.includes("Insufficient stock")) {
                return res.status(400).json({ message });
            }

            log.error("Error updating cart item", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Remove Item ─────────────────────────────────────────────────

    /**
     * DELETE /cart/items/:itemId — Remove an item from the cart.
     */
    removeItem = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { itemId } = req.params;
            const cart = await this.cartService.removeItem(userId, itemId);
            return res.status(200).json({ message: "Item removed", cart });
        } catch (error) {
            const message = (error as Error).message;

            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }

            log.error("Error removing cart item", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Clear Cart ──────────────────────────────────────────────────

    /**
     * DELETE /cart — Clear entire cart.
     */
    clearCart = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const cart = await this.cartService.clearCart(userId);
            return res.status(200).json({ message: "Cart cleared", cart });
        } catch (error) {
            log.error("Error clearing cart", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
