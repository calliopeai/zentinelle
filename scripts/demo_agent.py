#!/usr/bin/env python3
"""
Real agent demo — registers, sends events, evaluates policies, heartbeats.

Run this against a live Zentinelle deployment to see:
  - An agent appear in /agents
  - Live events streaming to /events
  - Policy evaluations in /audit-logs
  - Heartbeats keeping the agent "healthy"

Usage:
  ZENTINELLE_URL=http://localhost:8080 \\
  ZENTINELLE_BOOTSTRAP_TOKEN=bt_00000000-...-... \\
  python scripts/demo_agent.py

Watch the portal at http://localhost:8080/agents while it runs.
"""
import os
import random
import sys
import time
from pathlib import Path

# Add SDK to path (for local development without `pip install zentinelle`)
SDK_PATH = Path(__file__).parent.parent.parent / "zentinelle-sdk.git" / "python"
if SDK_PATH.exists():
    sys.path.insert(0, str(SDK_PATH))

try:
    from zentinelle import ZentinelleClient
except ImportError:
    print("ERROR: zentinelle SDK not found.", file=sys.stderr)
    print(f"Tried: {SDK_PATH}", file=sys.stderr)
    print("Install: pip install -e ../zentinelle-sdk.git/python", file=sys.stderr)
    sys.exit(1)


def main():
    endpoint = os.environ.get("ZENTINELLE_URL", "http://localhost:8080")
    bootstrap = os.environ.get("ZENTINELLE_BOOTSTRAP_TOKEN")

    if not bootstrap:
        print("ERROR: Set ZENTINELLE_BOOTSTRAP_TOKEN", file=sys.stderr)
        print(
            "Generate one: docker compose exec backend python manage.py "
            "bootstrap_token generate 00000000-0000-0000-0000-000000000001 "
            "--label 'demo-runner'",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Connecting to {endpoint}")
    print()

    # Register the agent
    client = ZentinelleClient(
        api_key=bootstrap,
        agent_type="custom",
        endpoint=endpoint,
        agent_id=f"demo-runner-{int(time.time())}",
    )
    result = client.register(
        name="Demo Runner",
        capabilities=["chat", "tools", "policy_evaluation"],
    )
    print(f"  registered: {client.agent_id}")
    if getattr(result, "api_key", None):
        print(f"  agent api key: {result.api_key[:16]}... (would be saved in production)")
    print()

    # Run a loop of realistic events
    actions = [
        ("tool_call", "web_search", {"query": "AI governance frameworks 2026"}),
        ("model_request", "claude-sonnet-4-5", {"input_tokens": 1200, "output_tokens": 850}),
        ("tool_call", "Read", {"file": "/etc/policies.json"}),
        ("model_request", "gpt-4o", {"input_tokens": 600, "output_tokens": 400}),
        ("tool_call", "Bash", {"command": "ls /tmp"}),
        ("model_request", "claude-opus-4-7", {"input_tokens": 5000, "output_tokens": 2000}),
    ]

    print("Sending events and policy evaluations...")
    print("Open http://localhost:8080/events to watch the live stream")
    print()

    for i in range(20):
        action_type, name, context = random.choice(actions)

        # 1. Evaluate policy
        try:
            decision = client.evaluate(
                action_type,
                context={"tool": name, **context},
                user_id="demo-user-1",
            )
            allowed = "allowed" if decision.allowed else "BLOCKED"
            print(f"  [{i+1:2}] {action_type}/{name}: {allowed}")
            if not decision.allowed:
                print(f"       reason: {decision.reason}")
        except Exception as e:
            print(f"  [{i+1:2}] evaluate failed: {e}")

        # 2. Track usage (if model_request)
        if action_type == "model_request" and "input_tokens" in context:
            client.emit_model_request(
                model=name,
                input_tokens=context["input_tokens"],
                output_tokens=context["output_tokens"],
                provider="anthropic" if "claude" in name else "openai",
            )

        # 3. Heartbeat occasionally
        if i % 5 == 0:
            client.heartbeat(status="healthy", metrics={"uptime_s": i * 2})

        time.sleep(2)

    # Flush remaining events
    client.flush_events()
    client.heartbeat(status="healthy", metrics={"completed": True})

    print()
    print("Done. Check the portal:")
    print("  - /agents — your agent should appear")
    print("  - /events — see all 20 evaluations + heartbeats")
    print("  - /audit-logs — see the policy decisions")
    print("  - /monitoring — see token usage charts")

    client.shutdown()


if __name__ == "__main__":
    main()
