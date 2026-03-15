import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("platform_settings")
export class PlatformSettings {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true })
    setting_key: string;

    @Column("text")
    setting_value: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
