import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { normalizePlate, validatePlate } from './plate-validation.ts';

export type PublicPlateStats = {
  plate: string;
  lookupCount: number;
  status?: PlateLookupStatus;
  message?: string;
  checkedAt?: string;
};

export type PlateLookupStatus = 'available' | 'unavailable' | 'error';

export type PlateLookupResult = {
  status: PlateLookupStatus;
  message: string;
  checkedAt: string;
};

type StatsFile = Record<string, Omit<PublicPlateStats, 'plate'>>;

const EMPTY_HEADERS = { 'cache-control': 'no-store' } as const;
export { EMPTY_HEADERS as PLATE_STATS_HEADERS };

const DEFAULT_MAX_ENTRIES = 10_000;

function cleanTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 40 || Number.isNaN(Date.parse(value))) {
    return undefined;
  }
  return value;
}

function cleanStatus(value: unknown): PlateLookupStatus | undefined {
  return value === 'available' || value === 'unavailable' || value === 'error' ? value : undefined;
}

function cleanMessage(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 500 ? value : undefined;
}

function sanitizeStatsFile(input: unknown): StatsFile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const result: StatsFile = {};
  for (const [rawPlate, rawStats] of Object.entries(input)) {
    const plate = normalizePlate(rawPlate);
    if (validatePlate(plate) || !rawStats || typeof rawStats !== 'object') continue;

    const stats = rawStats as Record<string, unknown>;
    const count = Number(stats.lookupCount);
    result[plate] = {
      lookupCount: Number.isFinite(count)
        ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(count)))
        : 0,
      status: cleanStatus(stats.status),
      message: cleanMessage(stats.message),
      checkedAt: cleanTimestamp(stats.checkedAt),
    };
  }
  return result;
}

export function createPlateStatsStore(
  directory = process.env.PLATE_PANTRY_STATS_DIR ?? process.env.NYPL8_DATA_DIR,
  maxEntries = Number(process.env.PLATE_PANTRY_MAX_STATS_ENTRIES ?? DEFAULT_MAX_ENTRIES),
) {
  const dataDir = directory ? resolve(directory) : join(process.cwd(), 'data');
  const statsFile = join(dataDir, 'plate-stats.json');
  const effectiveMax =
    Number.isFinite(maxEntries) && maxEntries > 0 ? maxEntries : DEFAULT_MAX_ENTRIES;
  let writeQueue: Promise<unknown> = Promise.resolve();

  async function readAll(): Promise<StatsFile> {
    try {
      return sanitizeStatsFile(JSON.parse(await readFile(statsFile, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  async function writeAll(stats: StatsFile): Promise<void> {
    await mkdir(dataDir, { recursive: true });
    const tempFile = join(dataDir, `.plate-stats.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tempFile, JSON.stringify(stats, null, 2), 'utf8');
    await rename(tempFile, statsFile);
  }

  async function get(plateInput: string): Promise<PublicPlateStats> {
    const plate = normalizePlate(plateInput);
    if (validatePlate(plate)) throw new Error('Invalid plate.');
    const current = (await readAll())[plate];
    return current ? { plate, ...current } : { plate, lookupCount: 0 };
  }

  function record(plateInput: string, result: PlateLookupResult): Promise<PublicPlateStats> {
    const plate = normalizePlate(plateInput);
    const checkedAt = cleanTimestamp(result.checkedAt);
    const status = cleanStatus(result.status);
    const message = cleanMessage(result.message);
    if (validatePlate(plate) || !checkedAt || !status || message === undefined) {
      return Promise.reject(new Error('Invalid lookup.'));
    }

    const operation = writeQueue.then(async () => {
      const allStats = await readAll();
      const current = allStats[plate];
      const updated: Omit<PublicPlateStats, 'plate'> = {
        lookupCount: (current?.lookupCount ?? 0) + 1,
        status,
        message,
        checkedAt,
      };
      allStats[plate] = updated;

      const keys = Object.keys(allStats);
      if (keys.length > effectiveMax) {
        keys.sort((a, b) => {
          const countDiff = allStats[a].lookupCount - allStats[b].lookupCount;
          if (countDiff !== 0) return countDiff;
          const timeA = allStats[a].checkedAt ? Date.parse(allStats[a].checkedAt) : 0;
          const timeB = allStats[b].checkedAt ? Date.parse(allStats[b].checkedAt) : 0;
          return timeA - timeB;
        });
        const toEvict = keys.length - effectiveMax;
        for (let i = 0; i < toEvict; i++) {
          delete allStats[keys[i]];
        }
      }

      await writeAll(allStats);
      return { plate, ...updated };
    });

    writeQueue = operation.catch(() => undefined);
    return operation;
  }

  return { get, record };
}

let defaultStore: ReturnType<typeof createPlateStatsStore> | undefined;

function getDefaultStore() {
  defaultStore ??= createPlateStatsStore();
  return defaultStore;
}

export const getPlateStats = (plate: string) => getDefaultStore().get(plate);
export const recordPlateLookup = (plate: string, result: PlateLookupResult) =>
  getDefaultStore().record(plate, result);
