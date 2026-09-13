"""Stock Screener Pydantic Schemas."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class StockScanRequest(BaseModel):
    universe: str = Field(default="nifty500", description="'nifty500' or 'microcap250'")
    min_volume_ratio: float = Field(default=1.5, description="Volume relative to 20-day average")
    limit: int = Field(default=20, description="Max results to return")


class StockItem(BaseModel):
    symbol: str
    company_name: str
    current_price: float
    change_pct: float
    volume: int
    avg_volume: int
    volume_ratio: float
    rsi: Optional[float] = None
    breakout_signal: str


class StockScanResponse(BaseModel):
    universe: str
    total_scanned: int
    breakouts_found: int
    stocks: List[StockItem]


class StockReportRequest(BaseModel):
    symbol: str = Field(..., description="Stock symbol, e.g. 'TCS.NS' or 'RELIANCE.NS'")


class StockReportResponse(BaseModel):
    symbol: str
    company_name: Optional[str] = None
    report_markdown: str
    technicals: Dict[str, Any]
    fundamentals: Dict[str, Any]
