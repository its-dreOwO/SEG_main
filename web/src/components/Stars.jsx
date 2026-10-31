import { StarShape } from './Icons.jsx';
import { useT } from '../i18n.jsx';

// Read-only star row; the gold layer is clipped to the rating width.
export default function Stars({ value = 0, count, size = 14 }) {
  const { t } = useT();
  const pct = Math.max(0, Math.min(5, value || 0)) * 20;
  const label = count ? t('stars.label', { value: (value || 0).toFixed(1), count }) : t('stars.none');
  return (
    <span className="stars" role="img" aria-label={label}>
      <span className="stars__row stars__row--base" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <StarShape key={i} size={size} />)}</span>
      <span className="stars__row stars__row--fill" style={{ width: `${pct}%` }} aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <StarShape key={i} size={size} />)}</span>
    </span>
  );
}
