import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("banners")
export class Banner {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 255 })
    title: string;

    @Column({ type: "text", nullable: true })
    description: string | null;

    @Column({ type: "text", nullable: true })
    imageUrl: string | null;

    @Column({ type: "text", nullable: true })
    deepLink: string | null;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @Column({ type: "int", default: 0 })
    priority: number;

    @Column({ type: "timestamp", nullable: true })
    expiryDate: Date | null;

    @Column({ type: "varchar", length: 100, default: "global" })
    targetType: string; // global, region, category

    @Column({ type: "varchar", length: 100, nullable: true })
    targetValue: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
