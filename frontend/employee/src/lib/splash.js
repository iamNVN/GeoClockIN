// The launch splash is plain HTML in index.html so it shows before the app's
// JavaScript loads. These helpers keep it up for a minimum time and then fade
// it out once the app knows whether the employee is signed in.

const MIN_VISIBLE_MS = 1200;
const FADE_MS = 400;

/** Resolves once the splash has been on screen for at least MIN_VISIBLE_MS. */
export function splashMinimumElapsed() {
  const shownAt = window.__splashShownAt ?? 0;
  const remaining = MIN_VISIBLE_MS - (performance.now() - shownAt);
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, remaining)));
}

/** Fades out and removes the launch splash. Safe to call more than once. */
export function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash || splash.classList.contains('is-hidden')) return;
  splash.classList.add('is-hidden');
  setTimeout(() => splash.remove(), FADE_MS);
}
