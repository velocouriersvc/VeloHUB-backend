import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./user";

@Entity("broadcasts")
export class Broadcast {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 150 })
    title: string;

    @Column({ type: "text" })
    body: string;

    @Column({ type: "varchar", length: 50, default: "all" })
    targetGroup: string; // all, riders, drivers, merchants

    @Column({ type: "int", default: 0 })
    userCount: number;

    @Column({ type: "text" })
    adminId: string;

    @ManyToOne(() => User, { createForeignKeyConstraints: false })
    @JoinColumn({ name: "adminId" })
    admin: User;

    @CreateDateColumn()
    createdAt: Date;
}
