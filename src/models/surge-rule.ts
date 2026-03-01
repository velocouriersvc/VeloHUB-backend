import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

export enum DayType {
    WEEKDAY = "weekday",
    WEEKEND = "weekend",
    ALL = "all",
}

@Entity("surge_rules")
export class SurgeRule {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 100 })
    name: string;

    @Column({ type: "enum", enum: DayType })
    dayType: DayType;

    @Column({ type: "int" })
    startHour: number;

    @Column({ type: "int" })
    endHour: number;

    @Column({ type: "decimal", precision: 3, scale: 2 })
    multiplier: number;

    @Column({ type: "boolean", default: true })
    isActive: boolean;
}
