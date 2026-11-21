import { Injectable, HttpException, type NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import { finalize } from 'rxjs';
import { createHash } from 'node:crypto';

/** Per-process limits. Multi-instance deployment requires a shared limiter at the gateway. */
@Injectable()
export class RequestLimits {
  private buckets = new Map<string, { count: number; until: number }>();
  private active = 0;
  private heavy = 0;

  check(key: string, limit: number, seconds: number, now = Date.now()) {
    if (this.buckets.size >= 10000) {
      for (const [key, value] of this.buckets) if (value.until <= now) this.buckets.delete(key);
      if (!this.buckets.has(key) && this.buckets.size >= 10000) this.reject();
    }
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.until <= now) {
      bucket = { count: 0, until: now + seconds * 1000 };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= limit) this.reject(Math.max(1, Math.ceil((bucket.until - now) / 1000)));
    bucket.count++;
  }

  acquire(heavy: boolean) {
    if (this.active >= 100 || (heavy && this.heavy >= 4)) this.reject(2);
    this.active++;
    if (heavy) this.heavy++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      if (heavy) this.heavy--;
    };
  }

  private reject(retryAfter = 60): never {
    throw new HttpException({ statusCode: 429, message: 'طلبات كثيرة حالياً، انتظر قليلاً ثم أعد المحاولة.', retryAfter }, 429);
  }
}

@Injectable()
export class RequestCapacityInterceptor implements NestInterceptor {
  constructor(private readonly limits: RequestLimits) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const heavy = /\/(import|export|reports)(\/|$)/.test(req.path);
    if (heavy && req.user) this.limits.check('heavy:' + req.user.sub, 20, 60);
    const release = this.limits.acquire(heavy);
    try { return next.handle().pipe(finalize(release)); }
    catch (error) { release(); throw error; }
  }
}

export function loginKey(username: unknown) {
  return createHash('sha256').update(typeof username === 'string' ? username.trim().slice(0, 256) : '').digest('hex');
}

