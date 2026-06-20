from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class OptionLeg(BaseModel):
    strike: float
    right: str  # "call" or "put"
    quantity: int = 1
    action: str = "sell"  # "buy" or "sell"


class StrategyConfig(BaseModel):
    symbol: str = "SPY"
    strategy_type: str
    legs: List[OptionLeg]
    entry_dte: int = Field(45, ge=7, le=365)
    hold_until_dte: int = Field(21, ge=0, le=365)
    entry_frequency_days: int = Field(7, ge=1, le=90)
    start_date: str = "2023-01-01"
    end_date: str = ""
    starting_balance: float = Field(50_000, gt=0)
    commission_per_contract: float = 0.65
    volatility_model: str = "historical"  # "historical" or "constant"
    risk_free_rate: float = 0.05


STRATEGY_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "credit_spread": {
        "label": "Credit Spread",
        "description": "Sell a higher-premium option, buy a cheaper option for protection. Net credit received.",
        "default_legs": [
            {"strike": 0, "right": "put", "quantity": 1, "action": "sell"},
            {"strike": 0, "right": "put", "quantity": 1, "action": "buy"},
        ],
        "margin_rule": "spread",
    },
    "debit_spread": {
        "label": "Debit Spread",
        "description": "Buy a higher-premium option, sell a cheaper option. Net debit paid.",
        "default_legs": [
            {"strike": 0, "right": "call", "quantity": 1, "action": "buy"},
            {"strike": 0, "right": "call", "quantity": 1, "action": "sell"},
        ],
        "margin_rule": "none",
    },
    "iron_condor": {
        "label": "Iron Condor",
        "description": "Sell an OTM put spread + sell an OTM call spread. Profit from low volatility.",
        "default_legs": [
            {"strike": 0, "right": "put", "quantity": 1, "action": "sell"},
            {"strike": 0, "right": "put", "quantity": 1, "action": "buy"},
            {"strike": 0, "right": "call", "quantity": 1, "action": "sell"},
            {"strike": 0, "right": "call", "quantity": 1, "action": "buy"},
        ],
        "margin_rule": "iron_condor",
    },
    "calendar_spread": {
        "label": "Calendar Spread",
        "description": "Sell a short-dated option, buy a longer-dated option at the same strike. Profit from time decay.",
        "default_legs": [
            {"strike": 0, "right": "call", "quantity": 1, "action": "sell"},
            {"strike": 0, "right": "call", "quantity": 1, "action": "buy"},
        ],
        "margin_rule": "none",
    },
    "ratio_spread": {
        "label": "Ratio Spread",
        "description": "Buy one option, sell multiple further OTM options. Unlimited risk directionally.",
        "default_legs": [
            {"strike": 0, "right": "call", "quantity": 1, "action": "buy"},
            {"strike": 0, "right": "call", "quantity": 2, "action": "sell"},
        ],
        "margin_rule": "ratio",
    },
    "straddle": {
        "label": "Straddle",
        "description": "Buy/sell both a call and put at the same strike. Profits from volatility (long) or time decay (short).",
        "default_legs": [
            {"strike": 0, "right": "call", "quantity": 1, "action": "buy"},
            {"strike": 0, "right": "put", "quantity": 1, "action": "buy"},
        ],
        "margin_rule": "none",
    },
    "strangle": {
        "label": "Strangle",
        "description": "Buy/sell an OTM call and an OTM put. Wider than straddle, lower premium.",
        "default_legs": [
            {"strike": 0, "right": "put", "quantity": 1, "action": "buy"},
            {"strike": 0, "right": "call", "quantity": 1, "action": "buy"},
        ],
        "margin_rule": "none",
    },
    "covered_call": {
        "label": "Covered Call",
        "description": "Own 100 shares, sell 1 call. Income generation with upside cap.",
        "default_legs": [
            {"strike": 0, "right": "call", "quantity": 1, "action": "sell"},
        ],
        "margin_rule": "none",
    },
    "protective_put": {
        "label": "Protective Put",
        "description": "Own 100 shares, buy 1 put. Downside protection while keeping upside.",
        "default_legs": [
            {"strike": 0, "right": "put", "quantity": 1, "action": "buy"},
        ],
        "margin_rule": "none",
    },
}


def get_default_config(strategy_type: str, symbol: str = "SPY") -> Optional[StrategyConfig]:
    sd = STRATEGY_DEFINITIONS.get(strategy_type)
    if not sd:
        return None
    legs = [OptionLeg(**leg) for leg in sd["default_legs"]]
    return StrategyConfig(
        symbol=symbol,
        strategy_type=strategy_type,
        legs=legs,
    )
