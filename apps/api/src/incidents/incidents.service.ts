import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  IncidentActivityChanges,
  IncidentActivityResponse,
  IncidentDetail,
  IncidentListResponse,
  IncidentStatus,
  IncidentSummary,
} from "@signaldesk/contracts";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ListIncidentsQueryDto } from "./dto/list-incidents.query";
import type { UpdateIncidentDto } from "./dto/update-incident.dto";
import { planIncidentUpdate } from "./incident-update";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListIncidentsQueryDto): Promise<IncidentListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where = buildWhere(query);

    const [total, incidents, grouped] = await Promise.all([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          severity: true,
          service: true,
          team: true,
          assignee: true,
          createdAt: true,
          _count: { select: { events: true } },
        },
      }),
      this.prisma.incident.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    return {
      items: incidents.map((incident) => ({
        id: incident.id,
        title: incident.title,
        status: incident.status,
        severity: incident.severity,
        service: incident.service,
        team: incident.team,
        assignee: incident.assignee,
        createdAt: incident.createdAt.toISOString(),
        eventCount: incident._count.events,
      })),
      page,
      limit,
      total,
      pageCount: total === 0 ? 0 : Math.ceil(total / limit),
      summary: toSummary(grouped),
    };
  }

  async getById(id: string): Promise<IncidentDetail> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { timestamp: "asc" },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(INCIDENT_NOT_FOUND);
    }

    return toIncidentDetail(incident);
  }

  async update(id: string, dto: UpdateIncidentDto): Promise<IncidentDetail> {
    const expectedUpdatedAt = new Date(dto.expectedUpdatedAt);
    if (Number.isNaN(expectedUpdatedAt.getTime())) {
      throw new BadRequestException("expectedUpdatedAt no es una fecha válida.");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.incident.findUnique({ where: { id } });
        if (!current) {
          throw new NotFoundException(INCIDENT_NOT_FOUND);
        }

        if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          throw new ConflictException(INCIDENT_CONFLICT);
        }

        const plan = planIncidentUpdate(
          current,
          {
            status: dto.status,
            team: dto.team,
            assignee: dto.assignee,
            rootCause: dto.rootCause,
            resolution: dto.resolution,
          },
          new Date(),
        );

        if (!plan.ok && plan.error === "invalid-transition") {
          throw new BadRequestException(
            `No se puede pasar de ${current.status} a ${dto.status ?? current.status}.`,
          );
        }

        if (!plan.ok) {
          throw new BadRequestException("Para resolver el incidente hace falta una resolución.");
        }

        if (plan.changed) {
          const written = await tx.incident.updateMany({
            where: { id, updatedAt: current.updatedAt },
            data: plan.data,
          });
          if (written.count !== 1) {
            throw new ConflictException(INCIDENT_CONFLICT);
          }

          await tx.incidentActivity.create({
            data: {
              incidentId: id,
              action: "UPDATED",
              changes: plan.changes,
              actorId: null,
            },
          });
        }

        const saved = await tx.incident.findUnique({
          where: { id },
          include: { events: { orderBy: { timestamp: "asc" } } },
        });
        if (!saved) {
          throw new NotFoundException(INCIDENT_NOT_FOUND);
        }

        return toIncidentDetail(saved);
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw error;
    }
  }

  async listActivity(id: string): Promise<IncidentActivityResponse> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      select: {
        id: true,
        activities: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(INCIDENT_NOT_FOUND);
    }

    return {
      items: incident.activities.map((activity) => ({
        id: activity.id,
        action: activity.action,
        createdAt: activity.createdAt.toISOString(),
        actorId: activity.actorId,
        changes: readChanges(activity.changes),
      })),
    };
  }
}

const INCIDENT_NOT_FOUND = "No encontramos ese incidente.";
const INCIDENT_CONFLICT =
  "El incidente cambió desde que lo cargaste. Volvé a leerlo antes de guardar.";

type IncidentWithEvents = Prisma.IncidentGetPayload<{
  include: { events: true };
}>;

function toIncidentDetail(incident: IncidentWithEvents): IncidentDetail {
  return {
    id: incident.id,
    title: incident.title,
    status: incident.status,
    severity: incident.severity,
    service: incident.service,
    team: incident.team,
    assignee: incident.assignee,
    rootCause: incident.rootCause,
    resolution: incident.resolution,
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    eventCount: incident.events.length,
    events: incident.events.map((event) => ({
      id: event.id,
      timestamp: event.timestamp.toISOString(),
      source: event.source,
      service: event.service,
      errorType: event.errorType,
      message: event.message,
      metadata: event.metadata,
    })),
  };
}

const ACTIVITY_FIELDS = ["status", "rootCause", "resolution", "team", "assignee"] as const;

function readChanges(value: unknown): IncidentActivityChanges {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const changes: IncidentActivityChanges = {};
  for (const field of ACTIVITY_FIELDS) {
    const entry = source[field];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    changes[field] = {
      from: typeof record.from === "string" ? record.from : null,
      to: typeof record.to === "string" ? record.to : null,
    };
  }

  return changes;
}

function buildWhere(query: ListIncidentsQueryDto): Prisma.IncidentWhereInput {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.severity ? { severity: query.severity } : {}),
    ...(query.service ? { service: query.service } : {}),
    ...(query.team ? { team: query.team } : {}),
  };
}

function toSummary(
  groups: { status: IncidentStatus; _count: { _all: number } }[],
): IncidentSummary {
  return {
    open: countFor(groups, "OPEN"),
    investigating: countFor(groups, "INVESTIGATING"),
    resolved: countFor(groups, "RESOLVED"),
  };
}

function countFor(
  groups: { status: IncidentStatus; _count: { _all: number } }[],
  status: IncidentStatus,
): number {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}
