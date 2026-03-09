import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { WaitlistCountry } from "./waitlist-country";

@Entity("waitlist")
export class Waitlist {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 255 })
    fullName: string;

    @Column({ type: "varchar", length: 255 })
    email: string;

    @Column({ type: "varchar", length: 20 })
    phoneNumber: string;

    @Column({ type: "uuid" })
    countryId: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @ManyToOne(() => WaitlistCountry, (country: WaitlistCountry) => country.entries)
    @JoinColumn({ name: "countryId" })
    country: WaitlistCountry;
}
