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
      <span className="flex items-center gap-1 font-mono">
        <span className="text-gray-400">{row.originalIndex}</span>
        {recommendedParameter?.originalIndex === row.originalIndex && <Award className="text-amber-400" size={14} />}
      </span>
    )},
    { header: '综合分', align: 'text-right', render: (row) =>
      <span className="font-bold text-amber-400">{(row.combinedScore||0).toFixed(3)}</span> },
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
      <span className="font-bold text-green-400">{(row.calmarRatio||0).toFixed(2)}</span> },
    { header: '净收益%', align: 'text-right', render: (row) => `${(row.returnPct||0).toFixed(2)}%` },
    { header: '回撤%', align: 'text-right', render: (row) =>
      <span className={(row.ddPct||0)>20?'text-red-400':(row.ddPct||0)>15?'text-yellow-400':'text-green-400'}>
        {(row.ddPct||0).toFixed(2)}%</span> },
    { header: '胜率', align: 'text-right', render: (row) =>
      <span className={(row.winRate||0)>=40?'text-green-400':(row.winRate||0)>=30?'text-yellow-400':'text-orange-400'}>
        {(row.winRate||0).toFixed(1)}%</span> },
    { header: '盈亏比', align: 'text-right', render: (row) =>
      <span className={(row.winLossRatio||0)>=3?'text-green-400':'text-yellow-400'}>{(row.winLossRatio||0).toFixed(2)}</span> },
    { header: '笔数', align: 'text-right', render: (row) => row.totalTrades||0 },
    { header: '帕累托', align: 'text-center', render: (row) => isPareto(row) && <Star className="text-purple-400 inline" size={14} /> },
  ];

  const allDataColumns = [
    { header: '行号', render: (row) => <span className="text-gray-400 font-mono">{row.originalIndex}</span> },
    { header: '综合分', align: 'text-right', render: (row) =>
      <span className="font-bold text-amber-400">{row.combinedScore!=null?(row.combinedScore).toFixed(3):'-'}</span> },
    { header: '效用分', align: 'text-right', render: (row) =>
      <span className="text-purple-400">{row.utilityScore!=null?(row.utilityScore).toFixed(3):'-'}</span> },
    { header: '稳健性', align: 'text-left', render: (row) =>
      row.robustnessScore!=null
        ? <RobustnessBar score={row.robustnessScore} totalNeighbors={row.neighborCount||0} stableNeighbors={row.stableNeighborCount||0} passedNeighbors={row.passedNeighborCount||0} />
        : <span className="text-gray-600 text-[10px]">-</span> },
    { header: 'Calmar', align: 'text-right', render: (row) => (row.calmarRatio||0).toFixed(2) },
    { header: '净收益%', align: 'text-right', render: (row) => `${(row.returnPct||0).toFixed(2)}%` },
    { header: '回撤%', align: 'text-right', render: (row) => `${(row.ddPct||0).toFixed(2)}%` },
    { header: '笔数', align: 'text-right', render: (row) => row.totalTrades||0 },
    { header: '筛选状态', align: 'text-left', render: (row) =>
      row.passed
        ? <span className="flex items-center gap-1"><CheckCircle className="text-green-400" size={12} /><span className="text-green-400 font-medium">通过</span></span>
        : <span className="flex items-start gap-1"><XCircle className="text-red-400 flex-shrink-0 mt-0.5" size={12} /><span className="text-red-400 text-[10px] leading-tight">{row.filterReasons.join('; ')}</span></span>
    },
  ];

  // Live clock for header
  const [clock, setClock] = React.useState(() => new Date().toLocaleTimeString('zh-CN', {hour12:false}));
  React.useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('zh-CN', {hour12:false})), 1000);
    return () => clearInterval(t);
  }, []);

  // Ticker items
  const tickerItems = [
    { sym:'BTC/USDT', val:'$67,234', chg:'+2.41%', up:true },
    { sym:'ETH/USDT', val:'$3,521',  chg:'+1.87%', up:true },
    { sym:'SOL/USDT', val:'$168.4',  chg:'-0.92%', up:false },
    { sym:'BNB/USDT', val:'$582.1',  chg:'+0.55%', up:true },
    { sym:'ARB/USDT', val:'$1.124',  chg:'+3.21%', up:true },
    { sym:'DOGE/USDT',val:'$0.1423', chg:'-1.33%', up:false },
    { sym:'MATIC/USDT',val:'$0.892', chg:'+0.78%', up:true },
    { sym:'AVAX/USDT', val:'$38.72', chg:'-0.44%', up:false },
  ];

  return (
    <div className="min-h-screen text-[#e8f4fd]" style={{ background: '#050a14' }}>

      {/* ── Ticker Tape ── */}
      <div className="ticker-wrap py-1.5" style={{ borderBottom: '1px solid rgba(0,212,255,0.15)', background: 'rgba(0,212,255,0.04)' }}>
        <div className="ticker-inner">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 mx-6 text-xs"
              style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              <span style={{ color: '#7eb3d4' }}>{item.sym}</span>
              <span style={{ color: '#e8f4fd', fontWeight: 700 }}>{item.val}</span>
              <span style={{ color: item.up ? '#00ff88' : '#ff3366',
                textShadow: item.up ? '0 0 6px rgba(0,255,136,0.6)' : '0 0 6px rgba(255,51,102,0.6)' }}>
                {item.chg}
              </span>
              <span style={{ color: 'rgba(0,212,255,0.3)', marginLeft: 8 }}>◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Top Nav Bar ── */}
      <div className="flex items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.12)', background: 'rgba(5,10,20,0.7)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.4)' }}>
            <Zap size={14} style={{ color: '#00d4ff' }} />
          </div>
          <span className="text-sm font-black tracking-widest uppercase"
            style={{ fontFamily: "'Orbitron', monospace", color: '#00d4ff',
              textShadow: '0 0 10px rgba(0,212,255,0.5)' }}>
            NEXUS QUANT
          </span>
          <span className="text-xs tracking-wider hidden md:block" style={{ color: '#7eb3d4' }}>
            // BTC 量化回测智能评分系统
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)',
              fontFamily: "'Share Tech Mono', monospace" }}>
            <span className="status-dot" />
            <span style={{ color: '#00ff88' }}>SYSTEM ONLINE</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)',
              fontFamily: "'Share Tech Mono', monospace", color: '#00d4ff' }}>
            {clock}
          </div>
          <div className="px-3 py-1.5 rounded-lg text-xs hidden md:block"
            style={{ background: 'rgba(10,22,40,0.8)', border: '1px solid rgba(0,212,255,0.15)',
              fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>
            ENGINE v3.2 // LATENT STABILITY: ACTIVE
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10 md:px-6">
        {/* ── Header ── */}
        <header className="mb-12 relative">
          {/* Background glows */}
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)' }} />
          <div className="absolute -top-10 right-0 w-96 h-96 rounded-full blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(0,255,136,0.04) 0%, transparent 70%)' }} />

          <div className="relative z-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-5 text-xs font-bold tracking-widest uppercase"
              style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)',
                fontFamily: "'Share Tech Mono', monospace", color: '#00d4ff' }}>
              <Activity size={12} />
              TradingView Assistant Pro // Stability-First AI Engine
            </div>

            {/* Title */}
            <h1 className="mb-4 font-black tracking-tighter leading-none"
              style={{ fontFamily: "'Orbitron', monospace", fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
              <span style={{ color: '#e8f4fd' }}>量化回测</span>
              <span className="gradient-text-neon ml-2">评分面板</span>
            </h1>

            <p className="max-w-2xl text-base leading-relaxed" style={{ color: '#7eb3d4' }}>
              基于{' '}
              <span style={{ color: '#00ff88', fontWeight: 700, textShadow: '0 0 8px rgba(0,255,136,0.5)' }}>
                单步邻居法
              </span>
              {' '}的稳健性评估系统，助你从成千上万个回测组合中锁定真正具备实盘价值的
              <span style={{ color: '#ffd700', textShadow: '0 0 8px rgba(255,215,0,0.4)' }}>「稳健高原」</span>。
            </p>

            {/* Cyber divider */}
            <div className="cyber-divider mt-6" />
          </div>
        </header>

        {/* ── Upload Area ── */}
        <section className="mb-12">
          <div className="tech-card p-6 transition-all duration-500"
            style={{ border: '1px solid rgba(0,212,255,0.25)' }}>
            <h3 className="flex items-center gap-2 mb-4 text-xs font-bold tracking-[0.2em] uppercase"
              style={{ fontFamily: "'Share Tech Mono', monospace", color: '#00d4ff' }}>
              <Upload size={14} />
              DATA INJECTION INTERFACE // 数据上传接口
            </h3>
            <label className="flex flex-col items-center justify-center gap-4 cursor-pointer p-10 rounded-xl transition-all duration-300"
              style={{ border: '2px dashed rgba(0,212,255,0.2)', background: 'rgba(0,212,255,0.02)' }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(0,212,255,0.5)'; e.currentTarget.style.background='rgba(0,212,255,0.06)';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(0,212,255,0.2)'; e.currentTarget.style.background='rgba(0,212,255,0.02)';}}>
              <div className="p-4 rounded-2xl transition-transform duration-300 hover:scale-110"
                style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
                  boxShadow: '0 0 20px rgba(0,212,255,0.2)' }}>
                <Upload style={{ color: '#00d4ff' }} size={30} />
              </div>
              <div className="text-center">
                <span className="text-lg font-bold block mb-1" style={{ color: '#e8f4fd', fontFamily: "'Rajdhani', sans-serif" }}>
                  拖入回测 CSV 报告
                </span>
                <span className="text-sm" style={{ color: '#7eb3d4', fontFamily: "'Share Tech Mono', monospace", fontSize: '11px' }}>
                  支持 TradingView 策略生成器导出的原始数据
                </span>
              </div>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
            {uploadLog && (
              <div className="mt-4 text-sm p-3 rounded-xl flex items-center gap-3"
                style={uploadLog.includes('✅')
                  ? { background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', fontFamily: "'Share Tech Mono', monospace" }
                  : { background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366', fontFamily: "'Share Tech Mono', monospace" }}>
                {uploadLog.includes('✅') ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {uploadLog}
              </div>
            )}
          </div>
        </section>

        {data.length > 0 && (
          <div className="animate-in fade-in duration-1000">
            {/* Stats Overview */}
            <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-12">
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
              <div className="mb-6 p-4 rounded-xl flex items-center gap-4"
                style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.25)' }}>
                <Activity className="animate-spin flex-shrink-0" size={18} style={{ color: '#00d4ff' }} />
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold tracking-widest uppercase"
                      style={{ fontFamily: "'Share Tech Mono', monospace", color: '#00d4ff' }}>
                      SCANNING // 单步邻居稳健性扫描中...
                    </span>
                    <span className="text-xs font-black"
                      style={{ fontFamily: "'Share Tech Mono', monospace", color: '#00d4ff' }}>
                      {robustnessProgress}%
                    </span>
                  </div>
                  <div className="w-full rounded-full h-1.5 overflow-hidden"
                    style={{ background: 'rgba(0,212,255,0.1)' }}>
                    <div className="neon-progress h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${robustnessProgress}%` }} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Algo Info Panel ── */}
            <section className="mb-12">
              <div className="tech-card overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 transition-all"
                  style={{ color: '#e8f4fd' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(0,212,255,0.04)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  onClick={() => setShowAlgoInfo(!showAlgoInfo)}
                >
                  <div className="flex items-center gap-3">
                    <Shield size={16} style={{ color: '#00d4ff' }} />
                    <span className="font-bold tracking-[0.15em] uppercase text-sm"
                      style={{ fontFamily: "'Share Tech Mono', monospace", color: '#00d4ff' }}>
                      ALGORITHM INFO // 单步邻居评估算法说明
                    </span>
                  </div>
                  <div className="transition-transform duration-300" style={{ transform: showAlgoInfo ? 'rotate(180deg)' : 'none' }}>
                    <ArrowUpRight size={14} style={{ color: '#7eb3d4' }} className="rotate-45" />
                  </div>
                </button>

                {showAlgoInfo && (
                  <div className="px-6 pb-6">
                    <div className="cyber-divider mb-4" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div className="rounded-xl p-5"
                        style={{ background: 'rgba(255,51,102,0.05)', border: '1px solid rgba(255,51,102,0.2)' }}>
                        <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-widest"
                          style={{ fontFamily: "'Share Tech Mono', monospace", color: '#ff3366' }}>
                          <XCircle size={12} /> 核心解决问题
                        </div>
                        <ul className="space-y-2 text-sm" style={{ color: '#7eb3d4' }}>
                          <li>• <span style={{ color: 'rgba(255,51,102,0.9)' }}>孤峰陷阱</span>：部分参数虽然回测极佳，但稍有改动表现即雪崩。</li>
                          <li>• <span style={{ color: 'rgba(255,51,102,0.9)' }}>维度黑洞</span>：高维参数空间中，传统算法极容易漏掉真正稳健的配置。</li>
                        </ul>
                      </div>
                      <div className="rounded-xl p-5"
                        style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)' }}>
                        <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-widest"
                          style={{ fontFamily: "'Share Tech Mono', monospace", color: '#00ff88' }}>
                          <CheckCircle size={12} /> 新算法特性
                        </div>
                        <ul className="space-y-2 text-sm" style={{ color: '#7eb3d4' }}>
                          <li>• <span style={{ color: '#00ff88' }}>高原效应</span>：搜寻"仅改变 1-2 步进"的邻居，确认"高原区域"。</li>
                          <li>• <span style={{ color: '#00ff88' }}>布尔修正</span>：v3.2 深度支持布尔型开关参数的变动追踪。</li>
                        </ul>
                      </div>
                    </div>

                    {algoStats && (
                      <div className="rounded-xl p-5"
                        style={{ background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.15)' }}>
                        <h4 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2"
                          style={{ fontFamily: "'Share Tech Mono', monospace", color: '#00d4ff' }}>
                          <Activity size={12} /> PARAM ENGINE DIAGNOSTICS // 步长推断结果
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2 gap-x-6 text-[11px]"
                          style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                          {Object.entries(algoStats.steps).map(([key, step]) => (
                            <div key={key} className="flex justify-between items-center py-1"
                              style={{ borderBottom: '1px solid rgba(0,212,255,0.1)' }}>
                              <span className="truncate mr-3" style={{ color: '#7eb3d4' }}>{key}</span>
                              <span className="font-bold px-2 py-0.5 rounded"
                                style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.08)', textShadow: '0 0 6px rgba(0,212,255,0.4)' }}>
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
              {/* Filter Panel */}
              <section className="tech-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg" style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)' }}>
                    <Filter size={16} style={{ color: '#00d4ff' }} />
                  </div>
                  <h2 className="text-lg font-black tracking-tight" style={{ fontFamily: "'Orbitron', monospace", color: '#e8f4fd' }}>
                    分层核心过滤
                  </h2>
                </div>

                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00ff88', boxShadow: '0 0 6px rgba(0,255,136,0.8)' }} />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]"
                        style={{ fontFamily: "'Share Tech Mono', monospace", color: '#00ff88' }}>
                        LAYER 1 // 生存筛选
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {filterInputs.filter(f=>f.category==='survival').map(({ key, label, step }) => (
                        <div key={key}>
                          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
                            style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>{label}</label>
                          <input type="number" step={step} value={filters[key]}
                            onChange={(e)=>setFilters({...filters,[key]:Number(e.target.value)})}
                            className="w-full px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)',
                              color: '#e8f4fd', fontFamily: "'Share Tech Mono', monospace" }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="cyber-divider" />

                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ffd700', boxShadow: '0 0 6px rgba(255,215,0,0.8)' }} />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]"
                        style={{ fontFamily: "'Share Tech Mono', monospace", color: '#ffd700' }}>
                        LAYER 2 // 性能深度过滤
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {filterInputs.filter(f=>f.category==='risk').map(({ key, label, step }) => (
                        <div key={key}>
                          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
                            style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>{label}</label>
                          <input type="number" step={step} value={filters[key]}
                            onChange={(e)=>setFilters({...filters,[key]:Number(e.target.value)})}
                            className="w-full px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)',
                              color: '#e8f4fd', fontFamily: "'Share Tech Mono', monospace" }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Score Weights Panel */}
              <section className="tech-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg" style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)' }}>
                    <Award size={16} style={{ color: '#ffd700' }} />
                  </div>
                  <h2 className="text-lg font-black tracking-tight" style={{ fontFamily: "'Orbitron', monospace", color: '#e8f4fd' }}>
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
                      <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5"
                        style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>{label}</label>
                      <input type="number" step="0.05" min="0" max="1"
                        value={scoreWeights[key]||0}
                        onChange={(e)=>setScoreWeights({...scoreWeights,[key]:Number(e.target.value)})}
                        className="w-full px-3 py-2 rounded-lg text-sm"
                        style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.2)',
                          color: '#ffd700', fontFamily: "'Share Tech Mono', monospace" }} />
                    </div>
                  ))}
                </div>

                <div className="cyber-divider mb-5" />

                <div>
                  <h4 className="flex items-center gap-2 text-sm font-bold mb-1"
                    style={{ fontFamily: "'Share Tech Mono', monospace", color: '#00d4ff' }}>
                    <Shield size={14} /> 稳健性置信因子 ROBUSTNESS WEIGHT
                  </h4>
                  <p className="text-xs mb-4" style={{ color: '#7eb3d4' }}>决定"选高原"还是"选山尖"的平衡杠杆</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <input type="range" min="0" max="1" step="0.05"
                        value={robustnessWeight}
                        onChange={(e)=>setRobustnessWeight(Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{ accentColor: '#00d4ff', background: 'rgba(0,212,255,0.15)' }} />
                      <div className="flex justify-between mt-2 text-[10px] font-black uppercase tracking-widest"
                        style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>
                        <span>纯收益导向</span>
                        <span>极致稳健</span>
                      </div>
                    </div>
                    <div className="px-4 py-3 rounded-xl font-black text-2xl min-w-[70px] text-center"
                      style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)',
                        color: '#00d4ff', fontFamily: "'Orbitron', monospace",
                        textShadow: '0 0 10px rgba(0,212,255,0.6)' }}>
                      {(robustnessWeight*100).toFixed(0)}<span className="text-sm">%</span>
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
                  {/* Background glow */}
                  <div className="absolute -inset-4 rounded-3xl blur-2xl pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at 70% 50%, rgba(255,215,0,0.06) 0%, transparent 70%)' }} />

                  <div className="relative rounded-2xl p-6 md:p-10 overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, rgba(10,22,40,0.95) 0%, rgba(5,10,20,0.98) 100%)',
                      border: '2px solid rgba(255,215,0,0.4)',
                      boxShadow: '0 0 40px rgba(255,215,0,0.08), inset 0 0 40px rgba(255,215,0,0.03)' }}>

                    {/* Corner brackets — gold */}
                    <div className="absolute top-0 left-0 w-6 h-6" style={{ borderTop: '3px solid #ffd700', borderLeft: '3px solid #ffd700', borderRadius: '4px 0 0 0' }} />
                    <div className="absolute top-0 right-0 w-6 h-6" style={{ borderTop: '3px solid #ffd700', borderRight: '3px solid #ffd700', borderRadius: '0 4px 0 0' }} />
                    <div className="absolute bottom-0 left-0 w-6 h-6" style={{ borderBottom: '3px solid #ffd700', borderLeft: '3px solid #ffd700', borderRadius: '0 0 0 4px' }} />
                    <div className="absolute bottom-0 right-0 w-6 h-6" style={{ borderBottom: '3px solid #ffd700', borderRight: '3px solid #ffd700', borderRadius: '0 0 4px 0' }} />

                    {/* Header row */}
                    <div className="flex flex-col md:flex-row gap-6 items-start justify-between mb-8">
                      <div className="flex gap-5 items-start">
                        <div className="p-4 rounded-2xl flex-shrink-0"
                          style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.4)',
                            boxShadow: '0 0 30px rgba(255,215,0,0.2)' }}>
                          <Award style={{ color: '#ffd700' }} size={36} strokeWidth={2} />
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-xs font-black uppercase tracking-[0.3em]"
                              style={{ fontFamily: "'Share Tech Mono', monospace", color: '#ffd700',
                                textShadow: '0 0 8px rgba(255,215,0,0.6)' }}>
                              AI SELECTED OPTIMAL
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black"
                              style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)',
                                color: '#ffd700', fontFamily: "'Share Tech Mono', monospace" }}>
                              ROW #{recommendedParameter.originalIndex}
                            </span>
                          </div>
                          <h2 className="text-3xl font-black tracking-tighter mb-2"
                            style={{ fontFamily: "'Orbitron', monospace", color: '#e8f4fd' }}>
                            最强黄金参数组
                          </h2>
                          <div className="flex items-center gap-2" style={{ color: '#7eb3d4' }}>
                            <TrendingUp size={14} style={{ color: '#00ff88' }} />
                            <span className="text-sm">该组合在全域参数变动中表现出极高的生存韧性</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] font-black uppercase tracking-widest mb-1"
                          style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>
                          COMBINED SCORE
                        </div>
                        <div className="text-6xl font-black leading-none gradient-text-cyber"
                          style={{ fontFamily: "'Orbitron', monospace" }}>
                          {(recommendedParameter.combinedScore||0).toFixed(3)}
                        </div>
                      </div>
                    </div>

                    <div className="cyber-divider mb-6" />

                    {/* Metrics grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                      {/* Robustness */}
                      <div className="rounded-xl p-5 transition-all"
                        style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)' }}>
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-3"
                          style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>稳健性矩阵</div>
                        <div className="flex justify-between items-baseline mb-2">
                          <span className="text-xs" style={{ color: '#7eb3d4' }}>高原置信度</span>
                          <span className="text-2xl font-black" style={{ fontFamily: "'Orbitron', monospace", color: '#00d4ff',
                            textShadow: '0 0 8px rgba(0,212,255,0.6)' }}>
                            {((recommendedParameter.robustnessScore||0)*100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(0,212,255,0.1)' }}>
                          <div className="neon-progress h-full rounded-full transition-all duration-1000"
                            style={{ width: `${(recommendedParameter.robustnessScore||0)*100}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px]" style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>
                          <span>{recommendedParameter.stableNeighborCount} STABLE</span>
                          <span>{recommendedParameter.neighborCount} NBRS</span>
                        </div>
                      </div>

                      {/* Core metrics */}
                      <div className="rounded-xl p-5 lg:col-span-2"
                        style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.15)' }}>
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-4"
                          style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>核心绩效数据</div>
                        <div className="grid grid-cols-3 gap-4">
                          {[
                            { label:'CALMAR', val:(recommendedParameter.calmarRatio||0).toFixed(2), color:'#00ff88' },
                            { label:'NET PROFIT', val:`${(recommendedParameter.returnPct||0).toFixed(2)}%`, color:'#00d4ff' },
                            { label:'MAX DD', val:`${(recommendedParameter.ddPct||0).toFixed(2)}%`, color:(recommendedParameter.ddPct||0)>15?'#ff3366':'#00ff88' },
                            { label:'PROFIT FACTOR', val:(recommendedParameter.profitFactor||0).toFixed(2), color:'#e8f4fd' },
                            { label:'WIN RATE', val:`${(recommendedParameter.winRate||0).toFixed(1)}%`, color:'#e8f4fd' },
                            { label:'TRADES', val:recommendedParameter.totalTrades, color:'#7eb3d4' },
                          ].map(({label, val, color}) => (
                            <div key={label}>
                              <div className="text-[9px] font-bold uppercase tracking-wider mb-1"
                                style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>{label}</div>
                              <div className="text-lg font-black" style={{ fontFamily: "'Orbitron', monospace", color, textShadow: `0 0 8px ${color}55` }}>
                                {val}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Kelly */}
                      <div className="rounded-xl p-5"
                        style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.25)' }}>
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-3"
                          style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>资金管理策略</div>
                        <div className="mb-1 text-[10px]" style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>KELLY CRITERION</div>
                        <div className="text-xl font-black mb-3" style={{ fontFamily: "'Orbitron', monospace", color: '#c084fc', textShadow: '0 0 8px rgba(192,132,252,0.5)' }}>
                          {(recommendedParameter.kellyFraction||0).toFixed(3)}
                        </div>
                        <div className="rounded-lg p-3" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                          <div className="text-[9px] font-black uppercase tracking-widest mb-1"
                            style={{ fontFamily: "'Share Tech Mono', monospace", color: '#c084fc' }}>建议入场仓位</div>
                          <div className="text-2xl font-black" style={{ fontFamily: "'Orbitron', monospace", color: '#c084fc', textShadow: '0 0 8px rgba(192,132,252,0.6)' }}>
                            {(Math.max(0,recommendedParameter.kellyFraction||0)*50).toFixed(1)}%
                          </div>
                          <div className="text-[8px] mt-1 italic" style={{ color: '#7eb3d4' }}>* Half-Kelly 保守策略</div>
                        </div>
                      </div>
                    </div>

                    {/* Strategy Params */}
                    {recommendedParameter.strategyParams && Object.keys(recommendedParameter.strategyParams).length > 0 && (
                      <div className="rounded-xl p-5 mb-6"
                        style={{ background: 'rgba(0,212,255,0.03)', border: '1px solid rgba(0,212,255,0.15)' }}>
                        <h4 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] mb-4"
                          style={{ fontFamily: "'Share Tech Mono', monospace", color: '#00d4ff' }}>
                          <Zap size={11} fill="currentColor" /> TV SCRIPT INPUTS // 策略参数配置
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3">
                          {Object.entries(recommendedParameter.strategyParams)
                            .filter(([,v]) => v!==null && v!==undefined && v!=='' && !(typeof v==='number'&&isNaN(v)))
                            .map(([key,value]) => (
                              <div key={key}>
                                <div className="text-[9px] font-bold uppercase tracking-tighter truncate mb-0.5"
                                  style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>{key}</div>
                                <div className="font-black text-sm" style={{ fontFamily: "'Share Tech Mono', monospace", color: '#00d4ff' }}>
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
                        { icon:<Activity size={12}/>, label:'Stability Profile: Premium', color:'#00ff88' },
                        { icon:<Shield size={12}/>, label:'Risk Exposure: Optimized', color:'#00d4ff' },
                      ].map(({icon, label, color}) => (
                        <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black"
                          style={{ background: `rgba(${color==='#00ff88'?'0,255,136':'0,212,255'},0.06)`,
                            border: `1px solid ${color}33`, color, fontFamily: "'Share Tech Mono', monospace" }}>
                          {icon} {label}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* ── Ranking Tables ── */}
              <div className="grid grid-cols-1 gap-10">
                {/* TOP 10 */}
                <section>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-xl font-black tracking-tight flex items-center gap-3"
                        style={{ fontFamily: "'Orbitron', monospace", color: '#e8f4fd' }}>
                        <div className="w-1 h-6 rounded-full" style={{ background: '#00d4ff', boxShadow: '0 0 8px rgba(0,212,255,0.8)' }} />
                        RANKING // 强势排行榜 TOP 10
                      </h2>
                      <p className="text-xs mt-1" style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>
                        已综合收益效能与参数稳健性进行加权排序
                      </p>
                    </div>
                    <button
                      onClick={()=>setShowParetoOnly(!showParetoOnly)}
                      className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                      style={showParetoOnly
                        ? { background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.5)',
                            color: '#c084fc', fontFamily: "'Share Tech Mono', monospace",
                            boxShadow: '0 0 15px rgba(168,85,247,0.2)' }
                        : { background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)',
                            color: '#7eb3d4', fontFamily: "'Share Tech Mono', monospace" }}>
                      {showParetoOnly ? '★ 展示全部' : '☆ 仅看帕累托最优'}
                    </button>
                  </div>
                  <DataTable data={displayData} columns={recommendColumns}
                    rowClassName={(row) => {
                      const isRec = recommendedParameter?.originalIndex === row.originalIndex;
                      return isRec ? 'bg-amber-500/10 border-l-2 border-l-amber-500 hover:bg-amber-500/15' :
                             isPareto(row) ? 'bg-purple-500/5 hover:bg-purple-500/10' : 'hover:bg-[rgba(0,212,255,0.03)]';
                    }}
                  />
                </section>

                {/* Raw data pool */}
                <section>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-xl font-black tracking-tight flex items-center gap-3"
                        style={{ fontFamily: "'Orbitron', monospace", color: '#e8f4fd' }}>
                        <div className="w-1 h-6 rounded-full" style={{ background: 'rgba(0,212,255,0.4)', boxShadow: '0 0 6px rgba(0,212,255,0.3)' }} />
                        DATA POOL // 原始数据明细池
                      </h2>
                      <p className="text-xs mt-1" style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>
                        完整记录每一组参数的回测表现与过滤状态
                      </p>
                    </div>
                    <div className="flex p-1 rounded-xl gap-1"
                      style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)' }}>
                      {[{key:'combined', label:'综合分'},{key:'utility', label:'效用分'},{key:'original', label:'原始行'}].map(({key, label}) => (
                        <button key={key} onClick={()=>setAllTableSort(key)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                          style={allTableSort===key
                            ? { background: 'rgba(0,212,255,0.15)', color: '#00d4ff', fontFamily: "'Share Tech Mono', monospace" }
                            : { color: '#7eb3d4', fontFamily: "'Share Tech Mono', monospace" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <DataTable data={allTableData.slice(0, 500)} columns={allDataColumns}
                    rowClassName={(row) => {
                      const isRec = recommendedParameter?.originalIndex === row.originalIndex;
                      return isRec ? 'bg-amber-500/10' : row.passed ? 'hover:bg-[rgba(0,212,255,0.03)]' : 'bg-red-500/5 opacity-75';
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
              <div className="w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto mb-8 transition-transform duration-700 hover:rotate-12"
                style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)',
                  boxShadow: '0 0 30px rgba(0,212,255,0.1)' }}>
                <BarChart3 size={36} style={{ color: 'rgba(0,212,255,0.4)' }} />
              </div>

              <h2 className="text-2xl font-black mb-3"
                style={{ fontFamily: "'Orbitron', monospace", color: '#e8f4fd' }}>
                AWAITING DATA INPUT
              </h2>
              <p className="text-sm leading-relaxed mb-6" style={{ color: '#7eb3d4' }}>
                等待数据注入... 该系统将自动解析您的交易策略报告，通过数学建模从海量结果中锁定具备长效竞争力的核心参数。
              </p>
              <div className="flex gap-2 justify-center">
                {['NO DATA', 'ANALYSIS IDLE', 'ENGINE v3.2'].map(t => (
                  <div key={t} className="px-3 py-1 rounded-full text-[10px] font-black uppercase"
                    style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)',
                      color: '#7eb3d4', fontFamily: "'Share Tech Mono', monospace" }}>{t}</div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ── Footer status bar ── */}
      <div className="mt-16 px-6 py-3 flex items-center justify-between text-[10px]"
        style={{ borderTop: '1px solid rgba(0,212,255,0.1)', fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4',
          background: 'rgba(5,10,20,0.6)' }}>
        <div className="flex items-center gap-4">
          <span style={{ color: '#00d4ff' }}>NEXUS QUANT ENGINE v3.2</span>
          <span>// LATENT STABILITY ALGORITHM: ACTIVE</span>
        </div>
        <div className="flex items-center gap-4">
          <span>DISCLAIMER: 仅供策略研究参考，不构成投资建议</span>
          <span style={{ color: 'rgba(0,212,255,0.4)' }}>◆</span>
          <span style={{ color: '#00d4ff' }}>{clock}</span>
        </div>
      </div>
    </div>
  );
};

export default AnalysisDashboard;
