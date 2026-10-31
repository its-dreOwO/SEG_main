// Motion helpers: GSAP only, hand-written. Every effect checks reduced motion first and never leaves content hidden.
import { gsap } from 'gsap';

export { gsap };

export { reducedMotion } from './reduced.js';

export { useReveal } from './useReveal.js';
export { usePageTransition } from './usePageTransition.js';
export { flyToCart } from './flyToCart.js';
export { useHeroSequence } from './useHeroSequence.js';
export { default as FlipDigit } from './FlipDigit.jsx';
