import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./user";

export enum DevicePlatform {
    IOS = "ios",
    ANDROID = "android",
}

@Entity("push_tokens")
export class PushToken {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "text" })
    token: string;

    @Column({ type: "enum", enum: DevicePlatform })
    platform: DevicePlatform;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
