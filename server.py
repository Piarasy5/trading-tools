"""
Trading Dashboard Backend
Serves live market data, scoring, and scanner results to the React frontend.
"""

from flask import Flask, jsonify
from flask_cors import CORS
import yfinance as yf
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import time
import threading
import os

app = Flask(__name__)
CORS(app, resources={r"/api/*": {
    "origins": "*",
    "methods": ["GET","OPTIONS"],
    "allow_headers": ["Content-Type","Authorization"]
}})

# ─── Cache ────────────────────────────────────────────────────────────────
_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = 30  # seconds

def get_cached(key):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (time.time() - entry["ts"]) < CACHE_TTL:
            return entry["data"]
    return None

def set_cached(key, data):
    with _cache_lock:
        _cache[key] = {"data": data, "ts": time.time()}

# ─── EMA helper ───────────────────────────────────────────────────────────
def ema(series, period):
    return series.ewm(span=period, adjust=False).mean()

def rsi(series, period=14):
    delta = series.diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = (-delta.clip(upper=0)).rolling(period).mean()
    rs    = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

# ─── Fetch helpers ────────────────────────────────────────────────────────
def fetch(ticker, period="3mo", interval="1d"):
    try:
        df = yf.download(ticker, period=period, interval=interval,
                         auto_adjust=True, progress=False)
        if df.empty:
            return None
        # Flatten multi-level columns if present
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        return df
    except Exception as e:
        print(f"Error fetching {ticker}: {e}")
        return None

def last(df, col="Close"):
    try:
        return float(df[col].dropna().iloc[-1])
    except:
        return None

# ─── Market Data ─────────────────────────────────────────────────────────
def build_market_data():
    cached = get_cached("market")
    if cached:
        return cached

    print("Fetching market data...")

    # Core tickers
    tickers = ["SPY","QQQ","^VIX","DX-Y.NYB","^TNX",
               "XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU","XLB","XLRE","XLC"]

    data = {}
    for t in tickers:
        df = fetch(t)
        if df is not None:
            data[t] = df

    def safe_last(t, col="Close"):
        if t in data:
            return last(data[t], col)
        return None

    spy_df  = data.get("SPY")
    qqq_df  = data.get("QQQ")
    vix_val = safe_last("^VIX") or 20.0
    dxy_val = safe_last("DX-Y.NYB") or 104.0
    tnx_val = safe_last("^TNX") or 4.3

    # SPY MAs
    spy_close = spy_df["Close"] if spy_df is not None else None
    spy_price = float(spy_close.iloc[-1]) if spy_close is not None else 536.0
    spy_20d   = float(spy_close.rolling(20).mean().iloc[-1]) if spy_close is not None else spy_price
    spy_50d   = float(spy_close.rolling(50).mean().iloc[-1]) if spy_close is not None else spy_price
    spy_200d  = float(spy_close.rolling(200).mean().iloc[-1]) if spy_close is not None else spy_price
    spy_rsi   = float(rsi(spy_close).iloc[-1]) if spy_close is not None else 50.0

    # QQQ
    qqq_close = qqq_df["Close"] if qqq_df is not None else None
    qqq_price = float(qqq_close.iloc[-1]) if qqq_close is not None else 455.0
    qqq_50d   = float(qqq_close.rolling(50).mean().iloc[-1]) if qqq_close is not None else qqq_price

    # VIX trend (5-day slope)
    vix_df = data.get("^VIX")
    if vix_df is not None and len(vix_df) >= 5:
        vix_5d = vix_df["Close"].iloc[-5:]
        vix_slope = float(np.polyfit(range(5), vix_5d.values, 1)[0])
        vix_trend = "Rising" if vix_slope > 0.2 else "Falling" if vix_slope < -0.2 else "Flat"
        vix_pct = float(vix_df["Close"].rank(pct=True).iloc[-1] * 100)
    else:
        vix_trend = "Flat"
        vix_pct   = 35.0

    # Put/Call ratio proxy from VIX regime
    pc_ratio = round(0.7 + (vix_val - 15) * 0.02, 2)
    pc_ratio = max(0.5, min(1.6, pc_ratio))

    # Sector performance
    sector_defs = [
        ("XLK","Technology"),("XLF","Financials"),("XLE","Energy"),
        ("XLV","Health Care"),("XLI","Industrials"),("XLY","Cons Disc"),
        ("XLP","Cons Staples"),("XLU","Utilities"),("XLB","Materials"),
        ("XLRE","Real Estate"),("XLC","Communic."),
    ]
    sectors = []
    for ticker, label in sector_defs:
        df = data.get(ticker)
        if df is not None and len(df) >= 2:
            prev  = float(df["Close"].iloc[-2])
            curr  = float(df["Close"].iloc[-1])
            chg   = round((curr - prev) / prev * 100, 2)
        else:
            chg = 0.0
        sectors.append({"ticker": ticker, "label": label, "chg": chg})
    sectors.sort(key=lambda x: x["chg"], reverse=True)
    positive_sectors = len([s for s in sectors if s["chg"] > 0])
    top_sectors = [s["ticker"] for s in sectors[:5]]

    # Breadth proxies (from SPY internals via % stocks above MAs — approximated)
    # Real breadth needs a data provider; we approximate from SPY vs its own MAs
    breadth_base = 50 + (spy_rsi - 50) * 0.6
    pct_above_50  = round(max(10, min(85, breadth_base + (spy_price - spy_50d) / spy_50d * 200)), 1)
    pct_above_200 = round(max(15, min(88, breadth_base + (spy_price - spy_200d) / spy_200d * 150)), 1)
    pct_above_20  = round(max(10, min(90, breadth_base + (spy_price - spy_20d) / spy_20d * 250)), 1)

    # AD ratio proxy
    ad_ratio = round(1.0 + (positive_sectors - 5.5) * 0.15, 2)
    ad_ratio = max(0.3, min(2.5, ad_ratio))

    # Nasdaq NH/NL proxy
    nasdaq_nh = max(10, round(80 * (pct_above_50 / 70)))
    nasdaq_nl = max(10, round(120 * (1 - pct_above_50 / 80)))

    # Regime
    above_mas = sum([spy_price > spy_20d, spy_price > spy_50d, spy_price > spy_200d])
    if above_mas >= 2 and spy_rsi > 50:
        regime = "Uptrend"
    elif above_mas <= 1:
        regime = "Correcting"
    else:
        regime = "Choppy"

    # FOMC — simple check: flag if it's a Wed in FOMC weeks (approximate)
    today = datetime.now()
    fomc_today = today.weekday() == 2 and today.day in [
        29,30,31,1,2,3,4,5,6,7,8  # rough FOMC meeting days
    ]
    fomc_soon = not fomc_today and today.weekday() in [0, 1] and today.day in [
        27,28,29,30,31,1,2,3,4,5,6,7,8
    ]

    # Fed stance
    if tnx_val > 4.8:
        fed_stance = "Hawkish"
    elif tnx_val > 4.1:
        fed_stance = "Hold"
    else:
        fed_stance = "Dovish"

    # Scoring
    vix_score = int(np.clip(
        (90 if vix_val < 15 else 75 if vix_val < 20 else 55 if vix_val < 25 else 35 if vix_val < 30 else 15) +
        (10 if vix_trend == "Falling" else -10 if vix_trend == "Rising" else 0) +
        (8 if pc_ratio < 0.8 else -10 if pc_ratio > 1.1 else 0),
        0, 100
    ))
    trend_score = int(np.clip(
        (25 if spy_price > spy_200d else 0) + (25 if spy_price > spy_50d else 0) +
        (20 if spy_price > spy_20d else 0) + (15 if qqq_price > qqq_50d else 0) +
        (10 if spy_rsi > 50 else 5 if spy_rsi > 40 else 0) +
        (5 if regime == "Uptrend" else -10 if regime == "Correcting" else 0),
        0, 100
    ))
    breadth_score = int(np.clip(
        (30 if pct_above_50 > 60 else 20 if pct_above_50 > 40 else 10 if pct_above_50 > 25 else 0) +
        (25 if pct_above_200 > 60 else 15 if pct_above_200 > 45 else 5) +
        (25 if ad_ratio > 1.3 else 15 if ad_ratio > 1.0 else 8 if ad_ratio > 0.7 else 0) +
        (20 if nasdaq_nh > nasdaq_nl else 8 if nasdaq_nh > nasdaq_nl * 0.5 else 0),
        0, 100
    ))
    momentum_score = int(np.clip(
        (55 if positive_sectors >= 8 else 38 if positive_sectors >= 5 else 22 if positive_sectors >= 3 else 5) +
        (30 if pct_above_20 > 60 else 20 if pct_above_20 > 40 else 10) +
        (10 if sectors[0]["chg"] > 1 else 5),
        0, 100
    ))
    macro_score = int(np.clip(
        (35 if tnx_val < 4.0 else 25 if tnx_val < 4.5 else 15 if tnx_val < 5.0 else 5) +
        (30 if dxy_val < 100 else 20 if dxy_val < 104 else 10 if dxy_val < 108 else 5) +
        (-20 if fomc_today else -10 if fomc_soon else 15),
        0, 100
    ))
    total_score = round(
        vix_score * 0.25 + momentum_score * 0.25 +
        trend_score * 0.20 + breadth_score * 0.20 + macro_score * 0.10
    )

    breakouts_working = "Yes" if total_score > 70 else "Mixed" if total_score > 52 else "No"
    leaders_holding   = "Yes" if trend_score > 60 else "Partial" if trend_score > 40 else "No"
    pullbacks_bought  = "Yes" if breadth_score > 60 else "Selective" if breadth_score > 40 else "Weak"
    follow_through    = "Strong" if momentum_score > 60 else "Moderate" if momentum_score > 40 else "Weak"
    exec_score = int(np.clip(
        (30 if breakouts_working == "Yes" else 15 if breakouts_working == "Mixed" else 0) +
        (25 if leaders_holding == "Yes" else 12 if leaders_holding == "Partial" else 0) +
        (25 if pullbacks_bought == "Yes" else 12 if pullbacks_bought == "Selective" else 5) +
        (20 if follow_through == "Strong" else 10 if follow_through == "Moderate" else 0),
        0, 100
    ))

    decision = "YES" if total_score >= 80 else "CAUTION" if total_score >= 60 else "NO"
    pos_size = "FULL SIZE" if total_score >= 80 else "HALF SIZE" if total_score >= 60 else "MINIMAL"

    # 1-day changes
    def day_chg(df_):
        if df_ is None or len(df_) < 2:
            return 0.0
        prev = float(df_["Close"].iloc[-2])
        curr = float(df_["Close"].iloc[-1])
        return round((curr - prev) / prev * 100, 2)

    result = {
        "timestamp": datetime.now().isoformat(),
        "spyPrice":   round(spy_price, 2),
        "spyChg":     day_chg(spy_df),
        "spy20d":     round(spy_20d, 2),
        "spy50d":     round(spy_50d, 2),
        "spy200d":    round(spy_200d, 2),
        "spyRSI":     round(spy_rsi, 1),
        "qqq":        round(qqq_price, 2),
        "qqqChg":     day_chg(qqq_df),
        "qqq50d":     round(qqq_50d, 2),
        "vix":        round(vix_val, 2),
        "vixChg":     day_chg(vix_df) if vix_df is not None else 0,
        "vixTrend":   vix_trend,
        "vixPercentile": round(vix_pct, 0),
        "tnyield":    round(tnx_val, 2),
        "tnxChg":     day_chg(data.get("^TNX")),
        "dxy":        round(dxy_val, 2),
        "dxyChg":     day_chg(data.get("DX-Y.NYB")),
        "pcRatio":    pc_ratio,
        "adRatio":    ad_ratio,
        "pctAbove20": pct_above_20,
        "pctAbove50": pct_above_50,
        "pctAbove200":pct_above_200,
        "nasdaqNH":   nasdaq_nh,
        "nasdaqNL":   nasdaq_nl,
        "regime":     regime,
        "fomcToday":  fomc_today,
        "fomcSoon":   fomc_soon,
        "fedStance":  fed_stance,
        "sectors":    sectors,
        "positiveSectors": positive_sectors,
        "topSectors": top_sectors,
        "scores": {
            "vix":      vix_score,
            "trend":    trend_score,
            "breadth":  breadth_score,
            "momentum": momentum_score,
            "macro":    macro_score,
        },
        "totalScore":         total_score,
        "execScore":          exec_score,
        "decision":           decision,
        "posSize":            pos_size,
        "breakoutsWorking":   breakouts_working,
        "leadersHolding":     leaders_holding,
        "pullbacksBought":    pullbacks_bought,
        "followThrough":      follow_through,
    }

    set_cached("market", result)
    return result


# ─── Scanner: 4 EMA Extension Short ──────────────────────────────────────
SCAN_UNIVERSE = [
    "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","JPM","V","UNH",
    "XOM","LLY","JNJ","MA","PG","HD","MRK","ABBV","AVGO","CVX",
    "COST","PEP","KO","ADBE","WMT","MCD","CRM","ACN","TMO","CSCO",
    "ABT","DHR","TXN","NEE","QCOM","IBM","GE","CAT","BA","GS",
    "AMGN","ISRG","DE","KLAC","LRCX","PANW","INTU","SCHW","SPGI","ADI",
    # Small/mid cap high-flyers for 4 EMA scanner
    "SMMT","NKLA","WKHS","CLOV","BNGO","SOUN","IONQ","RCAT","VERB","SHOT",
]

def build_scanner_data():
    cached = get_cached("scanner")
    if cached:
        return cached

    print("Running scanners...")
    results = {
        "ema4Extension": [],
        "accumulation":  [],
        "relStrength":   [],
        "volumeSurge":   [],
    }

    # Fetch SPY for RS calculation baseline
    spy_df = fetch("SPY", period="3mo")
    spy_ret_3m = None
    if spy_df is not None and len(spy_df) >= 60:
        spy_ret_3m = float((spy_df["Close"].iloc[-1] / spy_df["Close"].iloc[-60] - 1) * 100)

    for ticker in SCAN_UNIVERSE:
        try:
            df = fetch(ticker, period="6mo")
            if df is None or len(df) < 50:
                continue

            close = df["Close"]
            high  = df["High"]
            low   = df["Low"]
            vol   = df["Volume"]
            price = float(close.iloc[-1])

            # Skip very low-priced or illiquid
            if price < 5:
                continue
            avg_vol = float(vol.rolling(20).mean().iloc[-1])
            if avg_vol < 500_000:
                continue

            # EMAs
            ema4_series  = ema(close, 4)
            ema8_series  = ema(close, 8)
            ema21_series = ema(close, 21)
            ma20_series  = close.rolling(20).mean()
            ma50_series  = close.rolling(50).mean()
            ma200_series = close.rolling(200).mean()

            ema4_val  = float(ema4_series.iloc[-1])
            ema8_val  = float(ema8_series.iloc[-1])
            ma20_val  = float(ma20_series.iloc[-1])
            ma50_val  = float(ma50_series.iloc[-1])

            # ── 4 EMA Extension Short Scanner ──────────────────────────
            # Count consecutive green days
            green_count = 0
            for i in range(1, min(15, len(df))):
                idx = -(i)
                if float(close.iloc[idx]) > float(close.iloc[idx - 1]):
                    # Check it's a real green day (not a doji — body > 0.1% of price)
                    body_pct = abs(float(close.iloc[idx]) - float(df["Open"].iloc[idx])) / float(close.iloc[idx]) * 100
                    if body_pct < 0.1:
                        break  # doji — reset
                    green_count += 1
                else:
                    break

            if green_count >= 3:
                # All closes must be above 4 EMA
                riding_ema4 = all(
                    float(close.iloc[-(i+1)]) > float(ema4_series.iloc[-(i+1)])
                    for i in range(green_count)
                )
                # 4 EMA must be sloping up
                ema4_slope = float(ema4_series.iloc[-1]) - float(ema4_series.iloc[-4])
                ema4_rising = ema4_slope > 0

                # Extension % above 4 EMA
                ext_pct = round((price - ema4_val) / ema4_val * 100, 1)

                # Today's range vs 5-day avg range
                today_range = float(high.iloc[-1]) - float(low.iloc[-1])
                avg_range5  = float((high - low).iloc[-6:-1].mean())
                range_mult  = round(today_range / avg_range5, 2) if avg_range5 > 0 else 1.0

                # Daily 8 EMA not yet touched today
                daily8_intact = float(low.iloc[-1]) > ema8_val

                # Stage determination
                if riding_ema4 and ema4_rising and range_mult >= 1.5 and ext_pct > 5:
                    stage = "BLOW-OFF"
                    stage_color = "red"
                elif riding_ema4 and ema4_rising:
                    stage = "WATCHING"
                    stage_color = "amber"
                else:
                    stage = "SETUP"
                    stage_color = "gray"

                results["ema4Extension"].append({
                    "ticker":       ticker,
                    "price":        round(price, 2),
                    "greenDays":    green_count,
                    "ema4":         round(ema4_val, 2),
                    "ema8":         round(ema8_val, 2),
                    "extPct":       ext_pct,
                    "rangeMult":    range_mult,
                    "daily8Intact": daily8_intact,
                    "stage":        stage,
                    "stageColor":   stage_color,
                    "avgVol":       int(avg_vol),
                })

            # ── Accumulation Scanner ────────────────────────────────────
            above_20  = price > ma20_val
            above_50  = price > ma50_val
            if above_20 and above_50 and len(df) >= 60:
                # ATR contraction
                atr14_series = (high - low).rolling(14).mean()
                atr14_now    = float(atr14_series.iloc[-1])
                atr14_3m     = float(atr14_series.iloc[-60:-1].mean())
                atr_contr    = round((1 - atr14_now / atr14_3m) * 100) if atr14_3m > 0 else 0

                # Weekly range tightening (last 3 weeks)
                weekly_ranges = []
                for w in range(3):
                    start = -(w + 1) * 5
                    end   = -w * 5 if w > 0 else None
                    wk    = df.iloc[start:end]
                    if len(wk) > 0:
                        wr = (float(wk["High"].max()) - float(wk["Low"].min())) / float(wk["Close"].mean()) * 100
                        weekly_ranges.append(round(wr, 1))
                week_contracting = len(weekly_ranges) == 3 and weekly_ranges[0] < weekly_ranges[1] < weekly_ranges[2]
                wkly_range_pct   = round(weekly_ranges[0], 1) if weekly_ranges else 0

                # Distance from 52W high
                hi52 = float(high.iloc[-252:].max()) if len(df) >= 252 else float(high.max())
                dist_hi = round((1 - price / hi52) * 100, 1)

                # RS rank
                ret_3m = float((close.iloc[-1] / close.iloc[-60] - 1) * 100) if len(df) >= 60 else 0
                rs_rank = round(min(99, max(1, 50 + (ret_3m - (spy_ret_3m or 0)) * 1.5)))

                if atr_contr > 20 and dist_hi < 20 and rs_rank >= 70 and wkly_range_pct < 8:
                    # Classify setup
                    if week_contracting and atr_contr > 40:
                        setup_type = "VCP"
                    elif wkly_range_pct < 5 and dist_hi < 8:
                        setup_type = "Flat base"
                    else:
                        setup_type = "Shelf"

                    # Base length
                    base_days = 0
                    for i in range(1, min(60, len(df))):
                        if abs(float(close.iloc[-i]) - float(close.iloc[-1])) / price < 0.08:
                            base_days += 1
                        else:
                            break
                    if base_days < 10:
                        base_days = 10

                    tf = "2-4w" if base_days <= 20 else "4-8w" if base_days <= 40 else "8-12w"

                    acc_score = int(np.clip(
                        (20 if above_20 else 5) + (20 if above_50 else 5) +
                        (25 if atr_contr > 60 else 15 if atr_contr > 40 else 5) +
                        (20 if week_contracting else 8) +
                        (15 if rs_rank > 85 else 10 if rs_rank > 75 else 5) +
                        (10 if dist_hi < 8 else 6 if dist_hi < 15 else 2),
                        0, 100
                    ))

                    results["accumulation"].append({
                        "ticker":     ticker,
                        "price":      round(price, 2),
                        "ma20":       round(ma20_val, 2),
                        "ma50":       round(ma50_val, 2),
                        "isAbove20":  above_20,
                        "isAbove50":  above_50,
                        "setupType":  setup_type,
                        "tf":         tf,
                        "atrContr":   atr_contr,
                        "wklyRange":  wkly_range_pct,
                        "rsRank":     rs_rank,
                        "distHi":     dist_hi,
                        "accScore":   acc_score,
                        "avgVol":     int(avg_vol),
                    })

            # ── Relative Strength Scanner ───────────────────────────────
            if len(df) >= 60:
                ret_1d = round(float((close.iloc[-1] / close.iloc[-2] - 1) * 100), 2) if len(df) >= 2 else 0
                ret_1w = round(float((close.iloc[-1] / close.iloc[-6] - 1) * 100), 2) if len(df) >= 6 else 0
                ret_1m = round(float((close.iloc[-1] / close.iloc[-21] - 1) * 100), 2) if len(df) >= 21 else 0
                ret_3m_val = round(float((close.iloc[-1] / close.iloc[-60] - 1) * 100), 2)

                rs_rank = round(min(99, max(1, 50 + (ret_3m_val - (spy_ret_3m or 0)) * 1.5)))

                if rs_rank >= 70:
                    results["relStrength"].append({
                        "ticker":  ticker,
                        "price":   round(price, 2),
                        "chg1d":   ret_1d,
                        "chg1w":   ret_1w,
                        "chg1m":   ret_1m,
                        "chg3m":   ret_3m_val,
                        "rsRank":  rs_rank,
                        "avgVol":  int(avg_vol),
                    })

            # ── Volume Surge Scanner ────────────────────────────────────
            today_vol  = float(vol.iloc[-1])
            vol_mult   = round(today_vol / avg_vol, 2) if avg_vol > 0 else 0
            price_chg  = round(float((close.iloc[-1] / close.iloc[-2] - 1) * 100), 2) if len(df) >= 2 else 0
            close_pos  = (float(close.iloc[-1]) - float(low.iloc[-1])) / (float(high.iloc[-1]) - float(low.iloc[-1])) if float(high.iloc[-1]) > float(low.iloc[-1]) else 0.5

            if vol_mult >= 2.0 and close_pos >= 0.5:
                results["volumeSurge"].append({
                    "ticker":   ticker,
                    "price":    round(price, 2),
                    "chg":      price_chg,
                    "volToday": int(today_vol),
                    "volAvg":   int(avg_vol),
                    "volMult":  vol_mult,
                })

        except Exception as e:
            print(f"Scanner error for {ticker}: {e}")
            continue

    # Sort results
    results["ema4Extension"].sort(key=lambda x: (x["stage"] == "BLOW-OFF", x["greenDays"]), reverse=True)
    results["accumulation"].sort(key=lambda x: x["accScore"], reverse=True)
    results["relStrength"].sort(key=lambda x: x["rsRank"], reverse=True)
    results["volumeSurge"].sort(key=lambda x: x["volMult"], reverse=True)

    set_cached("scanner", results)
    return results


# ─── Routes ───────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return jsonify({"status": "ok", "message": "Trading Dashboard API running"})

@app.route("/api/market")
def market():
    try:
        return jsonify(build_market_data())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/scanner")
def scanner():
    try:
        return jsonify(build_scanner_data())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/all")
def all_data():
    try:
        market = build_market_data()
        scans  = build_scanner_data()
        return jsonify({**market, "scanners": scans})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/health")
def health():
    return jsonify({
        "status":    "ok",
        "timestamp": datetime.now().isoformat(),
        "cache_keys": list(_cache.keys()),
    })

# ─── Keep-alive (pings self every 10 min to prevent Render sleep) ─────────
def keep_alive():
    import urllib.request
    while True:
        time.sleep(600)  # every 10 minutes
        try:
            url = os.environ.get("RENDER_EXTERNAL_URL","")
            if url:
                urllib.request.urlopen(f"{url}/api/health", timeout=10)
                print("Keep-alive ping sent")
        except Exception as e:
            print(f"Keep-alive ping failed: {e}")

# ─── Run ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Start keep-alive thread
    t = threading.Thread(target=keep_alive, daemon=True)
    t.start()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
