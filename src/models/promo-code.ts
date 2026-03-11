import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./user";

export enum PromoApplicableTo {
    RIDES = "rides",
    ORDERS = "orders",
    BOTH = "both",
}

@Entity("promo_codes")
export class PromoCode {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 50, unique: true })
    code: string;

    @Column({ type: "decimal", precision: 5, scale: 2 })
    discountPercent: number;

    @Column({ type: "decimal", precision: 8, scale: 2, nullable: true })
    maxDiscountAmt: number | null;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @Column({ type: "timestamp", nullable: true })
    expiryDate: Date | null;

    @Column({ type: "int", nullable: true })
    usageLimit: number | null;

    @Column({ type: "int", default: 0 })
    usedCount: number;

    // ── Marketplace Additions ──
    @Column({ type: "enum", enum: PromoApplicableTo, default: PromoApplicableTo.BOTH })
    applicableTo: PromoApplicableTo;

    @Column({ type: "varchar", length: 100, nullable: true })
    categoryRestriction: string | null; // e.g. "food", "pharmacy" or null for all

    @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
    minOrderValue: number | null;

    @Column({ type: "uuid", nullable: true })
    merchantId: string | null; // null = global, set = merchant-specific

    @CreateDateColumn()
    createdAt: Date;

    // ── Relations ──
    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "merchantId" })
    merchant: User | null;
}
