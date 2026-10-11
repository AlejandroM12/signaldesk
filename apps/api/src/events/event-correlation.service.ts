import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type CorrelationCandidate,
  readCorrelationWindowMs,
  selectCorrelatedIncident,
} from "./event-correlation";

@Injectable()
export class EventCorrelationService {
  private readonly windowMs: number;

  constructor(config: ConfigService) {
    this.windowMs = readCorrelationWindowMs(
      config.get<string>("EVENT_CORRELATION_WINDOW_MINUTES"),
    );
  }

  select(
    candidates: readonly CorrelationCandidate[],
    eventTimestamp: Date,
  ): CorrelationCandidate | null {
    return selectCorrelatedIncident(candidates, eventTimestamp, this.windowMs);
  }
}
