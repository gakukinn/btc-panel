import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Upload, BarChart3, Filter, Award, Star, 
  CheckCircle, XCircle, Shield, Info, ArrowUpRight,
  TrendingUp, Activity, Target, Zap
} from 'lucide-react';
import { parseCSV, formatNumber, prepareStepNeighborMeta } from '../utils/csvParser';
import StatCard from './StatCard';
import DataTable from './DataTable';
import RobustnessBar from './RobustnessBar';

const AnalysisDashboard = () => {
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({
    minTrades: 20,
    minProfitFactor: 1.2,
    maxSingleLossPct: 15,
    maxDrawdown: 20,
    minSharpe: 0.10,
    minSortino: 1.0,
    minWinRate: 25,
    minWinLossRatio: 2.0,
  });
  const [scoreWeights, setScoreWeights] = useState({
    calmar: 0.30, sortino: 0.25, profitFactor: 0.25, sharpe: 0.05, netReturn: 0.15
  });
  const [robustnessWeight, setRobustnessWeight] = useState(0.30);
  const [showParetoOnly, setShowParetoOnly] = useState(false);
  const [allTableSort, setAllTableSort] = useState('combined');
  const [uploadLog, setUploadLog] = useState('');
  const [showAlgoInfo, setShowAlgoInfo] = useState(false);
  const [robustnessData, setRobustnessData] = useState({});
  const [robustnessProgress, setRobustnessProgress] = useState(0); // 0=未开始, 1-99=计算中, 100=完成
  const robustnessAbortRef = useRef(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseCSV(e.target.result);
        if (parsed.length === 0) {
          setUploadLog('❌ 未读取到数据，请确认首行是表头');
          return;
        }
        setData(parsed);
        setUploadLog(`✅ 成功加载 ${parsed.length} 行数据`);
      } catch (error) {
        setUploadLog('❌ 文件解析失败: ' + error.message);
      }
    };
    reader.readAsText(file);
  };

  const processedData = useMemo(() => data.map((row, idx) => {
    const getVal = (row, ...keys) => {
      for (const k of keys) if (row[k] !== undefined && row[k] !== null) return row[k];
      return 0;
    };

    const initialCapital = getVal(row, 'Initial Capital: All', 'Initial Capital', 'Initial capital') || 10000;
    const percentProfit = getVal(row, 'Percent profitable: All', 'Percent Profitable', 'Win Rate');
    const grossProfit = getVal(row, 'Gross profit: All', 'Gross Profit');
    const grossLoss = Math.abs(getVal(row, 'Gross loss: All', 'Gross Loss'));
    const maxDD = Math.abs(getVal(row, 'Max equity drawdown', 'Max Drawdown'));
    const maxDDPct = Math.abs(getVal(row, 'Max equity drawdown %', 'Max Drawdown %'));
    const totalTrades = getVal(row, 'Total trades: All', 'Total Trades');
    const netProfit = getVal(row, 'Net profit: All', 'Net Profit', 'Net P&L: All', 'Total P&L');
    const netProfitPct = getVal(row, 'Net profit %: All', 'Net Profit %', 'Net P&L %: All', 'Total P&L %');
    const netPnlLong = getVal(row, 'Net P&L: Long', 'Net profit: Long');
    const netPnlShort = getVal(row, 'Net P&L: Short', 'Net profit: Short');
    const netPnlPctLong = getVal(row, 'Net P&L %: Long', 'Net profit %: Long');
    const netPnlPctShort = getVal(row, 'Net P&L %: Short', 'Net profit %: Short');
    const winningTrades = getVal(row, 'Winning trades: All', 'Winning Trades');
    const losingTrades = getVal(row, 'Losing trades: All', 'Losing Trades');
    const avgWin = getVal(row, 'Avg winning trade: All', 'Avg Trade');
    const avgLoss = Math.abs(getVal(row, 'Avg losing trade: All', 'Avg Trade'));
    const largestLoss = Math.abs(getVal(row, 'Largest losing trade: All', 'Largest Losing Trade'));
    const largestLossPct = Math.abs(getVal(row, 'Largest losing trade percent: All', 'Largest Losing Trade %'));
    const sharpe = getVal(row, 'Sharpe ratio', 'Sharpe Ratio');
    const sortino = getVal(row, 'Sortino ratio', 'Sortino Ratio');
    const profitFactor = getVal(row, 'Profit factor: All', 'Profit Factor');
    const marginCalls = getVal(row, 'Margin calls: All', 'Margin Calls', 'Margin calls');
    const totalTradesLong = getVal(row, 'Total trades: Long') || 0;
    const totalTradesShort = getVal(row, 'Total trades: Short') || 0;

    let finalAvgWin = avgWin, finalAvgLoss = avgLoss;
    if (finalAvgWin === 0 && winningTrades > 0 && grossProfit > 0) finalAvgWin = grossProfit / winningTrades;
    if (finalAvgLoss === 0 && losingTrades > 0 && grossLoss > 0) finalAvgLoss = grossLoss / losingTrades;

    const p = percentProfit > 1 ? percentProfit / 100 : percentProfit;
    const winRate = percentProfit;
    const E = p * finalAvgWin - (1 - p) * finalAvgLoss;
    const ddPct = maxDDPct || (maxDD / initialCapital) * 100;
    const returnPct = netProfitPct;
    const calmarRatio = ddPct > 0 ? returnPct / ddPct : 0;
    const R = finalAvgLoss > 0 ? finalAvgWin / finalAvgLoss : 0;
    
    let kellyFraction = 0;
    if (finalAvgLoss === 0 && finalAvgWin > 0 && winningTrades > 0) {
      kellyFraction = 1.0;
    } else if (R > 0) {
      kellyFraction = Math.min(1.0, (p * R - (1 - p)) / R);
    }
    const singleLossPct = largestLossPct || (largestLoss / initialCapital) * 100;

    const strategyParams = {};
    Object.keys(row).forEach(key => {
      if (key.startsWith('__')) strategyParams[key.replace(/^__/, '')] = row[key];
    });

    return {
      ...row, originalIndex: idx + 2,
      E, ddPct, returnPct, calmarRatio, winRate, winLossRatio: R,
      kellyFraction, singleLossPct, adjustedSharpe: sharpe, totalExpectation: netProfit,
      initialCapital, percentProfit, grossProfit, grossLoss, maxDD, totalTrades,
      winningTrades, losingTrades, netProfit, netProfitPct, netPnlLong, netPnlShort,
      netPnlPctLong, netPnlPctShort, sharpe, sortino, profitFactor, marginCalls,
      avgWin, avgLoss: finalAvgLoss, totalTradesLong, totalTradesShort, strategyParams
    };
  }), [data]);

  const deduplicatedData = useMemo(() => {
    const seen = new Set();
    return processedData.filter(row => {
      const key = [row.netProfit?.toFixed(2), row.ddPct?.toFixed(2), row.totalTrades,
                   row.profitFactor?.toFixed(3), row.sharpe?.toFixed(3)].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [processedData]);

  const getFilterReasons = (row) => {
    const reasons = [];
    if (row.netProfit <= 0) reasons.push('亏损');
    if (row.E <= 0) reasons.push('期望为负');
    if (row.profitFactor < filters.minProfitFactor) reasons.push(`盈利因子<${filters.minProfitFactor}`);
    if (row.totalTrades < filters.minTrades) reasons.push(`交易数<${filters.minTrades}`);
    if (row.marginCalls > 0) reasons.push('有爆仓');
    if (row.singleLossPct > filters.maxSingleLossPct) reasons.push(`单笔亏损>${filters.maxSingleLossPct}%`);
    const sampleOk = row.ddPct >= 2.0 || (row.totalTrades >= 30 && row.winningTrades >= 8);
    if (!sampleOk) reasons.push('样本不足(回撤<2%需30笔+8胜)');

    if (reasons.length === 0) {
      if (row.ddPct > filters.maxDrawdown) reasons.push(`回撤>${filters.maxDrawdown}%`);
      if (row.sharpe < filters.minSharpe) reasons.push(`夏普<${filters.minSharpe}`);
      if (row.sortino < filters.minSortino) reasons.push(`索提诺<${filters.minSortino}`);
      if (row.winRate < filters.minWinRate) reasons.push(`胜率<${filters.minWinRate}%`);
      if (row.winLossRatio < filters.minWinLossRatio) reasons.push(`盈亏比<${filters.minWinLossRatio}`);
    }
    return reasons;
  };

  const filteredData = useMemo(() => deduplicatedData.map(row => {
    const reasons = getFilterReasons(row);
    return { ...row, filterReasons: reasons, passed: reasons.length === 0 };
  }).filter(r => r.passed), [deduplicatedData, filters]);

  const scoredData = useMemo(() => {
    if (filteredData.length === 0) return [];
    const N = filteredData.length;
    const pLow = N < 50 ? 0.0 : 0.05, pHigh = N < 50 ? 1.0 : 0.95;
    const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length-1, Math.floor(s.length*p))] || 0; };
    const allDDs = filteredData.map(d => d.ddPct).sort((a, b) => a - b);
    const calmarFloor = Math.max(allDDs[Math.floor(allDDs.length/2)] || 5.0, 2.0);
    const recalc = filteredData.map(r => ({ ...r, calmarRatio: r.returnPct / Math.max(r.ddPct, calmarFloor) }));
    const dynNorm = (v, min, max) => max === min ? 0.5 : Math.max(0, Math.min(1, (v-min)/(max-min)));
    const ranges = {
      calmar: { min: pct(recalc.map(d=>d.calmarRatio), pLow), max: pct(recalc.map(d=>d.calmarRatio), pHigh) },
      sharpe: { min: pct(recalc.map(d=>d.adjustedSharpe), pLow), max: pct(recalc.map(d=>d.adjustedSharpe), pHigh) },
      sortino: { min: pct(recalc.map(d=>d.sortino), pLow), max: pct(recalc.map(d=>d.sortino), pHigh) },
      profitFactor:{ min: pct(recalc.map(d=>d.profitFactor), pLow), max: pct(recalc.map(d=>d.profitFactor), pHigh) },
      netReturn: { min: pct(recalc.map(d=>d.returnPct), pLow), max: pct(recalc.map(d=>d.returnPct), pHigh) },
    };
    return recalc.map(row => ({
      ...row,
      finalScore:
        dynNorm(row.calmarRatio, ranges.calmar.min, ranges.calmar.max) * scoreWeights.calmar +
        dynNorm(row.adjustedSharpe, ranges.sharpe.min, ranges.sharpe.max) * scoreWeights.sharpe +
        dynNorm(row.sortino, ranges.sortino.min, ranges.sortino.max) * scoreWeights.sortino +
        dynNorm(row.profitFactor, ranges.profitFactor.min, ranges.profitFactor.max) * scoreWeights.profitFactor +
        dynNorm(row.returnPct, ranges.netReturn.min, ranges.netReturn.max) * (scoreWeights.netReturn || 0)
    }));
  }, [filteredData, scoreWeights]);

  const paretoFront = useMemo(() => {
    if (scoredData.length === 0) return [];
    const dims = ['calmarRatio', 'sharpe', 'sortino', 'profitFactor'];
    return scoredData.filter((item, i) =>
      !scoredData.some((other, j) => i !== j &&
        dims.every(d => other[d] >= item[d]) && dims.some(d => other[d] > item[d]))
    );
  }, [scoredData]);

  const isPareto = (row) => paretoFront.some(p => p.originalIndex === row.originalIndex);

  const enrichedScoredData = useMemo(() => {
    if (scoredData.length === 0) return [];
    return scoredData.map(row => {
      const stabilityCoeff = row.totalTrades >= 80 ? 1.03 : row.totalTrades >= 50 ? 1.01 : 1.0;
      let riskProximityPenalty = 0;
      const safeMaxDD = Math.max(0.0001, filters.maxDrawdown);
      const safeMaxLoss = Math.max(0.0001, filters.maxSingleLossPct);
      const ddProx = row.ddPct / safeMaxDD;
      if (ddProx > 0.85) riskProximityPenalty += 0.15 * (ddProx - 0.85) / 0.15;
      const lossProx = row.singleLossPct / safeMaxLoss;
      if (lossProx > 0.8) riskProximityPenalty += 0.1 * (lossProx - 0.8) / 0.2;

      let longShortPenalty = 0;
      const isBidi = (row.totalTradesLong||0) > 0 && (row.totalTradesShort||0) > 0;
      if (isBidi) {
        const l = row.netPnlLong||0, s = row.netPnlShort||0, tot = Math.abs(l)+Math.abs(s);
        if (tot > 0) {
          if (l < 0 || s < 0) longShortPenalty = 0.08 * Math.abs(Math.min(l,s)) / tot;
          else { const dom = Math.max(l,s)/tot; if (dom > 0.90) longShortPenalty = 0.03*(dom-0.90)/0.10; }
        }
      }
      const utilityScore = row.finalScore * stabilityCoeff - riskProximityPenalty - longShortPenalty;
      return { ...row, utilityScore, stabilityCoeff, riskProximityPenalty };
    }).sort((a, b) => b.utilityScore - a.utilityScore);
  }, [scoredData, filters]);

  useEffect(() => {
    let aborted = false;
    if (robustnessAbortRef.current) robustnessAbortRef.current();
    robustnessAbortRef.current = () => { aborted = true; };

    if (deduplicatedData.length < 2) {
      setRobustnessData({});
      setRobustnessProgress(0);
      return;
    }

    setRobustnessProgress(1);

    setTimeout(() => {
      if (aborted) return;
      const passedSet = new Set(filteredData.map(r => r.originalIndex));
      const { numericVaryingKeys, boolVaryingKeys, stepSizes } = prepareStepNeighborMeta(deduplicatedData);

      if (numericVaryingKeys.length === 0 && boolVaryingKeys.length === 0) {
        setRobustnessData({});
        setRobustnessProgress(100);
        return;
      }

      const result = {};
      const totalRows = deduplicatedData.length;
      let currentIndex = 0;
      const CHUNK = 150;

      const processChunk = () => {
        if (aborted) return;
        const end = Math.min(currentIndex + CHUNK, totalRows);

        for (let i = currentIndex; i < end; i++) {
          const row = deduplicatedData[i];
          const rowReturn = row.returnPct || 0;
          const rowDD = row.ddPct || 0;
          let totalNeighbors = 0, stableNeighbors = 0, passedNeighbors = 0;

          for (let j = 0; j < totalRows; j++) {
            if (i === j) continue;
            const other = deduplicatedData[j];
            let changedParams = 0;
            let anyExceedsTwoSteps = false;

            for (const key of numericVaryingKeys) {
              const vRow = row.strategyParams?.[key];
              const vOther = other.strategyParams?.[key];
              if (typeof vRow !== 'number' || !isFinite(vRow) ||
                  typeof vOther !== 'number' || !isFinite(vOther)) continue;
              const diff = Math.abs(vRow - vOther);
              if (diff < 1e-9) continue;
              const step = stepSizes[key];
              if (!isFinite(step) || step <= 0) { changedParams++; continue; }
              if (diff / step > 1.5) { anyExceedsTwoSteps = true; break; }
              changedParams++;
            }

            if (!anyExceedsTwoSteps) {
              for (const key of boolVaryingKeys) {
                const vRow = row.strategyParams?.[key];
                const vOther = other.strategyParams?.[key];
                if (typeof vRow !== 'boolean' || typeof vOther !== 'boolean') continue;
                if (vRow !== vOther) changedParams++;
              }
            }

            if (anyExceedsTwoSteps || changedParams === 0 || changedParams > 2) continue;

            totalNeighbors++;
            if (passedSet.has(other.originalIndex)) passedNeighbors++;

            const otherReturn = other.returnPct || 0;
            const otherDD = other.ddPct || 0;
            const ddDiffPt = Math.abs(otherDD - rowDD);
            let returnDiffPct;
            if (Math.abs(rowReturn) < 1e-6) {
              returnDiffPct = Math.abs(otherReturn) < 1e-6 ? 0 : 1;
            } else {
              returnDiffPct = Math.abs(otherReturn - rowReturn) / Math.abs(rowReturn);
            }
            if (returnDiffPct < 0.15 && ddDiffPt < 5.0) stableNeighbors++;
          }

          const stableRatio = totalNeighbors > 0 ? stableNeighbors / totalNeighbors : 0;
          const passedRatio = totalNeighbors > 0 ? passedNeighbors / totalNeighbors : 0;
          const confidenceMultiplier = totalNeighbors >= 3 ? 1.0 : (totalNeighbors > 0 ? 0.9 : 0);
          result[row.originalIndex] = {
            totalNeighbors, stableNeighbors, passedNeighbors,
            stableRatio, passedRatio,
            robustnessScore: (stableRatio * 0.70 + passedRatio * 0.30) * confidenceMultiplier,
            paramDimensions: numericVaryingKeys.length,
            boolDimensions: boolVaryingKeys.length,
            stepSizes,
          };
        }

        currentIndex = end;
        setRobustnessProgress(Math.round((currentIndex / totalRows) * 100));

        if (currentIndex < totalRows) {
          setTimeout(processChunk, 0);
        } else {
          setRobustnessData(result);
          setRobustnessProgress(100);
        }
      };

      setTimeout(processChunk, 0);
    }, 0);

    return () => { aborted = true; };
  }, [deduplicatedData, filteredData]);

  const finalRankedData = useMemo(() => {
    if (enrichedScoredData.length === 0) return [];
    return enrichedScoredData.map(row => {
      const rb = robustnessData[row.originalIndex] || {
        totalNeighbors: 0, stableNeighbors: 0, passedNeighbors: 0, robustnessScore: 0
      };
      const multiplier = (1 - robustnessWeight) + robustnessWeight * rb.robustnessScore;
      const combinedScore = row.utilityScore > 0 ? row.utilityScore * multiplier : row.utilityScore;
      return {
        ...row,
        neighborCount: rb.totalNeighbors,
        stableNeighborCount: rb.stableNeighbors,
        passedNeighborCount: rb.passedNeighbors,
        robustnessScore: rb.robustnessScore,
        combinedScore
      };
    }).sort((a, b) => b.combinedScore - a.combinedScore);
  }, [enrichedScoredData, robustnessData, robustnessWeight]);

  const recommendedParameter = useMemo(() => finalRankedData.length > 0 ? finalRankedData[0] : null, [finalRankedData]);

  const displayData = useMemo(() => {
    const src = showParetoOnly ? finalRankedData.filter(r => isPareto(r)) : finalRankedData;
    return src.slice(0, 10);
  }, [finalRankedData, showParetoOnly, isPareto]);

  const allTableData = useMemo(() => {
    const enrichedMap = new Map(finalRankedData.map(r => [r.originalIndex, r]));
    const rows = deduplicatedData.map(row => {
      const reasons = getFilterReasons(row);
      const enriched = enrichedMap.get(row.originalIndex);
      const rb = robustnessData[row.originalIndex] || { totalNeighbors: 0, stableNeighbors: 0, passedNeighbors: 0, robustnessScore: 0 };
      return {
        ...(enriched || row),
        filterReasons: reasons,
        passed: reasons.length === 0,
        combinedScore: enriched?.combinedScore || null,
        robustnessScore: rb.robustnessScore || null,
        neighborCount: rb.totalNeighbors || 0,
        stableNeighborCount: rb.stableNeighbors || 0,
        passedNeighborCount: rb.passedNeighbors || 0,
      };
    });
    if (allTableSort === 'combined') rows.sort((a, b) => (b.combinedScore||0) - (a.combinedScore||0));
    else if (allTableSort === 'utility') rows.sort((a, b) => (b.utilityScore||0) - (a.utilityScore||0));
    else if (allTableSort === 'totalExpectation') rows.sort((a, b) => (b.totalExpectation||0) - (a.totalExpectation||0));
    return rows;
  }, [deduplicatedData, finalRankedData, robustnessData, allTableSort, filters, getFilterReasons]);

  const algoStats = useMemo(() => {
    const firstKey = Object.keys(robustnessData)[0];
    if (!firstKey) return null;
    const info = robustnessData[firstKey];
    return { 
      dims: info?.paramDimensions || 0, 
      boolDims: info?.boolDimensions || 0, 
      steps: info?.stepSizes || {} 
    };
  }, [robustnessData]);

  const stats = useMemo(() => ({
    total: data.length,
    deduplicated: deduplicatedData.length,
    filtered: filteredData.length,
    pareto: paretoFront.length,
    maxReturn: scoredData.length > 0 ? scoredData.reduce((max, r) => Math.max(max, r.returnPct||0), 0) : 0,
    maxCalmar: scoredData.length > 0 ? scoredData.reduce((max, r) => Math.max(max, r.calmarRatio||0), 0) : 0,
    paramDimensions: algoStats?.dims || 0,
    boolDimensions: algoStats?.boolDims || 0,
  }), [data.length, deduplicatedData.length, filteredData.length, scoredData.length, paretoFront.length, algoStats]);

  const filterInputs = [
    { key: 'minTrades', label: '最小交易次数', step: 1, category: 'survival' },
    { key: 'minProfitFactor', label: '最小盈利因子', step: 0.1, category: 'survival' },
    { key: 'maxSingleLossPct',label: '最大单笔亏损 (%)', step: 1, category: 'survival' },
    { key: 'maxDrawdown', label: '最大回撤 (%)', step: 1, category: 'risk' },
    { key: 'minSharpe', label: '最小夏普比率', step: 0.05, category: 'risk' },
    { key: 'minSortino', label: '最小索提诺比率', step: 0.1, category: 'risk' },
    { key: 'minWinRate', label: '最小胜率 (%)', step: 1, category: 'risk' },
    { key: 'minWinLossRatio', label: '最小盈亏比', step: 0.1, category: 'risk' },
  ];

  const recommendColumns = [
    { header: '行号', render: (row) => (
      <span className="flex items-center gap-1 font-mono text-slate-400">
        <span>{row.originalIndex}</span>
        {recommendedParameter?.originalIndex === row.originalIndex && <Award className="text-amber-500" size={14} />}
      </span>
    )},
    { header: '综合分', align: 'text-right', render: (row) =>
      <span className="font-bold text-amber-500">{(row.combinedScore||0).toFixed(3)}</span> },
    { header: '效用分', align: 'text-right', render: (row) =>
      <span className="text-purple-400">{(row.utilityScore||0).toFixed(3)}</span> },
    { header: '稳健性', align: 'text-left', render: (row) =>
      <RobustnessBar
        score={row.robustnessScore||0}
        totalNeighbors={row.neighborCount||0}
        stableNeighbors={row.stableNeighborCount||0}
        passedNeighbors={row.passedNeighborCount||0}
      /> },
    { header: 'Calmar', align: 'text-right', render: (row) =>
      <span className="font-bold text-emerald-500">{(row.calmarRatio||0).toFixed(2)}</span> },
    { header: '净收益%', align: 'text-right', render: (row) => `${(row.returnPct||0).toFixed(2)}%` },
    { header: '回撤%', align: 'text-right', render: (row) =>
      <span className={(row.ddPct||0)>20?'text-red-500':(row.ddPct||0)>15?'text-amber-500':'text-emerald-500'}>
        {(row.ddPct||0).toFixed(2)}%</span> },
    { header: '胜率', align: 'text-right', render: (row) =>
      <span className={(row.winRate||0)>=40?'text-emerald-500':(row.winRate||0)>=30?'text-amber-500':'text-orange-500'}>
        {(row.winRate||0).toFixed(1)}%</span> },
    { header: '盈亏比', align: 'text-right', render: (row) =>
      <span className={(row.winLossRatio||0)>=3?'text-emerald-500':'text-amber-500'}>{(row.winLossRatio||0).toFixed(2)}</span> },
    { header: '笔数', align: 'text-right', render: (row) => row.totalTrades||0 },
    { header: '帕累托', align: 'text-center', render: (row) => isPareto(row) && <Star className="text-purple-500 inline" size={14} /> },
  ];

  const allDataColumns = [
    { header: '行号', render: (row) => <span className="text-slate-400 font-mono">{row.originalIndex}</span> },
    { header: '综合分', align: 'text-right', render: (row) =>
      <span className="font-bold text-amber-500">{row.combinedScore!=null?(row.combinedScore).toFixed(3):'-'}</span> },
    { header: '效用分', align: 'text-right', render: (row) =>
      <span className="text-purple-400">{row.utilityScore!=null?(row.utilityScore).toFixed(3):'-'}</span> },
    { header: '稳健性', align: 'text-left', render: (row) =>
      row.robustnessScore!=null
        ? <RobustnessBar score={row.robustnessScore} totalNeighbors={row.neighborCount||0} stableNeighbors={row.stableNeighborCount||0} passedNeighbors={row.passedNeighborCount||0} />
        : <span className="text-slate-600">-</span> },
    { header: 'Calmar', align: 'text-right', render: (row) => (row.calmarRatio||0).toFixed(2) },
    { header: '净收益%', align: 'text-right', render: (row) => `${(row.returnPct||0).toFixed(2)}%` },
    { header: '回撤%', align: 'text-right', render: (row) => `${(row.ddPct||0).toFixed(2)}%` },
    { header: '笔数', align: 'text-right', render: (row) => row.totalTrades||0 },
    { header: '筛选状态', align: 'text-left', render: (row) =>
      row.passed
        ? <span className="flex items-center gap-1"><CheckCircle className="text-emerald-500" size={12} /><span className="text-emerald-500 font-medium">通过</span></span>
        : <span className="flex items-start gap-1"><XCircle className="text-red-500 flex-shrink-0 mt-0.5" size={12} /><span className="text-red-500 text-xs leading-tight">{row.filterReasons.join('; ')}</span></span>
    },
  ];

  // Live clock for header
  const [clock, setClock] = React.useState(() => new Date().toLocaleTimeString('zh-CN', {hour12:false}));
  React.useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('zh-CN', {hour12:false})), 1000);
    return () => clearInterval(t);
  }, []);

  // Ticker items (Real-time from Binance)
  const [tickerItems, setTickerItems] = React.useState([]);

  React.useEffect(() => {
    const fetchTicker = async () => {
      try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const data = await response.json();
        const targets = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ARBUSDT', 'DOGEUSDT', 'MATICUSDT', 'AVAXUSDT'];
        const targetSet = new Set(targets);
        const filtered = data.filter(d => targetSet.has(d.symbol));
        // Sort to match target order
        filtered.sort((a, b) => targets.indexOf(a.symbol) - targets.indexOf(b.symbol));
        
        const formatPrice = (p) => {
          const val = parseFloat(p);
          if (val < 1) return val.toFixed(4);
          if (val < 100) return val.toFixed(2);
          return val.toFixed(1);
        };
        
        const items = filtered.map(item => ({
          sym: item.symbol.replace('USDT', '/USDT'),
          val: '$' + formatPrice(item.lastPrice),
          chg: (parseFloat(item.priceChangePercent) >= 0 ? '+' : '') + parseFloat(item.priceChangePercent).toFixed(2) + '%',
          up: parseFloat(item.priceChangePercent) >= 0
        }));
        
        if (items.length > 0) setTickerItems(items);
      } catch (e) {
        console.error('Ticker fetch error:', e);
      }
    };
    
    fetchTicker();
    const timer = setInterval(fetchTicker, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen text-slate-100 bg-slate-900">

      {/* ── Ticker Tape ── */}
      <div className="ticker-wrap py-2 border-b border-slate-800 bg-slate-800/30">
        <div className="ticker-inner">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2 mx-6 text-xs text-slate-300 font-mono-tech">
              <span className="text-slate-500">{item.sym}</span>
              <span className="text-slate-100 font-bold">{item.val}</span>
              <span className={item.up ? 'text-emerald-500' : 'text-red-500'}>
                {item.chg}
              </span>
              <span className="text-slate-700 ml-6">◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Top Nav Bar ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center border border-slate-700">
            <Zap size={16} className="text-blue-500" />
          </div>
          <span className="text-sm font-bold tracking-wider text-slate-100">
            NEXUS QUANT
          </span>
          <span className="text-xs text-slate-500 hidden md:block">
            // BTC 量化回测智能评分系统
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded text-xs bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-mono-tech">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>SYSTEM ONLINE</span>
          </div>
          <div className="px-3 py-1.5 rounded text-xs bg-slate-800 border border-slate-700 text-slate-300 font-mono-tech">
            {clock}
          </div>
          <div className="px-3 py-1.5 rounded text-xs hidden md:block bg-slate-800 border border-slate-700 text-slate-400 font-mono-tech">
            ENGINE v3.2
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 md:px-6">
        {/* ── Header ── */}
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded mb-4 text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 font-mono-tech">
            <Activity size={12} />
            TradingView Assistant Pro // Stability-First
          </div>

          <h1 className="mb-3 font-bold text-4xl text-slate-100">
            量化回测评分面板
          </h1>

          <p className="max-w-2xl text-sm text-slate-400 leading-relaxed">
            基于<span className="text-emerald-400 mx-1">单步邻居法</span>
            的稳健性评估系统，助你从成千上万个回测组合中锁定真正具备实盘价值的
            <span className="text-amber-400 mx-1">「稳健高原」</span>。
          </p>
        </header>

        {/* ── Upload Area ── */}
        <section className="mb-8">
          <div className="bg-slate-800 rounded border border-slate-700 p-6">
            <h3 className="flex items-center gap-2 mb-4 text-sm font-semibold text-slate-300">
              <Upload size={16} />
              数据上传
            </h3>
            <label className="flex flex-col items-center justify-center gap-3 cursor-pointer p-8 rounded border-2 border-dashed border-slate-600 bg-slate-900/50 hover:bg-slate-700/50 hover:border-slate-500 transition-all">
              <div className="p-3 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                <Upload size={24} />
              </div>
              <div className="text-center">
                <span className="text-base font-semibold block text-slate-200">
                  拖入或点击上传回测 CSV 报告
                </span>
                <span className="text-xs text-slate-500 mt-1 block">
                  支持 TradingView 策略生成器导出的原始数据
                </span>
              </div>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
            {uploadLog && (
              <div className={`mt-4 text-sm p-3 rounded flex items-center gap-2 border ${
                uploadLog.includes('✅') 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                {uploadLog.includes('✅') ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {uploadLog}
              </div>
            )}
          </div>
        </section>

        {data.length > 0 && (
          <div className="animate-in fade-in duration-500">
            {/* Stats Overview */}
            <section className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-8">
              <StatCard label="原始组合" value={stats.total} color="blue" />
              <StatCard label="去重后" value={stats.deduplicated} color="cyan" />
              <StatCard label="通过过滤" value={stats.filtered} color="green" />
              <StatCard label="帕累托最优" value={stats.pareto} color="purple" />
              <StatCard label="MAX 收益" value={stats.maxReturn.toFixed(1) + '%'} color="amber" />
              <StatCard label="MAX Calmar" value={stats.maxCalmar.toFixed(2)} color="rose" />
              <StatCard label="参数维度" value={(stats.paramDimensions + stats.boolDimensions) + 'D'} color="teal" />
            </section>

            {/* ── Robustness Scan Progress ── */}
            {robustnessProgress > 0 && robustnessProgress < 100 && (
              <div className="mb-6 p-4 rounded bg-slate-800 border border-slate-700 flex items-center gap-4">
                <Activity className="animate-spin text-blue-500 flex-shrink-0" size={20} />
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-300">
                      单步邻居稳健性扫描中...
                    </span>
                    <span className="text-xs font-bold text-blue-400 font-mono-tech">
                      {robustnessProgress}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded bg-slate-700 overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${robustnessProgress}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Algo Info Panel ── */}
            <section className="mb-8">
              <div className="bg-slate-800 rounded border border-slate-700 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-700/50 transition-colors"
                  onClick={() => setShowAlgoInfo(!showAlgoInfo)}
                >
                  <div className="flex items-center gap-3">
                    <Shield size={16} className="text-blue-500" />
                    <span className="font-semibold text-sm text-slate-300">
                      单步邻居评估算法说明
                    </span>
                  </div>
                  <div className={`transition-transform duration-300 ${showAlgoInfo ? 'rotate-180' : ''}`}>
                    <ArrowUpRight size={16} className="text-slate-500 rotate-45" />
                  </div>
                </button>

                {showAlgoInfo && (
                  <div className="px-6 pb-6 border-t border-slate-700 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div className="rounded bg-red-500/5 border border-red-500/20 p-5">
                        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-red-400">
                          <XCircle size={14} /> 核心解决问题
                        </div>
                        <ul className="space-y-2 text-sm text-slate-400">
                          <li>• <span className="text-red-400 font-medium">孤峰陷阱</span>：部分参数虽然回测极佳，但稍有改动表现即雪崩。</li>
                          <li>• <span className="text-red-400 font-medium">维度黑洞</span>：高维参数空间中，传统算法极容易漏掉真正稳健的配置。</li>
                        </ul>
                      </div>
                      <div className="rounded bg-emerald-500/5 border border-emerald-500/20 p-5">
                        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-emerald-500">
                          <CheckCircle size={14} /> 新算法特性
                        </div>
                        <ul className="space-y-2 text-sm text-slate-400">
                          <li>• <span className="text-emerald-500 font-medium">高原效应</span>：搜寻"仅改变 1-2 步进"的邻居，确认"高原区域"。</li>
                          <li>• <span className="text-emerald-500 font-medium">布尔修正</span>：深度支持布尔型开关参数的变动追踪。</li>
                        </ul>
                      </div>
                    </div>

                    {algoStats && (
                      <div className="rounded bg-slate-900 border border-slate-700 p-5">
                        <h4 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                          <Activity size={14} className="text-blue-500" /> 步长推断结果
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2 gap-x-6 text-sm">
                          {Object.entries(algoStats.steps).map(([key, step]) => (
                            <div key={key} className="flex justify-between items-center py-1 border-b border-slate-800 last:border-0">
                              <span className="truncate mr-3 text-slate-400">{key}</span>
                              <span className="font-mono-tech text-blue-400 font-bold bg-blue-500/10 px-2 rounded">
                                {isFinite(step) ? step.toFixed(4).replace(/\.?0+$/, '') : 'INF'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ── Filter & Score Config ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Filter Panel */}
              <section className="bg-slate-800 rounded border border-slate-700 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded bg-slate-900 border border-slate-700">
                    <Filter size={16} className="text-slate-300" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-100">
                    分层核心过滤
                  </h2>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        LAYER 1 // 生存筛选
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {filterInputs.filter(f=>f.category==='survival').map(({ key, label, step }) => (
                        <div key={key}>
                          <label className="block text-xs font-semibold text-slate-400 mb-1.5">{label}</label>
                          <input type="number" step={step} value={filters[key]}
                            onChange={(e)=>setFilters({...filters,[key]:Number(e.target.value)})}
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono-tech transition-colors" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <hr className="border-slate-700" />

                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        LAYER 2 // 性能深度过滤
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {filterInputs.filter(f=>f.category==='risk').map(({ key, label, step }) => (
                        <div key={key}>
                          <label className="block text-xs font-semibold text-slate-400 mb-1.5">{label}</label>
                          <input type="number" step={step} value={filters[key]}
                            onChange={(e)=>setFilters({...filters,[key]:Number(e.target.value)})}
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-mono-tech transition-colors" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Score Weights Panel */}
              <section className="bg-slate-800 rounded border border-slate-700 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded bg-slate-900 border border-slate-700">
                    <Award size={16} className="text-slate-300" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-100">
                    加权评估矩阵
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  {[
                    { key:'calmar', label:'Calmar Ratio' },
                    { key:'sortino', label:'Sortino Ratio' },
                    { key:'profitFactor', label:'Profit Factor' },
                    { key:'netReturn', label:'Net Return %' },
                    { key:'sharpe', label:'Sharpe Ratio' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">{label}</label>
                      <input type="number" step="0.05" min="0" max="1"
                        value={scoreWeights[key]||0}
                        onChange={(e)=>setScoreWeights({...scoreWeights,[key]:Number(e.target.value)})}
                        className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-sm text-amber-500 focus:outline-none focus:border-amber-500 font-mono-tech transition-colors" />
                    </div>
                  ))}
                </div>

                <hr className="border-slate-700 mb-6" />

                <div>
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-1">
                    <Shield size={16} className="text-blue-500" /> 稳健性置信因子
                  </h4>
                  <p className="text-xs text-slate-500 mb-4">决定"选高原"还是"选山尖"的平衡杠杆</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <input type="range" min="0" max="1" step="0.05"
                        value={robustnessWeight}
                        onChange={(e)=>setRobustnessWeight(Number(e.target.value))}
                        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-900 border border-slate-700 accent-blue-500" />
                      <div className="flex justify-between mt-2 text-xs font-semibold text-slate-500">
                        <span>纯收益导向</span>
                        <span>极致稳健</span>
                      </div>
                    </div>
                    <div className="px-4 py-2 rounded bg-slate-900 border border-slate-700 font-bold text-xl min-w-[80px] text-center text-blue-500 font-mono-tech">
                      {(robustnessWeight*100).toFixed(0)}<span className="text-sm ml-1">%</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Results Section */}
            <div className={`transition-all duration-700 ${robustnessProgress > 0 && robustnessProgress < 100 ? 'opacity-30 blur-sm pointer-events-none scale-[0.99]' : 'opacity-100 scale-100'}`}>
              
              {/* ── GOLD Recommendation Card ── */}
              {recommendedParameter && (
                <section className="mb-12 relative">
                  <div className="relative rounded bg-slate-800 border-2 border-amber-500 overflow-hidden shadow-sm">
                    {/* Header row */}
                    <div className="p-6 md:p-8 border-b border-slate-700 bg-slate-800">
                      <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
                        <div className="flex gap-5 items-start">
                          <div className="p-4 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 flex-shrink-0">
                            <Award size={36} strokeWidth={2} />
                          </div>
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-amber-500 font-mono-tech">
                                AI SELECTED OPTIMAL
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 border border-slate-700 text-slate-400 font-mono-tech">
                                ROW #{recommendedParameter.originalIndex}
                              </span>
                            </div>
                            <h2 className="text-2xl font-bold text-slate-100 mb-2">
                              最强推荐参数组
                            </h2>
                            <div className="flex items-center gap-2 text-slate-400">
                              <TrendingUp size={14} className="text-emerald-500" />
                              <span className="text-sm">该组合在全域参数变动中表现出极高的生存韧性</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">
                            COMBINED SCORE
                          </div>
                          <div className="text-5xl font-bold text-amber-500 font-mono-tech">
                            {(recommendedParameter.combinedScore||0).toFixed(3)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 md:p-8 bg-slate-900/50">
                      {/* Metrics grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        {/* Robustness */}
                        <div className="rounded bg-slate-800 border border-slate-700 p-5">
                          <div className="text-xs font-semibold uppercase text-slate-400 mb-3">稳健性评估</div>
                          <div className="flex justify-between items-baseline mb-2">
                            <span className="text-xs text-slate-500">高原置信度</span>
                            <span className="text-2xl font-bold text-blue-400 font-mono-tech">
                              {((recommendedParameter.robustnessScore||0)*100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-2 rounded bg-slate-700 overflow-hidden mb-2">
                            <div className="h-full bg-blue-500 transition-all duration-1000"
                              style={{ width: `${(recommendedParameter.robustnessScore||0)*100}%` }} />
                          </div>
                          <div className="flex justify-between text-xs text-slate-500 font-mono-tech">
                            <span>{recommendedParameter.stableNeighborCount} STABLE</span>
                            <span>{recommendedParameter.neighborCount} NBRS</span>
                          </div>
                        </div>

                        {/* Core metrics */}
                        <div className="rounded bg-slate-800 border border-slate-700 p-5 lg:col-span-2">
                          <div className="text-xs font-semibold uppercase text-slate-400 mb-4">核心绩效数据</div>
                          <div className="grid grid-cols-3 gap-y-4 gap-x-2">
                            {[
                              { label:'CALMAR', val:(recommendedParameter.calmarRatio||0).toFixed(2), color:'text-emerald-500' },
                              { label:'NET PROFIT', val:`${(recommendedParameter.returnPct||0).toFixed(2)}%`, color:'text-blue-400' },
                              { label:'MAX DD', val:`${(recommendedParameter.ddPct||0).toFixed(2)}%`, color:(recommendedParameter.ddPct||0)>15?'text-red-500':'text-emerald-500' },
                              { label:'PROFIT FACTOR', val:(recommendedParameter.profitFactor||0).toFixed(2), color:'text-slate-100' },
                              { label:'WIN RATE', val:`${(recommendedParameter.winRate||0).toFixed(1)}%`, color:'text-slate-100' },
                              { label:'TRADES', val:recommendedParameter.totalTrades, color:'text-slate-400' },
                            ].map(({label, val, color}) => (
                              <div key={label}>
                                <div className="text-[10px] font-semibold uppercase text-slate-500 mb-1">{label}</div>
                                <div className={`text-lg font-bold font-mono-tech ${color}`}>
                                  {val}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Kelly */}
                        <div className="rounded bg-slate-800 border border-slate-700 p-5">
                          <div className="text-xs font-semibold uppercase text-slate-400 mb-3">资金管理</div>
                          <div className="text-[10px] text-slate-500 mb-1">KELLY CRITERION</div>
                          <div className="text-xl font-bold mb-3 text-purple-400 font-mono-tech">
                            {(recommendedParameter.kellyFraction||0).toFixed(3)}
                          </div>
                          <div className="rounded bg-slate-900 border border-slate-700 p-3">
                            <div className="text-[10px] font-semibold uppercase text-slate-400 mb-1">建议入场仓位</div>
                            <div className="text-2xl font-bold text-purple-400 font-mono-tech">
                              {(Math.max(0,recommendedParameter.kellyFraction||0)*50).toFixed(1)}%
                            </div>
                            <div className="text-[10px] mt-1 text-slate-500">* Half-Kelly 保守策略</div>
                          </div>
                        </div>
                      </div>

                      {/* Strategy Params */}
                      {recommendedParameter.strategyParams && Object.keys(recommendedParameter.strategyParams).length > 0 && (
                        <div className="rounded bg-slate-800 border border-slate-700 p-5 mb-5">
                          <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 mb-4">
                            <Zap size={12} className="text-blue-500" /> SCRIPT INPUTS // 策略参数配置
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {Object.entries(recommendedParameter.strategyParams)
                              .filter(([,v]) => v!==null && v!==undefined && v!=='' && !(typeof v==='number'&&isNaN(v)))
                              .map(([key,value]) => (
                                <div key={key}>
                                  <div className="text-[10px] font-semibold uppercase text-slate-500 truncate mb-1">{key}</div>
                                  <div className="font-bold text-sm text-blue-400 font-mono-tech">
                                    {typeof value==='boolean'?(value?'TRUE':'FALSE'):value}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Status badges */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {[
                          { icon:<Activity size={14}/>, label:'Stability: Premium', border:'border-emerald-500/20', text:'text-emerald-500' },
                          { icon:<Shield size={14}/>, label:'Risk: Optimized', border:'border-blue-500/20', text:'text-blue-500' },
                        ].map(({icon, label, border, text}) => (
                          <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-900 border ${border} ${text}`}>
                            {icon} {label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* ── Ranking Tables ── */}
              <div className="grid grid-cols-1 gap-8">
                {/* TOP 10 */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-3 text-slate-100">
                        <div className="w-1.5 h-6 rounded bg-blue-500" />
                        强势排行榜 TOP 10
                      </h2>
                      <p className="text-xs mt-1 text-slate-400">
                        已综合收益效能与参数稳健性进行加权排序
                      </p>
                    </div>
                    <button
                      onClick={()=>setShowParetoOnly(!showParetoOnly)}
                      className={`px-4 py-2 rounded text-xs font-semibold transition-colors border ${
                        showParetoOnly
                          ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {showParetoOnly ? '★ 展示全部' : '☆ 仅看帕累托最优'}
                    </button>
                  </div>
                  <DataTable data={displayData} columns={recommendColumns}
                    rowClassName={(row) => {
                      const isRec = recommendedParameter?.originalIndex === row.originalIndex;
                      return isRec ? 'bg-amber-500/5 font-bold hover:bg-amber-500/10' :
                             isPareto(row) ? 'bg-purple-500/5 hover:bg-purple-500/10' : '';
                    }}
                  />
                </section>

                {/* Raw data pool */}
                <section>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-3 text-slate-100">
                        <div className="w-1.5 h-6 rounded bg-slate-600" />
                        原始数据明细池
                      </h2>
                      <p className="text-xs mt-1 text-slate-400">
                        完整记录每一组参数的回测表现与过滤状态
                      </p>
                    </div>
                    <div className="flex p-1 rounded bg-slate-800 border border-slate-700 gap-1">
                      {[{key:'combined', label:'综合分'},{key:'utility', label:'效用分'},{key:'original', label:'原始行'}].map(({key, label}) => (
                        <button key={key} onClick={()=>setAllTableSort(key)}
                          className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                            allTableSort===key
                              ? 'bg-slate-700 text-slate-100'
                              : 'text-slate-400 hover:text-slate-300'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <DataTable data={allTableData.slice(0, 500)} columns={allDataColumns}
                    rowClassName={(row) => {
                      const isRec = recommendedParameter?.originalIndex === row.originalIndex;
                      return isRec ? 'bg-amber-500/5 font-bold' : row.passed ? '' : 'text-slate-500 bg-slate-800/10';
                    }}
                  />
                </section>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {data.length === 0 && (
          <section className="mt-24 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-slate-800 border border-slate-700">
                <BarChart3 size={32} className="text-slate-500" />
              </div>

              <h2 className="text-xl font-bold mb-3 text-slate-300">
                等待数据注入
              </h2>
              <p className="text-sm leading-relaxed mb-6 text-slate-500">
                该系统将自动解析您的交易策略报告，通过数学建模从海量结果中锁定具备长效竞争力的核心参数。
              </p>
              <div className="flex gap-2 justify-center">
                {['NO DATA', 'ANALYSIS IDLE', 'ENGINE v3.2'].map(t => (
                  <div key={t} className="px-3 py-1 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-500">
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ── Footer status bar ── */}
      <div className="mt-16 px-6 py-4 flex flex-col md:flex-row gap-4 items-center justify-between text-xs border-t border-slate-800 bg-slate-900 text-slate-500 font-mono-tech">
        <div className="flex items-center gap-4">
          <span className="text-blue-500">NEXUS QUANT ENGINE v3.2</span>
          <span>// LATENT STABILITY ALGORITHM</span>
        </div>
        <div className="flex items-center gap-4">
          <span>DISCLAIMER: 仅供策略研究参考，不构成投资建议</span>
        </div>
      </div>
    </div>
  );
};

export default AnalysisDashboard;
