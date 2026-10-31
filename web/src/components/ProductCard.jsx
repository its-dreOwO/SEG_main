import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n.jsx';
import { useCart } from '../cart.jsx';
import { discountPercent } from '../money.js';
import Stars from './Stars.jsx';
import ProductImage from './ProductImage.jsx';

export default function ProductCard({ product, onOpen }) {
  const { t, pick, price, catName } = useT();
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  const soldOut = product.stock <= 0;
  const inCart = cart.items.find((i) => i.docId === product.id)?.qty ?? 0;
  const atCap = inCart >= product.stock;
  const off = discountPercent(product.price, product.compare_at_price);
  const to = `/product/${product.slug}`;

  const addToCart = () => {
    cart.add(product, 1);
    setAdded(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1600);
  };

  return (
    <article className="card">
      <Link to={to} className="card__media" onClick={() => onOpen?.(product)} tabIndex={-1} aria-hidden="true">
        <ProductImage doc={product} />
        {off > 0 && !soldOut && <span className="badge badge--accent">-{off}%</span>}
        {soldOut && <span className="badge">{t('card.soldOut')}</span>}
      </Link>
      <div className="card__body">
        <Stars value={product.rating} count={product.rating_count} />
        <p className="card__cat">{catName(product.category_slug, product.category)}</p>
        <h3 className="card__title"><Link to={to} onClick={() => onOpen?.(product)}>{pick(product, 'title')}</Link></h3>
        <p className="card__price">
          <span>{price(product.price)}</span>
          {product.compare_at_price > product.price && <del>{price(product.compare_at_price)}</del>}
        </p>
      </div>
      <button type="button" className="card__add" onClick={addToCart} disabled={soldOut || atCap}
        aria-label={`${soldOut ? t('card.soldOut') : t('card.add')}: ${pick(product, 'title')}`}>
        {soldOut ? t('card.soldOut') : atCap ? t('card.maxInCart') : added ? t('card.added') : t('card.add')}
      </button>
    </article>
  );
}
