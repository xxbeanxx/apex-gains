import { formatNumber } from './units';

/**
 * How long a cardio set ran. Stored in seconds, entered and displayed in
 * minutes; this is the only place that conversion happens.
 *
 * Duration is unit-independent, so unlike `Weight` and `Speed` it needs no
 * reference to the athlete's preferences.
 */
export class Duration {
  private constructor(private readonly totalSeconds: number) {}

  static seconds(value: number): Duration {
    return new Duration(Math.round(value));
  }

  static minutes(value: number): Duration {
    return new Duration(Math.round(value * 60));
  }

  static fromStorage(value: number | null | undefined): Duration | null {
    return value == null ? null : new Duration(value);
  }

  get inSeconds(): number {
    return this.totalSeconds;
  }

  get inMinutes(): number {
    return this.totalSeconds / 60;
  }

  toStorage(): number {
    return this.totalSeconds;
  }

  /** "30 min" - minutes are the only granularity the UI ever offered. */
  format(): string {
    return `${formatNumber(this.inMinutes)} min`;
  }

  plus(other: Duration): Duration {
    return new Duration(this.totalSeconds + other.totalSeconds);
  }

  isLongerThan(other: Duration): boolean {
    return this.totalSeconds > other.totalSeconds;
  }

  equals(other: Duration): boolean {
    return this.totalSeconds === other.totalSeconds;
  }
}
