import { useEffect, useRef, useState } from 'preact/hooks';
import { reducedMotion } from '../../game/fx/motion';

// Landing hero: the clock-tower town at night behind the sign-in card.
//
// Loading order (first paint never waits on a big image):
//   1. CSS colour + a ~1 KB blurred placeholder inlined in auth.css (data: URI; CSP allows data: images).
//   2. The composite scene (desktop 16:9 or phone portrait art via <picture> media queries), faded in.
//   3. Desktop only, after load + idle, and not with reduced motion: the separated parallax planes
//      (sky / town / near; WebP only - without WebP the composite simply stays). When all have
//      decoded they replace the composite.
// Every layer sits inside one "cover box" that has the art's aspect ratio and covers the viewport,
// so overlays (lantern glows, window flicker, fireflies) are positioned in art percentages and stay
// aligned at any window size. Parallax only translates whole groups by a few pixels (CSSOM
// transforms, CSP-safe); with reduced motion (OS setting or the ct.reducedMotion pref) nothing moves.

const L = '/landing/';

type Src = { avif?: string; webp: string; fallback: string };
const DESKTOP = { avif: `${L}hero-d.avif`, webp: `${L}hero-d.webp`, fallback: `${L}hero-d.jpg` };
const MOBILE = { avif: `${L}hero-m.avif`, webp: `${L}hero-m.webp`, fallback: `${L}hero-m.jpg` };
const PLANES: { id: 'sky' | 'town' | 'near'; depth: number; src: Src }[] = [
  { id: 'sky', depth: 0.25, src: { avif: `${L}plane-sky.avif`, webp: `${L}plane-sky.webp`, fallback: `${L}plane-sky.jpg` } },
  { id: 'town', depth: 0.55, src: { webp: `${L}plane-town.webp`, fallback: `${L}plane-town.webp` } },
  { id: 'near', depth: 1.4, src: { webp: `${L}plane-near.webp`, fallback: `${L}plane-near.webp` } },
];
/** Max shift in CSS px for depth 1 (pointer at the viewport edge). */
const RANGE = 14;
const PHONE_MEDIA = '(max-aspect-ratio: 4/5)';

function Pic({ src, phone, onLoad, class: cls }: { src: Src; phone?: Src; onLoad?: () => void; class?: string }) {
  return (
    <picture>
      {phone?.avif && <source media={PHONE_MEDIA} type="image/avif" srcset={phone.avif} />}
      {phone && <source media={PHONE_MEDIA} type="image/webp" srcset={phone.webp} />}
      {phone && <source media={PHONE_MEDIA} srcset={phone.fallback} />}
      {src.avif && <source type="image/avif" srcset={src.avif} />}
      <source type="image/webp" srcset={src.webp} />
      <img class={cls} src={src.fallback} alt="" decoding="async" draggable={false} onLoad={onLoad} />
    </picture>
  );
}

export function Hero() {
  const root = useRef<HTMLDivElement>(null);
  const [baseReady, setBaseReady] = useState(false);
  const [loadPlanes, setLoadPlanes] = useState(false);
  const [planesReady, setPlanesReady] = useState(0);
  const allPlanes = planesReady >= PLANES.length;

  // Decide whether to fetch the parallax planes (desktop-shaped viewport with a mouse, motion allowed).
  useEffect(() => {
    if (reducedMotion()) return;
    let cancelled = false;
    const wide = window.matchMedia?.(`not all and ${PHONE_MEDIA}`).matches ?? true;
    const fine = window.matchMedia?.('(pointer: fine)').matches ?? false;
    if (!wide || !fine) return;
    const go = () => !cancelled && setLoadPlanes(true);
    const idle = () => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 600));
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', idle);
    };
  }, []);

  // Parallax: pointer (desktop) + scroll of the landing column; eased in rAF, idle when settled.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let tx = 0, ty = 0, x = 0, y = 0, scroll = 0, raf = 0;
    const host = el.closest('.ct-landing') ?? el;
    let still = reducedMotion();
    host.classList.toggle('is-still', still);
    const groups = () => Array.from(el.querySelectorAll<HTMLElement>('[data-depth]'));
    const apply = () => {
      raf = 0;
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      for (const g of groups()) {
        const d = Number(g.dataset.depth) || 0;
        g.style.transform = still ? '' : `translate3d(${(-x * d * RANGE).toFixed(2)}px, ${(-y * d * RANGE * 0.6 - scroll * d * 0.08).toFixed(2)}px, 0)`;
      }
      if (!still && (Math.abs(tx - x) > 0.002 || Math.abs(ty - y) > 0.002)) raf = requestAnimationFrame(apply);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      still = reducedMotion();
      host.classList.toggle('is-still', still);
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      kick();
    };
    const scroller = el.parentElement?.querySelector<HTMLElement>('.ct-landing-scroll');
    const onScroll = () => {
      scroll = scroller?.scrollTop ?? 0;
      kick();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      scroller?.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={root} class={`ct-hero${baseReady ? ' base-ready' : ''}${allPlanes ? ' planes-ready' : ''}`} aria-hidden="true">
      <div class="ct-hero-placeholder" />
      <div class="ct-hero-box">
        <div class="ct-hero-group ct-hero-base" data-depth="0.5">
          <Pic src={DESKTOP} phone={MOBILE} onLoad={() => setBaseReady(true)} />
        </div>
        {loadPlanes &&
          PLANES.map((p) => (
            <div key={p.id} class={`ct-hero-group ct-hero-plane ct-plane-${p.id}`} data-depth={p.depth}>
              <Pic src={p.src} onLoad={() => setPlanesReady((n) => n + 1)} />
            </div>
          ))}
        {/* Life: steady-ish lamp glows, a window that lights up, drifting fog and fireflies. */}
        <div class="ct-hero-group ct-hero-life" data-depth="0.6">
          <i class="ct-glow ct-glow-1" />
          <i class="ct-glow ct-glow-2" />
          <i class="ct-glow ct-glow-3" />
          <i class="ct-glow ct-glow-4" />
          <i class="ct-clockglow" />
        </div>
        <div class="ct-hero-group ct-hero-fog" data-depth="0.8">
          <i class="ct-fog ct-fog-1" />
          <i class="ct-fog ct-fog-2" />
        </div>
        <div class="ct-hero-group ct-hero-flies" data-depth="1.1">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} class={`ct-fly ct-fly-${i + 1}`} />
          ))}
        </div>
      </div>
      <div class="ct-hero-vignette" />
    </div>
  );
}
