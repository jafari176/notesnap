/**
 * Finds the YouTube <video> element and seeks it. Used by TimestampChip
 * (M3) to jump to a note's source moment. Kept separate from mount.ts so it
 * has no React dependency and can be unit-tested/reused independently.
 */
export function seekVideoTo(seconds: number): boolean {
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
  if (!video) return false;
  video.currentTime = seconds;
  if (video.paused) video.play().catch(() => {});
  scrollPlayerIntoView();
  return true;
}

function scrollPlayerIntoView(): void {
  const player = document.querySelector('#movie_player');
  if (!player) return;
  const rect = player.getBoundingClientRect();
  const isInView = rect.top >= 0 && rect.bottom <= window.innerHeight;
  if (!isInView) {
    player.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
