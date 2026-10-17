/** Story settings shared by this area's screen stories (not components). */

/** 768px wide, the narrow width every screen is reviewed at (ui-overhaul-ia §5). */
export const NARROW = {
  parameters: {
    viewport: {
      options: {
        narrow768: {
          name: "768px",
          styles: { width: "768px", height: "1024px" },
          type: "tablet" as const,
        },
      },
    },
  },
  globals: { viewport: { value: "narrow768", isRotated: false } },
};
