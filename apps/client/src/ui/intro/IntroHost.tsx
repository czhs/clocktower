import { useEffect, useState } from 'preact/hooks';
import { IntroTour, type IntroCloseReason } from './IntroTour';
import { INTRO_EVENT, markIntroSeen, openIntro, shouldAutoShowIntro } from './state';

/** Drop-in: first-visit auto-show + openIntro() + "seen" bookkeeping. Mount once per screen. */
export function IntroHost({ invited = false, onAction }: { invited?: boolean; onAction?: (reason: IntroCloseReason) => void }) {
  const [open, setOpen] = useState(() => shouldAutoShowIntro());
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(INTRO_EVENT, on);
    return () => window.removeEventListener(INTRO_EVENT, on);
  }, []);
  return (
    <IntroTour
      open={open}
      invited={invited}
      onClose={(r) => {
        markIntroSeen();
        setOpen(false);
        onAction?.(r);
      }}
    />
  );
}

/** The unobtrusive way back in after the first visit. */
export function WatchTourLink({ label = 'Watch the tour' }: { label?: string }) {
  return (
    <span class="ct-intro-link">
      <span class="muted">What is this?</span>{' '}
      <button type="button" class="ct-link" onClick={openIntro}>
        ▶ {label}
      </button>
    </span>
  );
}
