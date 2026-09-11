"""Canonical content contract shared by proxies, SDKs and policy replay."""
import json
import math


def normalize_context(value):
    if not isinstance(value, dict):
        raise ValueError('Evaluation context must be an object')
    context = dict(value)
    if type(context.get("schema_version", 1)) is not int or context.get("schema_version", 1) != 1:
        raise ValueError("Unsupported evaluation context schema_version")
    for canonical, aliases in {
        'input_text': ('extracted_text', 'input'),
        'output_text': ('output',),
    }.items():
        if canonical not in context:
            for alias in aliases:
                if isinstance(context.get(alias), str):
                    context[canonical] = context[alias]
                    break

    body = context.get('request_body', context.get('_body_bytes'))
    if body:
        if isinstance(body, (str, bytes)):
            body = json.loads(body)
        if not isinstance(body, dict):
            raise ValueError('Model request must be a JSON object')
        # Scan the whole request, including tool results and retrieved content.
        # Do not truncate inspection to the preview stored in the UI.
        context['request_body'] = json.dumps(body, ensure_ascii=False, sort_keys=True)
        context['input_text'] = context['request_body']
        context['input_tokens'] = max(
            int(context.get('input_tokens') or 0),
            math.ceil(len(context['input_text']) / 4),
        )
        context['max_output_tokens'] = body.get(
            'max_output_tokens', body.get('max_completion_tokens', body.get('max_tokens'))
        )
        from zentinelle.services.multimodal_scanner import analyze_request_body
        media = analyze_request_body(body, context.get('provider', ''))
        if media.has_media:
            context['has_multimodal'] = True
            context['multimodal'] = media.media_summary
        if body.get('safetySettings', body.get('safety_settings')):
            context['safety_settings'] = body.get('safetySettings', body.get('safety_settings'))

    if 'output_text' in context and isinstance(context['output_text'], str):
        context['output_text'] = normalize_output_text(context['output_text'])

    for key in ('input_text', 'output_text'):
        if key in context and not isinstance(context[key], str):
            raise ValueError(f'{key} must be text')
    for key in ('tool_outputs', 'rag_context'):
        if key in context:
            items = context[key]
            if isinstance(items, str):
                context[key] = [items]
            elif not isinstance(items, list) or any(not isinstance(item, str) for item in items):
                raise ValueError(f'{key} must be text or a list of texts')
    return context


def normalize_output_text(text):
    """Decode JSON and SSE escapes before inspecting provider response content."""
    def strings(value):
        if isinstance(value, str):
            return [value]
        if isinstance(value, dict):
            return [text for item in value.values() for text in strings(item)]
        if isinstance(value, list):
            return [text for item in value for text in strings(item)]
        return []
    try:
        parsed = json.loads(text)
        return '\n'.join(strings(parsed))
    except (ValueError, TypeError):
        pass
    if text.lstrip().startswith(('data:', 'event:')):
        def fragments(value):
            if isinstance(value, dict):
                return [part for key, item in value.items()
                        for part in (strings(item) if key in ('content', 'text', 'arguments', 'partial_json', 'output_text')
                                     else fragments(item))]
            if isinstance(value, list):
                return [part for item in value for part in fragments(item)]
            return []
        decoded = []
        for line in text.splitlines():
            if line.startswith('data:'):
                try:
                    payload = json.loads(line[5:].strip())
                    decoded.extend(fragments(payload) or strings(payload))
                except ValueError:
                    decoded.append(line)
        # Concatenate fragments so a sensitive value split across deltas is scanned.
        return ''.join(decoded) if decoded else text
    return text
