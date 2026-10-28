import type { SVGProps } from "react";

const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

export const ArrowUp = () => (
  <svg {...base(20)}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
export const Sparkle = ({ size = 20 }: { size?: number }) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5z" />
    <path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" opacity=".6" />
  </svg>
);
export const Check = ({ size = 14 }: { size?: number }) => (
  <svg {...base(size)} strokeWidth={3}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const Trash = () => (
  <svg {...base(18)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
  </svg>
);
export const ChevronRight = () => (
  <svg {...base(18)}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const ChevronLeft = () => (
  <svg {...base(18)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const Inbox = () => (
  <svg {...base(34)} strokeWidth={1.6}>
    <path d="M4 13l2.5-7h11L20 13M4 13v5a2 2 0 002 2h12a2 2 0 002-2v-5M4 13h4.5l1 2h5l1-2H20" />
  </svg>
);
export const Google = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);
