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
from routers.ai_tools import AI_TOOLS, TOOL_SYSTEM_PROMPT, execute_tool

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


class ChatWithToolsRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[Dict[str, Any]] = None
    temperature: float = 0.3
    max_tokens: int = 3000
    max_tool_rounds: int = 5  # Prevent infinite loops


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


@router.post("/chat-with-tools")
async def chat_with_tools(req: ChatWithToolsRequest, user: dict = Depends(get_current_user)):
    """Chat with the AI assistant, with tool-calling capability.
    
    The AI can execute backtests, query available tickers, and get market data.
    Follows the OpenAI function-calling protocol: the LLM requests tools,
    the server executes them, and results are fed back to the LLM for a final response.
    """
    try:
        import httpx

        system_prompt = TOOL_SYSTEM_PROMPT

        messages = [{"role": "system", "content": system_prompt}]

        # Add context if provided (e.g., current project, backtest results)
        if req.context:
            context_str = json.dumps(req.context, indent=2, default=str)
            messages.append({
                "role": "system",
                "content": f"Current context:\n```json\n{context_str[:8000]}\n```"
            })

        for msg in req.messages:
            messages.append({"role": msg.role, "content": msg.content})

        # Multi-round tool calling loop
        round_count = 0
        tool_calls_log = []

        while round_count < req.max_tool_rounds:
            round_count += 1

            headers = {"Content-Type": "application/json", **_get_llm_headers()}
            url = f"{LLM_BASE_URL}/v1/chat/completions"

            payload = {
                "model": LLM_MODEL,
                "messages": messages,
                "temperature": req.temperature,
                "max_tokens": req.max_tokens,
                "tools": AI_TOOLS,
                "tool_choice": "auto",
            }

            async with httpx.AsyncClient(timeout=LLM_TIMEOUT) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code != 200:
                    raise HTTPException(502, f"LLM error: {resp.status_code} {resp.text[:200]}")

                data = resp.json()
                choices = data.get("choices", [])
                if not choices:
                    raise HTTPException(502, "LLM returned no choices")

                msg = choices[0].get("message", {})
                finish_reason = choices[0].get("finish_reason", "")

                # Append assistant message to conversation
                messages.append(msg)

                # Check for tool calls
                tool_calls = msg.get("tool_calls", [])

                if tool_calls and finish_reason == "tool_calls":
                    # Execute each tool
                    for tc in tool_calls:
                        tc_id = tc.get("id", f"call_{round_count}")
                        func = tc.get("function", {})
                        name = func.get("name", "")
                        args_str = func.get("arguments", "{}")

                        try:
                            args = json.loads(args_str)
                        except json.JSONDecodeError:
                            args = {}

                        logger.info(f"AI tool call: {name}({json.dumps(args)[:200]})")

                        # Execute the tool
                        result_str = await execute_tool(name, args)
                        tool_calls_log.append({
                            "tool": name,
                            "arguments": args,
                            "result_preview": result_str[:300],
                        })

                        # Append tool result to messages
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc_id,
                            "content": result_str,
                        })

                    # Continue loop — LLM will process tool results and respond
                    continue

                # No tool calls — this is the final response
                content = msg.get("content", "")
                return {
                    "response": content,
                    "model": LLM_MODEL,
                    "provider": LLM_TYPE,
                    "tool_calls_made": tool_calls_log,
                    "rounds": round_count,
                }

        # Max rounds exceeded
        return {
            "response": "I ran into too many tool calls. Please simplify your request.",
            "model": LLM_MODEL,
            "tool_calls_made": tool_calls_log,
            "rounds": round_count,
        }

    except ImportError:
        raise HTTPException(503, "httpx not installed")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("chat-with-tools failed")
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


class AnalyzeFileRequest(BaseModel):
    """Accepts a full backtest JSON result (the whole result from POST /api/backtest/options/run)."""
    backtest_data: Dict[str, Any]
    question: str = "Analyze these backtest results. What's working and what should I change?"


@router.post("/analyze-file")
async def analyze_backtest_file(req: AnalyzeFileRequest, user: dict = Depends(get_current_user)):
    """Analyze a complete backtest result JSON, including equity curve and trade log."""
    try:
        data = req.backtest_data
        metrics = data.get("metrics", {})
        trades = data.get("trades", [])
        equity = data.get("equity_curve", [])
        ticker = data.get("ticker", "Unknown")
        strategy = data.get("strategy", "Unknown")

        # Compute additional stats from trade log
        avg_win = 0
        avg_loss = 0
        winning = [t for t in trades if t.get("pnl", 0) > 0]
        losing = [t for t in trades if t.get("pnl", 0) < 0]
        if winning:
            avg_win = sum(t["pnl"] for t in winning) / len(winning)
        if losing:
            avg_loss = abs(sum(t["pnl"] for t in losing) / len(losing))

        summary = {
            "ticker": ticker,
            "strategy": strategy,
            "metrics": metrics,
            "trade_summary": {
                "total_trades": len(trades),
                "winning_trades": len(winning),
                "losing_trades": len(losing),
                "avg_win": round(avg_win, 2),
                "avg_loss": round(avg_loss, 2),
                "payoff_ratio": round(avg_win / avg_loss, 2) if avg_loss > 0 else None,
            },
            "equity_curve_summary": {
                "start_equity": equity[0]["equity"] if equity else 0,
                "end_equity": equity[-1]["equity"] if equity else 0,
                "points": len(equity),
            },
            "recent_trades": trades[-10:] if trades else [],
        }

        prompt = f"""You are a quantitative trading assistant analyzing a complete backtest result.
Provide specific, data-driven observations about strategy performance, risk metrics,
trade execution, and suggestions for improvement. Reference exact numbers from the data.

Backtest Data:
```json
{json.dumps(summary, indent=2, default=str)[:12000]}
```

{req.question}

Structure your response:
1. **Overall Performance** — key metrics and how they compare to benchmarks
2. **Risk Analysis** — drawdown, Sharpe, Sortino, and what they imply
3. **Trade Quality** — win rate, payoff ratio, expectancy
4. **Recommendations** — specific, actionable changes"""

        response = await _call_llm(
            [{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=3000,
        )
        return {"analysis": response, "model": LLM_MODEL, "ticker": ticker}

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
