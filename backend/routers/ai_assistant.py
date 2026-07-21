"""
Local AI Assistant router.
Supports llama-server (OpenAI-compatible API) or Ollama.
Point LLM_BASE_URL at your running instance.
"""
import json
import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_jwt import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai-assistant"])

# ── Configuration ──────────────────────────────────────────────────────────────
# For llama-server (default): http://localhost:8080
# For Ollama: http://localhost:11434
LLM_BASE_URL = os.getenv("LLM_BASE_URL", os.getenv("OLLAMA_BASE_URL", "http://localhost:8080"))
LLM_MODEL = os.getenv("LLM_MODEL", os.getenv("OLLAMA_MODEL", "llama"))
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "120"))
LLM_TYPE = os.getenv("LLM_TYPE", "llama")  # "llama" for llama-server, "ollama" for Ollama


def _get_llm_headers() -> dict:
    """Get auth headers if LLM_API_KEY is set."""
    api_key = os.getenv("LLM_API_KEY", "")
    if api_key:
        return {"Authorization": f"Bearer {api_key}"}
    return {}


async def _call_llm(messages: list, temperature: float = 0.3, max_tokens: int = 2000) -> str:
    """Call the LLM via llama-server or Ollama API."""
    import httpx

    headers = {"Content-Type": "application/json", **_get_llm_headers()}

    if LLM_TYPE == "ollama":
        # Ollama API format
        url = f"{LLM_BASE_URL}/api/chat"
        payload = {
            "model": LLM_MODEL,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                raise HTTPException(502, f"LLM error: {resp.status_code} {resp.text[:200]}")
            data = resp.json()
            return data.get("message", {}).get("content", "")
    else:
        # llama-server / OpenAI-compatible API format (default)
        url = f"{LLM_BASE_URL}/v1/chat/completions"
        payload = {
            "model": LLM_MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code != 200:
                raise HTTPException(502, f"LLM error: {resp.status_code} {resp.text[:200]}")
            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                raise HTTPException(502, "LLM returned no choices")
            return choices[0].get("message", {}).get("content", "")


class ChatMessage(BaseModel):
    role: str = "user"
    content: str


class AIRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[Dict[str, Any]] = None
    temperature: float = 0.3
    max_tokens: int = 2000


class BacktestAnalysisRequest(BaseModel):
    backtest_results: Dict[str, Any]
    question: str = "Analyze these backtest results. What worked well, what didn't, and what would you change?"


@router.post("/chat")
async def chat(req: AIRequest, user: dict = Depends(get_current_user)):
    """Chat with the local AI assistant using llama-server or Ollama."""
    try:
        system_prompt = """You are a quantitative trading assistant. You analyze backtest results, 
option strategies, and portfolio data. You provide specific, actionable advice based on the data.
You are direct and quantitative — cite numbers, don't be vague. You understand options greeks,
portfolio theory, and risk management. Keep responses concise unless asked for detail."""

        messages = [{"role": "system", "content": system_prompt}]

        if req.context:
            context_str = json.dumps(req.context, indent=2, default=str)
            messages.append({
                "role": "system",
                "content": f"Context data:\n```json\n{context_str[:8000]}\n```"
            })

        for msg in req.messages:
            messages.append({"role": msg.role, "content": msg.content})

        response = await _call_llm(messages, req.temperature, req.max_tokens)
        return {"response": response, "model": LLM_MODEL, "provider": LLM_TYPE}

    except ImportError:
        raise HTTPException(503, "httpx not installed. Run: pip install httpx")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"AI assistant unavailable: {str(e)[:200]}")


@router.post("/analyze-backtest")
async def analyze_backtest(req: BacktestAnalysisRequest, user: dict = Depends(get_current_user)):
    """Analyze backtest results using the local LLM."""
    try:
        metrics = req.backtest_results.get("metrics", {})
        trades = req.backtest_results.get("trades", [])
        ticker = req.backtest_results.get("ticker", "Unknown")
        strategy = req.backtest_results.get("strategy", "Unknown")

        summary = {
            "ticker": ticker,
            "strategy": strategy,
            "metrics": metrics,
            "recent_trades": trades[-5:] if trades else [],
            "total_trades": len(trades),
        }

        prompt = f"""You are a quantitative trading assistant analyzing backtest results.

Backtest Summary:
```json
{json.dumps(summary, indent=2, default=str)}
```

{req.question}

Provide specific, data-driven observations. Reference the numbers. Be direct."""

        response = await _call_llm(
            [{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2000,
        )
        return {"analysis": response, "model": LLM_MODEL, "metrics": metrics}

    except ImportError:
        raise HTTPException(503, "httpx not installed")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Analysis unavailable: {str(e)[:200]}")


@router.get("/status")
async def ai_status(user: dict = Depends(get_current_user)):
    """Check if the local LLM is available (llama-server or Ollama)."""
    try:
        import httpx
        headers = _get_llm_headers()

        if LLM_TYPE == "ollama":
            url = f"{LLM_BASE_URL}/api/tags"
        else:
            url = f"{LLM_BASE_URL}/v1/models"

        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                if LLM_TYPE == "ollama":
                    models = data.get("models", [])
                    available = [m["name"] for m in models]
                else:
                    models = data.get("data", data.get("models", []))
                    available = [m.get("id", m.get("name", "unknown")) for m in models]

                return {
                    "available": True,
                    "llm_url": LLM_BASE_URL,
                    "type": LLM_TYPE,
                    "default_model": LLM_MODEL,
                    "available_models": available,
                    "model_loaded": LLM_MODEL in available,
                }
            return {"available": False, "detail": f"LLM returned {resp.status_code}"}

    except ImportError:
        return {"available": False, "detail": "httpx not installed"}
    except Exception as e:
        return {"available": False, "detail": str(e)[:100]}
