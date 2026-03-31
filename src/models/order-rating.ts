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

@Entity("order_ratings")
export class OrderRating {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", unique: true })
    orderId: string;

    @Column({ type: "uuid" })
    customerId: string;

    @Column({ type: "uuid" })
    merchantId: string;

    @Column({ type: "int" })
    merchantRating: number; // 1-5

    @Column({ type: "text", nullable: true })
    merchantComment: string | null;

    @Column({ type: "uuid", nullable: true })
    driverId: string | null;

    @Column({ type: "int", nullable: true })
    driverRating: number | null; // 1-5

    @Column({ type: "text", nullable: true })
    driverComment: string | null;

    @CreateDateColumn()
    createdAt: Date;

    // ── Relations ──
    @ManyToOne(() => Order, { onDelete: "CASCADE" })
    @JoinColumn({ name: "orderId" })
    order: Order;

    @ManyToOne(() => User)
    @JoinColumn({ name: "customerId" })
    customer: User;

    
    @ManyToOne(() => User)
    @JoinColumn({ name: "merchantId" })
    merchantUser: User;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "driverId" })
    driverUser: User | null;
}
