import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne, JoinColumn, OneToMany } from "typeorm";
import { User } from "./user";

@Entity("referral_codes")
export class ReferralCode {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", unique: true })
    userId: string;

    @Column({ type: "varchar", length: 20, unique: true })
    code: string;

    @CreateDateColumn()
    createdAt: Date;

    @OneToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @OneToMany("ReferralLink", (link: any) => link.referralCode)
    referralLinks: any[];
}
