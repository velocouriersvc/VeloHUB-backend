import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

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

    @CreateDateColumn()
    createdAt: Date;
}
