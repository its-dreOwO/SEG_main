import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { reducedMotion } from './reduced.js';

// A number cell that flips (rotates in on the X axis) whenever its text changes. Plain text with reduced motion.
export default function FlipDigit({ value, className = '' }) {
  const ref = useRef(null);
  const prev = useRef(value);
  useLayoutEffect(() => {
    const el = ref.current;
    if (prev.current === value) return undefined;
    prev.current = value;
    if (!el || reducedMotion()) return undefined;
    const tween = gsap.fromTo(el, { rotationX: -90, opacity: 0.2, transformPerspective: 300 }, { rotationX: 0, opacity: 1, duration: 0.3, ease: 'power2.out', overwrite: true, clearProps: 'transform,opacity' });
    return () => { tween.kill(); gsap.set(el, { clearProps: 'transform,opacity' }); };
  }, [value]);
  return <span ref={ref} className={`flip ${className}`}>{value}</span>;
}
