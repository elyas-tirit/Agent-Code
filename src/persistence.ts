import * as fs from "node:fs";
import * as path from "node:path";

/**
 * A tiny JSON file store with atomic writes.
 *
 * Replaces stuffing long agent transcripts into VS Code's `globalState` (a
 * key-value store that bloats and re-serializes wholesale). Writes go to a temp
 * file then rename — so a crash mid-write never leaves a half-written, unparseable
 * file. Async writes are coalesced (only the latest value is flushed); `flushSync`
 * exists for shutdown (`deactivate`) where there's no time to await.
 */
export class JsonFileStore<T> {
  private last?: T;
  private inFlight = false;
  private queued = false;

  constructor(private readonly file: string) {}

  exists(): boolean {
    return fs.existsSync(this.file);
  }

  /** Synchronous read; returns `fallback` if missing or corrupt. */
  read(fallback: T): T {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  /** Queue an atomic write. Coalesces bursts to the latest value. */
  async write(value: T): Promise<void> {
    this.last = value;
    if (this.inFlight) {
      this.queued = true;
      return;
    }
    this.inFlight = true;
    try {
      await this.writeOnce(this.last);
      while (this.queued) {
        this.queued = false;
        await this.writeOnce(this.last);
      }
    } finally {
      this.inFlight = false;
    }
  }

  /** Best-effort synchronous flush of the last value (for shutdown paths). */
  flushSync(): void {
    if (this.last === undefined) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.last));
      fs.renameSync(tmp, this.file);
    } catch {
      /* nothing we can do at shutdown */
    }
  }

  private async writeOnce(value: T | undefined): Promise<void> {
    if (value === undefined) return;
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(value));
    await fs.promises.rename(tmp, this.file);
  }
}
