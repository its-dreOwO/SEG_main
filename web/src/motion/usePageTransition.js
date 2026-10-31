import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { reducedMotion } from './reduced.js';

// Short fade and rise of the page body when the route path changes. The first load is left to the page itself.
export function usePageTransition(pathname) {
  const ref = useRef(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (first.current) { first.current = false; return undefined; }
    if (!el || reducedMotion()) return undefined;
    const tween = gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out', clearProps: 'opacity,transform', overwrite: true });
    return () => { tween.kill(); gsap.set(el, { clearProps: 'opacity,transform' }); };
  }, [pathname]);
  return ref;
}
