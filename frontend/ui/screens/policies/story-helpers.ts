/** Shared by this area's stories: the 768px viewport and the callbacks a story does not act on. */
import { fn } from "storybook/test";

/** A tablet-width viewport, as the README's "768px wide" state asks. */
export const NARROW = {
  parameters: {
    viewport: {
      options: {
        narrow: {
          name: "768px",
          styles: { width: "768px", height: "1024px" },
          type: "tablet",
        },
      },
    },
  },
  globals: { viewport: { value: "narrow", isRotated: false } },
} as const;

/** A callback that resolves, as a mutation that succeeded. */
export const resolved = () => fn(async () => true);
