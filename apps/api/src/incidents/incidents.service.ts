import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  IncidentDetail,
  IncidentListResponse,
  IncidentStatus,
  IncidentSummary,
} from "@signaldesk/contracts";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ListIncidentsQueryDto } from "./dto/list-incidents.query";

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
}

const INCIDENT_NOT_FOUND = "No encontramos ese incidente.";

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
