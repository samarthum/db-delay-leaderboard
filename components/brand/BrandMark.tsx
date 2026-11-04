/**
 * The site's mark: a train seen from the front (windscreen, two headlights) on a rail. Drawn in the current text
 * colour, so it follows the ink. Decorative: the brand link next to it already says "Zugmonitor".
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
      <circle cx="11.4" cy="19.6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="20.6" cy="19.6" r="1.5" fill="currentColor" stroke="none" />
      <path d="M11 24.5L10 27.2M21 24.5L22 27.2M4.5 27.5H27.5" />
    </svg>
  );
}
