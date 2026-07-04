import type { Interval } from '@tv/layout-sync';
import { Menu, MenuLabel } from '../ui';
import { IconChevronDown, IconStar } from '../ui/icons';
import { orderedFavorites } from './workspace';

/**
 * Temporality switcher. Favorite timeframes sit inline as a segmented control;
 * the caret opens the full catalog grouped by unit, where any timeframe can be
 * starred into (or out of) the inline row. The active interval always shows —
 * even when it isn't a favorite — so the current temporality is never hidden.
 */

const INTERVAL_GROUPS: { label: string; items: Interval[] }[] = [
  { label: 'Minutes', items: ['1m', '5m', '15m', '30m'] },
  { label: 'Hours', items: ['1h', '4h'] },
  { label: 'Days', items: ['1d', '1w'] },
];

const FULL_LABEL: Record<Interval, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '30m': '30 minutes',
  '1h': '1 hour',
  '4h': '4 hours',
  '1d': '1 day',
  '1w': '1 week',
};

/** Compact chip label (day/week read as 1D/1W the way terminals show them). */
export const intervalLabel = (interval: Interval): string =>
  interval === '1d' ? '1D' : interval === '1w' ? '1W' : interval;

export interface IntervalPickerProps {
  value: Interval;
  onChange: (interval: Interval) => void;
  favorites: readonly Interval[];
  onToggleFavorite: (interval: Interval) => void;
}

export function IntervalPicker({ value, onChange, favorites, onToggleFavorite }: IntervalPickerProps) {
  const shown = orderedFavorites(favorites);
  const currentIsFavorite = shown.includes(value);

  return (
    <div className="ws-tf">
      <div className="ui-seg ws-tf-seg" role="tablist">
        {shown.map((interval) => (
          <button
            key={interval}
            type="button"
            role="tab"
            aria-selected={interval === value}
            className={interval === value ? 'active' : ''}
            onClick={() => onChange(interval)}
            title={FULL_LABEL[interval]}
          >
            {intervalLabel(interval)}
          </button>
        ))}
        {!currentIsFavorite && (
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="active ws-tf-adhoc"
            onClick={() => onChange(value)}
            title={`${FULL_LABEL[value]} (not a favorite)`}
          >
            {intervalLabel(value)}
          </button>
        )}
      </div>

      <Menu title="All timeframes" width={200} button={<IconChevronDown size={12} />}>
        {(close) => (
          <>
            {INTERVAL_GROUPS.map((group) => (
              <div key={group.label}>
                <MenuLabel>{group.label}</MenuLabel>
                {group.items.map((interval) => {
                  const favorite = favorites.includes(interval);
                  return (
                    <div
                      key={interval}
                      className={`ws-tf-row${interval === value ? ' active' : ''}`}
                    >
                      <button
                        type="button"
                        className="ws-tf-row-select"
                        onClick={() => {
                          onChange(interval);
                          close();
                        }}
                      >
                        <span className="ws-tf-row-code">{intervalLabel(interval)}</span>
                        <span className="ws-tf-row-name">{FULL_LABEL[interval]}</span>
                      </button>
                      <button
                        type="button"
                        className={`ws-tf-star${favorite ? ' on' : ''}`}
                        title={favorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-pressed={favorite}
                        onClick={() => onToggleFavorite(interval)}
                      >
                        <IconStar size={13} filled={favorite} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="ws-tf-hint">
              <span>Step timeframe</span>
              <span>
                <kbd>[</kbd>
                <kbd>]</kbd>
              </span>
            </div>
          </>
        )}
      </Menu>
    </div>
  );
}
