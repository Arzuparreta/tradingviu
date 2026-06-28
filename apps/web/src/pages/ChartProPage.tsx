import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { KLineProChart } from '../chart/KLineProChart';
import type { TvSymbolInfo } from '../chart/klinepro-datafeed';

/**
 * KLineChart Pro chart page — the TradingView-grade chart + native drawing suite.
 * Picks the routed symbol id when present, otherwise the first seeded symbol;
 * the built-in symbol search (powered by the datafeed) changes it from there.
 */
export function ChartProPage() {
  const params = useParams<{ symbol?: string }>();
  const routedId = params.symbol;
  const symbolsQ = useQuery({ queryKey: ['symbols-all'], queryFn: () => api.symbols('') });

  const rows = symbolsQ.data?.results ?? [];
  const chosen = (routedId ? rows.find((r) => r.id === routedId) : undefined) ?? rows[0];

  if (!chosen) {
    return <div className="page">{symbolsQ.isLoading ? 'Loading chart…' : 'No symbols available.'}</div>;
  }

  const symbol: TvSymbolInfo = {
    id: chosen.id,
    ticker: chosen.ticker,
    name: chosen.name,
    exchange: chosen.exchange,
    priceCurrency: chosen.currency,
    type: chosen.assetClass,
  };

  return (
    <div style={{ height: 'calc(100vh - 56px)' }}>
      <KLineProChart symbol={symbol} />
    </div>
  );
}
