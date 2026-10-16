"""Published model prices, USD per 1M tokens, Standard (pay-as-you-go) tier.

This is the shipped price catalog. Migration 0066 seeds it into the model
registry (AIModel), which is authoritative from then on: an operator's price in
the registry always wins, and this table only prices a model the registry has
no price for. Keys are exact provider model IDs; a model that is not listed is
unpriced, never matched to a similar name.

Read from the providers' pricing pages on 2026-10-16:
"""

SOURCES = {
    'anthropic': 'https://platform.claude.com/docs/en/about-claude/pricing',
    'openai': 'https://developers.openai.com/api/docs/pricing',
    'google': 'https://ai.google.dev/gemini-api/docs/pricing',
}
AS_OF = '2026-10-16'

# A dated catalog is never edited once a migration has seeded it; a price
# change ships as a new dated catalog and a new migration.
#
# Each entry: (model_id, provider, name, input, output, extra). `extra` may hold
#   long_context: a request whose input is above `above_input_tokens` is priced
#                 at `input`/`output` for the whole request, as the pages state.
#   schedule:     a published future price, in effect from `from` (UTC date).
#   alias_of:     a snapshot ID the provider prices as the named model.
CATALOG_2026_10_16 = (
    # Anthropic. Claude 4.6 and later have a 1M window at standard prices;
    # Claude Haiku 5.5 is priced by prompt length above 100,000 tokens.
    ('claude-fable-5-1', 'anthropic', 'Claude Fable 5.1', '10', '50', {}),
    ('claude-fable-5', 'anthropic', 'Claude Fable 5', '10', '50', {}),
    ('claude-opus-5-5', 'anthropic', 'Claude Opus 5.5', '4', '20', {}),
    ('claude-opus-5', 'anthropic', 'Claude Opus 5', '5', '25', {}),
    ('claude-opus-4-8', 'anthropic', 'Claude Opus 4.8', '5', '25', {}),
    ('claude-opus-4-7', 'anthropic', 'Claude Opus 4.7', '5', '25', {}),
    ('claude-opus-4-6', 'anthropic', 'Claude Opus 4.6', '5', '25', {}),
    ('claude-opus-4-5-20251101', 'anthropic', 'Claude Opus 4.5', '5', '25', {}),
    ('claude-opus-4-5', 'anthropic', 'Claude Opus 4.5', '5', '25', {'alias_of': 'claude-opus-4-5-20251101'}),
    ('claude-opus-4-1-20250805', 'anthropic', 'Claude Opus 4.1', '15', '75', {}),
    ('claude-opus-4-1', 'anthropic', 'Claude Opus 4.1', '15', '75', {'alias_of': 'claude-opus-4-1-20250805'}),
    ('claude-opus-4-20250514', 'anthropic', 'Claude Opus 4', '15', '75', {}),
    ('claude-opus-4-0', 'anthropic', 'Claude Opus 4', '15', '75', {'alias_of': 'claude-opus-4-20250514'}),
    ('claude-sonnet-5-5', 'anthropic', 'Claude Sonnet 5.5', '2', '10', {}),
    ('claude-sonnet-5', 'anthropic', 'Claude Sonnet 5', '2', '10', {}),
    ('claude-sonnet-4-6', 'anthropic', 'Claude Sonnet 4.6', '3', '15', {}),
    ('claude-sonnet-4-5-20250929', 'anthropic', 'Claude Sonnet 4.5', '3', '15', {}),
    ('claude-sonnet-4-5', 'anthropic', 'Claude Sonnet 4.5', '3', '15', {'alias_of': 'claude-sonnet-4-5-20250929'}),
    ('claude-sonnet-4-20250514', 'anthropic', 'Claude Sonnet 4', '3', '15', {}),
    ('claude-sonnet-4-0', 'anthropic', 'Claude Sonnet 4', '3', '15', {'alias_of': 'claude-sonnet-4-20250514'}),
    ('claude-haiku-5-5', 'anthropic', 'Claude Haiku 5.5', '0.10', '0.50', {
        'long_context': {'above_input_tokens': 100000, 'input': '0.50', 'output': '2.50'}}),
    ('claude-haiku-4-5-20251001', 'anthropic', 'Claude Haiku 4.5', '1', '5', {}),
    ('claude-haiku-4-5', 'anthropic', 'Claude Haiku 4.5', '1', '5', {'alias_of': 'claude-haiku-4-5-20251001'}),
    ('claude-3-5-haiku-20241022', 'anthropic', 'Claude Haiku 3.5', '0.80', '4', {}),

    # OpenAI. Long context is above 272K input tokens where the page lists it.
    ('gpt-6-astra', 'openai', 'GPT-6 Astra', '10', '50', {
        'long_context': {'above_input_tokens': 272000, 'input': '20', 'output': '75'}}),
    ('gpt-6.1-sol', 'openai', 'GPT-6.1 Sol', '2', '10', {
        'long_context': {'above_input_tokens': 272000, 'input': '4', 'output': '15'}}),
    ('gpt-6-sol', 'openai', 'GPT-6 Sol', '2', '10', {
        'long_context': {'above_input_tokens': 272000, 'input': '4', 'output': '15'}}),
    ('gpt-6-luna', 'openai', 'GPT-6 Luna', '0.10', '0.50', {
        'long_context': {'above_input_tokens': 272000, 'input': '0.20', 'output': '0.75'}}),
    ('gpt-5.6-sol', 'openai', 'GPT-5.6 Sol', '4', '20', {
        'long_context': {'above_input_tokens': 272000, 'input': '8', 'output': '30'}}),
    ('gpt-5.6-terra', 'openai', 'GPT-5.6 Terra', '2', '12', {
        'long_context': {'above_input_tokens': 272000, 'input': '4', 'output': '18'}}),
    ('gpt-5.6-luna', 'openai', 'GPT-5.6 Luna', '0.20', '1.20', {
        'long_context': {'above_input_tokens': 272000, 'input': '0.40', 'output': '1.80'}}),
    ('gpt-5.5', 'openai', 'GPT-5.5', '5', '30', {
        'long_context': {'above_input_tokens': 272000, 'input': '10', 'output': '45'}}),
    ('gpt-5.5-pro', 'openai', 'GPT-5.5 Pro', '30', '180', {
        'long_context': {'above_input_tokens': 272000, 'input': '60', 'output': '270'}}),
    ('gpt-5.4', 'openai', 'GPT-5.4', '2.50', '15', {
        'long_context': {'above_input_tokens': 272000, 'input': '5', 'output': '22.50'}}),
    ('gpt-5.4-mini', 'openai', 'GPT-5.4 mini', '0.75', '4.50', {}),
    ('gpt-5.4-nano', 'openai', 'GPT-5.4 nano', '0.20', '1.25', {}),
    ('gpt-5.4-pro', 'openai', 'GPT-5.4 Pro', '30', '180', {
        'long_context': {'above_input_tokens': 272000, 'input': '60', 'output': '270'}}),
    ('gpt-5.2', 'openai', 'GPT-5.2', '1.75', '14', {}),
    ('gpt-5.2-pro', 'openai', 'GPT-5.2 Pro', '21', '168', {}),
    ('gpt-5.1', 'openai', 'GPT-5.1', '1.25', '10', {}),
    ('gpt-5', 'openai', 'GPT-5', '1.25', '10', {}),
    ('gpt-5-2025-08-07', 'openai', 'GPT-5', '1.25', '10', {'alias_of': 'gpt-5'}),
    ('gpt-5-mini', 'openai', 'GPT-5 mini', '0.25', '2', {}),
    ('gpt-5-mini-2025-08-07', 'openai', 'GPT-5 mini', '0.25', '2', {'alias_of': 'gpt-5-mini'}),
    ('gpt-5-nano', 'openai', 'GPT-5 nano', '0.05', '0.40', {}),
    ('gpt-5-nano-2025-08-07', 'openai', 'GPT-5 nano', '0.05', '0.40', {'alias_of': 'gpt-5-nano'}),
    ('gpt-5-pro', 'openai', 'GPT-5 Pro', '15', '120', {}),
    ('gpt-4.1', 'openai', 'GPT-4.1', '2', '8', {}),
    ('gpt-4.1-2025-04-14', 'openai', 'GPT-4.1', '2', '8', {'alias_of': 'gpt-4.1'}),
    ('gpt-4.1-mini', 'openai', 'GPT-4.1 mini', '0.40', '1.60', {}),
    ('gpt-4.1-mini-2025-04-14', 'openai', 'GPT-4.1 mini', '0.40', '1.60', {'alias_of': 'gpt-4.1-mini'}),
    ('gpt-4.1-nano', 'openai', 'GPT-4.1 nano', '0.10', '0.40', {}),
    ('gpt-4.1-nano-2025-04-14', 'openai', 'GPT-4.1 nano', '0.10', '0.40', {'alias_of': 'gpt-4.1-nano'}),
    ('gpt-4o', 'openai', 'GPT-4o', '2.50', '10', {}),
    ('gpt-4o-2024-11-20', 'openai', 'GPT-4o', '2.50', '10', {'alias_of': 'gpt-4o'}),
    ('gpt-4o-2024-08-06', 'openai', 'GPT-4o', '2.50', '10', {'alias_of': 'gpt-4o'}),
    ('gpt-4o-2024-05-13', 'openai', 'GPT-4o (2024-05-13)', '5', '15', {}),
    ('gpt-4o-mini', 'openai', 'GPT-4o mini', '0.15', '0.60', {}),
    ('gpt-4o-mini-2024-07-18', 'openai', 'GPT-4o mini', '0.15', '0.60', {'alias_of': 'gpt-4o-mini'}),
    ('o1', 'openai', 'o1', '15', '60', {}),
    ('o1-pro', 'openai', 'o1-pro', '150', '600', {}),
    ('o3-pro', 'openai', 'o3-pro', '20', '80', {}),
    ('o3', 'openai', 'o3', '2', '8', {}),
    ('o3-2025-04-16', 'openai', 'o3', '2', '8', {'alias_of': 'o3'}),
    ('o4-mini', 'openai', 'o4-mini', '1.10', '4.40', {}),
    ('o4-mini-2025-04-16', 'openai', 'o4-mini', '1.10', '4.40', {'alias_of': 'o4-mini'}),
    ('o3-mini', 'openai', 'o3-mini', '1.10', '4.40', {}),
    ('gpt-4-turbo-2024-04-09', 'openai', 'GPT-4 Turbo', '10', '30', {}),
    ('gpt-4-turbo', 'openai', 'GPT-4 Turbo', '10', '30', {'alias_of': 'gpt-4-turbo-2024-04-09'}),
    ('gpt-4-0613', 'openai', 'GPT-4', '30', '60', {}),
    ('gpt-4', 'openai', 'GPT-4', '30', '60', {'alias_of': 'gpt-4-0613'}),
    ('gpt-3.5-turbo', 'openai', 'GPT-3.5 Turbo', '0.50', '1.50', {}),

    # Google Gemini API, paid tier, text input. Pro models are priced by prompt
    # length above 200K tokens.
    ('gemini-4-argon', 'google', 'Gemini 4 Argon', '2', '10', {
        'schedule': [{'from': '2026-12-01', 'input': '4', 'output': '20'}]}),
    ('gemini-3.8-flash', 'google', 'Gemini 3.8 Flash', '0.75', '3.75', {
        'schedule': [{'from': '2027-01-01', 'input': '1.50', 'output': '7.50'}]}),
    ('gemini-3.6-flash', 'google', 'Gemini 3.6 Flash', '0.75', '3.75', {
        'schedule': [{'from': '2027-01-01', 'input': '1.50', 'output': '7.50'}]}),
    ('gemini-3.5-flash-lite', 'google', 'Gemini 3.5 Flash-Lite', '0.30', '2.50', {}),
    ('gemini-3.1-flash-lite', 'google', 'Gemini 3.1 Flash-Lite', '0.25', '1.50', {}),
    ('gemini-3.1-pro-preview', 'google', 'Gemini 3.1 Pro Preview', '2', '12', {
        'long_context': {'above_input_tokens': 200000, 'input': '4', 'output': '18'}}),
    ('gemini-3-flash-preview', 'google', 'Gemini 3 Flash Preview', '0.50', '3', {}),
    ('gemini-2.5-pro', 'google', 'Gemini 2.5 Pro', '1.25', '10', {
        'long_context': {'above_input_tokens': 200000, 'input': '2.50', 'output': '15'}}),
    ('gemini-2.5-flash', 'google', 'Gemini 2.5 Flash', '0.30', '2.50', {}),
    ('gemini-2.5-flash-lite', 'google', 'Gemini 2.5 Flash-Lite', '0.10', '0.40', {}),
)

CATALOG = CATALOG_2026_10_16
