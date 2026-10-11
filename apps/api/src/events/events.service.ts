import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import {
  IncidentSeverity,
  IncidentStatus,
  IncidentTeam,
  Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateEventDto } from "./dto/create-event.dto";
import type {
  IngestedEvent,
  IngestedIncident,
  IngestEventResponse,
} from "./dto/ingest-event.response";
import { incidentTitle } from "./event-correlation";
import { EventCorrelationService } from "./event-correlation.service";

const DUPLICATE_EVENT_MESSAGE =
  "Ya existe un evento con ese origen e identificador externo.";
const PERSISTENCE_ERROR_MESSAGE = "No se pudo guardar el evento.";

type StoredEvent = {
  id: string;
  source: string;
  externalId: string | null;
  incidentId: string;
  service: string;
  errorType: string;
  message: string;
  timestamp: Date;
  metadata: unknown;
  createdAt: Date;
};

type StoredIncident = {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  service: string;
  team: IncidentTeam;
  assignee: string | null;
  rootCause: string | null;
  resolution: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly correlation: EventCorrelationService,
  ) {}

  async ingest(dto: CreateEventDto): Promise<IngestEventResponse> {
    try {
      return await this.prisma.$transaction((tx) => this.ingestInTransaction(tx, dto));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_EVENT_MESSAGE);
      }

      this.logger.error(
        "Event ingest failed",
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(PERSISTENCE_ERROR_MESSAGE);
    }
  }

  private async ingestInTransaction(
    tx: Prisma.TransactionClient,
    dto: CreateEventDto,
  ): Promise<IngestEventResponse> {
    if (dto.externalId) {
      const existing = await tx.event.findUnique({
        where: {
          source_externalId: {
            source: dto.source,
            externalId: dto.externalId,
          },
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException(DUPLICATE_EVENT_MESSAGE);
      }
    }

    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${dto.service}), hashtext(${dto.errorType}))
    `;

    const openIncidents = await tx.incident.findMany({
      where: {
        service: dto.service,
        status: { in: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING] },
        events: { some: { errorType: dto.errorType } },
      },
      select: {
        id: true,
        createdAt: true,
        events: {
          where: { errorType: dto.errorType },
          select: { timestamp: true },
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    });

    const selected = this.correlation.select(
      openIncidents.flatMap((incident) => {
        const latest = incident.events[0];
        if (!latest) {
          return [];
        }

        return [
          {
            id: incident.id,
            createdAt: incident.createdAt,
            latestEventTimestamp: latest.timestamp,
          },
        ];
      }),
      new Date(dto.timestamp),
    );

    if (selected) {
      const event = await tx.event.create({
        data: {
          ...eventData(dto),
          incidentId: selected.id,
        },
      });
      const incident = await tx.incident.update({
        where: { id: selected.id },
        data: { updatedAt: new Date() },
      });

      return toResponse(event, incident, false);
    }

    const incident = await tx.incident.create({
      data: {
        title: incidentTitle(dto.errorType, dto.service),
        status: IncidentStatus.OPEN,
        severity: dto.severity ?? IncidentSeverity.MEDIUM,
        service: dto.service,
        team: dto.team ?? IncidentTeam.UNKNOWN,
        events: { create: eventData(dto) },
      },
      include: { events: true },
    });
    const event = incident.events[0];
    if (!event) {
      throw new InternalServerErrorException(PERSISTENCE_ERROR_MESSAGE);
    }

    return toResponse(event, incident, true);
  }
}

function eventData(dto: CreateEventDto): {
  source: string;
  externalId: string | null;
  service: string;
  errorType: string;
  message: string;
  timestamp: Date;
  metadata?: Prisma.InputJsonValue;
} {
  return {
    source: dto.source,
    externalId: dto.externalId ?? null,
    service: dto.service,
    errorType: dto.errorType,
    message: dto.message,
    timestamp: new Date(dto.timestamp),
    ...(dto.metadata === undefined
      ? {}
      : { metadata: dto.metadata as Prisma.InputJsonValue }),
  };
}

function toResponse(
  event: StoredEvent,
  incident: StoredIncident,
  incidentCreated: boolean,
): IngestEventResponse {
  return {
    incidentCreated,
    event: toEvent(event),
    incident: toIncident(incident),
  };
}

function toEvent(event: StoredEvent): IngestedEvent {
  return {
    id: event.id,
    source: event.source,
    externalId: event.externalId,
    incidentId: event.incidentId,
    service: event.service,
    errorType: event.errorType,
    message: event.message,
    timestamp: event.timestamp.toISOString(),
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString(),
  };
}

function toIncident(incident: StoredIncident): IngestedIncident {
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
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
