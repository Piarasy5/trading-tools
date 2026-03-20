import { useState, useEffect, useCallback, useRef } from "react";

// ─── Helpers ───────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmtTime = () => new Date().toLocaleTimeString("en-US", { hour12: false });
const fmtDate = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
const scoreColor = (s) => s >= 70 ? "#00d4aa" : s >= 40 ? "#f5a623" : "#e63946";
const chgColor   = (n) => n >= 0 ? "#00d4aa" : "#e63946";
const decColor   = (d) => d === "YES" ? "#00d4aa" : d === "CAUTION" ? "#f5a623" : "#e63946";

// ─── Large-cap universe for scanner simulation ─────────────────────────────
const LARGE_CAPS = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","BRK","JPM","V",
  "UNH","XOM","LLY","JNJ","MA","PG","HD","MRK","ABBV","AVGO",
  "CVX","COST","PEP","KO","ADBE","WMT","MCD","CRM","ACN","TMO",
  "CSCO","ABT","DHR","LIN","NEE","TXN","VZ","PM","UPS","HON",
  "AMGN","QCOM","IBM","GE","CAT","BA","GS","MS","SCHW","INTU",
  "ISRG","DE","AMT","SHW","ZTS","ELV","MDT","ADI","REGN","GILD",
  "PLD","MMC","ADP","SPGI","ICE","KLAC","LRCX","PANW","SNPS","CDNS",
];

const SECTORS = {
  AAPL:"XLK",MSFT:"XLK",NVDA:"XLK",GOOGL:"XLK",META:"XLK",ADBE:"XLK",
  AVGO:"XLK",CSCO:"XLK",TXN:"XLK",QCOM:"XLK",IBM:"XLK",INTU:"XLK",
  ADI:"XLK",KLAC:"XLK",LRCX:"XLK",PANW:"XLK",SNPS:"XLK",CDNS:"XLK",
  AMZN:"XLY",TSLA:"XLY",HD:"XLY",MCD:"XLY",
  JPM:"XLF",V:"XLF",MA:"XLF",GS:"XLF",MS:"XLF",SCHW:"XLF",ICE:"XLF",SPGI:"XLF",MMC:"XLF",
  UNH:"XLV",JNJ:"XLV",LLY:"XLV",MRK:"XLV",ABBV:"XLV",ABT:"XLV",TMO:"XLV",
  DHR:"XLV",AMGN:"XLV",ISRG:"XLV",ZTS:"XLV",MDT:"XLV",REGN:"XLV",GILD:"XLV",ELV:"XLV",
  XOM:"XLE",CVX:"XLE",
  PG:"XLP",PEP:"XLP",KO:"XLP",WMT:"XLP",COST:"XLP",PM:"XLP",
  HON:"XLI",UPS:"XLI",GE:"XLI",CAT:"XLI",BA:"XLI",DE:"XLI",
  NEE:"XLU",AMT:"XLRE",PLD:"XLRE",
  LIN:"XLB",SHW:"XLB",
  ACN:"XLK",CRM:"XLK",ADP:"XLK",
  VZ:"XLC",BRK:"XLF",
};

// ─── Market data generator ─────────────────────────────────────────────────
function generateMarketData() {
  const rand = (base, variance) => base + (Math.random() - 0.5) * variance;
  const vix        = clamp(rand(22, 10), 10, 45);
  const spyPrice   = clamp(rand(536, 24), 480, 600);
  const spy20d     = spyPrice * rand(1.005, 0.05);
  const spy50d     = spyPrice * rand(1.02,  0.05);
  const spy200d    = spyPrice * rand(0.93,  0.05);
  const qqq        = clamp(rand(455, 20), 400, 520);
  const qqq50d     = qqq * rand(1.015, 0.04);
  const spyRSI     = clamp(rand(46, 22), 20, 80);
  const tnyield    = clamp(rand(4.35, 0.5), 3.5, 5.5);
  const dxy        = clamp(rand(104, 4), 97, 112);
  const pcRatio    = clamp(rand(0.9, 0.35), 0.55, 1.5);
  const adRatio    = clamp(rand(0.9, 0.7), 0.3, 2.2);
  const pctAbove20 = clamp(rand(38, 32), 10, 90);
  const pctAbove50 = clamp(rand(31, 28), 8, 85);
  const pctAbove200= clamp(rand(50, 26), 15, 88);
  const nasdaqNH   = Math.round(rand(60, 90));
  const nasdaqNL   = Math.round(rand(130, 90));
  const vixPercentile = clamp(rand(35, 22), 5, 99);
  const vixTrend   = Math.random() > 0.35 ? "Rising" : Math.random() > 0.5 ? "Falling" : "Flat";

  const sectorDefs = [
    {ticker:"XLK",label:"Technology"},{ticker:"XLF",label:"Financials"},
    {ticker:"XLE",label:"Energy"},{ticker:"XLV",label:"Health Care"},
    {ticker:"XLI",label:"Industrials"},{ticker:"XLY",label:"Cons Disc"},
    {ticker:"XLP",label:"Cons Staples"},{ticker:"XLU",label:"Utilities"},
    {ticker:"XLB",label:"Materials"},{ticker:"XLRE",label:"Real Estate"},
    {ticker:"XLC",label:"Communic."},
  ];
  const sectors = sectorDefs.map(s => ({...s, chg: clamp(rand(-1.0, 3.5), -4, 3)}))
    .sort((a,b) => b.chg - a.chg);
  const positiveSectors = sectors.filter(s => s.chg > 0).length;
  const topSectors = sectors.slice(0,5).map(s => s.ticker);

  const aboveMAs = [spyPrice>spy20d, spyPrice>spy50d, spyPrice>spy200d].filter(Boolean).length;
  const regime   = aboveMAs >= 2 && spyRSI > 50 ? "Uptrend" : aboveMAs <= 1 ? "Correcting" : "Choppy";
  const fomcToday = Math.random() > 0.82;
  const fomcSoon  = !fomcToday && Math.random() > 0.78;

  // Scoring
  const vixScore = clamp(Math.round(
    (vix<15?90:vix<20?75:vix<25?55:vix<30?35:15) +
    (vixTrend==="Falling"?10:vixTrend==="Rising"?-10:0) +
    (pcRatio<0.8?8:pcRatio>1.1?-10:0)
  ),0,100);
  const trendScore = clamp(Math.round(
    (spyPrice>spy200d?25:0)+(spyPrice>spy50d?25:0)+(spyPrice>spy20d?20:0)+
    (qqq>qqq50d?15:0)+(spyRSI>50?10:spyRSI>40?5:0)+
    (regime==="Uptrend"?5:regime==="Correcting"?-10:0)
  ),0,100);
  const breadthScore = clamp(Math.round(
    (pctAbove50>60?30:pctAbove50>40?20:pctAbove50>25?10:0)+
    (pctAbove200>60?25:pctAbove200>45?15:5)+
    (adRatio>1.3?25:adRatio>1.0?15:adRatio>0.7?8:0)+
    (nasdaqNH>nasdaqNL?20:nasdaqNH>nasdaqNL*0.5?8:0)
  ),0,100);
  const momentumScore = clamp(Math.round(
    (positiveSectors>=8?55:positiveSectors>=5?38:positiveSectors>=3?22:5)+
    (pctAbove20>60?30:pctAbove20>40?20:10)+(sectors[0].chg>1?10:5)
  ),0,100);
  const macroScore = clamp(Math.round(
    (tnyield<4.0?35:tnyield<4.5?25:tnyield<5.0?15:5)+
    (dxy<100?30:dxy<104?20:dxy<108?10:5)+
    (fomcToday?-20:fomcSoon?-10:15)
  ),0,100);
  const totalScore = Math.round(
    vixScore*0.25 + momentumScore*0.25 + trendScore*0.20 + breadthScore*0.20 + macroScore*0.10
  );

  const breakoutsWorking  = totalScore>70?"Yes":totalScore>52?"Mixed":"No";
  const leadersHolding    = trendScore>60?"Yes":trendScore>40?"Partial":"No";
  const pullbacksBought   = breadthScore>60?"Yes":breadthScore>40?"Selective":"Weak";
  const followThrough     = momentumScore>60?"Strong":momentumScore>40?"Moderate":"Weak";
  const execScore = clamp(Math.round(
    (breakoutsWorking==="Yes"?30:breakoutsWorking==="Mixed"?15:0)+
    (leadersHolding==="Yes"?25:leadersHolding==="Partial"?12:0)+
    (pullbacksBought==="Yes"?25:pullbacksBought==="Selective"?12:5)+
    (followThrough==="Strong"?20:followThrough==="Moderate"?10:0)
  ),0,100);

  const decision = totalScore>=80?"YES":totalScore>=60?"CAUTION":"NO";
  const posSize  = totalScore>=80?"FULL SIZE":totalScore>=60?"HALF SIZE":"MINIMAL";
  const fedStance= tnyield>4.8?"Hawkish":tnyield>4.1?"Hold":"Dovish";

  return {
    vix,spyPrice,spy20d,spy50d,spy200d,qqq,qqq50d,spyRSI,
    tnyield,dxy,pcRatio,adRatio,pctAbove20,pctAbove50,pctAbove200,
    nasdaqNH,nasdaqNL,vixPercentile,vixTrend,
    sectors,positiveSectors,topSectors,regime,fomcToday,fomcSoon,
    scores:{vix:vixScore,trend:trendScore,breadth:breadthScore,momentum:momentumScore,macro:macroScore},
    totalScore,execScore,decision,posSize,fedStance,
    breakoutsWorking,leadersHolding,pullbacksBought,followThrough,
    spyChg:rand(-1.3,2.6),qqqChg:rand(-1.5,2.8),
    vixChg:rand(2,10)*(vixTrend==="Rising"?1:-0.5),
    dxyChg:rand(-0.1,0.5),tnxChg:rand(-0.05,0.2),
  };
}

// ─── Scanner data generators ───────────────────────────────────────────────
function generateAccumulationScans(topSectors) {
  const rand = (b,v) => b + (Math.random()-0.5)*v;
  const timeframes = ["2-4w","4-8w","8-12w"];

  return LARGE_CAPS
    .filter(() => Math.random() > 0.55)
    .slice(0,18)
    .map(ticker => {
      const price     = clamp(rand(180, 300), 25, 900);
      const ma20      = price * rand(0.995, 0.03);
      const ma50      = price * rand(0.985, 0.03);
      const hi52w     = price * rand(1.08, 0.12);
      const atr14     = clamp(rand(3.5, 4), 0.8, 18);
      const atrPct    = (atr14 / price * 100);
      const atrContraction = clamp(rand(68, 30), 20, 95); // % contracted vs 3m avg
      const weeklyRangeContraction = clamp(rand(62, 28), 15, 92);
      const volumeAvg = Math.round(rand(1800, 2400)) * 1000;
      const volumeCur = Math.round(volumeAvg * rand(0.72, 0.4));
      const volContraction = Math.round((1 - volumeCur/volumeAvg)*100);
      const rsRank    = clamp(Math.round(rand(78, 20)), 70, 99);
      const distFromHigh = Math.round((1 - price/hi52w)*100);
      const tf        = timeframes[Math.floor(Math.random()*3)];
      const sector    = SECTORS[ticker] || "XLK";
      const inTopSector = topSectors.includes(sector);

      // Accumulation score: higher = better setup
      const accScore = clamp(Math.round(
        (price > ma20 ? 20 : 5) +
        (price > ma50 ? 20 : 5) +
        (atrContraction > 60 ? 25 : atrContraction > 40 ? 15 : 5) +
        (weeklyRangeContraction > 55 ? 20 : weeklyRangeContraction > 35 ? 12 : 4) +
        (rsRank > 85 ? 15 : rsRank > 75 ? 10 : 5) +
        (inTopSector ? 10 : 0) +
        (distFromHigh < 8 ? 10 : distFromHigh < 15 ? 6 : 2) +
        (volContraction > 30 ? 5 : 0)
      ),0,100);

      const setupType = weeklyRangeContraction > 65 && atrContraction > 65
        ? "VCP" : distFromHigh < 8 && volContraction > 25
        ? "Flat base" : "Shelf";

      return {
        ticker, price, ma20, ma50, hi52w, atr14, atrPct,
        atrContraction, weeklyRangeContraction, volumeAvg, volumeCur,
        volContraction, rsRank, distFromHigh, tf, sector, inTopSector,
        accScore, setupType, isAbove20: price > ma20, isAbove50: price > ma50,
      };
    })
    .sort((a,b) => b.accScore - a.accScore);
}

function generateRSScans(topSectors) {
  const rand = (b,v) => b + (Math.random()-0.5)*v;
  return LARGE_CAPS.filter(()=>Math.random()>0.6).slice(0,14).map(ticker => {
    const price  = clamp(rand(180,300), 25, 900);
    const chg1d  = rand(-0.3, 2.8);
    const chg1w  = rand(0.5, 4.5);
    const chg1m  = rand(2, 12);
    const chg3m  = rand(5, 30);
    const rsRank = clamp(Math.round(rand(82, 16)), 70, 99);
    const vol    = Math.round(rand(2200,3000))*1000;
    const sector = SECTORS[ticker]||"XLK";
    return { ticker,price,chg1d,chg1w,chg1m,chg3m,rsRank,vol,sector,
      inTopSector: topSectors.includes(sector) };
  }).sort((a,b)=>b.rsRank-a.rsRank);
}

function generateVolScans() {
  const rand = (b,v) => b + (Math.random()-0.5)*v;
  return LARGE_CAPS.filter(()=>Math.random()>0.65).slice(0,12).map(ticker => {
    const price  = clamp(rand(180,300), 25, 900);
    const chg    = rand(-0.5, 4);
    const volAvg = Math.round(rand(1500,2500))*1000;
    const volMult= clamp(rand(2.8, 2.2), 1.5, 7);
    const volCur = Math.round(volAvg * volMult);
    const sector = SECTORS[ticker]||"XLK";
    return { ticker,price,chg,volAvg,volCur,volMult,sector };
  }).sort((a,b)=>b.volMult-a.volMult);
}

function generateGapperScans() {
  const rand = (b,v) => b + (Math.random()-0.5)*v;
  return LARGE_CAPS.filter(()=>Math.random()>0.75).slice(0,10).map(ticker => {
    const price    = clamp(rand(180,300), 25, 900);
    const gapPct   = clamp(rand(4.5, 4), 1.5, 12);
    const daysHeld = Math.floor(rand(2.5, 2));
    const ema4     = price * rand(0.97, 0.03);
    const aboveEma = price > ema4;
    const chgToday = rand(0.2, 2.5);
    const vol      = Math.round(rand(2000,4000))*1000;
    const sector   = SECTORS[ticker]||"XLK";
    return { ticker,price,gapPct,daysHeld,ema4,aboveEma,chgToday,vol,sector };
  }).sort((a,b)=>b.gapPct-a.gapPct);
}

// ─── UI Primitives ────────────────────────────────────────────────────────
const P = ({children,style={}}) => (
  <div style={{background:"#060e18",border:"1px solid #182535",padding:"12px 14px",borderRadius:1,...style}}>
    {children}
  </div>
);
function ScoreBar({score,height=3}) {
  return (
    <div style={{background:"#0d1820",borderRadius:1,height,width:"100%",overflow:"hidden",marginTop:4}}>
      <div style={{width:`${score}%`,height:"100%",background:scoreColor(score),transition:"width 0.9s ease"}}/>
    </div>
  );
}
function PanelHead({icon,label,score}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
      <span style={{fontFamily:"monospace",fontSize:10,color:"#5a7a8a",letterSpacing:2}}>{icon} {label}</span>
      <span style={{fontFamily:"monospace",fontSize:17,fontWeight:"bold",color:scoreColor(score)}}>{score}</span>
    </div>
  );
}
function Row({label,val,tag,tc}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"2.5px 0",borderBottom:"1px solid #0a1520"}}>
      <span style={{fontFamily:"monospace",fontSize:10.5,color:"#4a6a7a",display:"flex",alignItems:"center",gap:5}}>
        <span style={{width:5,height:5,borderRadius:"50%",background:"#1a3040",display:"inline-block",flexShrink:0}}/>
        {label}
      </span>
      <span style={{fontFamily:"monospace",fontSize:10.5,display:"flex",gap:7,alignItems:"center"}}>
        <span style={{color:"#c0d0e0"}}>{val}</span>
        {tag&&<span style={{color:tc||"#4a6a7a",fontSize:10}}>{tag}</span>}
      </span>
    </div>
  );
}
function CircleScore({score,size=96}) {
  const r=size/2-9,circ=2*Math.PI*r,color=scoreColor(score);
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#141f2c" strokeWidth={7}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={circ} strokeDashoffset={circ*(1-score/100)}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{transition:"stroke-dashoffset 1s ease,stroke 0.5s"}}/>
      <text x={size/2} y={size/2-5} textAnchor="middle" fill={color} fontSize={22} fontFamily="monospace" fontWeight="bold">{score}</text>
      <text x={size/2} y={size/2+13} textAnchor="middle" fill="#3a5a6a" fontSize={9} fontFamily="monospace">/ 100</text>
    </svg>
  );
}

// ─── Ticker ───────────────────────────────────────────────────────────────
function TickerBar({d}) {
  const items=[
    {label:"SPY",val:d.spyPrice.toFixed(2),chg:d.spyChg},
    {label:"QQQ",val:d.qqq.toFixed(2),chg:d.qqqChg},
    {label:"VIX",val:d.vix.toFixed(2),chg:d.vixChg},
    {label:"DXY",val:d.dxy.toFixed(2),chg:d.dxyChg},
    {label:"TNX",val:d.tnyield.toFixed(2),chg:d.tnxChg},
    ...d.sectors.slice(0,6).map(s=>({label:s.ticker,val:"",chg:s.chg})),
  ];
  const doubled=[...items,...items];
  return (
    <div style={{borderBottom:"1px solid #1a2535",background:"#040c14",overflow:"hidden",height:30,display:"flex",alignItems:"center"}}>
      <div style={{display:"flex",animation:"ticker 45s linear infinite",whiteSpace:"nowrap"}}>
        {doubled.map((it,i)=>(
          <span key={i} style={{marginRight:28,fontFamily:"monospace",fontSize:11.5}}>
            <span style={{color:"#9aacbc",marginRight:4}}>{it.label}</span>
            {it.val&&<span style={{color:"#c8d8e8",marginRight:4}}>{it.val}</span>}
            <span style={{color:chgColor(it.chg)}}>{it.chg>=0?"+":""}{it.chg.toFixed(2)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Accumulation Scanner ─────────────────────────────────────────────────
function AccumulationScanner({data,topSectors}) {
  const [tfFilter,setTfFilter]=useState("All");
  const [typeFilter,setTypeFilter]=useState("All");
  const [sortBy,setSortBy]=useState("score");
  const tfs=["All","2-4w","4-8w","8-12w"];
  const types=["All","VCP","Flat base","Shelf"];

  const filtered = data
    .filter(r=>(tfFilter==="All"||r.tf===tfFilter)&&(typeFilter==="All"||r.setupType===typeFilter))
    .sort((a,b)=>sortBy==="score"?b.accScore-a.accScore:sortBy==="rs"?b.rsRank-a.rsRank:b.atrContraction-a.atrContraction);

  const setupColor = t => t==="VCP"?"#00d4aa":t==="Flat base"?"#f5a623":"#8899aa";

  return (
    <div>
      {/* Controls */}
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontFamily:"monospace",fontSize:10,color:"#3a5a6a"}}>TIMEFRAME:</span>
        {tfs.map(t=>(
          <button key={t} onClick={()=>setTfFilter(t)} style={{
            background:tfFilter===t?"#102030":"transparent",
            border:`1px solid ${tfFilter===t?"#00d4aa":"#182535"}`,
            color:tfFilter===t?"#00d4aa":"#4a6a7a",
            fontFamily:"monospace",fontSize:10,padding:"2px 10px",cursor:"pointer"
          }}>{t}</button>
        ))}
        <span style={{fontFamily:"monospace",fontSize:10,color:"#3a5a6a",marginLeft:8}}>SETUP:</span>
        {types.map(t=>(
          <button key={t} onClick={()=>setTypeFilter(t)} style={{
            background:typeFilter===t?"#102030":"transparent",
            border:`1px solid ${typeFilter===t?"#f5a623":"#182535"}`,
            color:typeFilter===t?"#f5a623":"#4a6a7a",
            fontFamily:"monospace",fontSize:10,padding:"2px 10px",cursor:"pointer"
          }}>{t}</button>
        ))}
        <span style={{fontFamily:"monospace",fontSize:10,color:"#3a5a6a",marginLeft:8}}>SORT:</span>
        {[["score","Acc Score"],["rs","RS Rank"],["atr","ATR Contr."]].map(([k,l])=>(
          <button key={k} onClick={()=>setSortBy(k)} style={{
            background:sortBy===k?"#102030":"transparent",
            border:`1px solid ${sortBy===k?"#8899aa":"#182535"}`,
            color:sortBy===k?"#c0d0e0":"#4a6a7a",
            fontFamily:"monospace",fontSize:10,padding:"2px 10px",cursor:"pointer"
          }}>{l}</button>
        ))}
      </div>

      {/* Column headers */}
      <div style={{display:"grid",gridTemplateColumns:"60px 60px 55px 55px 70px 65px 65px 60px 55px 55px 50px",gap:"0 8px",padding:"4px 8px",borderBottom:"1px solid #182535",marginBottom:4}}>
        {["Ticker","Price","MA20","MA50","Setup","Timeframe","ATR Contr.","Wkly Rng","RS Rank","Dist Hi","Score"].map(h=>(
          <span key={h} style={{fontFamily:"monospace",fontSize:9,color:"#3a5a6a",letterSpacing:0.5}}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:340,overflowY:"auto"}}>
        {filtered.map((r,i)=>(
          <div key={r.ticker} style={{
            display:"grid",gridTemplateColumns:"60px 60px 55px 55px 70px 65px 65px 60px 55px 55px 50px",
            gap:"0 8px",padding:"5px 8px",
            background:i%2===0?"#040c14":"#060e18",
            borderLeft:`2px solid ${setupColor(r.setupType)}`,
            alignItems:"center"
          }}>
            <span style={{fontFamily:"monospace",fontSize:11,color:"#e0eaf4",fontWeight:"bold"}}>
              {r.ticker}
              {r.inTopSector&&<span style={{color:"#f5a623",fontSize:9,marginLeft:3}}>★</span>}
            </span>
            <span style={{fontFamily:"monospace",fontSize:10.5,color:"#c0d0e0"}}>${r.price.toFixed(1)}</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:r.isAbove20?"#00d4aa":"#e63946"}}>
              {r.isAbove20?"▲ Above":"▼ Below"}
            </span>
            <span style={{fontFamily:"monospace",fontSize:10,color:r.isAbove50?"#00d4aa":"#e63946"}}>
              {r.isAbove50?"▲ Above":"▼ Below"}
            </span>
            <span style={{fontFamily:"monospace",fontSize:10,color:setupColor(r.setupType),
              background:`${setupColor(r.setupType)}18`,padding:"1px 5px",textAlign:"center"}}>
              {r.setupType}
            </span>
            <span style={{fontFamily:"monospace",fontSize:10,color:"#8899aa"}}>{r.tf}</span>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{flex:1,background:"#0d1820",height:8,borderRadius:1,overflow:"hidden"}}>
                <div style={{width:`${r.atrContraction}%`,height:"100%",background:r.atrContraction>60?"#00d4aa":"#f5a623"}}/>
              </div>
              <span style={{fontFamily:"monospace",fontSize:9,color:r.atrContraction>60?"#00d4aa":"#f5a623",width:26,textAlign:"right"}}>{r.atrContraction}%</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{flex:1,background:"#0d1820",height:8,borderRadius:1,overflow:"hidden"}}>
                <div style={{width:`${r.weeklyRangeContraction}%`,height:"100%",background:r.weeklyRangeContraction>60?"#00d4aa":"#f5a623"}}/>
              </div>
              <span style={{fontFamily:"monospace",fontSize:9,color:r.weeklyRangeContraction>60?"#00d4aa":"#f5a623",width:26,textAlign:"right"}}>{r.weeklyRangeContraction}%</span>
            </div>
            <span style={{fontFamily:"monospace",fontSize:10.5,color:r.rsRank>85?"#00d4aa":"#f5a623"}}>{r.rsRank}</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:r.distFromHigh<10?"#00d4aa":r.distFromHigh<15?"#f5a623":"#8899aa"}}>
              -{r.distFromHigh}%
            </span>
            <span style={{fontFamily:"monospace",fontSize:11,fontWeight:"bold",color:scoreColor(r.accScore)}}>{r.accScore}</span>
          </div>
        ))}
        {filtered.length===0&&(
          <div style={{fontFamily:"monospace",fontSize:11,color:"#3a5a6a",padding:"20px 8px",textAlign:"center"}}>
            No results for current filters
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{display:"flex",gap:16,marginTop:10,paddingTop:8,borderTop:"1px solid #182535",flexWrap:"wrap"}}>
        {[["VCP","Volatility contraction pattern — narrowing weekly ranges","#00d4aa"],
          ["Flat base","Low-volatility shelf near highs — institutional accumulation","#f5a623"],
          ["Shelf","Sideways drift above MAs — coiling before expansion","#8899aa"]].map(([t,d,c])=>(
          <div key={t} style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:8,height:8,background:c,borderRadius:1}}/>
            <span style={{fontFamily:"monospace",fontSize:9,color:"#4a6a7a"}}><span style={{color:c}}>{t}</span> — {d}</span>
          </div>
        ))}
        <span style={{fontFamily:"monospace",fontSize:9,color:"#4a6a7a",marginLeft:"auto"}}>★ = top-5 sector</span>
      </div>
    </div>
  );
}

// ─── RS Scanner ───────────────────────────────────────────────────────────
function RSScanner({data}) {
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"65px 60px 55px 55px 60px 70px 55px 80px",gap:"0 8px",padding:"4px 8px",borderBottom:"1px solid #182535",marginBottom:4}}>
        {["Ticker","Price","1D","1W","1M","3M","RS Rank","Sector"].map(h=>(
          <span key={h} style={{fontFamily:"monospace",fontSize:9,color:"#3a5a6a"}}>{h}</span>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:340,overflowY:"auto"}}>
        {data.map((r,i)=>(
          <div key={r.ticker} style={{
            display:"grid",gridTemplateColumns:"65px 60px 55px 55px 60px 70px 55px 80px",
            gap:"0 8px",padding:"5px 8px",
            background:i%2===0?"#040c14":"#060e18",
            borderLeft:`2px solid ${r.inTopSector?"#f5a623":"#1a3040"}`,
            alignItems:"center"
          }}>
            <span style={{fontFamily:"monospace",fontSize:11,color:"#e0eaf4",fontWeight:"bold"}}>{r.ticker}</span>
            <span style={{fontFamily:"monospace",fontSize:10.5,color:"#c0d0e0"}}>${r.price.toFixed(1)}</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:chgColor(r.chg1d)}}>{r.chg1d>=0?"+":""}{r.chg1d.toFixed(1)}%</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:chgColor(r.chg1w)}}>{r.chg1w>=0?"+":""}{r.chg1w.toFixed(1)}%</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:chgColor(r.chg1m)}}>{r.chg1m>=0?"+":""}{r.chg1m.toFixed(1)}%</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:chgColor(r.chg3m),fontWeight:"bold"}}>{r.chg3m>=0?"+":""}{r.chg3m.toFixed(1)}%</span>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:28,background:"#0d1820",height:6,borderRadius:1,overflow:"hidden"}}>
                <div style={{width:`${r.rsRank}%`,height:"100%",background:r.rsRank>85?"#00d4aa":"#f5a623"}}/>
              </div>
              <span style={{fontFamily:"monospace",fontSize:10,color:r.rsRank>85?"#00d4aa":"#f5a623"}}>{r.rsRank}</span>
            </div>
            <span style={{fontFamily:"monospace",fontSize:9,color:r.inTopSector?"#f5a623":"#4a6a7a"}}>{r.sector}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Volume Scanner ───────────────────────────────────────────────────────
function VolumeScanner({data}) {
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"65px 60px 65px 80px 80px 70px 70px",gap:"0 8px",padding:"4px 8px",borderBottom:"1px solid #182535",marginBottom:4}}>
        {["Ticker","Price","Change","Vol Today","Vol Avg 20d","Multiplier","Sector"].map(h=>(
          <span key={h} style={{fontFamily:"monospace",fontSize:9,color:"#3a5a6a"}}>{h}</span>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:340,overflowY:"auto"}}>
        {data.map((r,i)=>(
          <div key={r.ticker} style={{
            display:"grid",gridTemplateColumns:"65px 60px 65px 80px 80px 70px 70px",
            gap:"0 8px",padding:"5px 8px",
            background:i%2===0?"#040c14":"#060e18",
            borderLeft:`2px solid ${r.volMult>4?"#e63946":r.volMult>2.5?"#f5a623":"#1a3040"}`,
            alignItems:"center"
          }}>
            <span style={{fontFamily:"monospace",fontSize:11,color:"#e0eaf4",fontWeight:"bold"}}>{r.ticker}</span>
            <span style={{fontFamily:"monospace",fontSize:10.5,color:"#c0d0e0"}}>${r.price.toFixed(1)}</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:chgColor(r.chg)}}>{r.chg>=0?"+":""}{r.chg.toFixed(2)}%</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:"#c0d0e0"}}>{(r.volCur/1e6).toFixed(1)}M</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:"#5a7a8a"}}>{(r.volAvg/1e6).toFixed(1)}M</span>
            <span style={{fontFamily:"monospace",fontSize:11,fontWeight:"bold",color:r.volMult>4?"#e63946":r.volMult>2.5?"#f5a623":"#c0d0e0"}}>
              {r.volMult.toFixed(1)}x
            </span>
            <span style={{fontFamily:"monospace",fontSize:9,color:"#4a6a7a"}}>{r.sector}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Gapper Scanner ───────────────────────────────────────────────────────
function GapperScanner({data}) {
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"65px 60px 65px 60px 60px 55px 70px 70px",gap:"0 8px",padding:"4px 8px",borderBottom:"1px solid #182535",marginBottom:4}}>
        {["Ticker","Price","Gap %","Days Held","4 EMA","Above?","Today","Sector"].map(h=>(
          <span key={h} style={{fontFamily:"monospace",fontSize:9,color:"#3a5a6a"}}>{h}</span>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:340,overflowY:"auto"}}>
        {data.map((r,i)=>(
          <div key={r.ticker} style={{
            display:"grid",gridTemplateColumns:"65px 60px 65px 60px 60px 55px 70px 70px",
            gap:"0 8px",padding:"5px 8px",
            background:i%2===0?"#040c14":"#060e18",
            borderLeft:`2px solid ${r.aboveEma&&r.gapPct>5?"#00d4aa":r.aboveEma?"#f5a623":"#e63946"}`,
            alignItems:"center"
          }}>
            <span style={{fontFamily:"monospace",fontSize:11,color:"#e0eaf4",fontWeight:"bold"}}>{r.ticker}</span>
            <span style={{fontFamily:"monospace",fontSize:10.5,color:"#c0d0e0"}}>${r.price.toFixed(1)}</span>
            <span style={{fontFamily:"monospace",fontSize:11,fontWeight:"bold",color:chgColor(r.gapPct)}}>+{r.gapPct.toFixed(1)}%</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:"#8899aa"}}>Day {r.daysHeld}</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:"#5a7a8a"}}>${r.ema4.toFixed(1)}</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:r.aboveEma?"#00d4aa":"#e63946"}}>{r.aboveEma?"▲ Yes":"▼ No"}</span>
            <span style={{fontFamily:"monospace",fontSize:10,color:chgColor(r.chgToday)}}>{r.chgToday>=0?"+":""}{r.chgToday.toFixed(2)}%</span>
            <span style={{fontFamily:"monospace",fontSize:9,color:"#4a6a7a"}}>{r.sector}</span>
          </div>
        ))}
      </div>
      <div style={{marginTop:10,padding:"6px 8px",background:"#0a1420",border:"1px solid #182535",fontFamily:"monospace",fontSize:10,color:"#4a6a7a"}}>
        Multi-day gapper setup: gap up D1 → holds above 4 EMA on D2/D3 → extended but not overextended. Green border = prime setup.
      </div>
    </div>
  );
}

// ─── Scanner Panel ────────────────────────────────────────────────────────
function ScannerPanel({d, liveScans=null}) {
  const [activeTab,setActiveTab]=useState("accumulation");
  const [scans,setScans]=useState(null);
  const tabs=[
    {id:"accumulation",label:"🔍 Accumulation",desc:"VCP · Flat base · Shelf"},
    {id:"rs",label:"⚡ Rel. Strength",desc:"RS rank > 70"},
    {id:"volume",label:"📊 Volume Surge",desc:"2x+ avg volume"},
    {id:"gapper",label:"🚀 Multi-Day Gapper",desc:"Gap + 4 EMA ext."},
  ];

  const runScan = useCallback(() => {
    if(liveScans){
      // Map live API field names to component expected format
      setScans({
        accumulation: liveScans.accumulation  || generateAccumulationScans(d.topSectors),
        rs:           liveScans.relStrength   || generateRSScans(d.topSectors),
        volume:       liveScans.volumeSurge   || generateVolScans(),
        gapper:       liveScans.ema4Extension || generateGapperScans(),
      });
    } else {
      setScans({
        accumulation: generateAccumulationScans(d.topSectors),
        rs:           generateRSScans(d.topSectors),
        volume:       generateVolScans(),
        gapper:       generateGapperScans(),
      });
    }
  },[d.topSectors, liveScans]);

  useEffect(()=>{ runScan(); },[d.totalScore, liveScans]);

  if(!scans) return (
    <P><span style={{fontFamily:"monospace",fontSize:11,color:"#3a5a6a"}}>
      <span style={{animation:"blink 1s infinite",display:"inline-block"}}>█</span> Running scanners...
    </span></P>
  );

  const counts = {
    accumulation: scans.accumulation.length,
    rs:           scans.rs.length,
    volume:       scans.volume.length,
    gapper:       scans.gapper.length,
  };

  return (
    <P>
      {/* Tab bar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
              background:activeTab===t.id?"#102030":"transparent",
              border:`1px solid ${activeTab===t.id?"#00d4aa":"#182535"}`,
              color:activeTab===t.id?"#00d4aa":"#4a6a7a",
              fontFamily:"monospace",fontSize:10.5,padding:"5px 14px",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:1
            }}>
              <span>{t.label}</span>
              <span style={{fontSize:9,color:activeTab===t.id?"#3a8a6a":"#2a4050"}}>{t.desc}</span>
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{display:"flex",gap:8}}>
            {tabs.map(t=>(
              <span key={t.id} style={{fontFamily:"monospace",fontSize:10,color:activeTab===t.id?"#00d4aa":"#3a5a6a"}}>
                {counts[t.id]} hits
              </span>
            ))}
          </div>
          <button onClick={runScan} style={{
            background:"#0a1825",border:"1px solid #182535",color:"#00d4aa",
            fontFamily:"monospace",fontSize:10,padding:"4px 12px",cursor:"pointer"
          }}>↻ Rescan</button>
        </div>
      </div>

      {/* Active scanner */}
      {activeTab==="accumulation"&&<AccumulationScanner data={scans.accumulation} topSectors={d.topSectors}/>}
      {activeTab==="rs"&&<RSScanner data={scans.rs}/>}
      {activeTab==="volume"&&<VolumeScanner data={scans.volume}/>}
      {activeTab==="gapper"&&<GapperScanner data={scans.gapper}/>}

      {/* Alert watchlist strip */}
      <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #182535",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontFamily:"monospace",fontSize:10,color:"#f5a623",letterSpacing:1}}>⚠ ALERT WATCHLIST</span>
        <span style={{fontFamily:"monospace",fontSize:9,color:"#3a5a6a"}}>Top-rated setups from all scanners:</span>
        {[
          ...(scans.accumulation.slice(0,2).map(r=>({ticker:r.ticker,label:r.setupType,color:"#00d4aa"}))),
          ...(scans.rs.slice(0,1).map(r=>({ticker:r.ticker,label:"RS"+r.rsRank,color:"#f5a623"}))),
          ...(scans.gapper.filter(r=>r.aboveEma).slice(0,1).map(r=>({ticker:r.ticker,label:"Gap+EMA",color:"#e0eaf4"}))),
          ...(scans.volume.slice(0,1).map(r=>({ticker:r.ticker,label:r.volMult.toFixed(1)+"x vol",color:"#f5a623"}))),
        ].map((item,i)=>(
          <span key={i} style={{
            fontFamily:"monospace",fontSize:10,color:item.color,
            background:`${item.color}15`,border:`1px solid ${item.color}40`,
            padding:"2px 8px",borderRadius:2
          }}>{item.ticker} <span style={{color:`${item.color}99`,fontSize:9}}>{item.label}</span></span>
        ))}
      </div>
    </P>
  );
}

// ─── Market panels (condensed) ────────────────────────────────────────────
function MarketPanels({d}) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,padding:"6px 14px 0"}}>
      <P>
        <PanelHead icon="⚡" label="VOLATILITY" score={d.scores.vix}/>
        <ScoreBar score={d.scores.vix}/>
        <div style={{marginTop:8}}>
          <Row label="VIX" val={d.vix.toFixed(2)} tag={d.vix>28?"High":d.vix>20?"Elevated":"Low"} tc={d.vix>28?"#e63946":d.vix>20?"#f5a623":"#00d4aa"}/>
          <Row label="VIX Trend" val={d.vixTrend} tag={d.vixTrend==="Rising"?"Spiking":"Easing"} tc={d.vixTrend==="Rising"?"#e63946":"#00d4aa"}/>
          <Row label="VIX %ile" val={`${Math.round(d.vixPercentile)}th`} tag={d.vixPercentile>70?"Fearful":"Normal"} tc={d.vixPercentile>70?"#e63946":"#f5a623"}/>
          <Row label="Put/Call" val={d.pcRatio.toFixed(2)} tag={d.pcRatio>1.1?"Fear":"Neutral"} tc={d.pcRatio>1.1?"#e63946":"#6a8a9a"}/>
        </div>
      </P>
      <P>
        <PanelHead icon="📈" label="TREND" score={d.scores.trend}/>
        <ScoreBar score={d.scores.trend}/>
        <div style={{marginTop:8}}>
          <Row label="SPX vs 20d" val={d.spyPrice>d.spy20d?"Above":"Below"} tag={d.spyPrice>d.spy20d?"Intact":"Weak"} tc={d.spyPrice>d.spy20d?"#00d4aa":"#e63946"}/>
          <Row label="SPX vs 50d" val={d.spyPrice>d.spy50d?"Above":"Below"} tag={d.spyPrice>d.spy50d?"Intact":"Weak"} tc={d.spyPrice>d.spy50d?"#00d4aa":"#e63946"}/>
          <Row label="SPX vs 200d" val={d.spyPrice>d.spy200d?"Above":"Below"} tag={d.spyPrice>d.spy200d?"Intact":"Break"} tc={d.spyPrice>d.spy200d?"#00d4aa":"#e63946"}/>
          <Row label="Regime" val={d.regime} tag={d.regime} tc={d.regime==="Uptrend"?"#00d4aa":d.regime==="Choppy"?"#f5a623":"#e63946"}/>
        </div>
      </P>
      <P>
        <PanelHead icon="📊" label="BREADTH" score={d.scores.breadth}/>
        <ScoreBar score={d.scores.breadth}/>
        <div style={{marginTop:8}}>
          <Row label="> 50d MA" val={`${Math.round(d.pctAbove50)}%`} tag={d.pctAbove50>60?"Strong":"Weak"} tc={d.pctAbove50>60?"#00d4aa":"#e63946"}/>
          <Row label="> 200d MA" val={`${Math.round(d.pctAbove200)}%`} tag={d.pctAbove200>60?"Strong":"Weak"} tc={d.pctAbove200>60?"#00d4aa":"#e63946"}/>
          <Row label="NYSE A/D" val={`${d.adRatio.toFixed(1)}:1`} tag={d.adRatio>1.2?"Positive":"Negative"} tc={d.adRatio>1.2?"#00d4aa":"#e63946"}/>
          <Row label="NAS H/L" val={`${d.nasdaqNH}/${d.nasdaqNL}`} tag={d.nasdaqNH>d.nasdaqNL?"Highs":"Lows"} tc={d.nasdaqNH>d.nasdaqNL?"#00d4aa":"#e63946"}/>
        </div>
      </P>
      <P>
        <PanelHead icon="⚡" label="MOMENTUM" score={d.scores.momentum}/>
        <ScoreBar score={d.scores.momentum}/>
        <div style={{marginTop:8}}>
          <Row label="Sectors +" val={`${d.positiveSectors}/11`} tag={d.positiveSectors>=7?"Broad":"Thin"} tc={d.positiveSectors>=7?"#00d4aa":"#e63946"}/>
          <Row label="Leader" val={d.sectors[0].ticker} tag={`+${d.sectors[0].chg.toFixed(2)}%`} tc={chgColor(d.sectors[0].chg)}/>
          <Row label="Laggard" val={d.sectors[d.sectors.length-1].ticker} tag={`${d.sectors[d.sectors.length-1].chg.toFixed(2)}%`} tc="#e63946"/>
          <Row label="Top 5 sectors" val={d.topSectors.slice(0,3).join(" ")} tag="leaders" tc="#f5a623"/>
        </div>
      </P>
      <P>
        <PanelHead icon="🌐" label="MACRO" score={d.scores.macro}/>
        <ScoreBar score={d.scores.macro}/>
        <div style={{marginTop:8}}>
          <Row label="FOMC" val={d.fomcToday?"TODAY":d.fomcSoon?"This week":"Clear"} tag={d.fomcToday?"Risk!":"—"} tc={d.fomcToday?"#e63946":"#00d4aa"}/>
          <Row label="10Y Yield" val={`${d.tnyield.toFixed(2)}%`} tag={d.tnyield>4.8?"Rising":"OK"} tc={d.tnyield>4.8?"#e63946":"#f5a623"}/>
          <Row label="DXY" val={d.dxy.toFixed(2)} tag={d.dxy>106?"Strong":"Neutral"} tc={d.dxy>106?"#e63946":"#f5a623"}/>
          <Row label="Fed" val={d.fedStance} tag={d.fedStance} tc={d.fedStance==="Hawkish"?"#e63946":d.fedStance==="Hold"?"#f5a623":"#00d4aa"}/>
        </div>
      </P>
    </div>
  );
}

// ─── Terminal Analysis ────────────────────────────────────────────────────
function TerminalAnalysis({d,mode}) {
  const [analysis,setAnalysis]=useState("");
  const [loading,setLoading]=useState(false);
  const [ts,setTs]=useState("");
  const fetched=useRef(false);

  const fetch_ = useCallback(async()=>{
    setLoading(true);
    try {
      const prompt=`You are a professional stock market analyst. Write exactly 3 sentences in Bloomberg Terminal style for ${mode} traders based on this data: Decision=${d.decision}(${d.totalScore}/100), VIX=${d.vix.toFixed(2)} ${d.vixTrend}, Regime=${d.regime}, %>50dMA=${Math.round(d.pctAbove50)}%, Sectors+=${d.positiveSectors}/11, Leader=${d.sectors[0].ticker}(${d.sectors[0].chg.toFixed(2)}%), 10Y=${d.tnyield.toFixed(2)}%, Fed=${d.fedStance}, FOMC=${d.fomcToday}, Exec=${d.execScore}/100.
Sentence 1: VERDICT IN CAPS then key context. Sentence 2: 2-3 specific data points. Sentence 3: "Suggested action:" + one concrete instruction. No lists, no headers, 3 sentences only.`;
      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})
      });
      const json=await res.json();
      setAnalysis(json?.content?.[0]?.text||"Analysis unavailable.");
      setTs(`Updated ${fmtDate()} ${fmtTime()}`);
    } catch { setAnalysis("Market analysis temporarily unavailable."); }
    setLoading(false);
  },[d.totalScore,d.decision,mode]);

  useEffect(()=>{ if(!fetched.current){fetched.current=true;fetch_();} },[]);
  useEffect(()=>{ fetch_(); },[d.decision,mode]);

  const sentences=analysis.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
  return (
    <P>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:"#00d4aa",fontFamily:"monospace",fontSize:11}}>▶</span>
          <span style={{fontFamily:"monospace",fontSize:10.5,color:"#c0d0e0",letterSpacing:2}}>TERMINAL ANALYSIS</span>
          <span style={{fontFamily:"monospace",fontSize:9,color:"#2a4050"}}>AI-generated market assessment</span>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {ts&&<span style={{fontFamily:"monospace",fontSize:9,color:"#2a4050"}}>{ts}</span>}
          <button onClick={fetch_} style={{background:"#0a1825",border:"1px solid #182535",color:"#00d4aa",fontFamily:"monospace",fontSize:9.5,padding:"3px 10px",cursor:"pointer"}}>↻ Regenerate</button>
        </div>
      </div>
      {loading?(
        <div style={{fontFamily:"monospace",fontSize:11.5,color:"#2a4050",padding:"8px 0"}}>
          <span style={{animation:"blink 1s infinite"}}>█</span> Analysing market conditions...
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {sentences.map((s,i)=>(
            <p key={i} style={{margin:0,fontFamily:"monospace",fontSize:11.5,lineHeight:1.75,
              color:i===0?"#e0eaf4":i===sentences.length-1?"#6aaa7a":"#7a9aaa",
              fontStyle:i===sentences.length-1?"italic":"normal"}}>{s}</p>
          ))}
        </div>
      )}
    </P>
  );
}

// ─── Small Cap Data Generator ─────────────────────────────────────────────
const SC_NAMES = [
  "XTIA","PEGY","RNAZ","MIGI","NKLA","VERB","CRBP","CLOV","WKHS","PRTY",
  "ILUS","SHOT","LIFW","TPST","AEYE","BNGO","CIDM","CETX","CTIC","DARE",
  "EDSA","EVAX","FFIE","GFAI","HGEN","IMCC","JXJT","KALI","LQDA","MDJH",
  "NXGL","OPAD","PAVS","QMMM","RCAT","SNAL","TPVG","UVXY","VMAR","WINC",
];

function generateWeekData(weekOffset = 0) {
  const rand = (b, v) => b + (Math.random() - 0.5) * v;
  const weekNames = ["This week","Last week","2 weeks ago","3 weeks ago"];

  // Generate gappers for this week
  const numGappers = Math.round(rand(8, 8));
  const tickers = [...SC_NAMES].sort(() => Math.random() - 0.5).slice(0, numGappers);

  const gappers = tickers.map(ticker => {
    const gapPct    = clamp(rand(65, 60), 45, 180);
    const hod       = clamp(rand(gapPct * 1.15, 20), gapPct, gapPct * 1.4);
    const closePct  = rand(hod * 0.3, hod * 0.8); // close well below HOD usually
    const fadePct   = Math.round(hod - closePct);
    const closedRed = closePct < 0;
    const vol       = Math.round(rand(25, 40)) * 1e6;
    const float_    = clamp(rand(8, 12), 1, 30); // millions
    const isMultiDay= Math.random() > 0.72;
    const daysToPeak= isMultiDay ? Math.round(rand(2.5, 1.5)) : 1;
    return {
      ticker, gapPct: Math.round(gapPct), hod: Math.round(hod * 10) / 10,
      closePct: Math.round(closePct * 10) / 10, fadePct,
      closedRed, vol, float: Math.round(float_ * 10) / 10,
      isMultiDay, daysToPeak,
    };
  }).sort((a, b) => b.gapPct - a.gapPct);

  const closedRedCount  = gappers.filter(g => g.closedRed).length;
  const redPct          = Math.round(closedRedCount / gappers.length * 100);
  const avgFade         = Math.round(gappers.reduce((s, g) => s + g.fadePct, 0) / gappers.length);
  const multiDayCount   = gappers.filter(g => g.isMultiDay).length;
  const bigGappers      = gappers.filter(g => g.gapPct >= 45).length;
  const biggest         = gappers[0];

  // Sentiment scoring
  const sentScore = clamp(Math.round(
    (bigGappers >= 6 ? 35 : bigGappers >= 3 ? 20 : 8) +
    (redPct >= 70 ? 30 : redPct >= 50 ? 18 : 5) +
    (avgFade >= 40 ? 20 : avgFade >= 25 ? 12 : 4) +
    (multiDayCount <= 2 ? 15 : multiDayCount <= 4 ? 8 : 2)
  ), 0, 100);

  const sentiment = sentScore >= 65 ? "HOT" : sentScore >= 40 ? "COLD" : "DEAD";

  return {
    week: weekNames[weekOffset], weekOffset,
    gappers, bigGappers, closedRedCount, redPct, avgFade,
    multiDayCount, singleDayCount: gappers.length - multiDayCount,
    biggest, sentScore, sentiment, totalGappers: gappers.length,
  };
}

function generateSmallCapData() {
  return [0, 1, 2, 3].map(i => generateWeekData(i));
}

// ─── Small Cap Components ─────────────────────────────────────────────────
function SentimentBadge({ sentiment, score }) {
  const cfg = {
    HOT:  { bg: "#1a0a00", border: "#e63946", color: "#e63946", glow: "#e6394640" },
    COLD: { bg: "#0a1020", border: "#f5a623", color: "#f5a623", glow: "#f5a62330" },
    DEAD: { bg: "#080f18", border: "#3a5a6a", color: "#3a5a6a", glow: "transparent" },
  }[sentiment];
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        border: `2px solid ${cfg.border}`, color: cfg.color, background: cfg.bg,
        fontFamily: "monospace", fontSize: 20, fontWeight: "bold",
        padding: "6px 20px", letterSpacing: 3,
        boxShadow: `0 0 16px ${cfg.glow}`, display: "inline-block",
      }}>{sentiment}</div>
      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#3a5a6a", marginTop: 4 }}>
        short environment score: {score}/100
      </div>
    </div>
  );
}

function WeekSummaryStats({ week }) {
  const stats = [
    { label: "Gappers >45%",   val: week.bigGappers,                       color: week.bigGappers >= 5 ? "#e63946" : "#f5a623" },
    { label: "Closed red",     val: `${week.redPct}%`,                      color: week.redPct >= 65 ? "#00d4aa" : "#f5a623" },
    { label: "Avg fade HOD",   val: `${week.avgFade}%`,                     color: week.avgFade >= 35 ? "#00d4aa" : "#f5a623" },
    { label: "Single-day fade",val: week.singleDayCount,                    color: week.singleDayCount >= week.multiDayCount ? "#00d4aa" : "#f5a623" },
    { label: "Multi-day runs", val: week.multiDayCount,                     color: week.multiDayCount <= 2 ? "#00d4aa" : "#e63946" },
    { label: "Biggest play",   val: `${week.biggest?.ticker} +${week.biggest?.gapPct}%`, color: "#c0d0e0" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
      {stats.map(s => (
        <div key={s.label} style={{ background: "#040c14", border: "1px solid #182535", padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#3a5a6a", marginBottom: 5, letterSpacing: 0.5 }}>{s.label}</div>
          <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: "bold", color: s.color }}>{s.val}</div>
        </div>
      ))}
    </div>
  );
}

function FourWeekHeatmap({ weeks }) {
  const metrics = [
    { label: "Sentiment",    fn: w => w.sentiment,         colorFn: s => s==="HOT"?"#e63946":s==="COLD"?"#f5a623":"#3a5a6a" },
    { label: "Gappers >45%", fn: w => w.bigGappers,        colorFn: n => n>=6?"#e63946":n>=3?"#f5a623":"#3a5a6a" },
    { label: "% Closed red", fn: w => `${w.redPct}%`,      colorFn: (_,w) => w.redPct>=65?"#00d4aa":w.redPct>=45?"#f5a623":"#e63946" },
    { label: "Avg fade HOD", fn: w => `${w.avgFade}%`,     colorFn: (_,w) => w.avgFade>=35?"#00d4aa":w.avgFade>=20?"#f5a623":"#e63946" },
    { label: "Multi-day",    fn: w => w.multiDayCount,     colorFn: n => n<=2?"#00d4aa":n<=4?"#f5a623":"#e63946" },
    { label: "Short env.",   fn: w => `${w.sentScore}/100`, colorFn: (_,w) => w.sentScore>=65?"#e63946":w.sentScore>=40?"#f5a623":"#3a5a6a" },
  ];
  return (
    <div>
      {/* Header row */}
      <div style={{ display: "grid", gridTemplateColumns: "90px repeat(4, 1fr)", gap: 4, marginBottom: 4 }}>
        <div />
        {weeks.map(w => (
          <div key={w.week} style={{ fontFamily: "monospace", fontSize: 9, color: w.weekOffset===0?"#c0d0e0":"#3a5a6a", textAlign: "center", letterSpacing: 0.5 }}>
            {w.week}
          </div>
        ))}
      </div>
      {/* Metric rows */}
      {metrics.map(m => (
        <div key={m.label} style={{ display: "grid", gridTemplateColumns: "90px repeat(4, 1fr)", gap: 4, marginBottom: 4 }}>
          <div style={{ fontFamily: "monospace", fontSize: 9.5, color: "#4a6a7a", display: "flex", alignItems: "center" }}>{m.label}</div>
          {weeks.map(w => {
            const val = m.fn(w);
            const col = m.colorFn(val, w);
            return (
              <div key={w.week} style={{
                background: `${col}18`, border: `1px solid ${col}40`,
                fontFamily: "monospace", fontSize: 11, fontWeight: "bold",
                color: col, textAlign: "center", padding: "5px 4px",
                opacity: w.weekOffset === 0 ? 1 : 0.75,
              }}>{val}</div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function GapperTable({ gappers }) {
  return (
    <div>
      {/* Headers */}
      <div style={{ display: "grid", gridTemplateColumns: "55px 55px 65px 60px 65px 65px 60px 55px 70px", gap: "0 8px", padding: "4px 8px", borderBottom: "1px solid #182535", marginBottom: 4 }}>
        {["Ticker","Gap %","HOD %","Close %","Fade HOD","Closed","Volume","Float","Type"].map(h => (
          <span key={h} style={{ fontFamily: "monospace", fontSize: 9, color: "#3a5a6a" }}>{h}</span>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>
        {gappers.map((g, i) => (
          <div key={g.ticker} style={{
            display: "grid", gridTemplateColumns: "55px 55px 65px 60px 65px 65px 60px 55px 70px",
            gap: "0 8px", padding: "5px 8px", alignItems: "center",
            background: i % 2 === 0 ? "#040c14" : "#060e18",
            borderLeft: `2px solid ${g.closedRed ? "#00d4aa" : "#e63946"}`,
          }}>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#e0eaf4", fontWeight: "bold" }}>{g.ticker}</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#e63946", fontWeight: "bold" }}>+{g.gapPct}%</span>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#f5a623" }}>+{g.hod}%</span>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: g.closedRed ? "#e63946" : "#00d4aa" }}>
              {g.closePct >= 0 ? "+" : ""}{g.closePct}%
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ flex: 1, background: "#0d1820", height: 8, borderRadius: 1, overflow: "hidden" }}>
                <div style={{ width: `${clamp(g.fadePct / 1.2, 0, 100)}%`, height: "100%", background: g.fadePct >= 35 ? "#00d4aa" : "#f5a623" }} />
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: g.fadePct >= 35 ? "#00d4aa" : "#f5a623", width: 28, textAlign: "right" }}>{g.fadePct}%</span>
            </div>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: g.closedRed ? "#00d4aa" : "#e63946", fontWeight: "bold" }}>
              {g.closedRed ? "▼ RED" : "▲ GREEN"}
            </span>
            <span style={{ fontFamily: "monospace", fontSize: 9.5, color: "#6a8a9a" }}>{(g.vol / 1e6).toFixed(0)}M</span>
            <span style={{ fontFamily: "monospace", fontSize: 9.5, color: "#4a6a7a" }}>{g.float}M</span>
            <span style={{
              fontFamily: "monospace", fontSize: 9,
              color: g.isMultiDay ? "#e63946" : "#00d4aa",
              background: g.isMultiDay ? "#e6394618" : "#00d4aa18",
              padding: "1px 5px", textAlign: "center",
            }}>{g.isMultiDay ? `${g.daysToPeak}d runner` : "1d fade"}</span>
          </div>
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, paddingTop: 6, borderTop: "1px solid #182535" }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <div style={{ width: 8, height: 8, background: "#00d4aa" }} />
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6a7a" }}>Closed red = clean fade = good short env.</span>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <div style={{ width: 8, height: 8, background: "#e63946" }} />
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6a7a" }}>Multi-day runner = dangerous, avoid shorting early</span>
        </div>
      </div>
    </div>
  );
}

function SmallCapPanel() {
  const [weeks, setWeeks]       = useState(() => generateSmallCapData());
  const [activeWeek, setActiveWeek] = useState(0);
  const [activeView, setActiveView] = useState("gappers");
  const currentWeek = weeks[activeWeek];

  const refresh = () => setWeeks(generateSmallCapData());

  return (
    <P>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "monospace", fontSize: 10.5, color: "#c0d0e0", letterSpacing: 2 }}>📉 SMALL CAP SHORT ENVIRONMENT</span>
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#2a4050" }}>Rolling 4-week · Gappers &gt;45% · Short bias</span>
        </div>
        <button onClick={refresh} style={{ background: "#0a1825", border: "1px solid #182535", color: "#00d4aa", fontFamily: "monospace", fontSize: 9.5, padding: "3px 10px", cursor: "pointer" }}>↻ Refresh</button>
      </div>

      {/* Week selector + sentiment badge */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap" }}>
        {/* Week tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {weeks.map((w, i) => (
            <button key={i} onClick={() => setActiveWeek(i)} style={{
              background: activeWeek === i ? "#102030" : "transparent",
              border: `1px solid ${activeWeek === i ? "#00d4aa" : "#182535"}`,
              color: activeWeek === i ? "#00d4aa" : "#4a6a7a",
              fontFamily: "monospace", fontSize: 10, padding: "4px 12px", cursor: "pointer",
            }}>{w.week}</button>
          ))}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <SentimentBadge sentiment={currentWeek.sentiment} score={currentWeek.sentScore} />
        </div>
      </div>

      {/* Weekly stats summary */}
      <WeekSummaryStats week={currentWeek} />

      {/* View toggle */}
      <div style={{ display: "flex", gap: 4, margin: "12px 0 10px" }}>
        {[["gappers","📋 Gapper list"],["heatmap","🗓 4-week heatmap"]].map(([id, label]) => (
          <button key={id} onClick={() => setActiveView(id)} style={{
            background: activeView === id ? "#102030" : "transparent",
            border: `1px solid ${activeView === id ? "#f5a623" : "#182535"}`,
            color: activeView === id ? "#f5a623" : "#4a6a7a",
            fontFamily: "monospace", fontSize: 10, padding: "4px 14px", cursor: "pointer",
          }}>{label}</button>
        ))}
      </div>

      {/* Content */}
      {activeView === "gappers" && <GapperTable gappers={currentWeek.gappers} />}
      {activeView === "heatmap" && <FourWeekHeatmap weeks={weeks} />}

      {/* Insight strip */}
      <div style={{ marginTop: 10, padding: "8px 12px", background: "#040c14", border: "1px solid #182535", fontFamily: "monospace", fontSize: 10.5, color: "#7a9aaa", lineHeight: 1.7 }}>
        {currentWeek.sentiment === "HOT" && (
          <>🔴 <span style={{ color: "#e0eaf4" }}>Hot short environment</span> — {currentWeek.bigGappers} gappers over 45%, {currentWeek.redPct}% closed red, avg fade of {currentWeek.avgFade}% from HOD. {currentWeek.multiDayCount <= 2 ? "Clean single-day fades dominating — ideal short conditions." : `Watch out — ${currentWeek.multiDayCount} multi-day runners this week, size accordingly.`}</>
        )}
        {currentWeek.sentiment === "COLD" && (
          <>🟡 <span style={{ color: "#e0eaf4" }}>Cold short environment</span> — {currentWeek.bigGappers} gappers over 45%, {currentWeek.redPct}% closed red. Inconsistent fades, avg {currentWeek.avgFade}% from HOD. {currentWeek.multiDayCount >= 3 ? `${currentWeek.multiDayCount} multi-day runners — market rewarding longs more than shorts right now.` : "Some plays but choppy — stick to A+ setups only, reduce size."}</>
        )}
        {currentWeek.sentiment === "DEAD" && (
          <>⚫ <span style={{ color: "#e0eaf4" }}>Dead tape</span> — only {currentWeek.bigGappers} gappers over 45%, {currentWeek.redPct}% closed red. Shallow fades averaging {currentWeek.avgFade}% from HOD. Low quality plays, high chop risk — best to sit on hands and wait for a better week.</>
        )}
      </div>
    </P>
  );
}

// ─── API Config ───────────────────────────────────────────────────────────
const API_BASE = "https://trading-dashboard-api-6xeh.onrender.com";

// ─── Main App ─────────────────────────────────────────────────────────────
export default function TradingDashboard() {
  const [mode,setMode]=useState("SWING");
  const [view,setView]=useState("market");
  const [data,setData]=useState(()=>generateMarketData()); // start with sim while API loads
  const [scanData,setScanData]=useState(null);
  const [secsAgo,setSecsAgo]=useState(0);
  const [updating,setUpdating]=useState(false);
  const [apiError,setApiError]=useState(false);
  const [isLive,setIsLive]=useState(false);
  const REFRESH=45;

  const fetchMarket = useCallback(async(silent=false)=>{
    if(!silent) setUpdating(true);
    try {
      const res  = await fetch(`${API_BASE}/api/market`);
      const json = await res.json();
      if(json && json.totalScore !== undefined){
        setData(json);
        setIsLive(true);
        setApiError(false);
      }
    } catch(e){
      console.warn("Market API error, using simulation:",e);
      if(!isLive) setData(generateMarketData());
      setApiError(true);
    }
    if(!silent) setUpdating(false);
    setSecsAgo(0);
  },[isLive]);

  const fetchScanners = useCallback(async()=>{
    try {
      const res  = await fetch(`${API_BASE}/api/scanner`);
      const json = await res.json();
      if(json && json.ema4Extension){
        setScanData(json);
      }
    } catch(e){
      console.warn("Scanner API error:",e);
    }
  },[]);

  // Initial load
  useEffect(()=>{
    fetchMarket(true);
    fetchScanners();
  },[]);

  // Auto-refresh timer
  useEffect(()=>{
    const t=setInterval(()=>setSecsAgo(s=>{
      if(s>=REFRESH){
        fetchMarket(true);
        fetchScanners();
        return 0;
      }
      return s+1;
    }),1000);
    return()=>clearInterval(t);
  },[fetchMarket,fetchScanners]);

  const refresh = useCallback(()=>{
    fetchMarket(false);
    fetchScanners();
  },[fetchMarket,fetchScanners]);

  const dc=decColor(data.decision);
  const d=data;

  return (
    <div style={{background:"#030a12",minHeight:"100vh",color:"#c0d0e0"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-track{background:#030a12}
        ::-webkit-scrollbar-thumb{background:#182535}
      `}</style>

      {/* Navbar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 14px",height:40,borderBottom:"1px solid #182535",background:"#050c16"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:24,height:24,background:"#f5a623",borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:"bold"}}>⚡</div>
          <span style={{fontFamily:"monospace",fontSize:13,color:"#e0eaf4",letterSpacing:1,fontWeight:"bold"}}>SHOULD I BE TRADING?</span>
          <span style={{fontFamily:"monospace",fontSize:10,color:"#2a4050",letterSpacing:3}}>MARKET QUALITY TERMINAL</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {/* View switcher */}
          {["SWING","DAY"].map(m=>(
            <button key={m} onClick={()=>{setMode(m);setView("market");}} style={{
              background:view==="market"&&mode===m?"#102030":"transparent",
              border:`1px solid ${view==="market"&&mode===m?"#00d4aa":"#182535"}`,
              color:view==="market"&&mode===m?"#00d4aa":"#4a6a7a",
              fontFamily:"monospace",fontSize:10,padding:"3px 12px",cursor:"pointer",letterSpacing:1
            }}>{m}</button>
          ))}
          {/* Divider */}
          <div style={{width:1,height:18,background:"#182535"}}/>
          {/* Small cap tab */}
          <button onClick={()=>setView("smallcap")} style={{
            background:view==="smallcap"?"#1a0814":"transparent",
            border:`1px solid ${view==="smallcap"?"#e63946":"#182535"}`,
            color:view==="smallcap"?"#e63946":"#4a6a7a",
            fontFamily:"monospace",fontSize:10,padding:"3px 12px",cursor:"pointer",letterSpacing:1,
            display:"flex",flexDirection:"column",alignItems:"center",gap:1,
          }}>
            <span>SMALL CAP</span>
            <span style={{fontSize:8,color:view==="smallcap"?"#8a2030":"#2a4050",letterSpacing:0}}>short env.</span>
          </button>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:updating?"#f5a623":isLive?"#00d4aa":"#f5a623",animation:"pulse 2s infinite"}}/>
            <span style={{fontFamily:"monospace",fontSize:10,color:updating?"#f5a623":isLive?"#00d4aa":"#f5a623"}}>
              {updating?"UPDATING":isLive?"LIVE":"SIMULATED"}
            </span>
            {apiError&&<span style={{fontFamily:"monospace",fontSize:9,color:"#e63946"}}>API ERR</span>}
          </div>
          <span style={{fontFamily:"monospace",fontSize:10,color:"#2a4050"}}>🕐 {secsAgo}s ago</span>
          <button onClick={()=>refresh()} style={{background:"#0a1825",border:"1px solid #182535",color:"#6a8a9a",fontFamily:"monospace",fontSize:10,padding:"3px 9px",cursor:"pointer"}}>↻</button>
        </div>
      </div>

      <TickerBar d={d}/>

      {/* ── MARKET VIEW ── */}
      {view==="market" && <>

      {/* FOMC Alert */}
      {(d.fomcToday||d.fomcSoon)&&(
        <div style={{background:"#160a00",border:"1px solid #c07010",borderLeft:"3px solid #f5a623",margin:"8px 14px 0",padding:"7px 12px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{color:"#f5a623"}}>⚠</span>
          <span style={{fontFamily:"monospace",fontSize:10.5,color:"#f5a623",letterSpacing:1}}>{d.fomcToday?"FOMC DECISION TODAY":"FOMC WITHIN 72 HOURS"}</span>
          <span style={{fontFamily:"monospace",fontSize:10.5,color:"#7a9aaa"}}>{d.fomcToday?`Rate decision 2:00 PM ET. Expected hold ${d.tnyield.toFixed(2)}–${(d.tnyield+0.25).toFixed(2)}%. Press conf 2:30 PM.`:"Elevated event risk — reduce sizing and avoid new entries near the meeting."}</span>
        </div>
      )}

      {/* Hero */}
      <div style={{margin:"8px 14px 0",background:"#060e18",border:"1px solid #182535",padding:"14px 18px",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
        <div style={{textAlign:"center",minWidth:105}}>
          <div style={{fontFamily:"monospace",fontSize:9,color:"#3a5a6a",letterSpacing:2,marginBottom:5}}>DECISION</div>
          <div style={{border:`2px solid ${dc}`,color:dc,fontFamily:"monospace",fontSize:26,fontWeight:"bold",padding:"5px 18px",letterSpacing:3,boxShadow:`0 0 18px ${dc}30`,textAlign:"center"}}>{d.decision}</div>
          <div style={{fontFamily:"monospace",fontSize:9,color:"#2a4050",marginTop:5}}>{mode} Trading</div>
        </div>
        <div style={{textAlign:"center"}}>
          <CircleScore score={d.totalScore} size={96}/>
          <div style={{fontFamily:"monospace",fontSize:8,color:"#2a4050",marginTop:2,letterSpacing:1}}>MARKET QUALITY SCORE</div>
        </div>
        <div style={{display:"flex",flex:1,gap:18,justifyContent:"space-around",flexWrap:"wrap"}}>
          {[{label:"VOLATILITY",score:d.scores.vix},{label:"TREND",score:d.scores.trend},{label:"BREADTH",score:d.scores.breadth},{label:"MOMENTUM",score:d.scores.momentum},{label:"MACRO",score:d.scores.macro}]
            .map(({label,score})=>(
            <div key={label} style={{textAlign:"center",minWidth:65}}>
              <div style={{fontFamily:"monospace",fontSize:8.5,color:"#4a6a7a",letterSpacing:1,marginBottom:7}}>{label}</div>
              <div style={{fontFamily:"monospace",fontSize:22,fontWeight:"bold",color:scoreColor(score)}}>{score}</div>
              <ScoreBar score={score}/>
            </div>
          ))}
        </div>
        <div style={{textAlign:"center",minWidth:95}}>
          <div style={{fontFamily:"monospace",fontSize:9,color:"#3a5a6a",letterSpacing:2,marginBottom:7}}>POSITION SIZE</div>
          <div style={{fontSize:18,marginBottom:4}}>{d.totalScore>=80?"✅":d.totalScore>=60?"⚠️":"🛡️"}</div>
          <div style={{fontFamily:"monospace",fontSize:11,fontWeight:"bold",color:dc,letterSpacing:1}}>{d.posSize}</div>
          <div style={{fontFamily:"monospace",fontSize:9,color:"#2a4050",marginTop:4}}>{d.totalScore>=80?"Press risk":d.totalScore>=60?"A+ setups only":"Preserve capital"}</div>
        </div>
      </div>

      {/* 5 Market Panels */}
      <MarketPanels d={d}/>

      {/* Bottom row: Execution + Sector heatmap + Scoring */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr",gap:6,padding:"6px 14px 0"}}>
        <P>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontFamily:"monospace",fontSize:10,color:"#e63946",letterSpacing:2}}>🎯 EXECUTION WINDOW</span>
            <span style={{fontFamily:"monospace",fontSize:17,fontWeight:"bold",color:scoreColor(d.execScore)}}>{d.execScore}</span>
          </div>
          <ScoreBar score={d.execScore}/>
          <div style={{marginTop:8}}>
            <Row label="Breakouts working?" val={d.breakoutsWorking} tag={d.breakoutsWorking==="Yes"?"Confirmed":"Failing"} tc={d.breakoutsWorking==="Yes"?"#00d4aa":"#e63946"}/>
            <Row label="Leaders holding?" val={d.leadersHolding} tag={d.leadersHolding==="Yes"?"Holding":"Fading"} tc={d.leadersHolding==="Yes"?"#00d4aa":"#e63946"}/>
            <Row label="Pullbacks bought?" val={d.pullbacksBought} tag={d.pullbacksBought==="Yes"?"Support":"Ignored"} tc={d.pullbacksBought==="Yes"?"#00d4aa":"#e63946"}/>
            <Row label="Follow-through?" val={d.followThrough} tag={d.followThrough} tc={d.followThrough==="Strong"?"#00d4aa":d.followThrough==="Moderate"?"#f5a623":"#e63946"}/>
          </div>
        </P>
        <P>
          <div style={{fontFamily:"monospace",fontSize:10,color:"#5a7a8a",letterSpacing:2,marginBottom:10}}>📊 SECTOR PERFORMANCE</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {d.sectors.map(s=>{
              const maxAbs=Math.max(...d.sectors.map(x=>Math.abs(x.chg)),0.01);
              const w=Math.abs(s.chg)/maxAbs*82;
              const col=s.chg>=0.5?"#00a880":s.chg>=0?"#007a60":s.chg>-1.2?"#9a2030":"#e63946";
              const isTop=d.topSectors.includes(s.ticker);
              return (
                <div key={s.ticker} style={{display:"flex",alignItems:"center",gap:7}}>
                  <span style={{fontFamily:"monospace",fontSize:10,color:isTop?"#f5a623":"#4a6a7a",width:82,textAlign:"right",flexShrink:0}}>
                    {isTop?"★ ":""}{s.label}
                  </span>
                  <div style={{flex:1,background:"#0a1825",height:16,borderRadius:1,overflow:"hidden"}}>
                    <div style={{width:`${w}%`,height:"100%",background:col,opacity:0.88,transition:"width 0.8s"}}/>
                  </div>
                  <span style={{fontFamily:"monospace",fontSize:10,color:chgColor(s.chg),width:54,textAlign:"right",flexShrink:0}}>
                    {s.chg>=0?"+":""}{s.chg.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:6,fontFamily:"monospace",fontSize:9,color:"#2a4050"}}>★ = top-5 sector — scanner uses these for accumulation filter</div>
        </P>
        <P>
          <div style={{fontFamily:"monospace",fontSize:10,color:"#5a7a8a",letterSpacing:2,marginBottom:10}}>📈 SCORING WEIGHTS</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {[{label:"Volatility",w:"25%",s:d.scores.vix},{label:"Momentum",w:"25%",s:d.scores.momentum},{label:"Trend",w:"20%",s:d.scores.trend},{label:"Breadth",w:"20%",s:d.scores.breadth},{label:"Macro",w:"10%",s:d.scores.macro}]
              .map(r=>(
              <div key={r.label} style={{display:"flex",alignItems:"center",gap:7}}>
                <span style={{fontFamily:"monospace",fontSize:9.5,color:"#4a6a7a",width:65,flexShrink:0}}>{r.label}</span>
                <div style={{flex:1,background:"#0a1825",height:12,borderRadius:1,overflow:"hidden"}}>
                  <div style={{width:`${r.s}%`,height:"100%",background:scoreColor(r.s),transition:"width 0.8s"}}/>
                </div>
                <span style={{fontFamily:"monospace",fontSize:9.5,color:scoreColor(r.s),width:25,textAlign:"right"}}>{r.s}</span>
                <span style={{fontFamily:"monospace",fontSize:9,color:"#2a4050",width:28}}>+{r.w}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,borderTop:"1px solid #182535",paddingTop:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontFamily:"monospace",fontSize:10,color:"#4a6a7a"}}>TOTAL SCORE</span>
              <span style={{fontFamily:"monospace",fontSize:19,fontWeight:"bold",color:scoreColor(d.totalScore)}}>{d.totalScore}/100</span>
            </div>
            <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:3}}>
              {[["80–100","YES (press risk)","#00d4aa"],["60–79","CAUTION (selective)","#f5a623"],["<60","NO (preserve capital)","#e63946"]].map(([rng,lbl,col])=>(
                <div key={rng} style={{display:"flex",gap:7,alignItems:"center"}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:col,flexShrink:0}}/>
                  <span style={{fontFamily:"monospace",fontSize:9,color:"#4a6a7a"}}>{rng}: {lbl}</span>
                </div>
              ))}
            </div>
          </div>
        </P>
      </div>

      {/* Terminal Analysis */}
      <div style={{padding:"6px 14px 0"}}>
        <TerminalAnalysis d={d} mode={mode}/>
      </div>

      {/* ── SCANNER SECTION ── */}
      <div style={{padding:"6px 14px 0"}}>
        <div style={{fontFamily:"monospace",fontSize:10,color:"#5a7a8a",letterSpacing:2,marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
          <span>🔍 LARGE / MID-CAP SCANNERS</span>
          <span style={{fontSize:9,color:"#2a4050"}}>Universe: S&P 500 large caps · Filters: avg vol &gt;500k · RS rank &gt;70 · Top-5 sector weighted</span>
          {isLive&&<span style={{fontSize:9,color:"#00d4aa"}}>● LIVE DATA</span>}
          {!isLive&&<span style={{fontSize:9,color:"#f5a623"}}>● SIMULATED</span>}
        </div>
        <ScannerPanel d={d} liveScans={scanData}/>
      </div>

      </>} {/* end market view */}

      {/* ── SMALL CAP VIEW ── */}
      {view==="smallcap" && (
        <div style={{padding:"8px 14px 0"}}>
          {/* Small cap header bar */}
          <div style={{
            background:"#0a0408",border:"1px solid #3a1020",borderLeft:"3px solid #e63946",
            padding:"10px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12
          }}>
            <span style={{fontFamily:"monospace",fontSize:11,color:"#e63946",letterSpacing:2}}>📉 SMALL CAP SHORT ENVIRONMENT</span>
            <span style={{fontFamily:"monospace",fontSize:9,color:"#5a2030"}}>Rolling 4-week · Gappers &gt;45% · Short bias · Simulated data</span>
            <button onClick={()=>setView("market")} style={{
              marginLeft:"auto",background:"transparent",border:"1px solid #182535",
              color:"#4a6a7a",fontFamily:"monospace",fontSize:9,padding:"3px 10px",cursor:"pointer"
            }}>← Back to market</button>
          </div>
          <SmallCapPanel />
        </div>
      )}

      {/* Footer */}
      <div style={{padding:"6px 14px 14px",display:"flex",justifyContent:"space-between"}}>
        <span style={{fontFamily:"monospace",fontSize:9.5,color:"#1a3040"}}>Data: Simulated · Auto-refresh: {REFRESH}s · Not financial advice</span>
        <span style={{fontFamily:"monospace",fontSize:9.5,color:"#1a3040"}}>Should I Be Trading? Terminal v5.0 — Live</span>
      </div>
    </div>
  );
}
