import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn } from "typeorm";
import { Product } from "./product";

/**
 * A concrete color/size combination of a product with its own stock and price
 * adjustment. Absence of variants means the product is sold as a single SKU.
 */
@Entity("product_variants")
export class ProductVariant {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    productId: string;

    @ManyToOne(() => Product, { onDelete: "CASCADE" })
    @JoinColumn({ name: "productId" })
    product: Product;

    @Column({ type: "varchar", length: 60, nullable: true })
    color: string | null;

    @Column({ type: "varchar", length: 60, nullable: true })
    size: string | null;

    @Column({ type: "int", default: 0 })
    stockQuantity: number;

    // Added to (or subtracted from) the base product price for this variant.
    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    priceDelta: number;

    @Column({ type: "varchar", nullable: true })
    imageUrl: string | null;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;
}
