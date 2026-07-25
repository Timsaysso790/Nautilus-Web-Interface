"""
Options backtest API router.
Runs bar-by-bar backtests using the local parquet archive.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_jwt import get_current_user
from options_backtest_engine import OptionsBacktestEngine, OptionLeg as EngineLeg, OptionStrategy
import backtest_project_service as bps

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backtest/options", tags=["backtest-options"])

_backtest_lock = asyncio.Lock()
_result_cache: Dict[str, Any] = {}
_jobs: Dict[str, Dict[str, Any]] = {}  # job_id → { status, result?, error?, created_at }


class BacktestLeg(BaseModel):
    strike: float = 0.0
    right: str = Field(pattern="^(C|P)$")
    action: str = Field(pattern="^(buy|sell)$")
    quantity: int = 1
    target_delta: Optional[float] = Field(None, ge=0.0, le=1.0, description="Target delta for this leg (e.g. 0.16). Overrides strike when set.")


class BacktestRequest(BaseModel):
    ticker: str = "SPY"
    legs: List[BacktestLeg] = Field(min_length=1, max_length=4)
    entry_dte_min: int = Field(30, ge=7, le=365)
    entry_dte_max: int = Field(60, ge=7, le=365)
    hold_until_dte: int = Field(21, ge=0, le=365)
    entry_frequency_days: int = Field(7, ge=1, le=90)
    start_year: int = Field(2018, ge=2018, le=2026)
    end_year: int = Field(2026, ge=2018, le=2026)
    # New institutional features
    delta_min: float = Field(0.0, ge=0.0, le=1.0)
    delta_max: float = Field(1.0, ge=0.0, le=1.0)
    allow_overlapping: bool = False
    slippage_model: str = Field("mid", pattern="^(mid|spread_pct|aggressive|random)$")
    slippage_pct: float = Field(0.1, ge=0.0, le=100.0)
    profit_target_pct: Optional[float] = Field(None, ge=0.0, le=1000.0)
    stop_loss_pct: Optional[float] = Field(None, ge=0.0, le=1000.0)
    max_days_in_trade: int = Field(60, ge=1, le=365)
    project_id: Optional[str] = Field(None, description="Save result to this project if provided")
    run_name: Optional[str] = Field(None, description="Optional name for the saved run")
    # Technical indicator entry triggers
    entry_trigger_mode: str = Field("calendar", pattern="^(calendar|technical)$")
    indicator_type: str = Field("rsi", pattern="^(rsi|rsi_above|bb_lower|sma_below|sma_above)$")
    indicator_threshold: float = Field(30, ge=0, le=100)


@router.post("/run")
async def run_backtest(req: BacktestRequest, user: dict = Depends(get_current_user)):
    """Run a backtest asynchronously. Returns a job_id immediately; poll /status/{job_id} for completion."""
    job_id = str(uuid.uuid4())[:8]
    legs = [EngineLeg(l.strike, l.right, l.action, l.quantity, l.target_delta) for l in req.legs]
    strategy = OptionStrategy(legs)
    years = req.end_year - req.start_year + 1
    logger.info(f"Backtest queued [{job_id}]: {req.ticker} {strategy.description} ({req.start_year}-{req.end_year}, {years}yr)")

    _jobs[job_id] = {"status": "running", "created_at": datetime.now(timezone.utc).isoformat()}

    # Launch backtest in background — does NOT block the HTTP response
    async def _run():
        try:
            async with _backtest_lock:
                engine = OptionsBacktestEngine(
                    ticker=req.ticker,
                    strategy=strategy,
                    entry_dte_range=(req.entry_dte_min, req.entry_dte_max),
                    hold_until_dte=req.hold_until_dte,
                    entry_frequency_days=req.entry_frequency_days,
                    start_year=req.start_year,
                    end_year=req.end_year,
                    delta_min=req.delta_min,
                    delta_max=req.delta_max,
                    allow_overlapping=req.allow_overlapping,
                    slippage_model=req.slippage_model,
                    slippage_pct=req.slippage_pct,
                    profit_target_pct=req.profit_target_pct,
                    stop_loss_pct=req.stop_loss_pct,
                    max_days_in_trade=req.max_days_in_trade,
                    entry_trigger_mode=req.entry_trigger_mode,
                    indicator_type=req.indicator_type,
                    indicator_threshold=req.indicator_threshold,
                )
                loop = asyncio.get_event_loop()
                try:
                    result = await asyncio.wait_for(
                        loop.run_in_executor(None, engine.run),
                        timeout=300,
                    )
                except asyncio.TimeoutError:
                    _jobs[job_id] = {"status": "error", "error": "Backtest timed out after 5 minutes."}
                    return

            trades = len(result.get("trades", []))
            logger.info(f"Backtest complete [{job_id}]: {req.ticker} → {trades} trades, PnL ${result.get('metrics', {}).get('total_pnl', 0):.0f}")

            result_id = str(uuid.uuid4())[:8]
            _result_cache[result_id] = result
            result["id"] = result_id

            # Save result to project if project_id provided
            saved_seq = None
            if req.project_id:
                try:
                    from routers.backtest_projects import _get_project_slug
                    slug = await _get_project_slug(req.project_id)
                    if slug:
                        fpath = bps.save_result(slug, result, name=req.run_name)
                        saved_seq = result.get("metadata", {}).get("run_seq")
                        result["saved_to_project"] = True
                        logger.info(f"Saved result [{job_id}] to project {slug}: {fpath}")
                except Exception as e:
                    logger.warning(f"Failed to save result [{job_id}] to project {req.project_id}: {e}")

            _jobs[job_id] = {
                "status": "complete",
                "result_id": result_id,
                "saved_seq": saved_seq,
                "trades": trades,
                "pnl": result.get("metrics", {}).get("total_pnl", 0),
            }
        except FileNotFoundError as e:
            _jobs[job_id] = {"status": "error", "error": str(e)}
        except ValueError as e:
            _jobs[job_id] = {"status": "error", "error": str(e)}
        except Exception as e:
            logger.exception(f"Backtest failed [{job_id}]")
            _jobs[job_id] = {"status": "error", "error": str(e)[:200]}

    asyncio.create_task(_run())
    return {"job_id": job_id, "status": "running"}


@router.get("/status/{job_id}")
async def get_backtest_status(job_id: str, user: dict = Depends(get_current_user)):
    """Poll for backtest completion. Returns {status, result_id?, saved_seq?, trades?, pnl?, error?}."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    return {"job_id": job_id, **job}


@router.get("/result/{result_id}")
async def get_backtest_result(result_id: str, user: dict = Depends(get_current_user)):
    """Retrieve a cached backtest result."""
    result = _result_cache.get(result_id)
    if not result:
        raise HTTPException(404, f"Result {result_id} not found (cache may have expired)")
    return result


@router.get("/projects/{project_id}/results")
async def list_project_results(project_id: str, user: dict = Depends(get_current_user)):
    """List saved backtest results for a project."""
    from routers.backtest_projects import _get_project_slug
    try:
        slug = await _get_project_slug(project_id)
    except:
        return {"results": [], "count": 0}
    files = bps.list_project_files(slug)
    results = [f for f in files if f.get("_file_type") == "result" or f.get("_file", "").startswith("result-")]
    for r in results:
        # Extract sequence and summary info
        fname = r.get("_file", "")
        try:
            r["seq"] = int(fname.replace("result-", "").replace(".json", ""))
        except:
            r["seq"] = 0
        metrics = r.get("metrics", {})
        meta = r.get("metadata", {})
        r["summary"] = {
            "total_trades": metrics.get("total_trades", 0),
            "total_pnl": metrics.get("total_pnl", 0),
            "win_rate": metrics.get("win_rate", 0),
            "sharpe": metrics.get("sharpe_ratio", 0),
            "run_name": meta.get("run_name", f"Run #{r.get('seq', 0)}"),
        }
    return {"results": sorted(results, key=lambda x: x.get("seq", 0), reverse=True), "count": len(results)}


@router.get("/projects/{project_id}/results/{seq}")
async def get_project_result(project_id: str, seq: int, user: dict = Depends(get_current_user)):
    """Load a specific saved backtest result."""
    from routers.backtest_projects import _get_project_slug
    try:
        slug = await _get_project_slug(project_id)
    except:
        raise HTTPException(404, "Project not found")
    result = bps.load_result(slug, seq)
    if result is None:
        raise HTTPException(404, f"Result {seq} not found")
    return result


@router.post("/projects/{project_id}/results/{seq}/rename")
async def rename_project_result(project_id: str, seq: int, body: dict, user: dict = Depends(get_current_user)):
    """Rename a saved backtest result."""
    from routers.backtest_projects import _get_project_slug
    try:
        slug = await _get_project_slug(project_id)
    except:
        raise HTTPException(404, "Project not found")
    result = bps.load_result(slug, seq)
    if result is None:
        raise HTTPException(404, f"Result {seq} not found")
    new_name = body.get("name", "").strip()
    if not new_name:
        raise HTTPException(400, "Name is required")
    if "metadata" not in result:
        result["metadata"] = {}
    result["metadata"]["run_name"] = new_name
    bps.save_result(slug, result, name=new_name, overwrite_seq=seq)
    return {"success": True, "name": new_name}


@router.get("/tickers")
async def list_available_tickers(user: dict = Depends(get_current_user)):
    """List all tickers with their available year ranges."""
    from pathlib import Path
    import os
    archive = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))
    if not archive.exists():
        return {"tickers": [], "archive_path": str(archive), "found": False}

    result = []
    for d in sorted(archive.iterdir()):
        if not d.is_dir() or d.name.startswith("."):
            continue
        years = []
        for f in d.glob("*.parquet"):
            try:
                yr = int(f.stem.split("_")[-1])
                years.append(yr)
            except (ValueError, IndexError):
                pass
        years = sorted(years)
        result.append({
            "symbol": d.name,
            "years": years,
            "min_year": years[0] if years else None,
            "max_year": years[-1] if years else None,
            "file_count": len(years),
        })

    return {"tickers": result, "archive_path": str(archive), "count": len(result), "found": True}


@router.get("/ticker/{ticker}/years")
async def get_ticker_years(ticker: str, user: dict = Depends(get_current_user)):
    """Get available years for a specific ticker."""
    from pathlib import Path
    import os
    archive = Path(os.getenv("OPTIONS_ARCHIVE_PATH", "/workspace/Archive/Nautilus_Archive5min"))
    ticker_dir = archive / ticker.upper()
    if not ticker_dir.exists():
        raise HTTPException(404, f"Ticker {ticker} not found in archive")

    years = []
    for f in ticker_dir.glob("*.parquet"):
        try:
            yr = int(f.stem.split("_")[-1])
            years.append(yr)
        except (ValueError, IndexError):
            pass
    years = sorted(years)
    return {
        "ticker": ticker.upper(),
        "years": years,
        "min_year": years[0] if years else None,
        "max_year": years[-1] if years else None,
        "recommended_range": [max(years[0], 2020) if years else 2020, years[-1] if years else 2025],
    }


@router.post("/walk-forward")
async def walk_forward(req: BacktestRequest, user: dict = Depends(get_current_user)):
    """Run backtest on each year independently."""
    async with _backtest_lock:
        results = []
        for year in range(req.start_year, req.end_year + 1):
            try:
                legs = [EngineLeg(l.strike, l.right, l.action, l.quantity, l.target_delta) for l in req.legs]
                strategy = OptionStrategy(legs)
                engine = OptionsBacktestEngine(
                    ticker=req.ticker,
                    strategy=strategy,
                    entry_dte_range=(req.entry_dte_min, req.entry_dte_max),
                    hold_until_dte=req.hold_until_dte,
                    entry_frequency_days=req.entry_frequency_days,
                    start_year=year,
                    end_year=year,
                )
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(None, engine.run)
                results.append({
                    "year": year,
                    "metrics": result["metrics"],
                    "trade_count": len(result["trades"]),
                })
            except Exception as e:
                results.append({"year": year, "error": str(e)[:100]})

        return {
            "ticker": req.ticker,
            "strategy": f"{len(req.legs)}-leg strategy",
            "walk_forward_results": results,
            "years_tested": len(results),
        }
