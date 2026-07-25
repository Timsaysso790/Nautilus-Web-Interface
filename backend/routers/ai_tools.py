"""
AI Tool Calling — lets the AI assistant execute backtests, scan markets, and query data.
Follows OpenAI function-calling format, compatible with llama-server and most local LLMs.
"""
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from options_backtest_engine import (
    OptionsBacktestEngine, OptionLeg, OptionStrategy,
    load_archive_data, ARCHIVE_PATH as BACKTEST_ARCHIVE,
)

logger = logging.getLogger(__name__)

# ── Tool Definitions (OpenAI function-calling format) ───────────────────────────

AI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "run_options_backtest",
            "description": "Run an options strategy backtest using historical data from the local parquet archive. "
                           "Use this when the user asks to test a strategy, check performance, or backtest an idea. "
                           "Returns full results with metrics, equity curve, and trade log.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {
                        "type": "string",
                        "description": "Stock ticker symbol (e.g., SPY, QQQ, AAPL). Must exist in the archive."
                    },
                    "strategy_type": {
                        "type": "string",
                        "enum": ["put_credit_spread", "call_credit_spread", "iron_condor",
                                  "covered_call", "cash_secured_put", "custom"],
                        "description": "Type of options strategy to backtest."
                    },
                    "short_strike_delta": {
                        "type": "number",
                        "description": "Target delta for the short strike (e.g., 0.16 for 16-delta). Default 0.16."
                    },
                    "wing_width": {
                        "type": "number",
                        "description": "Width between short and long strikes in dollars. Default 5."
                    },
                    "dte_min": {
                        "type": "integer",
                        "description": "Minimum days to expiration for entry. Default 30."
                    },
                    "dte_max": {
                        "type": "integer",
                        "description": "Maximum days to expiration for entry. Default 45."
                    },
                    "hold_until_dte": {
                        "type": "integer",
                        "description": "Exit when DTE reaches this value. Default 21."
                    },
                    "start_year": {
                        "type": "integer",
                        "description": "Start year for backtest. Default 2020."
                    },
                    "end_year": {
                        "type": "integer",
                        "description": "End year for backtest. Default 2025."
                    },
                    "entry_frequency_days": {
                        "type": "integer",
                        "description": "Days between new trade entries. Default 7."
                    },
                    "profit_target_pct": {
                        "type": "number",
                        "description": "Exit at this profit percentage (e.g., 50 for 50% of max credit)."
                    },
                    "stop_loss_pct": {
                        "type": "number",
                        "description": "Exit at this loss percentage (e.g., 100 for -100% of credit)."
                    },
                },
                "required": ["ticker", "strategy_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_available_tickers",
            "description": "List all ticker symbols available in the options data archive for backtesting.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category_filter": {
                        "type": "string",
                        "description": "Optional: filter by category (e.g., 'etf', 'tech', 'finance'). Omit for all tickers."
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_ticker_data_info",
            "description": "Get information about available data for a specific ticker: years covered, "
                           "file sizes, data volume. Use before running a backtest to verify data exists.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {
                        "type": "string",
                        "description": "Stock ticker symbol to check."
                    },
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_market_snapshot",
            "description": "Get current market context: available tickers, data coverage, and recent scanner "
                           "results. Useful for answering 'what can I test?' or 'show me the market.'",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
]

TOOL_SYSTEM_PROMPT = """You are a quantitative trading AI assistant with the ability to run real backtests 
and analyze real market data. You have access to a local archive of historical options data with 
pre-computed Greeks.

IMPORTANT RULES:
1. When a user asks to backtest a strategy, ALWAYS use the run_options_backtest tool. 
   Do NOT just describe what would happen — actually run it.
2. When suggesting tickers, use get_available_tickers first to only suggest tickers that exist.
3. When a backtest completes, analyze the results: cite specific metrics, identify patterns, 
   and give actionable recommendations.
4. If a backtest shows poor performance (negative Sharpe, high drawdown), suggest specific 
   parameter changes to test next.
5. For put credit spreads, the standard tastytrade approach is: 30-45 DTE, 16-20 delta, 
   exit at 21 DTE or 50% profit. Mention when results align with or deviate from this benchmark.
6. Be concise but thorough. Reference exact numbers. Use bullet points for clarity.
7. After running a backtest, ALWAYS offer to run a variation (different ticker, delta, DTE, etc.)
   to help the user explore the strategy space."""


# ── Tool Executors ──────────────────────────────────────────────────────────────

async def execute_tool(tool_name: str, arguments: Dict[str, Any]) -> str:
    """Execute a tool and return the result as a JSON string."""
    try:
        if tool_name == "run_options_backtest":
            return await _run_backtest(arguments)
        elif tool_name == "get_available_tickers":
            return await _get_tickers(arguments)
        elif tool_name == "get_ticker_data_info":
            return await _get_ticker_info(arguments)
        elif tool_name == "get_market_snapshot":
            return await _get_snapshot(arguments)
        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
    except Exception as e:
        logger.exception(f"Tool {tool_name} failed")
        return json.dumps({"error": str(e)[:500]})


async def _run_backtest(args: Dict[str, Any]) -> str:
    """Execute an options backtest based on natural language parameters."""
    import asyncio

    ticker = args["ticker"].upper()
    strategy_type = args.get("strategy_type", "put_credit_spread")
    short_delta = args.get("short_strike_delta", 0.16)
    wing_width = args.get("wing_width", 5)
    dte_min = args.get("dte_min", 30)
    dte_max = args.get("dte_max", 45)
    hold_dte = args.get("hold_until_dte", 21)
    start_year = args.get("start_year", 2020)
    end_year = args.get("end_year", 2025)
    freq = args.get("entry_frequency_days", 7)
    pt = args.get("profit_target_pct")
    sl = args.get("stop_loss_pct")

    # Verify ticker exists
    ticker_dir = BACKTEST_ARCHIVE / ticker
    if not ticker_dir.exists():
        available = sorted(d.name for d in BACKTEST_ARCHIVE.iterdir()
                          if d.is_dir() and not d.name.startswith("."))
        return json.dumps({
            "error": f"Ticker {ticker} not found in archive.",
            "available_tickers": available[:50],
            "total_available": len(available),
        })

    # Build legs based on strategy type
    if strategy_type == "put_credit_spread":
        legs = [
            OptionLeg(strike=0, right="P", action="sell", quantity=1),
            OptionLeg(strike=0, right="P", action="buy", quantity=1),
        ]
    elif strategy_type == "call_credit_spread":
        legs = [
            OptionLeg(strike=0, right="C", action="sell", quantity=1),
            OptionLeg(strike=0, right="C", action="buy", quantity=1),
        ]
    elif strategy_type == "iron_condor":
        legs = [
            OptionLeg(strike=0, right="P", action="sell", quantity=1),
            OptionLeg(strike=0, right="P", action="buy", quantity=1),
            OptionLeg(strike=0, right="C", action="sell", quantity=1),
            OptionLeg(strike=0, right="C", action="buy", quantity=1),
        ]
    elif strategy_type == "covered_call":
        legs = [
            OptionLeg(strike=0, right="C", action="sell", quantity=1),
        ]
    elif strategy_type == "cash_secured_put":
        legs = [
            OptionLeg(strike=0, right="P", action="sell", quantity=1),
        ]
    else:
        legs = [
            OptionLeg(strike=0, right="P", action="sell", quantity=1),
            OptionLeg(strike=0, right="P", action="buy", quantity=1),
        ]

    strategy = OptionStrategy(legs)
    engine = OptionsBacktestEngine(
        ticker=ticker,
        strategy=strategy,
        entry_dte_range=(dte_min, dte_max),
        hold_until_dte=hold_dte,
        entry_frequency_days=freq,
        start_year=start_year,
        end_year=end_year,
        delta_min=short_delta * 0.8 if short_delta > 0 else 0,
        delta_max=short_delta * 1.2 if short_delta > 0 else 1.0,
        profit_target_pct=pt,
        stop_loss_pct=sl,
    )

    # Run in thread pool
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, engine.run)

    # Build a concise summary for the AI to read
    metrics = result.get("metrics", {})
    trades = result.get("trades", [])
    summary = {
        "ticker": ticker,
        "strategy": strategy_type.replace("_", " ").title(),
        "parameters": {
            "dte_range": f"{dte_min}-{dte_max}",
            "hold_until_dte": hold_dte,
            "delta_target": short_delta,
            "years": f"{start_year}-{end_year}",
            "frequency": f"every {freq} days",
        },
        "metrics": {
            "total_trades": metrics.get("total_trades", 0),
            "win_rate_pct": round(metrics.get("win_rate", 0) * 100, 1),
            "total_pnl": round(metrics.get("total_pnl", 0), 2),
            "avg_pnl_per_trade": round(metrics.get("avg_pnl", 0), 2),
            "profit_factor": round(metrics.get("profit_factor", 0), 2),
            "sharpe_ratio": round(metrics.get("sharpe_ratio", 0), 2),
            "sortino_ratio": round(metrics.get("sortino_ratio", 0), 2),
            "max_drawdown_pct": round(metrics.get("max_drawdown_pct", 0), 1),
            "avg_win": round(metrics.get("avg_win", 0), 2),
            "avg_loss": round(metrics.get("avg_loss", 0), 2),
            "payoff_ratio": round(metrics.get("payoff_ratio", 0), 2),
            "expectancy": round(metrics.get("expectancy", 0), 2),
            "cagr_pct": round(metrics.get("cagr_pct", 0), 1),
            "calmar_ratio": round(metrics.get("calmar_ratio", 0), 2),
        },
        "trade_sample": trades[:3] if trades else [],
        "equity_end": result.get("equity_curve", [{}])[-1].get("equity", 0) if result.get("equity_curve") else 0,
    }

    return json.dumps(summary, default=str)


async def _get_tickers(args: Dict[str, Any]) -> str:
    """List available tickers in the archive."""
    category = args.get("category_filter", "").lower()

    tickers = []
    for d in sorted(BACKTEST_ARCHIVE.iterdir()):
        if d.is_dir() and not d.name.startswith("."):
            # Count years available
            years = sorted(f.stem.split("_")[-1] for f in d.glob("*.parquet")
                          if f.stem.split("_")[-1].isdigit())
            tickers.append({
                "symbol": d.name,
                "years": f"{years[0]}-{years[-1]}" if years else "unknown",
                "file_count": len(years),
            })

    # Optional category filtering
    ETF_TICKERS = {"SPY", "QQQ", "IWM", "DIA", "TLT", "GLD", "SLV", "USO",
                   "XLF", "XLE", "XLK", "XLV", "XLI", "XLP", "XLY", "XLB",
                   "XLU", "XLRE", "XLC", "EEM", "EFA", "VXX", "UVXY", "SVXY"}
    if category == "etf":
        tickers = [t for t in tickers if t["symbol"] in ETF_TICKERS]
    elif category == "tech":
        tech = {"AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "NFLX", "AMD", "INTC", "TSLA"}
        tickers = [t for t in tickers if t["symbol"] in tech]

    return json.dumps({
        "tickers": tickers[:100],
        "total_count": len(tickers),
        "note": "Showing first 100 tickers. Use category_filter to narrow results."
    })


async def _get_ticker_info(args: Dict[str, Any]) -> str:
    """Get detailed info about a ticker's available data."""
    ticker = args["ticker"].upper()
    ticker_dir = BACKTEST_ARCHIVE / ticker

    if not ticker_dir.exists():
        available = sorted(d.name for d in BACKTEST_ARCHIVE.iterdir()
                          if d.is_dir() and not d.name.startswith("."))
        return json.dumps({
            "found": False,
            "ticker": ticker,
            "available_similar": [t for t in available[:20] if ticker[:2] in t],
        })

    files = sorted(ticker_dir.glob("*.parquet"))
    years = []
    total_size_mb = 0
    for f in files:
        try:
            year_str = f.stem.split("_")[-1]
            if year_str.isdigit():
                years.append(int(year_str))
            total_size_mb += f.stat().st_size / (1024 * 1024)
        except Exception:
            pass

    return json.dumps({
        "found": True,
        "ticker": ticker,
        "years_available": sorted(years),
        "year_range": f"{min(years)}-{max(years)}" if years else "unknown",
        "file_count": len(files),
        "total_size_mb": round(total_size_mb, 1),
    })


async def _get_snapshot(args: Dict[str, Any]) -> str:
    """Get a market snapshot: ticker count, data coverage, recent scanner results."""
    # Count tickers
    ticker_dirs = [d for d in BACKTEST_ARCHIVE.iterdir()
                   if d.is_dir() and not d.name.startswith(".")]

    # Get scanner data if available
    scanner_info = {}
    try:
        scanner_path = Path(os.getenv("SCANNER_OUTPUT_PATH",
                             os.getenv("SCANNER_DASHBOARD_DATA_DIR",
                             "/data/scanner/.mcp_scanner_output.json")))
        if scanner_path.exists():
            import json as _json
            data = _json.loads(scanner_path.read_text())
            if isinstance(data, list) and data:
                latest = data[0]
                scanner_info = {
                    "last_scan": latest.get("timestamp", "unknown"),
                    "entry_count": len(latest.get("results", [])),
                }
    except Exception:
        pass

    return json.dumps({
        "total_tickers": len(ticker_dirs),
        "archive_path": str(BACKTEST_ARCHIVE),
        "most_recent_year": max(
            (int(f.stem.split("_")[-1]) for d in ticker_dirs
             for f in d.glob("*.parquet") if f.stem.split("_")[-1].isdigit()),
            default=0
        ),
        "scanner": scanner_info if scanner_info else None,
    })
