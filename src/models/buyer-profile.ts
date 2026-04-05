import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user";
import { Identification } from "./identification";

@Entity("buyer_profiles")
export class BuyerProfile {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "varchar", length: 255 })
    fullName: string;

    @Column({ type: "varchar", length: 100, nullable: true })
    region: string | null;

    @Column({ type: "text", nullable: true })
    primaryLocation: string | null;

    @Column({ type: "uuid", nullable: true })
    identificationId: string | null;

    @Column({ type: "boolean", default: false })
    hasServicesAccess: boolean;

    @Column({ type: "decimal", precision: 3, scale: 2, default: 5.0 })
    averageRating: number;

    @Column({ type: "int", default: 0 })
    ratingCount: number;

    @OneToOne(() => Identification, { nullable: true })
    @JoinColumn({ name: "identificationId" })
    identification: Identification | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToOne(() => User, (user: User) => user.buyerProfile, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
