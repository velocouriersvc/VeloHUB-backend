import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn, Unique } from "typeorm";
import { Product } from "./product";
import { User } from "./user";

/**
 * A verified product review. Only a customer who received the product in a
 * delivered/completed order can leave one (one per product per order).
 */
@Entity("product_reviews")
@Unique(["productId", "userId", "orderId"])
export class ProductReview {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    productId: string;

    @ManyToOne(() => Product, { onDelete: "CASCADE" })
    @JoinColumn({ name: "productId" })
    product: Product;

    @Column({ type: "uuid" })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "userId" })
    user: User;

    @Column({ type: "uuid" })
    orderId: string;

    @Column({ type: "int" })
    rating: number; // 1..5

    @Column({ type: "text", nullable: true })
    comment: string | null;

    // Which color/size the reviewer purchased, e.g. "Red / Medium".
    @Column({ type: "varchar", length: 120, nullable: true })
    variantLabel: string | null;

    @CreateDateColumn()
    createdAt: Date;
}
