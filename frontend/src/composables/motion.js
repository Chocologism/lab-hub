import { gsap } from 'gsap'
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export function enterPage(el, done) {
  gsap.fromTo(el, { opacity: 0, y: reducedMotion() ? 0 : 6 }, { opacity: 1, y: 0, duration: reducedMotion() ? 0 : .12, ease: 'power2.out', clearProps: 'transform,opacity', onComplete: done })
}
export function leavePage(el, done) { gsap.to(el, { opacity: 0, duration: reducedMotion() ? 0 : .06, onComplete: done }) }
