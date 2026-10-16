# ui/: the new Zentinelle AI console

The overhaul of zentinelle#446, on the approved information architecture in
`docs/design/ui-overhaul-ia.md` (seven areas) and the shared package
`@calliopelabs/ui` (catalog: https://calliopeai.github.io/calliope-ui/).
Nothing under `app/` uses this folder yet: every component and every screen
is built and reviewed in Storybook first, then assembled into its route.

```
ui/
  product.ts            the product: zentinelleBrand + the seven-area nav, gated by capability
  shell/                ZentinelleShell (sidebar, assistant dock, user menu) and its dialogs
  screens/              whole screens, one folder per area as they land; Shell.stories.tsx shows every area empty
  storybook/            catalog helpers, not components: router, GraphQL mocks, fixtures, ShellStory
  test/                 the gates: story coverage, and every story rendered with the a11y checks
```

## Gates

- `npm test` runs two Vitest projects: `app` (node) and `ui` (jsdom). The `ui`
  project renders every story through `.storybook/preview.tsx`, runs its play
  function, and fails on any WCAG A or AA violation the a11y addon finds.
- Every `.tsx` under `ui/` that exports a component has a sibling
  `.stories.tsx` (`ui/test/story-coverage.test.ts`, no allowlist).
  `ui/storybook/` is exempt.
- `npm run storybook` serves the catalog on port 6006;
  `npm run build-storybook` builds it.

## Adding a screen

1. **The screen is pure.** `ui/screens/<area>/<Name>Screen.tsx` takes props and
   calls callbacks; it never calls a hook that fetches. The route under `app/`
   will fetch, map the result to the props, and render the screen.
2. **Fixtures come from the real operation.** In
   `ui/storybook/fixtures/<area>.ts`, import the document the app already
   sends (from `graphql/<area>/queries.ts`) and its result type, write the
   data the operation returns (only the fields it selects), and export mocks:
   `mockQuery(DOC, data)`, `mockLoading(DOC)`, `mockError(DOC)`. Never write a
   new `gql` literal here: `graphql/operations.test.ts` validates only what the
   app sends.
3. **The story** sits beside the screen, in every state: loading, empty, empty
   after filtering, error, full, long strings, and 768px wide. Render it in the
   shell when the frame matters:

   ```tsx
   export const Full: Story = {
     render: () => (
       <ShellStory path="/agents" role="operator">
         <AgentsScreen agents={toAgentRows(endpoints)} />
       </ShellStory>
     ),
   };
   ```

   A connected story (a container that calls the app's hook) lists its mocks
   instead, and the preview wraps it in Apollo's MockedProvider:
   `parameters: { graphql: { mocks: agentsMocks.full } }`.

4. **Pages stay short:** about two screens. More becomes a tab, a section that
   loads when opened, or a drawer. Lists page and sort on the server.

Copy: no em-dashes; "Zentinelle AI" and "Calliope AI", never bare "Calliope".
