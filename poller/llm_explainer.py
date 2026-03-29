try:
    from .config import (
        LLM_PROVIDER,
        GROQ_API_KEY,
        GROQ_MODEL,
    )
except ImportError:
    from config import (
        LLM_PROVIDER,
        GROQ_API_KEY,
        GROQ_MODEL,
    )


def build_prompt(alert):
    """Format alert parameters into a clear LLM prompt."""
    return f"""
You are a wireless network security expert. Analyze the following alert detected by a wireless IDS and explain it clearly.

Alert Details:
- Type: {alert["type"]}
- Severity: {alert["severity"]}
- Description: {alert["text"]}
- Source MAC: {alert["source_mac"]}
- Destination MAC: {alert["dest_mac"]}
- Channel: {alert["channel"]}
- Timestamp: {alert["timestamp"]}

Please provide:
1. What this attack is (in simple terms)
2. How it works
3. What the attacker is trying to achieve
4. Severity level and potential impact
5. Recommended defensive action
""".strip()


def explain_with_groq(alert):
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is missing")

    from groq import Groq

    client = Groq(api_key=GROQ_API_KEY)
    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You are a wireless network security expert.",
            },
            {"role": "user", "content": build_prompt(alert)},
        ],
        max_tokens=600,
    )
    return (response.choices[0].message.content or "").strip()


def explain_alert(alert):
    """Explain a parsed alert using the configured LLM provider."""
    if LLM_PROVIDER == "groq":
        return explain_with_groq(alert)
    raise ValueError(f"Unknown LLM provider: {LLM_PROVIDER}")
