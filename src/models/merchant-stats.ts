import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    UpdateDateColumn,
    OneToOne,
    JoinColumn,
} from "typeorm";
import { User } from "./user";

@Entity("merchant_stats")
export class MerchantStats {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", unique: true })
    merchantId: string;

    @Column({ type: "int", default: 0 })
    totalOrders: number;

    @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
    totalRevenue: number;

    @Column({ type: "decimal", precision: 3, scale: 2, default: 0 })
    averageRating: number;

    @Column({ type: "int", default: 0 })
    ratingCount: number;

    @Column({ type: "int", default: 0 })
    totalProducts: number;

    // Orders auto-cancelled because the merchant did not respond in time (penalty signal).
    @Column({ type: "int", default: 0 })
    autoCancelledOrders: number;

    @Column({ type: "int", default: 0 })
    viewCount: number;

    @UpdateDateColumn()
    updatedAt: Date;

    // ── Relations ──
    @OneToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "merchantId" })
    merchant: User;
}
