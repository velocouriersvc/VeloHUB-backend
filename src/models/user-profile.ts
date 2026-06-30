import {
    Entity,
    Column,
    OneToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user";

@Entity("user_profiles")
export class UserProfile {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", unique: true })
    userId: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    fullName: string | null;

    @Column({ type: "text", nullable: true })
    profileImageUrl: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToOne(() => User, (user: User) => user.userProfile, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
