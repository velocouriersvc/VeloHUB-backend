import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Index,
} from "typeorm";
import { User } from "./user";

@Entity("merchant_operating_hours")
@Index(["merchantId", "dayOfWeek"], { unique: true })
export class MerchantOperatingHours {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    merchantId: string;

    @Column({ type: "int" })
    dayOfWeek: number; // 0 = Sunday, 6 = Saturday

    @Column({ type: "time" })
    openTime: string;

    @Column({ type: "time" })
    closeTime: string;

    @Column({ type: "boolean", default: false })
    isClosed: boolean;

    // ── Relations ──
    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "merchantId" })
    merchant: User;
}
