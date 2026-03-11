import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from "typeorm";
import { Product } from "./product";
import { CustomizationOption } from "./customization-option";

@Entity("product_customizations")
export class ProductCustomization {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    productId: string;

    @Column({ type: "varchar", length: 255 })
    title: string;

    @Column({ type: "boolean", default: false })
    isRequired: boolean;

    @Column({ type: "int", default: 0 })
    minSelections: number;

    @Column({ type: "int", default: 1 })
    maxSelections: number;

    @Column({ type: "int", default: 0 })
    sortOrder: number;

    @CreateDateColumn()
    createdAt: Date;

    // ── Relations ──
    @ManyToOne(() => Product, (product: Product) => product.customizations, { onDelete: "CASCADE" })
    @JoinColumn({ name: "productId" })
    product: Product;

    @OneToMany(() => CustomizationOption, (option: CustomizationOption) => option.customization, { cascade: true })
    options: CustomizationOption[];
}
