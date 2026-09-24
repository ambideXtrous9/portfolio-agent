"""Stock Screener Pydantic Schemas."""

from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field


class StockScanRequest(BaseModel):
    universe: str = Field(default="nifty500", description="'nifty500', 'microcap250', or 'all'")
    mode: str = Field(default="volume_breakout", description="Scan mode: 'multibagger', 'volume_breakout', 'highest_eps', 'low_debt', 'bullish_engulfing', 'profit_jump'")
    min_volume_ratio: float = Field(default=1.4, description="Volume relative to 20-day average")
    limit: int = Field(default=50, description="Max results to return")
    min_multibagger_green: int = Field(default=4, description="Minimum green criteria for multibagger qualification (default 4)")
    include_bullish_engulfing: bool = Field(default=False, description="Filter: must also satisfy Bullish Engulfing")
    include_volume_breakout: bool = Field(default=False, description="Filter: must also satisfy Volume Breakout")


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
    mode: str
    total_scanned: int
    matches_found: int
    columns: List[str]
    stocks: List[Dict[str, Any]]


class StockCompanyItem(BaseModel):
    symbol: str
    company_name: str
    industry: Optional[str] = None


class CandlestickData(BaseModel):
    dates: List[str]
    open: List[float]
    high: List[float]
    low: List[float]
    close: List[float]
    volume: List[int]


class StatusBadge(BaseModel):
    label: str
    badge: str
    status_type: str  # positive, negative, loss, neutral, warning


class FinancialStatus(BaseModel):
    quarterly_profit: StatusBadge
    yearly_profit: StatusBadge
    fii_holding: StatusBadge
    dii_holding: StatusBadge
    promoter_holding: StatusBadge
    public_holding: StatusBadge


class StockNewsItem(BaseModel):
    title: str
    url: str
    publisher: Optional[str] = None
    published_date: Optional[str] = None


class MultibaggerTableRow(BaseModel):
    parameter: str
    your_value: str
    target: str
    verdict: str
    verdict_type: str  # positive, warning, negative
    why_it_matters: str


class CompanyOfficer(BaseModel):
    name: str
    title: str


class StockAnalysisResponse(BaseModel):
    symbol: str
    company_name: str
    current_price: str
    market_cap: str
    pe_ratio: str
    roe: str
    roce: str
    sector: str
    industry: str
    about: str
    day_range: str
    fifty_two_week_range: str
    volume: str
    avg_volume: str
    eps_ttm: Optional[str] = "N/A"
    eps_forward: Optional[str] = "N/A"
    eps_growth: Optional[str] = "N/A"
    company_officers: Optional[List[CompanyOfficer]] = []
    multibagger_table: Optional[List[MultibaggerTableRow]] = []
    valuation: Dict[str, Any]
    financials: Dict[str, Any]
    growth: Dict[str, Any]
    multibagger: Dict[str, Any]
    technical_indicators: Dict[str, Any]
    candlestick: CandlestickData
    shareholding_series: Dict[str, List[float]]
    financial_status: FinancialStatus
    news: List[StockNewsItem]


class StockReportRequest(BaseModel):
    symbol: str = Field(..., description="Stock symbol, e.g. 'TCS.NS' or 'RELIANCE.NS'")


class StockReportResponse(BaseModel):
    symbol: str
    company_name: Optional[str] = None
    thinking_part: Optional[str] = None
    report_markdown: str
    technicals: Dict[str, Any]
    fundamentals: Dict[str, Any]
