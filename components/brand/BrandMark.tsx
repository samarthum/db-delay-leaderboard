/**
 * The site's mark: a flustered little train (worried brows, wobbly mouth, two sweat drops) on a rail. Drawn in the
 * current text colour, so it follows the ink. Decorative: the brand link next to it already says "German Punctuality".
 * Source of truth for the shape is `scripts/brand/mark.svg`; keep the two in step (scripts/brand-icons.mjs draws the
 * app icons from that file).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="2.6 2.8 27.2 25.4"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 22.5V12.5C7 7.8 10.8 4.5 16 4.5S25 7.8 25 12.5V22.5C25 23.6 24.1 24.5 23 24.5H9C7.9 24.5 7 23.6 7 22.5Z" />
      <path d="M9.6 9.4C11.4 8 13.6 7.4 16 7.4S20.6 8 22.4 9.4L22 11.8C20 12.3 18 12.5 16 12.5S12 12.3 10 11.8Z" />
      <path d="M10.9 15.2L13.7 14.3M21.1 15.2L18.3 14.3" strokeWidth="1.5" />
      <circle cx="12.6" cy="18.6" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="19.4" cy="18.6" r="1.25" fill="currentColor" stroke="none" />
      <path d="M13.3 21.9Q14.2 21 15.1 21.9T16.9 21.9T18.7 21.9" strokeWidth="1.5" />
      <circle cx="9.6" cy="22" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="22.4" cy="22" r="0.8" fill="currentColor" stroke="none" />
      <path d="M11 24.5L10 27.2M21 24.5L22 27.2M4.5 27.5H27.5" />
      <path d="M27.6 3.6C27.6 3.6 26.1 5.5 26.1 6.5A1.5 1.5 0 0 0 29.1 6.5C29.1 5.5 27.6 3.6 27.6 3.6Z" fill="currentColor" strokeWidth="0.8" />
      <path d="M4.4 6.6C4.4 6.6 3.3 8 3.3 8.7A1.1 1.1 0 0 0 5.5 8.7C5.5 8 4.4 6.6 4.4 6.6Z" fill="currentColor" strokeWidth="0.8" />
    </svg>
  );
}
