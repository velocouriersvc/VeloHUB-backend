import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("product_categories")
export class ProductCategory {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 100, unique: true })
    name: string;

    @Column({ type: "varchar", length: 100, unique: true })
    slug: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    icon: string;

    @Column({ type: "varchar", length: 50, default: "product" }) // 'product', 'service', 'marketplace'
    type: string;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
