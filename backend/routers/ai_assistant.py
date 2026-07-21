"""
Local AI Assistant router.
Forwards backtest results and prompts to a local LLM (Ollama by default).
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
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:latest")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))


class ChatMessage(BaseModel):
    role: str = "user"  # "user" or "assistant"
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
    """Chat with the local AI assistant. Context can include backtest results, market data, etc."""
    try:
        import httpx

        system_prompt = """You are a quantitative trading assistant. You analyze backtest results, 
option strategies, and portfolio data. You provide specific, actionable advice based on the data.
You are direct and quantitative — cite numbers, don't be vague. You understand options greeks,
portfolio theory, and risk management. Keep responses concise unless asked for detail."""

        # Build messages for Ollama
        ollama_messages = [{"role": "system", "content": system_prompt}]

        # Add context if provided
        if req.context:
            context_str = json.dumps(req.context, indent=2, default=str)
            ollama_messages.append({
                "role": "system",
                "content": f"Context data:\n```json\n{context_str[:8000]}\n```"
            })

        for msg in req.messages:
            ollama_messages.append({"role": msg.role, "content": msg.content})

        # Call Ollama
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": ollama_messages,
                    "stream": False,
                    "options": {
                        "temperature": req.temperature,
                        "num_predict": req.max_tokens,
                    },
                },
            )
            if resp.status_code != 200:
                raise HTTPException(502, f"Ollama error: {resp.status_code} {resp.text[:200]}")

            data = resp.json()
            return {
                "response": data.get("message", {}).get("content", ""),
                "model": OLLAMA_MODEL,
                "provider": "ollama",
            }

    except ImportError:
        raise HTTPException(503, "httpx not installed. Run: pip install httpx")
    except Exception as e:
        raise HTTPException(502, f"AI assistant unavailable: {str(e)[:200]}")


@router.post("/analyze-backtest")
async def analyze_backtest(req: BacktestAnalysisRequest, user: dict = Depends(get_current_user)):
    """Analyze backtest results using the local AI."""
    try:
        import httpx

        # Extract key metrics for the prompt
        metrics = req.backtest_results.get("metrics", {})
        trades = req.backtest_results.get("trades", [])
        ticker = req.backtest_results.get("ticker", "Unknown")
        strategy = req.backtest_results.get("strategy", "Unknown")

        # Build a compact summary
        summary = {
            "ticker": ticker,
            "strategy": strategy,
            "metrics": metrics,
            "recent_trades": trades[-5:] if trades else [],
            "total_trades": len(trades),
        }

        system_prompt = f"""You are a quantitative trading assistant analyzing backtest results.

Backtest Summary:
```json
{json.dumps(summary, indent=2, default=str)}
```

{req.question}

Provide specific, data-driven observations. Reference the numbers. Be direct."""

        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": [{"role": "user", "content": system_prompt}],
                    "stream": False,
                    "options": {"temperature": 0.2, "num_predict": 2000},
                },
            )
            if resp.status_code != 200:
                raise HTTPException(502, f"Ollama error: {resp.status_code}")

            data = resp.json()
            return {
                "analysis": data.get("message", {}).get("content", ""),
                "model": OLLAMA_MODEL,
                "metrics": metrics,
            }

    except ImportError:
        raise HTTPException(503, "httpx not installed")
    except Exception as e:
        raise HTTPException(502, f"Analysis unavailable: {str(e)[:200]}")


@router.get("/status")
async def ai_status(user: dict = Depends(get_current_user)):
    """Check if the local AI is available."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                models = resp.json().get("models", [])
                available_models = [m["name"] for m in models]
                return {
                    "available": True,
                    "ollama_url": OLLAMA_BASE_URL,
                    "default_model": OLLAMA_MODEL,
                    "available_models": available_models,
                    "model_loaded": OLLAMA_MODEL in available_models,
                }
            return {"available": False, "detail": "Ollama not responding"}
    except ImportError:
        return {"available": False, "detail": "httpx not installed"}
    except Exception as e:
        return {"available": False, "detail": str(e)[:100]}
