import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AiTask } from '../entities/ai-task.entity';
import { AiTaskGroup } from '../entities/ai-task-group.entity';
import {
  CreateAiTaskDto,
  UpdateAiTaskDto,
  CreateAiTaskGroupDto,
  UpdateAiTaskGroupDto,
} from '../dto/ai-task.dto';

@Injectable()
export class AiTaskService {
  constructor(
    @InjectRepository(AiTask)
    private readonly taskRepo: Repository<AiTask>,
    @InjectRepository(AiTaskGroup)
    private readonly groupRepo: Repository<AiTaskGroup>,
  ) {}

  // --- Task CRUD ---

  async createTask(dto: CreateAiTaskDto): Promise<AiTask> {
    return this.taskRepo.save(this.taskRepo.create(dto));
  }

  async updateTask(id: string, dto: UpdateAiTaskDto): Promise<AiTask> {
    const task = await this.findTask(id);
    Object.assign(task, dto);
    return this.taskRepo.save(task);
  }

  async findTask(id: string): Promise<AiTask> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async listTasks(): Promise<AiTask[]> {
    return this.taskRepo.find({
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async deleteTask(id: string): Promise<void> {
    const task = await this.findTask(id);
    await this.taskRepo.remove(task);
  }

  /**
   * Seed default task templates for common use cases.
   */
  async seedDefaults(): Promise<AiTask[]> {
    const defaults: CreateAiTaskDto[] = [
      {
        name: 'Resumen ejecutivo',
        description: 'Genera un resumen conciso de la licitación',
        systemPrompt:
          'Eres un analista experto en licitaciones públicas españolas.',
        promptTemplate: `Genera un resumen ejecutivo de esta licitación en 5-7 frases:

TÍTULO: {{tenderTitle}}
ORGANISMO: {{contractingAuthority}}
PRESUPUESTO: {{budgetAmount}}€
TIPO: {{contractType}}
PLAZO PRESENTACIÓN: {{submissionDeadline}}

DESCRIPCIÓN:
{{tenderDescription}}

Incluye: objetivo principal, alcance del servicio, presupuesto, plazos clave y cualquier requisito destacable.`,
        maxTokens: 1000,
        temperature: 0.3,
        sortOrder: 1,
      },
      {
        name: 'Criterios de adjudicación',
        description: 'Extrae y estructura los criterios de adjudicación',
        systemPrompt:
          'Eres un experto en contratación pública española. Extrae información estructurada.',
        promptTemplate: `Analiza esta licitación y extrae los criterios de adjudicación:

TÍTULO: {{tenderTitle}}
DESCRIPCIÓN: {{tenderDescription}}

DATOS COMPLETOS:
{{rawData}}

Lista los criterios de adjudicación en formato:
1. [Nombre del criterio] - Peso: X% - Tipo: [automático/juicio de valor]
   Descripción: ...

Si no puedes extraer los criterios exactos, indica qué información falta.`,
        maxTokens: 2000,
        temperature: 0.1,
        sortOrder: 2,
      },
      {
        name: 'Requisitos de solvencia',
        description: 'Extrae requisitos de solvencia técnica y económica',
        systemPrompt:
          'Eres un experto en contratación pública española. Analiza requisitos de solvencia.',
        promptTemplate: `Analiza esta licitación y extrae TODOS los requisitos de solvencia:

TÍTULO: {{tenderTitle}}
TIPO CONTRATO: {{contractType}}
PRESUPUESTO: {{budgetAmount}}€

DESCRIPCIÓN:
{{tenderDescription}}

DATOS COMPLETOS:
{{rawData}}

Extrae y clasifica:

## Solvencia Económica
- [Requisito y umbral mínimo]

## Solvencia Técnica
- [Requisito y umbral mínimo]

## Certificaciones requeridas
- [ISO, ENS, u otras certificaciones]

## Experiencia mínima
- [Años, proyectos similares, importes]

Si hay requisitos que LYN Soluciones (empresa de desarrollo de software) podría NO cumplir, destácalos con ⚠️.`,
        maxTokens: 2000,
        temperature: 0.1,
        sortOrder: 3,
      },
      {
        name: 'Propuesta técnica inicial',
        description: 'Borrador de estructura para propuesta técnica',
        systemPrompt:
          'Eres un consultor de licitaciones con experiencia en redactar propuestas técnicas ganadoras para empresas de desarrollo de software.',
        promptTemplate: `Redacta un borrador de estructura para la propuesta técnica de esta licitación:

TÍTULO: {{tenderTitle}}
ORGANISMO: {{contractingAuthority}}
PRESUPUESTO: {{budgetAmount}}€
TIPO: {{contractType}}

DESCRIPCIÓN:
{{tenderDescription}}

EMPRESA LICITANTE: LYN Soluciones Tecnológicas (desarrollo de software, web, móvil, IA, chatbots)

Genera:
1. Índice propuesto para la memoria técnica
2. Resumen del enfoque técnico (metodología, tecnologías)
3. Equipo de trabajo sugerido (perfiles necesarios)
4. Planificación tentativa (fases y entregables)
5. Elementos diferenciadores a destacar
6. Riesgos identificados y mitigaciones

Sé específico y adapta la propuesta al objeto del contrato.`,
        maxTokens: 4000,
        temperature: 0.5,
        sortOrder: 4,
      },
      {
        name: 'Análisis de riesgos',
        description: 'Identifica riesgos y barreras de entrada',
        systemPrompt:
          'Eres un analista de riesgos especializado en contratación pública.',
        promptTemplate: `Analiza los riesgos de presentarse a esta licitación:

TÍTULO: {{tenderTitle}}
ORGANISMO: {{contractingAuthority}}
PRESUPUESTO: {{budgetAmount}}€
PROCEDIMIENTO: {{procedureType}}

DESCRIPCIÓN:
{{tenderDescription}}

EMPRESA: LYN Soluciones Tecnológicas (PYME de desarrollo de software)

Evalúa:
1. Barreras de entrada (certificaciones, solvencia, experiencia previa)
2. Riesgos técnicos
3. Riesgos económicos (presupuesto bajo, penalizaciones)
4. Competencia esperada
5. Probabilidad estimada de éxito: ALTA / MEDIA / BAJA
6. Recomendación: PRESENTARSE / NO PRESENTARSE / REVISAR CON DETALLE`,
        maxTokens: 2000,
        temperature: 0.3,
        sortOrder: 5,
      },
    ];

    const tasks: AiTask[] = [];
    for (const dto of defaults) {
      const existing = await this.taskRepo.findOne({
        where: { name: dto.name },
      });
      if (!existing) {
        tasks.push(await this.createTask(dto));
      }
    }
    return tasks;
  }

  // --- Group CRUD ---

  async createGroup(dto: CreateAiTaskGroupDto): Promise<AiTaskGroup> {
    const tasks = await this.taskRepo.find({
      where: { id: In(dto.taskIds) },
    });

    const group = this.groupRepo.create({
      name: dto.name,
      description: dto.description,
      tasks,
    });

    return this.groupRepo.save(group);
  }

  async updateGroup(
    id: string,
    dto: UpdateAiTaskGroupDto,
  ): Promise<AiTaskGroup> {
    const group = await this.findGroup(id);

    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description;
    if (dto.isActive !== undefined) group.isActive = dto.isActive;

    if (dto.taskIds) {
      group.tasks = await this.taskRepo.find({
        where: { id: In(dto.taskIds) },
      });
    }

    return this.groupRepo.save(group);
  }

  async findGroup(id: string): Promise<AiTaskGroup> {
    const group = await this.groupRepo.findOne({
      where: { id },
      relations: ['tasks'],
    });
    if (!group) throw new NotFoundException(`Group ${id} not found`);
    return group;
  }

  async listGroups(): Promise<AiTaskGroup[]> {
    return this.groupRepo.find({
      relations: ['tasks'],
      order: { createdAt: 'DESC' },
    });
  }

  async deleteGroup(id: string): Promise<void> {
    const group = await this.findGroup(id);
    await this.groupRepo.remove(group);
  }

  /**
   * Resolve tasks from either taskIds or groupId.
   */
  async resolveTasks(
    taskIds?: string[],
    groupId?: string,
  ): Promise<AiTask[]> {
    if (taskIds?.length) {
      return this.taskRepo.find({ where: { id: In(taskIds) } });
    }

    if (groupId) {
      const group = await this.findGroup(groupId);
      return group.tasks;
    }

    throw new Error('Either taskIds or groupId must be provided');
  }
}
