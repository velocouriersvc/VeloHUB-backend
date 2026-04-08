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

    // ── Rentals Specific ──
    @Column({ type: "enum", enum: RentalDuration, nullable: true })
    rentalDuration: RentalDuration | null;

    @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
    deposit: number | null;

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
