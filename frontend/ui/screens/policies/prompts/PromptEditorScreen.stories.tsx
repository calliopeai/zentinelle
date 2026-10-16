import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  analysis,
  longPrompt,
  promptDetail,
  prompts,
} from "../../../storybook/fixtures/prompts";
import { capabilitiesOf } from "../../../storybook/session";
import { ShellStory } from "../../../storybook/ShellStory";
import { NARROW, resolved } from "../story-helpers";
import {
  PromptEditorScreen,
  type PromptEditorScreenProps,
} from "./PromptEditorScreen";

function Story(
  props: Partial<PromptEditorScreenProps> & { role?: "viewer" | "operator" },
) {
  const { role = "operator", ...rest } = props;
  return (
    <ShellStory
      path={
        rest.mode === "edit"
          ? "/system-prompts/p-support"
          : "/system-prompts/new"
      }
      role={role}
      defaultAssistantHidden
    >
      <PromptEditorScreen
        capabilities={capabilitiesOf(role)}
        mode="blank"
        templates={prompts.filter((p) => p.isFeatured)}
        onPickTemplate={fn(async () => promptDetail)}
        onSave={resolved()}
        onAnalyze={fn(async () => analysis)}
        cancelHref="/system-prompts"
        {...rest}
      />
    </ShellStory>
  );
}

const meta = {
  title: "Policies/Screens/Prompt editor",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

export const Blank: S = {
  render: () => <Story />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Prompt text" }),
      "Hello {{{{name}}",
    );
    await expect(canvas.getByText("name")).toBeInTheDocument();
  },
};
export const Validation: S = {
  render: () => <Story />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Save to the library" }),
    );
    await expect(canvas.getByText("A name is required.")).toBeInTheDocument();
    await expect(
      canvas.getByText("The prompt has no text."),
    ).toBeInTheDocument();
  },
};
export const FromTemplate: S = {
  render: () => <Story mode="template" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByRole("combobox", { name: "Template" }),
      "p-support",
    );
    await expect(
      await canvas.findByDisplayValue("Support agent (copy)"),
    ).toBeInTheDocument();
  },
};
export const TemplatesLoading: S = {
  render: () => <Story mode="template" templates={[]} templatesLoading />,
};
export const NoTemplates: S = {
  render: () => <Story mode="template" templates={[]} />,
};
export const Guided: S = {
  render: () => <Story mode="guided" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Who the agent is" }),
      "the support assistant",
    );
    await expect(canvas.getByLabelText("Draft prompt")).toHaveTextContent(
      "You are the support assistant.",
    );
  },
};
export const Edit: S = {
  render: () => <Story mode="edit" prompt={promptDetail} />,
};
export const Analyzed: S = {
  render: () => <Story mode="edit" prompt={promptDetail} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Analyze" }));
    await expect(await canvas.findByText(/Score/)).toBeInTheDocument();
  },
};
export const SaveRefused: S = {
  render: () => (
    <Story
      mode="edit"
      prompt={promptDetail}
      onSave={fn(async () => {
        throw new globalThis.Error("You do not own this prompt.");
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "do not own",
    );
  },
};
export const Loading: S = {
  render: () => <Story mode="edit" prompt={null} loading />,
};
export const NotFound: S = {
  render: () => <Story mode="edit" prompt={null} />,
};
export const Error: S = {
  render: () => (
    <Story
      mode="edit"
      prompt={null}
      error={{ message: "Something went wrong on the server." }}
    />
  ),
};
/** A viewer reads the prompt; there is no form and no analysis, which is a mutation. */
export const Viewer: S = {
  render: () => <Story role="viewer" mode="edit" prompt={promptDetail} />,
};
export const ViewerNew: S = { render: () => <Story role="viewer" /> };
export const LongData: S = {
  render: () => (
    <Story
      mode="edit"
      prompt={{
        ...promptDetail,
        ...longPrompt,
        promptText:
          `${promptDetail.promptText}\n\n`.repeat(12) +
          longPrompt.templateVariables!.map((v) => `{{${v}}}`).join(" "),
      }}
    />
  ),
};
export const Narrow: S = {
  ...NARROW,
  render: () => <Story mode="edit" prompt={promptDetail} />,
};
