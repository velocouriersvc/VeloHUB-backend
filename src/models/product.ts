import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
    Index,
} from "typeorm";
import { User } from "./user";
import { ProductCustomization } from "./product-customization";

export enum ProductCategory {
    FOOD = "food",
    GROCERY = "grocery",
    PHARMACY = "pharmacy",
    MARKETPLACE = "marketplace",
    RENTALS = "rentals",
    SERVICES = "services",
}

export enum RentalDuration {
    HOURLY = "hourly",
    DAILY = "daily",
    WEEKLY = "weekly",
}

@Entity("products")
export class Product {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    @Index()
    merchantId: string;

    @Column({ type: "varchar", length: 255 })
    name: string;

    @Column({ type: "text", nullable: true })
    description: string | null;

    @Column({ type: "varchar", length: 100, nullable: true })
    @Index()
    category: string | null;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    price: number;

    @Column({ type: "varchar", length: 10, default: "GHS" })
    currency: string;

    @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
    compareAtPrice: number | null;

    @Column({ type: "int", default: 0 })
    stockQuantity: number;

    @Column({ type: "int", default: 0 })
    minStockAlert: number;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @Column({ type: "text", array: true, default: "{}" })
    images: string[];

    @Column({ type: "text", array: true, default: "{}" })
    tags: string[];

    // ── Food Specific ──
    @Column({ type: "int", nullable: true })
    preparationTimeMin: number | null;

    // ── Pharmacy Specific ──
    @Column({ type: "date", nullable: true })
    expirationDate: Date | null;

    @Column({ type: "text", nullable: true })
    dosageInfo: string | null;

    @Column({ type: "boolean", default: false })
    prescriptionRequired: boolean;

    // ── Services Specific ──
    @Column({ type: "int", nullable: true })
    serviceDurationMin: number | null;

    // Where this service takes place. In-call: customer comes to the provider;
    // out-call: provider travels to the customer (in-home). At least one must be
    // true for service listings (enforced in ProductService).
    @Column({ type: "boolean", default: true })
    inCall: boolean;

    @Column({ type: "boolean", default: false })
    outCall: boolean;

    // ── Rentals Specific ──
    @Column({ type: "enum", enum: RentalDuration, nullable: true })
    rentalDuration: RentalDuration | null;

    @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
    deposit: number | null;

    // ── Shipping dimensions (physical goods) ──
    // Used to compute the minimum vehicle tier a cart needs. Nullable so existing
    // listings keep working; missing dimensions fall back to the CAR tier.
    @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
    lengthIn: number | null;

    @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
    widthIn: number | null;

    @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
    heightIn: number | null;

    @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
    weightLb: number | null;

    /** Needs careful handling - forces at least the SUV tier. */
    @Column({ type: "boolean", default: false })
    isFragile: boolean;

    /** Time/temperature sensitive. */
    @Column({ type: "boolean", default: false })
    isPerishable: boolean;

    /** Cannot be enclosed (e.g. plants, long items) - forces an open-air capable tier. */
    @Column({ type: "boolean", default: false })
    requiresOpenAir: boolean;

    // ── Timestamps ──
    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt: Date | null;

    // ── Relations ──
    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "merchantId" })
    merchant: User;

    @OneToMany(() => ProductCustomization, (c: ProductCustomization) => c.product, { cascade: true })
    customizations: ProductCustomization[];
}
