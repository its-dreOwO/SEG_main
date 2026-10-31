import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { reducedMotion } from './reduced.js';

const CLEAR = 'opacity,transform';

// Reveals matching children once: in-view ones animate in at once, the rest wait for the viewport.
// Elements are marked so they never animate twice; a cleanup puts unrevealed ones back to normal.
export function useReveal(selector, deps = [], { stagger = 0.06, y = 16 } = {}) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || reducedMotion()) return undefined;
    const els = [...root.querySelectorAll(selector)].filter((e) => !e.dataset.rv);
    if (!els.length) return undefined;
    els.forEach((e) => { e.dataset.rv = '1'; });
    const done = (list) => list.forEach((e) => { e.dataset.rv = 'done'; });
    const vh = window.innerHeight;
    const inView = [];
    const below = [];
    els.forEach((e) => (e.getBoundingClientRect().top < vh ? inView : below).push(e));

    let io = null;
    if (below.length && !('IntersectionObserver' in window)) { done(below); below.length = 0; }
    if (inView.length) {
      gsap.from(inView, { opacity: 0, ...(y ? { y } : {}), duration: 0.35, stagger, ease: 'power2.out', clearProps: CLEAR, overwrite: 'auto', onComplete: () => done(inView) });
    }
    if (below.length) {
      gsap.set(below, { opacity: 0, ...(y ? { y } : {}) });
      io = new IntersectionObserver((entries) => {
        const hit = entries.filter((en) => en.isIntersecting).map((en) => en.target);
        if (!hit.length) return;
        hit.forEach((t) => io.unobserve(t));
        gsap.to(hit, { opacity: 1, ...(y ? { y: 0 } : {}), duration: 0.35, stagger, ease: 'power2.out', clearProps: CLEAR, overwrite: 'auto', onComplete: () => done(hit) });
      }, { rootMargin: '0px 0px -8% 0px' });
      below.forEach((e) => io.observe(e));
    }
    return () => {
      if (io) io.disconnect();
      els.forEach((e) => {
        if (e.dataset.rv === '1') {
          gsap.killTweensOf(e);
          gsap.set(e, { clearProps: CLEAR });
          delete e.dataset.rv;
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
