import { useT } from '../i18n.jsx';

function pageList(page, pages) {
  const set = new Set([1, pages, page, page - 1, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export default function Pagination({ page, pages, onChange }) {
  const { t } = useT();
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={t('pager.label')}>
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>{t('pager.prev')}</button>
      {pageList(page, pages).map((n, i) => (n === 'gap'
        ? <span key={`g${i}`} className="pagination__gap" aria-hidden="true">…</span>
        : <button key={n} type="button" className={n === page ? 'is-current' : ''} aria-current={n === page ? 'page' : undefined}
            aria-label={t('pager.page', { n })} onClick={() => onChange(n)}>{n}</button>))}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages}>{t('pager.next')}</button>
    </nav>
  );
}
