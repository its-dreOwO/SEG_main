import ProductCard from './ProductCard.jsx';
import { useT } from '../i18n.jsx';
import { useReveal } from '../motion/index.js';

export function CardGridSkeleton({ n = 4 }) {
  const { t } = useT();
  return (
    <div className="grid" aria-busy="true" aria-label={t('common.loading')}>
      {Array.from({ length: n }, (_, i) => (
        <div className="card card--skeleton" key={i}>
          <div className="card__media skeleton" />
          <div className="card__body"><div className="skeleton skeleton--line" /><div className="skeleton skeleton--line short" /></div>
        </div>
      ))}
    </div>
  );
}

export function ProductGrid({ items, onOpen }) {
  const ref = useReveal('.card', [items]);
  return (
    <div className="grid" ref={ref}>
      {items.map((p) => <ProductCard key={p.id} product={p} onOpen={onOpen} />)}
    </div>
  );
}

export function Notice({ title, children, action }) {
  return (
    <div className="notice">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
