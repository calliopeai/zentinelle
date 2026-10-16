/**
 * The 768px story every screen has (ui/README.md): the preview frame
 * resized to a tablet's width, so the shell's breakpoints apply as they
 * would in a browser. Spread it into a story: `{ ...narrow }`.
 */
export const narrow = {
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
