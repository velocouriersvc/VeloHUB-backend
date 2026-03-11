import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
} from "typeorm";
import { ProductCustomization } from "./product-customization";

@Entity("customization_options")
export class CustomizationOption {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    customizationId: string;

    @Column({ type: "varchar", length: 255 })
    name: string;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    price: number;

    @Column({ type: "boolean", default: false })
    isDefault: boolean;

    @Column({ type: "int", default: 0 })
    sortOrder: number;

    // ── Relations ──
    @ManyToOne(() => ProductCustomization, (c: ProductCustomization) => c.options, { onDelete: "CASCADE" })
    @JoinColumn({ name: "customizationId" })
    customization: ProductCustomization;
}
