"""
Script to fetch and cache fundamentals for NIFTY500 and MICROCAP250 stocks
using curl_cffi with browser impersonation to avoid Yahoo Finance 401/429 blocks.
"""

import concurrent.futures
import json
import os
import sys
import time
import pandas as pd
from curl_cffi import requests

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BACKEND_DIR, "data")
CACHE_FILE = os.path.join(DATA_DIR, "stock_fundamentals_cache.json")
NIFTY_CSV = os.path.join(DATA_DIR, "ind_nifty500list.csv")
MICRO_CSV = os.path.join(DATA_DIR, "ind_niftymicrocap250_list.csv")


class YahooFundamentalsFetcher:
    def __init__(self):
        self._session = None
        self._crumb = None
        self._init_session()

    def _init_session(self):
        for attempt in range(5):
            try:
                s = requests.Session(impersonate="chrome120")
                s.get("https://fc.yahoo.com", timeout=10)
                r_crumb = s.get("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=10)
                if r_crumb.status_code == 200 and r_crumb.text and "Too Many Requests" not in r_crumb.text:
                    self._session = s
                    self._crumb = r_crumb.text.strip()
                    print(f"Crumb obtained successfully: {self._crumb[:5]}***")
                    return
            except Exception as e:
                print(f"Session init attempt {attempt+1} failed: {e}")
                time.sleep(2)
        print("Warning: Could not obtain crumb.")

    def get_fundamentals(self, sym: str):
        if not self._crumb or not self._session:
            self._init_session()
        if not self._crumb:
            return None

        url = (
            f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{sym}"
            f"?modules=defaultKeyStatistics,financialData,summaryDetail,incomeStatementHistoryQuarterly"
            f"&crumb={self._crumb}"
        )
        try:
            r = self._session.get(url, timeout=10)
            if r.status_code == 401 or r.status_code == 429:
                # Crumb might have expired or session rate-limited, recreate
                self._init_session()
                if self._crumb:
                    url = (
                        f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{sym}"
                        f"?modules=defaultKeyStatistics,financialData,summaryDetail,incomeStatementHistoryQuarterly"
                        f"&crumb={self._crumb}"
                    )
                    r = self._session.get(url, timeout=10)

            if r.status_code != 200:
                return None

            data = r.json()
            res = data.get("quoteSummary", {}).get("result")
            if not res or len(res) == 0:
                return None

            entry = res[0]
            stats = entry.get("defaultKeyStatistics", {})
            fin = entry.get("financialData", {})
            summary = entry.get("summaryDetail", {})
            q_hist = entry.get("incomeStatementHistoryQuarterly", {}).get("incomeStatementHistory", [])

            eps = stats.get("trailingEps", {}).get("raw")
            pe = summary.get("trailingPE", {}).get("raw") or stats.get("trailingPE", {}).get("raw")
            de = fin.get("debtToEquity", {}).get("raw")
            cr = fin.get("currentRatio", {}).get("raw")
            mcap = summary.get("marketCap", {}).get("raw")
            curr_p = fin.get("currentPrice", {}).get("raw") or summary.get("previousClose", {}).get("raw")
            rev_g = fin.get("revenueGrowth", {}).get("raw")
            earn_g = fin.get("earningsGrowth", {}).get("raw")
            ebitda = fin.get("ebitdaMargins", {}).get("raw")
            net_m = fin.get("profitMargins", {}).get("raw")
            peg = stats.get("pegRatio", {}).get("raw")
            roe = fin.get("returnOnEquity", {}).get("raw")

            q_jump = None
            latest_q = None
            prev_q = None
            if len(q_hist) >= 2:
                q0 = q_hist[0].get("netIncome", {}).get("raw")
                q1 = q_hist[1].get("netIncome", {}).get("raw")
                if q0 is not None and q1 is not None:
                    latest_q = float(q0)
                    prev_q = float(q1)
                    if prev_q > 0 and latest_q > prev_q:
                        q_jump = round(((latest_q - prev_q) / prev_q) * 100, 1)

            # Normalize debt to equity (Yahoo can report as ratio e.g. 1.25 or percentage 125)
            norm_de = None
            if de is not None:
                norm_de = round(float(de) / 100, 2) if de > 5 else round(float(de), 2)

            pe_val = round(float(pe), 2) if pe is not None else None
            cr_val = round(float(cr), 2) if cr is not None else None
            peg_val = round(float(peg), 2) if peg is not None else None
            roe_val = round(float(roe), 4) if roe is not None else None
            rev_g_val = round(float(rev_g), 4) if rev_g is not None else None
            earn_g_val = round(float(earn_g), 4) if earn_g is not None else None
            ebitda_val = round(float(ebitda), 4) if ebitda is not None else None
            net_m_val = round(float(net_m), 4) if net_m is not None else None

            checks = {
                "Revenue Growth": rev_g_val is not None and rev_g_val >= 0.20,
                "Earnings Growth": earn_g_val is not None and earn_g_val >= 0.25,
                "EBITDA Margin": ebitda_val is not None and ebitda_val >= 0.15,
                "Net Margin": net_m_val is not None and net_m_val >= 0.12,
                "P/E (TTM)": pe_val is not None and 0 < pe_val <= 25,
                "PEG Ratio": peg_val is not None and 0 < peg_val <= 1.0,
                "Debt/Equity": norm_de is not None and norm_de <= 0.5,
                "ROE": roe_val is not None and roe_val >= 0.15,
                "Current Ratio": cr_val is not None and cr_val >= 1.5,
            }
            green_greens = [k for k, v in checks.items() if v]

            return {
                "eps": round(float(eps), 2) if eps is not None else None,
                "pe": pe_val,
                "current_price": round(float(curr_p), 2) if curr_p is not None else None,
                "debt_to_equity": norm_de,
                "current_ratio": cr_val,
                "market_cap": round(float(mcap) / 1e7, 1) if mcap is not None else None,
                "revenue_growth": rev_g_val,
                "earnings_growth": earn_g_val,
                "ebitda_margin": ebitda_val,
                "net_margin": net_m_val,
                "peg_ratio": peg_val,
                "roe": roe_val,
                "profit_jump": q_jump,
                "latest_q": latest_q,
                "prev_q": prev_q,
                "multibagger_green_count": len(green_greens),
                "multibagger_greens": green_greens,
                "updated_at": time.time()
            }
        except Exception as e:
            return None


def run():
    nifty = pd.read_csv(NIFTY_CSV)
    micro = pd.read_csv(MICRO_CSV)
    all_symbols = list(dict.fromkeys(
        [s + ".NS" for s in nifty["Symbol"].dropna().tolist()] +
        [s + ".NS" for s in micro["Symbol"].dropna().tolist()]
    ))
    print(f"Total target symbols: {len(all_symbols)}")

    cache = {}
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r") as f:
                cache = json.load(f)
        except Exception:
            cache = {}

    to_fetch = [s for s in all_symbols if s not in cache or cache[s].get("multibagger_green_count") is None]
    print(f"Symbols already having valid data: {len(all_symbols) - len(to_fetch)}, to fetch: {len(to_fetch)}")

    if not to_fetch:
        print("All symbols are already cached!")
        return

    fetcher = YahooFundamentalsFetcher()
    t0 = time.time()
    count = 0

    def worker(sym):
        return sym, fetcher.get_fundamentals(sym)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for sym, data in ex.map(worker, to_fetch):
            count += 1
            if data:
                cache[sym] = data
            if count % 25 == 0 or count == len(to_fetch):
                with open(CACHE_FILE, "w") as f:
                    json.dump(cache, f, indent=2)
                print(f"Progress: {count}/{len(to_fetch)} processed ({round(time.time() - t0, 1)}s)")

    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

    total_valid = sum(1 for s in all_symbols if s in cache and cache[s].get("eps") is not None)
    print(f"Done! Cache now has {len(cache)} entries ({total_valid}/{len(all_symbols)} valid) in {round(time.time() - t0, 1)}s.")


if __name__ == "__main__":
    run()
