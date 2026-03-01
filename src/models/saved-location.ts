import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./user";

@Entity("saved_locations")
export class SavedLocation {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "varchar", length: 100 })
    label: string;

    @Column({ type: "text" })
    address: string;

    @Column({ type: "double precision" })
    lat: number;

    @Column({ type: "double precision" })
    lng: number;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
