import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    UpdateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
    Index,
} from "typeorm";
import { User } from "./user";
import { CartItem } from "./cart-item";

@Entity("carts")
export class Cart {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", unique: true })
    @Index()
    userId: string;

    @Column({ type: "uuid", nullable: true })
    merchantId: string | null;

    @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
    subtotal: number;

    @UpdateDateColumn()
    updatedAt: Date;

    // ── Relations ──
    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "merchantId" })
    merchant: User | null;

    @OneToMany(() => CartItem, (item: CartItem) => item.cart, { cascade: true })
    items: CartItem[];
}
