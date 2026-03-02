import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { AiTask } from './ai-task.entity';

/**
 * A group of AI tasks that can be applied together to a set of tenders.
 *
 * Examples:
 * - "Análisis rápido": Resumen + Criterios de adjudicación
 * - "Preparación oferta completa": Resumen + Criterios + Solvencia + Propuesta técnica
 * - "Evaluación inicial": Resumen + Requisitos técnicos + Riesgos
 */
@Entity('ai_task_groups')
export class AiTaskGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToMany(() => AiTask, (task) => task.groups, { eager: true })
  @JoinTable({
    name: 'ai_task_group_tasks',
    joinColumn: { name: 'groupId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'taskId', referencedColumnName: 'id' },
  })
  tasks: AiTask[];

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
