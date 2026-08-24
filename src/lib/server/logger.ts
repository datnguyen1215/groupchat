import pino from 'pino';

/**
 * The server logger. One process, one stream, JSON on stdout.
 *
 * Levels, and what belongs at each:
 * - `error` — the operation failed and someone has to know.
 * - `warn`  — recovered, but not what we wanted (stale rows, dead subscriber).
 * - `info`  — every request, every write, every agent turn. The default.
 * - `debug` — high-volume detail: heartbeats, per-event fan-out, payloads.
 *
 * `debug` is off unless `LOG_LEVEL=debug`, so the noisy calls cost nothing in
 * normal running and are one env var away when tracing something.
 *
 * One field name to avoid: `name` is pino's own logger-name key, and pino-pretty
 * renders it as the logger's identity instead of as data. Log a thread's or a
 * skill's name as `threadName`, `skillName`, and so on.
 */
export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',

  /**
   * Provider errors carry the whole request back with them — the model SDK's
   * `APICallError` has a `requestBodyValues` holding every prompt and message,
   * and its auth errors quote part of the key. `loop.ts` already refuses to put
   * provider text into a thread for that reason; the log needs the same care,
   * because these lines outlive the request and get shipped off the box.
   *
   * The error's `message`, `name`, `status` and stack survive — that is what a
   * failure is diagnosed from.
   */
  redact: {
    paths: [
      'err.requestBodyValues',
      'err.responseBody',
      'err.data',
      'error.requestBodyValues',
      'error.responseBody',
      'error.data',
      'req.headers.authorization',
      'req.headers.cookie'
    ],
    remove: true
  },
  /** Pretty only in dev; production wants parseable lines. */
  ...(process.env.NODE_ENV === 'production'
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            messageFormat: '[{area}] {msg}'
          }
        }
      })
});

/** A logger tagged with the area it came from: `log.child({ area })`. */
export const logger = (area: string) => log.child({ area });

/** Milliseconds since `start`, rounded. Pair with `Date.now()` at the call site. */
export const since = (start: number) => Date.now() - start;
