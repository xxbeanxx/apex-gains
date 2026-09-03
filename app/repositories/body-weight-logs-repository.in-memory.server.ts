import { randomUUID } from "node:crypto";

import type { BodyWeightLog } from "~/db/schema";

import type {
  BodyWeightLogsRepository,
  RemoveBodyWeightLogOutcome,
} from "./body-weight-logs-repository";

// Dev-convenience adapter for running the app without a database
// configured (see body-weight-logs-repository.server.ts for the selection
// rule). Data lives only for the life of the process.
export class InMemoryBodyWeightLogsRepository
  implements BodyWeightLogsRepository
{
  private readonly logsById = new Map<string, BodyWeightLog>();

  async logForDate(userId: string, dateStr: string, weight: number) {
    const existing = [...this.logsById.values()].find(
      (row) => row.userId === userId && row.date === dateStr,
    );
    const log: BodyWeightLog = {
      id: existing?.id ?? randomUUID(),
      userId,
      date: dateStr,
      weight: String(weight),
      createdAt: existing?.createdAt ?? new Date(),
    };
    this.logsById.set(log.id, log);
    return log;
  }

  async listRecentForUser(userId: string, limit: number) {
    return [...this.logsById.values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }

  async removeOwnedByUser(
    userId: string,
    logId: string,
  ): Promise<RemoveBodyWeightLogOutcome> {
    const row = this.logsById.get(logId);
    if (row?.userId !== userId) return "not-found";

    this.logsById.delete(logId);
    return "removed";
  }
}
