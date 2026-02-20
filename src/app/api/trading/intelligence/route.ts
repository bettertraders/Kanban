import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';

export const dynamic = 'force-dynamic';

const scannerPath = '/Users/pennyledger/Projects/owen-watchdog/.owen-scanner-results.json';
const momentumLongPath = '/Users/pennyledger/Projects/owen-watchdog/strategies/momentum-long.json';
const momentumShortPath = '/Users/pennyledger/Projects/owen-watchdog/strategies/momentum-short.json';

const formatPct = (value: number) => `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;

const readJson = async <T,>(path: string): Promise<T> => {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as T;
};

export async function GET() {
  try {
    const [scanner, longStrat, shortStrat] = await Promise.all([
      readJson<any>(scannerPath),
      readJson<any>(momentumLongPath),
      readJson<any>(momentumShortPath),
    ]);

    const watchlist = Array.isArray(scanner?.watchlist)
      ? scanner.watchlist.map((item: any) => ({
          symbol: String(item.symbol ?? ''),
          score: Number(item.score ?? 0),
          rsi: Number(item.rsi ?? 0),
          price: Number(item.price ?? 0),
          change24h: Number(item.change24h ?? 0),
        })).filter((item: any) => item.symbol)
      : [];

    const riskParams = {
      sl: formatPct(Number(longStrat?.risk?.stopLossPct ?? 0)),
      tp: formatPct(Number(longStrat?.risk?.takeProfitPct ?? 0)),
      trail: formatPct(Number(longStrat?.trailingStop?.trailPct ?? 0)),
    };

    const longEnabled = longStrat?.enabled !== false;
    const shortEnabled = shortStrat?.enabled === true;
    const longWeight = longEnabled ? Number(longStrat?.weight ?? 1) : 0;
    const shortWeight = shortEnabled ? Number(shortStrat?.weight ?? 1) : 0;
    const totalWeight = longWeight + shortWeight;
    const longPct = totalWeight > 0 ? Math.round((longWeight / totalWeight) * 100) : 0;
    const shortPct = totalWeight > 0 ? Math.max(0, 100 - longPct) : 0;

    let label = 'No active strategies';
    if (longPct === 100) label = '100% LONG';
    else if (shortPct === 100) label = '100% SHORT';
    else if (totalWeight > 0) label = `${longPct}% LONG / ${shortPct}% SHORT`;

    const directionBias = { long: longPct, short: shortPct, label };

    return NextResponse.json({ watchlist, riskParams, directionBias });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load trading intelligence' }, { status: 500 });
  }
}
