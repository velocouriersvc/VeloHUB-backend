import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from "typeorm";
import { Cart } from "./cart";
import { Product } from "./product";

@Entity("cart_items")
export class CartItem {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    cartId: string;

    @Column({ type: "uuid" })
    productId: string;

    @Column({ type: "int", default: 1 })
    quantity: number;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    unitPrice: number;

    @Column({ type: "jsonb", nullable: true })
    selectedOptions: Array<{
        customizationId: string;
        optionId: string;
        optionName: string;
        price: number;
    }> | null;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    itemTotal: number;

    @CreateDateColumn()
    createdAt: Date;

    // ── Relations ──
    @ManyToOne(() => Cart, (cart: Cart) => cart.items, { onDelete: "CASCADE" })
    @JoinColumn({ name: "cartId" })
    cart: Cart;

    @ManyToOne(() => Product, { onDelete: "CASCADE" })
    @JoinColumn({ name: "productId" })
    product: Product;
}
