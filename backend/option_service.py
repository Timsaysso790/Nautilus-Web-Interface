import logging
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

NAUTILUS_CATALOG_PATH = Path(os.getenv("NAUTILUS_CATALOG_PATH", "./data_lake"))


# ── Math helpers ────────────────────────────────────────────────────────────

def _norm_cdf(x: float) -> float:
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0


def _norm_pdf(x: float) -> float:
    return math.exp(-x * x / 2.0) / math.sqrt(2.0 * math.pi)


def _build_option_id(symbol: str, expiration: str, right: str, strike: float) -> str:
    exp = expiration.replace("-", "")
    strike_int = int(round(strike * 1000))
    return f"{symbol.upper()}{exp}{right.upper()}{strike_int:08d}.OPRA"


# ── Catalog readers ─────────────────────────────────────────────────────────

def _find_underlying_price(symbol: str) -> Optional[float]:
    try:
        tk = yf.Ticker(symbol)
        fast = tk.fast_info
        if fast:
            try:
                return fast.last_price
            except Exception:
                pass
        info = tk.info or {}
        return info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
    except Exception:
        return None


def _find_catalog_greeks(option_id: str) -> Dict[str, float]:
    greeks_dir = NAUTILUS_CATALOG_PATH / "data" / "option_greeks" / option_id
    if not greeks_dir.exists():
        return {}

    try:
        import pyarrow.parquet as pq
        files = sorted(greeks_dir.glob("*.parquet"))
        if not files:
            return {}
        table = pq.read_table(files[-1])
        pdf = table.to_pandas()
        if pdf.empty:
            return {}
        latest = pdf.iloc[-1]
        return {
            col: float(latest[col])
            for col in pdf.columns
            if col not in ("ts_event", "ts_init") and pd.notna(latest.get(col))
        }
    except Exception as e:
        logger.debug("Failed to read catalog greeks for %s: %s", option_id, e)
        return {}


# ── Public API ──────────────────────────────────────────────────────────────

async def get_expirations(symbol: str) -> List[str]:
    try:
        tk = yf.Ticker(symbol)
        exps = tk.options
        return sorted(exps) if exps else []
    except Exception as e:
        logger.warning("yfinance expirations failed for %s: %s", symbol, e)
        return []


async def get_chain(symbol: str, expiration: str) -> Dict[str, Any]:
    upper = symbol.upper()
    try:
        tk = yf.Ticker(upper)
        chain = tk.option_chain(expiration)
        if chain is None or chain.calls is None:
            return {"symbol": upper, "expiration": expiration, "calls": [], "puts": []}

        underlying = _find_underlying_price(upper)

        def _format(row, right):
            strike = float(row.get("strike", 0))
            oid = _build_option_id(upper, expiration, right, strike)
            g = _find_catalog_greeks(oid)
            return {
                "symbol": oid,
                "strike": strike,
                "right": right.lower(),
                "bid": float(row["bid"]) if row.get("bid") and row["bid"] > 0 else None,
                "ask": float(row["ask"]) if row.get("ask") and row["ask"] > 0 else None,
                "last": float(row["lastPrice"]) if row.get("lastPrice") else None,
                "volume": int(row["volume"]) if row.get("volume") and row["volume"] > 0 else 0,
                "open_interest": int(row["openInterest"]) if row.get("openInterest") else 0,
                "implied_volatility": float(row["impliedVolatility"]) if row.get("impliedVolatility") else None,
                "delta": g.get("delta") or (float(row["delta"]) if row.get("delta") else None),
                "gamma": g.get("gamma") or (float(row["gamma"]) if row.get("gamma") else None),
                "theta": g.get("theta") or (float(row["theta"]) if row.get("theta") else None),
                "vega": g.get("vega") or (float(row["vega"]) if row.get("vega") else None),
                "rho": g.get("rho") or None,
                "iv": g.get("implied_volatility") or (float(row["impliedVolatility"]) if row.get("impliedVolatility") else None),
                "underlying_price": g.get("underlying_price") or underlying,
                "expiration": expiration,
            }

        calls = [_format(r, "C") for _, r in chain.calls.iterrows()]
        puts = [_format(r, "P") for _, r in chain.puts.iterrows()]

        return {
            "symbol": upper,
            "expiration": expiration,
            "underlying_price": underlying,
            "calls": calls,
            "puts": puts,
        }
    except Exception as e:
        logger.warning("Failed to get chain for %s %s: %s", upper, expiration, e)
        return {"symbol": upper, "expiration": expiration, "calls": [], "puts": [], "error": str(e)}


async def get_greeks(symbol: str, expiration: str, strike: float, right: str) -> Dict[str, Any]:
    upper = symbol.upper()
    oid = _build_option_id(upper, expiration, right, strike)
    g = _find_catalog_greeks(oid)
    return {"symbol": oid, **g} if g else {"symbol": oid, "error": "No greeks in catalog"}


async def calculate_bsm(
    underlying_price: float,
    strike: float,
    time_to_expiry: float,
    risk_free_rate: float = 0.05,
    volatility: float = 0.20,
    right: str = "call",
) -> Dict[str, float]:
    S = underlying_price
    K = strike
    T = time_to_expiry
    r = risk_free_rate
    sigma = volatility
    q = 0.0

    if T <= 0 or sigma <= 0 or S <= 0:
        intrinsic = max(0, S - K) if right == "call" else max(0, K - S)
        return {"price": round(intrinsic, 2), "delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}

    d1 = (math.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)

    if right == "call":
        price = S * math.exp(-q * T) * _norm_cdf(d1) - K * math.exp(-r * T) * _norm_cdf(d2)
        delta = math.exp(-q * T) * _norm_cdf(d1)
        rho_val = K * T * math.exp(-r * T) * _norm_cdf(d2) / 100
    else:
        price = K * math.exp(-r * T) * _norm_cdf(-d2) - S * math.exp(-q * T) * _norm_cdf(-d1)
        delta = -math.exp(-q * T) * _norm_cdf(-d1)
        rho_val = -K * T * math.exp(-r * T) * _norm_cdf(-d2) / 100

    gamma = math.exp(-q * T) * _norm_pdf(d1) / (S * sigma * math.sqrt(T))
    vega = S * math.exp(-q * T) * _norm_pdf(d1) * math.sqrt(T) / 100

    term1 = -(S * math.exp(-q * T) * _norm_pdf(d1) * sigma) / (2 * math.sqrt(T))
    if right == "call":
        theta = (term1 - r * K * math.exp(-r * T) * _norm_cdf(d2) + q * S * math.exp(-q * T) * _norm_cdf(d1)) / 365
    else:
        theta = (term1 + r * K * math.exp(-r * T) * _norm_cdf(-d2) - q * S * math.exp(-q * T) * _norm_cdf(-d1)) / 365

    return {
        "price": round(price, 2),
        "delta": round(delta, 4),
        "gamma": round(gamma, 4),
        "theta": round(theta, 4),
        "vega": round(vega, 4),
        "rho": round(rho_val, 4),
        "d1": round(d1, 4),
        "d2": round(d2, 4),
    }


async def calculate_payoff(
    legs: List[Dict[str, Any]],
    price_min: Optional[float] = None,
    price_max: Optional[float] = None,
    steps: int = 100,
) -> Dict[str, Any]:
    if not legs:
        return {"payoff": [], "legs": legs, "price_range": None}

    strikes = [leg["strike"] for leg in legs]
    atm = sum(strikes) / len(strikes)
    spread = max(strikes) - min(strikes) if len(strikes) > 1 else strikes[0] * 0.5
    p_min = price_min if price_min is not None else max(0, atm - spread * 1.5)
    p_max = price_max if price_max is not None else atm + spread * 1.5

    underlying_prices = [p_min + (p_max - p_min) * i / steps for i in range(steps + 1)]
    payoff_points = []

    for sp in underlying_prices:
        total_pnl = 0.0
        breakdown = []
        for leg in legs:
            strike = leg["strike"]
            right = leg.get("right", "call").lower()
            qty = leg.get("quantity", 1)
            entry = leg.get("entry_price", 0)

            if right == "call":
                intrinsic = max(0, sp - strike)
            else:
                intrinsic = max(0, strike - sp)

            leg_pnl = (intrinsic - entry) * qty
            total_pnl += leg_pnl
            breakdown.append(round(leg_pnl, 2))

        payoff_points.append({
            "underlying_price": round(sp, 2),
            "pnl": round(total_pnl, 2),
            "legs": breakdown,
        })

    return {
        "payoff": payoff_points,
        "legs": legs,
        "price_range": {"min": round(p_min, 2), "max": round(p_max, 2)},
    }
