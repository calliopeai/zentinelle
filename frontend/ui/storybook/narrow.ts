/**
 * The 768px story every screen carries (ui/README.md): a viewport of its
 * own, since Storybook's defaults jump from 414px to 834px. Spread into a
 * story: `{ ...NARROW, render: … }`.
 */
export const NARROW = {
  parameters: {
    viewport: {
      options: {
        w768: {
          name: "768px",
          styles: { width: "768px", height: "1024px" },
          type: "tablet",
        },
      },
    },
  },
  globals: { viewport: { value: "w768", isRotated: false } },
} as const;
