import { gsap } from 'gsap';
import { reducedMotion } from './reduced.js';

function bump() {
  const badge = document.querySelector('[data-cart-count]');
  if (badge) gsap.fromTo(badge, { scale: 1.7 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', overwrite: true, clearProps: 'transform' });
}

// A small copy of the product image flies to the cart icon, then the count bumps.
// With reduced motion nothing moves. If anything is missing, the count still bumps and nothing stays on screen.
export function flyToCart(fromEl) {
  if (reducedMotion()) return;
  const target = document.querySelector('[data-cart-count]')?.parentElement;
  const img = fromEl?.tagName === 'IMG' ? fromEl : fromEl?.querySelector?.('img');
  if (!target || !img || !img.currentSrc) { bump(); return; }
  const a = img.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  if (!a.width) { bump(); return; }
  const size = 56;
  const clone = document.createElement('img');
  clone.src = img.currentSrc;
  clone.alt = '';
  clone.setAttribute('aria-hidden', 'true');
  Object.assign(clone.style, {
    position: 'fixed', left: '0', top: '0', width: `${size}px`, height: `${size * 0.75}px`, objectFit: 'cover',
    zIndex: '90', pointerEvents: 'none', margin: '0',
  });
  document.body.appendChild(clone);
  const x0 = a.left + a.width / 2 - size / 2;
  const y0 = a.top + a.height / 2 - (size * 0.75) / 2;
  const x1 = b.left + b.width / 2 - size / 2;
  const y1 = b.top + b.height / 2 - (size * 0.75) / 2;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; clone.remove(); bump(); };
  gsap.fromTo(clone, { x: x0, y: y0, scale: 1, opacity: 1 }, { x: x1, y: y1, scale: 0.3, opacity: 0.4, duration: 0.5, ease: 'power2.in', onComplete: finish });
  setTimeout(finish, 900);
}
