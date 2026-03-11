import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from "typeorm";
import { Order } from "./order";
import { User } from "./user";

@Entity("order_status_history")
export class OrderStatusHistory {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    orderId: string;

    @Column({ type: "varchar", length: 50, nullable: true })
    fromStatus: string | null;

    @Column({ type: "varchar", length: 50 })
    toStatus: string;

    @Column({ type: "uuid", nullable: true })
    changedBy: string | null;

    @Column({ type: "varchar", length: 20 })
    changedByRole: string; // 'customer','merchant','driver','admin','system'

    @Column({ type: "text", nullable: true })
    note: string | null;

    @CreateDateColumn()
    createdAt: Date;

    // ── Relations ──
    @ManyToOne(() => Order, (order: Order) => order.statusHistory, { onDelete: "CASCADE" })
    @JoinColumn({ name: "orderId" })
    order: Order;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "changedBy" })
    changedByUser: User | null;
}
