// Public API of the pre-sign-in tour (tutorial teammate). Mounted by the landing/auth screen:
//
//   <IntroHost invited={invited} onAction={(r) => r === 'join' && goCreateAccount()} />
//   <WatchTourLink />            // "What is this? ▶ Watch the tour" (or call openIntro())
//
// IntroHost auto-opens the tour on the first visit (localStorage 'ct.intro.seen.v1'), reopens it on
// openIntro(), and marks it seen on close. IntroTour is the bare modal for custom mounting.
export { IntroTour, type IntroTourProps, type IntroCloseReason } from './IntroTour';
export { shouldAutoShowIntro, markIntroSeen, openIntro, INTRO_EVENT } from './state';
export { IntroHost, WatchTourLink } from './IntroHost';
