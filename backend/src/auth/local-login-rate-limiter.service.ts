import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LocalLoginRateLimiterService {
  private readonly attempts = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxAttempts: number;

  constructor(private readonly configService: ConfigService) {
    this.windowMs = this.readPositiveInt('LOCAL_AUTH_RATE_LIMIT_WINDOW_SECONDS', 300) * 1000;
    this.maxAttempts = this.readPositiveInt('LOCAL_AUTH_RATE_LIMIT_MAX_ATTEMPTS', 8);
  }

  isAllowed(key: string): boolean {
    const attempts = this.prune(key);
    return attempts.length < this.maxAttempts;
  }

  recordFailure(key: string): void {
    const attempts = this.prune(key);
    attempts.push(Date.now());
    this.attempts.set(key, attempts);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  private prune(key: string): number[] {
    const threshold = Date.now() - this.windowMs;
    const attempts = (this.attempts.get(key) ?? []).filter((timestamp) => timestamp >= threshold);
    this.attempts.set(key, attempts);
    return attempts;
  }

  private readPositiveInt(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number.parseInt(raw ?? '', 10);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    return fallback;
  }
}
