# Models & usage

The screens of the Models & usage area (ui-overhaul-ia §4.1, step 6), built
and reviewed in Storybook before any route uses them. Every screen is pure:
the route fetches, maps with the functions here, and renders.

| Screen                                                                   | Route (former route)                                     | Reads                                                                                             | Map with                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `UsageOverviewScreen`                                                    | `/usage` (`/monitoring`)                                 | `GetUsageMetrics`                                                                                 | `toUsageOverview`, `periodRange`   |
| `BudgetsScreen`                                                          | `/usage/budgets` (`/budgets/showback`)                   | REST `budgets/showback?group_by=`                                                                 | `ShowbackReport` as returned       |
| `AnomaliesScreen`                                                        | `/usage/anomalies` (`/observability/anomalies`)          | `GetUsageMetrics`, last 30 days                                                                   | `detectAnomalies`, `tokenBaseline` |
| `ModelsScreen` + `EstimateCostDrawer`                                    | `/models`, `?panel=estimate` (`/tools/token-calculator`) | `AiModels` (`availableOnly`, `search`, `providerSlug`)                                            | `providerOptions`                  |
| `CompareModelsScreen`                                                    | `/models/compare?ids=`                                   | `AiModels`                                                                                        |                                    |
| `RouteCheckScreen` (admin)                                               | `/models/routes` (`/models/route-canary`)                | REST `models/route-canary`, `.../{id}/rollback`                                                   |                                    |
| `ProvidersScreen` + `ProviderKeyDialog` + `ProviderModelsDialog` (admin) | `/models/providers` (`/settings/llm-providers`)          | REST `assistant/providers`, `settings/llm-providers`, `assistant/models`, `assistant/models/bulk` | `toProviderRows`                   |

Fixtures and GraphQL mocks are in `ui/storybook/fixtures/models.ts`; the
`Connected*` stories render the app's own hooks against them, and
`area.test.tsx` checks the mappers and that wiring.
