import { screen, userEvent } from "storybook/test";

/**
 * Picks an option in a @calliopelabs/ui Select from a play function: opens
 * the named trigger and clicks the option, which Radix renders in a portal
 * on document.body, outside the story's canvas.
 */
export async function chooseOption(
  trigger: HTMLElement,
  option: string | RegExp,
) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("option", { name: option }));
}
