import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { reducedMotion } from './reduced.js';

// Label, title, price, image (then the rest) in quick order the first time the hero shows.
let played = false;

export function useHeroSequence(ready) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!ready || !root || played || reducedMotion()) return undefined;
    const pick = (s) => root.querySelector(s);
    const steps = [pick('.hero__text .eyebrow'), pick('.hero__text h1'), pick('.hero__text .priceline'), pick('.hero__frame'), pick('.hero__sum'), pick('.hero__text .btn'), ...root.querySelectorAll('.hero__side .promo')].filter(Boolean);
    const tl = gsap.timeline({ onComplete: () => { played = true; } });
    steps.forEach((el, i) => {
      const isImg = el.classList.contains('hero__frame');
      tl.from(el, { opacity: 0, y: isImg ? 0 : 14, scale: isImg ? 0.94 : 1, duration: 0.35, ease: 'power2.out', clearProps: 'opacity,transform' }, i === 0 ? 0 : i * 0.09);
    });
    return () => { tl.kill(); gsap.set(steps, { clearProps: 'opacity,transform' }); };
  }, [ready]);
  return ref;
}
