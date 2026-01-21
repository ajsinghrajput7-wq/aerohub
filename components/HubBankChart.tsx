
import React, { useRef, useState, useLayoutEffect, useMemo, useEffect } from 'react';
import { HubSlot, Region, FlightInfo } from '../types';
import { REGION_COLORS, BLR_CATCHMENT } from '../constants';

interface HubBankChartProps {
  data: HubSlot[];
  highlightCatchment?: boolean;
  highlightConnections?: boolean;
  maxConnectionWindow?: number;
  mct?: number;
  onManualDrop?: (slotIndex: number, type: 'arr' | 'dep', block: FlightInfo, fromSlot?: number) => void;
  onUpdateManualFlight?: (slotIndex: number, type: 'arr' | 'dep', updatedFlight: FlightInfo) => void;
  onHoverManualFlight?: (hover: { slotIndex: number, type: 'arr' | 'dep', flightId?: string, isGroup?: boolean, code?: string } | null) => void;
  hoveredManualFlight?: { slotIndex: number, type: 'arr' | 'dep', flightId?: string, isGroup?: boolean, code?: string } | null;
  freqMode?: 'weekly' | 'daily';
}

interface PinnedIntel {
  id: string;
  slotIndex: number;
  type: 'arr' | 'dep';
  flight: FlightInfo;
  x: number;
  y: number;
}

const HubBankChart: React.FC<HubBankChartProps> = ({ 
  data, 
  highlightCatchment, 
  onManualDrop, 
  onUpdateManualFlight,
  highlightConnections = true,
  maxConnectionWindow = 6,
  mct = 1.5,
  onHoverManualFlight,
  hoveredManualFlight,
  freqMode = 'weekly'
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFitToScreen, setIsFitToScreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [dragOverSlot, setDragOverSlot] = useState<{ slotIndex: number, type: 'arr' | 'dep' } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [pinnedIntels, setPinnedIntels] = useState<PinnedIntel[]>([]);
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [editingFlight, setEditingFlight] = useState<{ slotIndex: number, type: 'arr' | 'dep', flight: FlightInfo } | null>(null);

  const consolidatedData = useMemo(() => {
    return data.map(slot => {
      const groupByType = (flights: FlightInfo[]) => {
        const groups: Record<string, FlightInfo[]> = {};
        flights.forEach(f => {
          if (!groups[f.code]) groups[f.code] = [];
          groups[f.code].push(f);
        });
        return Object.values(groups).map(group => {
          if (group.length === 1) return group[0];
          const first = group[0];
          return {
            ...first,
            id: `merged-${first.code}-${Math.random()}`,
            freq: group.reduce((sum, f) => sum + f.freq, 0),
            isMerged: true,
            mergedFlights: group
          } as FlightInfo & { isMerged: boolean, mergedFlights: FlightInfo[] };
        });
      };
      return {
        ...slot,
        arrivals: groupByType(slot.arrivals),
        departures: groupByType(slot.departures)
      };
    });
  }, [data]);

  const maxArrivals = Math.max(10, ...consolidatedData.map(s => s.arrivals.length));
  const maxDepartures = Math.max(10, ...consolidatedData.map(s => s.departures.length));

  const arrivalRows = Array.from({ length: maxArrivals }).fill(0);
  const departureRows = Array.from({ length: maxDepartures }).fill(0);

  const getMinutes = (slotIndex: number, exactTime?: string) => {
    if (exactTime && exactTime.includes(':')) {
      const [h, m] = exactTime.split(':').map(Number);
      return h * 60 + m;
    }
    return slotIndex * 60;
  };

  const formatMins = (m: number) => {
    const hours = Math.floor(m / 60) % 24;
    const mins = Math.round(m % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const formatVal = (val: number) => {
    if (freqMode === 'daily') return (val / 7).toFixed(1);
    return val.toString();
  };

  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setScale(prev => Math.min(Math.max(prev + delta, 0.1), 3.0));
      setIsFitToScreen(false);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
      return () => el.removeEventListener('wheel', handleWheel);
    }
  }, []);

  useLayoutEffect(() => {
    if (isFitToScreen && containerRef.current && chartRef.current) {
      const availableWidth = containerRef.current.clientWidth;
      const availableHeight = containerRef.current.clientHeight;
      const chartWidth = chartRef.current.offsetWidth;
      const chartHeight = chartRef.current.offsetHeight;
      const widthRatio = availableWidth / chartWidth;
      const heightRatio = availableHeight / chartHeight;
      setScale(Math.min(widthRatio, heightRatio) * 0.98);
    }
  }, [isFitToScreen, consolidatedData, maxArrivals, maxDepartures]);

  const handleDragOver = (e: React.DragEvent, slotIndex: number, type: 'arr' | 'dep') => {
    e.preventDefault();
    setDragOverSlot({ slotIndex, type });
  };

  const handleDrop = (e: React.DragEvent, slotIndex: number, type: 'arr' | 'dep') => {
    e.preventDefault();
    setDragOverSlot(null);
    const blockData = e.dataTransfer.getData('block');
    const fromSlotStr = e.dataTransfer.getData('fromSlot');
    if (blockData && onManualDrop) {
      const block = JSON.parse(blockData) as FlightInfo;
      const fromSlot = fromSlotStr ? parseInt(fromSlotStr) : undefined;
      onManualDrop(slotIndex, type, block, fromSlot);
    }
  };

  const isFlightInConnectionWindow = (
    sourceFlight: FlightInfo, 
    sourceSlotIndex: number, 
    sourceType: 'arr' | 'dep',
    targetFlight: FlightInfo, 
    targetSlotIndex: number, 
    targetType: 'arr' | 'dep'
  ) => {
    if (!highlightConnections) return false;
    const sourceFlights = (sourceFlight as any).mergedFlights || [sourceFlight];
    const targetFlights = (targetFlight as any).mergedFlights || [targetFlight];
    const mctMins = Math.round(mct * 60);
    const windowMins = Math.round(maxConnectionWindow * 60);

    const checkInWindow = (val: number, start: number, duration: number) => {
      let relativeVal = (val - start + 1440) % 1440;
      return relativeVal >= 0 && relativeVal <= duration;
    };

    return sourceFlights.some((sf: FlightInfo) => {
      const sourceMins = getMinutes(sourceSlotIndex, sf.exactTime);
      return targetFlights.some((tf: FlightInfo) => {
        const targetMins = getMinutes(targetSlotIndex, tf.exactTime);
        if (sourceType === 'arr' && targetType === 'dep') {
          const validStart = (sourceMins + mctMins) % 1440;
          return checkInWindow(targetMins, validStart, windowMins);
        }
        if (sourceType === 'dep' && targetType === 'arr') {
          const validEnd = (sourceMins - mctMins + 1440) % 1440;
          const validStart = (validEnd - windowMins + 1440) % 1440;
          return checkInWindow(targetMins, validStart, windowMins);
        }
        return false;
      });
    });
  };

  const getSummary = (source: { slotIndex: number, type: 'arr' | 'dep', flightId?: string }) => {
    const stats: Record<string, number> = {};
    const uniquePortsByRegion: Record<string, Set<string>> = {};
    const regionAirportStats: Record<string, Record<string, number>> = {};
    let totalFreq = 0;

    const sourceFlights = source.type === 'arr' ? consolidatedData[source.slotIndex].arrivals : consolidatedData[source.slotIndex].departures;
    const sourceFlight = source.flightId 
      ? sourceFlights.find(f => f.id === source.flightId) 
      : (sourceFlights.find(f => f.code === 'BLR' || f.isManual) || sourceFlights[0]);

    if (!sourceFlight) return { topRegions: [], totalFreq: 0, windowStart: '00:00', windowEnd: '00:00', focusTime: '00:00' };

    const individualFlights = (sourceFlight as any).mergedFlights || [sourceFlight];
    const timings = individualFlights.map((f: any) => getMinutes(source.slotIndex, f.exactTime)).sort((a: any, b: any) => a - b);
    const earliestMins = timings[0];
    const latestMins = timings[timings.length - 1];

    consolidatedData.forEach((slot, targetSlotIdx) => {
      const targetType = source.type === 'arr' ? 'dep' : 'arr';
      const targetFlights = targetType === 'arr' ? slot.arrivals : slot.departures;
      
      targetFlights.forEach(targetFlight => {
        if (isFlightInConnectionWindow(sourceFlight, source.slotIndex, source.type, targetFlight, targetSlotIdx, targetType)) {
          stats[targetFlight.region] = (stats[targetFlight.region] || 0) + targetFlight.freq;
          if (!uniquePortsByRegion[targetFlight.region]) uniquePortsByRegion[targetFlight.region] = new Set();
          uniquePortsByRegion[targetFlight.region].add(targetFlight.code);
          
          if (!regionAirportStats[targetFlight.region]) regionAirportStats[targetFlight.region] = {};
          regionAirportStats[targetFlight.region][targetFlight.code] = (regionAirportStats[targetFlight.region][targetFlight.code] || 0) + targetFlight.freq;
          totalFreq += targetFlight.freq;
        }
      });
    });

    const topRegions = Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .map(([region, freq]) => {
        const topPorts = Object.entries(regionAirportStats[region] || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        return { region, freq, uniqueCount: uniquePortsByRegion[region]?.size || 0, topPorts };
      });

    return { 
      topRegions, 
      totalFreq, 
      windowStart: formatMins((earliestMins + (source.type === 'arr' ? Math.round(mct * 60) : -Math.round(maxConnectionWindow * 60) - Math.round(mct * 60)) + 1440) % 1440), 
      windowEnd: formatMins((latestMins + (source.type === 'arr' ? Math.round(maxConnectionWindow * 60) + Math.round(mct * 60) : -Math.round(mct * 60)) + 1440) % 1440),
      focusTime: sourceFlight.isManual ? sourceFlight.exactTime : `${formatMins(earliestMins)}${individualFlights.length > 1 ? '+' : ''}`
    };
  };

  const connectionSummary = useMemo(() => {
    if (!hoveredManualFlight) return null;
    return getSummary(hoveredManualFlight);
  }, [hoveredManualFlight, consolidatedData, maxConnectionWindow, mct, freqMode]);

  const handleFlightClick = (slotIndex: number, type: 'arr' | 'dep', flight: FlightInfo | undefined) => {
    if (!flight) return;
    const id = `pin-${type}-${flight.id}-${Math.random()}`;
    const x = window.innerWidth - 350;
    const y = 80 + (pinnedIntels.length * 50);
    setPinnedIntels(prev => [{ id, slotIndex, type, flight, x, y }, ...prev.slice(0, 4)]);
  };

  const handleFlightDoubleClick = (slotIndex: number, type: 'arr' | 'dep', flight: FlightInfo | undefined) => {
    if (flight?.isManual) {
      setEditingFlight({ slotIndex, type, flight: { ...flight, exactTime: flight.exactTime || `${slotIndex.toString().padStart(2, '0')}:00` } });
    }
  };

  const startPanelDrag = (e: React.MouseEvent, id: string) => {
    const panel = pinnedIntels.find(p => p.id === id);
    if (panel) {
      setDraggingPanelId(id);
      setDragOffset({ x: e.clientX - panel.x, y: e.clientY - panel.y });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      if (draggingPanelId) {
        setPinnedIntels(prev => prev.map(p => p.id === draggingPanelId ? { ...p, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } : p));
      }
    };
    const handleMouseUp = () => setDraggingPanelId(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingPanelId, dragOffset]);

  const getCellClasses = (flight: FlightInfo | undefined, rowIndex: number, type: 'arr' | 'dep', slotIndex: number) => {
    let classes = 'transition-all duration-300 relative group overflow-hidden ';
    let isConn = false;
    
    if (hoveredManualFlight && flight) {
      const sourceSlot = consolidatedData[hoveredManualFlight.slotIndex];
      const sourceFlights = hoveredManualFlight.type === 'arr' ? sourceSlot.arrivals : sourceSlot.departures;
      const sourceFlight = hoveredManualFlight.flightId 
        ? sourceFlights.find(f => f.id === hoveredManualFlight.flightId)
        : (sourceFlights.find(f => f.code === 'BLR' || f.isManual) || sourceFlights[0]);
      
      const isSourceEligible = sourceFlight && (sourceFlight.isManual || sourceFlight.code === 'BLR');
      if (isSourceEligible) {
        isConn = isFlightInConnectionWindow(sourceFlight, hoveredManualFlight.slotIndex, hoveredManualFlight.type, flight, slotIndex, type);
      }
    }

    if (flight) {
      const isBLR = flight.code === 'BLR';
      const isCatchment = BLR_CATCHMENT.has(flight.code);
      const isManual = flight.isManual;

      if (isManual) {
        classes += type === 'arr' ? 'bg-[#00ff9d] text-[#004d30] shadow-[0_0_15px_rgba(0,255,157,0.5)] border-2 border-dashed border-white/60 z-30 cursor-pointer ' : 'bg-[#6366f1] text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] border-2 border-dashed border-white/60 z-30 cursor-pointer ';
      } else if (highlightCatchment && isCatchment) {
        // Neon Orange highlight for Catchment
        classes += 'bg-[#ff5f1f] text-white shadow-[0_0_12px_rgba(255,95,31,0.8)] z-20 ';
      } else {
        classes += `${REGION_COLORS[flight.region as Region] || 'bg-slate-100'} `;
      }

      if (isBLR && !isManual) classes += 'ring-2 ring-inset ring-red-500 z-30 shadow-[0_0_20px_rgba(239,68,68,0.4)] cursor-pointer ';
    } else {
      classes += 'bg-transparent ';
    }
    
    if (dragOverSlot?.slotIndex === slotIndex && dragOverSlot?.type === type) classes += 'bg-[#006a4e]/20 scale-[0.98] ring-4 ring-[#006a4e] ring-offset-2 z-40 ';
    
    if (isConn) {
      const ringColor = hoveredManualFlight?.type === 'arr' ? 'ring-indigo-400' : 'ring-teal-400';
      const bgColor = hoveredManualFlight?.type === 'arr' ? 'bg-indigo-500/30' : 'bg-teal-500/30';
      classes += `ring-4 ring-inset ${ringColor} ${bgColor} animate-pulse z-[100] scale-105 `;
    }
    return classes;
  };

  const IntelCard = ({ source, flight, onRemove, isPinned, onDragStart }: { source: { slotIndex: number, type: 'arr' | 'dep', flightId?: string }, flight: FlightInfo, onRemove?: () => void, isPinned?: boolean, onDragStart?: (e: React.MouseEvent) => void }) => {
    const summary = getSummary(source);
    const individualFlights = (flight as any).mergedFlights || [flight];
    const isPrimaryTarget = flight.isManual || flight.code === 'BLR';
    
    return (
      <div className={`bg-slate-900/95 backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl p-4 w-80 text-white overflow-hidden ${isPinned ? 'cursor-default ring-1 ring-indigo-500/50' : 'pointer-events-none'}`}>
        <div onMouseDown={onDragStart} className={`flex items-center justify-between mb-3 ${isPinned ? 'cursor-grab active:cursor-grabbing border-b border-white/10 pb-2' : ''}`}>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black uppercase tracking-widest text-indigo-400">
                {flight.code} {source.type === 'arr' ? 'Arrivals' : 'Departures'}
              </span>
              {individualFlights.length > 1 && <span className="text-[8px] font-black bg-indigo-500 px-1.5 py-0.5 rounded uppercase tracking-tighter">Consolidated</span>}
            </div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
               Bank Timing: {summary.focusTime}
            </span>
          </div>
          {onRemove && (
            <button onMouseDown={(e) => e.stopPropagation()} onClick={onRemove} className="text-slate-500 hover:text-white transition-colors">
              <i className="fas fa-times-circle text-lg"></i>
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white/10 rounded-lg p-2 border border-white/10">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Schedule Breakdown</p>
            <div className="grid grid-cols-2 gap-2">
               {individualFlights.map((f: any, i: number) => (
                 <div key={i} className="flex justify-between items-center bg-slate-800 rounded px-2 py-1 border border-white/5">
                    <span className="text-[10px] font-black">{f.exactTime || '--:--'}</span>
                    <span className="text-[8px] font-bold text-indigo-400">{formatVal(f.freq)} {freqMode === 'weekly' ? 'W' : 'D'}</span>
                 </div>
               ))}
            </div>
          </div>

          {isPrimaryTarget && (
            <>
              <div className="flex justify-between items-end border-b border-white/5 pb-2">
                <div className="flex flex-col">
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Effective Connection Range</p>
                   <p className="text-[8px] font-bold text-[#00ff9d] uppercase tracking-widest">{summary.windowStart} - {summary.windowEnd}</p>
                </div>
                <span className="text-xs font-black text-white bg-white/10 px-2 py-0.5 rounded">
                  {formatVal(summary.totalFreq)} {freqMode === 'weekly' ? 'Ops' : 'Daily'}
                </span>
              </div>
              
              <div className="space-y-4 max-h-[300px] overflow-y-auto no-scrollbar pr-1">
                {summary.topRegions.map(({ region, freq, uniqueCount, topPorts }) => (
                  <div key={region} className="space-y-2 bg-white/5 p-2 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black uppercase tracking-tight text-indigo-300">{region}</span>
                        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">{uniqueCount} Ports</span>
                      </div>
                      <span className="text-[10px] font-black bg-indigo-500/30 px-2 py-0.5 rounded text-white border border-indigo-500/20">
                        {formatVal(freq)} {freqMode === 'weekly' ? 'Ops' : 'Daily'}
                      </span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${(freq / Math.max(1, summary.totalFreq)) * 100}%` }} />
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      {topPorts.map(([code, pFreq]) => (
                        <div key={code} className="flex-1 bg-slate-800/50 rounded px-2 py-1.5 text-center border border-white/5 shadow-inner">
                          <div className="text-[11px] font-black text-slate-100">{code}</div>
                          <div className="text-[8px] font-bold text-indigo-400">{formatVal(pFreq)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 relative h-full overflow-hidden" ref={containerRef}>
      <style>{`
        @keyframes pulse-intense {
          0%, 100% { opacity: 1; transform: scale(1.05); }
          50% { opacity: 0.6; transform: scale(1.02); }
        }
        .animate-pulse {
          animation: pulse-intense 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {editingFlight && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
           <div className="bg-white rounded-3xl shadow-2xl w-96 overflow-hidden border border-slate-200">
             <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
                <h3 className="text-white text-xs font-black uppercase tracking-widest">Global Optimization Picker</h3>
                <button onClick={() => setEditingFlight(null)} className="text-slate-400 hover:text-white transition-colors">
                  <i className="fas fa-times"></i>
                </button>
             </div>
             <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Schedule Optimization Time</label>
                  <input 
                    type="time" 
                    value={editingFlight.flight.exactTime}
                    onChange={(e) => {
                      const newTime = e.target.value;
                      setEditingFlight({ ...editingFlight, flight: { ...editingFlight.flight, exactTime: newTime } });
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-800 text-lg focus:outline-none focus:ring-2 focus:ring-[#006a4e]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">IATA Code</label>
                    <input 
                      type="text" 
                      maxLength={3}
                      value={editingFlight.flight.code}
                      onChange={(e) => setEditingFlight({ ...editingFlight, flight: { ...editingFlight.flight, code: e.target.value.toUpperCase() } })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#006a4e]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Freq (1-7)</label>
                    <input 
                      type="number" 
                      min={1} max={7}
                      value={editingFlight.flight.freq}
                      onChange={(e) => setEditingFlight({ ...editingFlight, flight: { ...editingFlight.flight, freq: parseInt(e.target.value) || 1 } })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#006a4e]"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Market Region</label>
                  <select 
                    value={editingFlight.flight.region}
                    onChange={(e) => setEditingFlight({ ...editingFlight, flight: { ...editingFlight.flight, region: e.target.value as Region } })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#006a4e]"
                  >
                    {Object.values(Region).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button 
                  onClick={() => {
                    if (editingFlight && onUpdateManualFlight) {
                      onUpdateManualFlight(editingFlight.slotIndex, editingFlight.type, editingFlight.flight);
                      setEditingFlight(null);
                    }
                  }}
                  className="w-full py-3 bg-[#006a4e] text-white rounded-xl font-black uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-[#006a4e]/20 hover:bg-[#00523c] transition-all"
                >
                  Save Optimization
                </button>
             </div>
           </div>
        </div>
      )}

      {connectionSummary && hoveredManualFlight && !draggingPanelId && !editingFlight && (
        <div 
          className="fixed z-[9999] pointer-events-none transition-transform duration-100"
          style={{ 
            left: mousePos.x + 20, 
            top: hoveredManualFlight.type === 'arr' ? mousePos.y - 300 : mousePos.y + 20 
          }}
        >
          {(() => {
            const slot = consolidatedData[hoveredManualFlight.slotIndex];
            const flightList = hoveredManualFlight.type === 'arr' ? slot.arrivals : slot.departures;
            const flight = hoveredManualFlight.flightId 
              ? flightList.find(f => f.id === hoveredManualFlight.flightId)
              : (flightList.find(f => f.code === 'BLR' || f.isManual) || flightList[0]);
            return flight ? <IntelCard source={hoveredManualFlight} flight={flight} /> : null;
          })()}
        </div>
      )}

      {pinnedIntels.map((intel) => (
        <div key={intel.id} className="fixed z-[9500] shadow-2xl" style={{ left: intel.x, top: intel.y }}>
          <IntelCard 
            source={{ slotIndex: intel.slotIndex, type: intel.type, flightId: intel.flight.id }} 
            flight={intel.flight} 
            isPinned={true}
            onDragStart={(e) => startPanelDrag(e, intel.id)}
            onRemove={() => setPinnedIntels(prev => prev.filter(p => p.id !== intel.id))}
          />
        </div>
      ))}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-2 flex justify-between items-center shrink-0 mx-2 mt-2">
        <div className="flex items-center gap-4">
          <h2 className="text-xs font-black text-slate-900 tracking-tight uppercase">Bank Schedule</h2>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 text-white rounded-lg shadow text-xs">
             <span className="font-black opacity-60">ZOOM:</span>
             <span className="font-black tabular-nums">{(scale * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-[#006a4e] text-white rounded-lg shadow text-xs">
             <span className="font-black opacity-60 uppercase">Mode:</span>
             <span className="font-black uppercase">{freqMode === 'weekly' ? 'Weekly Freq' : 'Daily Dep'}</span>
          </div>
          {hoveredManualFlight && (
            <div className={`px-3 py-1 border rounded-lg flex items-center gap-2 shadow-sm ${hoveredManualFlight.type === 'arr' ? 'bg-indigo-50 border-indigo-200' : 'bg-teal-50 border-teal-200'}`}>
               <span className={`text-[10px] font-black uppercase tracking-widest ${hoveredManualFlight.type === 'arr' ? 'text-indigo-700' : 'text-teal-700'}`}>
                 Analysis: {hoveredManualFlight.type === 'arr' ? 'Outbound' : 'Inbound'}
               </span>
            </div>
          )}
        </div>
        <button 
          onClick={() => { setIsFitToScreen(!isFitToScreen); if(isFitToScreen) setScale(1); }} 
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border shadow-sm ${isFitToScreen ? 'bg-[#006a4e] text-white border-[#006a4e]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
        >
          <i className={`fas ${isFitToScreen ? 'fa-expand-arrows-alt' : 'fa-compress-arrows-alt'}`}></i>
          {isFitToScreen ? 'Reset Zoom' : 'Fit to Screen'}
        </button>
      </div>

      <div className={`relative flex-1 overflow-hidden flex items-center justify-center ${isFitToScreen ? 'bg-white' : 'bg-slate-50 p-2'}`}>
         <div className={`w-full h-full overflow-auto flex items-center justify-center transition-all duration-300 ${isFitToScreen ? 'no-scrollbar' : 'p-4'}`}>
            <div 
              ref={chartRef} 
              style={{ transform: `scale(${scale})`, transformOrigin: 'center center', minWidth: 'max-content', margin: 'auto' }}
              className="bg-white rounded-xl shadow-2xl border border-slate-200 relative p-8 transition-transform duration-300"
            >
              <div className="relative inline-block border-l border-r border-slate-200 ml-16">
                <div className="flex flex-col-reverse">
                  {arrivalRows.map((_, rowIndex) => (
                    <div key={`arr-row-${rowIndex}`} className="flex h-12">
                      {consolidatedData.map((slot, slotIndex) => {
                        const flight = slot.arrivals[rowIndex];
                        const isTarget = !!flight;
                        return (
                          <div 
                            key={`arr-slot-${slotIndex}-${rowIndex}`} 
                            onDragOver={(e) => handleDragOver(e, slotIndex, 'arr')}
                            onDrop={(e) => handleDrop(e, slotIndex, 'arr')}
                            onDragLeave={() => setDragOverSlot(null)}
                            onMouseEnter={() => isTarget && onHoverManualFlight?.({ slotIndex, type: 'arr', flightId: flight?.id })}
                            onMouseLeave={() => onHoverManualFlight?.(null)}
                            onClick={() => isTarget && handleFlightClick(slotIndex, 'arr', flight)}
                            onDoubleClick={() => isTarget && handleFlightDoubleClick(slotIndex, 'arr', flight)}
                            className={`w-24 border-r border-b border-slate-100 flex items-center justify-center cursor-default ${getCellClasses(flight, rowIndex, 'arr', slotIndex)}`}
                            draggable={!!flight?.isManual}
                            onDragStart={(e) => {
                              if (flight?.isManual) {
                                e.dataTransfer.setData('block', JSON.stringify(flight));
                                e.dataTransfer.setData('blockId', flight.id || '');
                                e.dataTransfer.setData('fromSlot', slotIndex.toString());
                                e.dataTransfer.setData('type', 'arr');
                              }
                            }}
                          >
                            {flight && (
                              <div className="flex items-center justify-center w-full h-full relative group/block">
                                <span className="text-2xl font-black tracking-tighter select-none">{flight.code}</span>
                                {(flight.isManual || (flight as any).isMerged) && (
                                  <div className={`absolute top-1 right-1 w-4 h-4 text-white rounded flex items-center justify-center text-[8px] font-black z-10 ${(flight as any).isMerged ? 'bg-indigo-600' : 'bg-slate-900'}`}>
                                    {(flight as any).isMerged ? '+' : 'S'}
                                  </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm text-white py-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity flex flex-col items-center pointer-events-none">
                                  <span className="text-[7px] font-black uppercase leading-none">{(flight as any).isMerged ? 'MULTI' : (flight.exactTime || '--:--')}</span>
                                  <span className="text-[7px] font-bold leading-none mt-0.5">Total: {formatVal(flight.freq)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex h-14 bg-slate-900 text-white relative z-[70] shadow-xl">
                  {consolidatedData.map((slot, idx) => (
                    <div key={`spine-${idx}`} className="w-24 border-r border-white/10 flex flex-col items-center justify-center">
                      <div className="text-2xl font-black leading-tight tabular-nums">{slot.label.split(':')[0]}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col">
                  {departureRows.map((_, rowIndex) => (
                    <div key={`dep-row-${rowIndex}`} className="flex h-12">
                      {consolidatedData.map((slot, slotIndex) => {
                        const flight = slot.departures[rowIndex];
                        const isTarget = !!flight;
                        return (
                          <div 
                            key={`dep-slot-${slotIndex}-${rowIndex}`} 
                            onDragOver={(e) => handleDragOver(e, slotIndex, 'dep')}
                            onDrop={(e) => handleDrop(e, slotIndex, 'dep')}
                            onDragLeave={() => setDragOverSlot(null)}
                            onMouseEnter={() => isTarget && onHoverManualFlight?.({ slotIndex, type: 'dep', flightId: flight?.id })}
                            onMouseLeave={() => onHoverManualFlight?.(null)}
                            onClick={() => isTarget && handleFlightClick(slotIndex, 'dep', flight)}
                            onDoubleClick={() => isTarget && handleFlightDoubleClick(slotIndex, 'dep', flight)}
                            className={`w-24 border-r border-b border-slate-100 flex items-center justify-center cursor-default ${getCellClasses(flight, rowIndex, 'dep', slotIndex)}`}
                            draggable={!!flight?.isManual}
                            onDragStart={(e) => {
                              if (flight?.isManual) {
                                e.dataTransfer.setData('block', JSON.stringify(flight));
                                e.dataTransfer.setData('blockId', flight.id || '');
                                e.dataTransfer.setData('fromSlot', slotIndex.toString());
                                e.dataTransfer.setData('type', 'dep');
                              }
                            }}
                          >
                            {flight && (
                              <div className="flex items-center justify-center w-full h-full relative group/block">
                                 <span className="text-2xl font-black tracking-tighter select-none">{flight.code}</span>
                                {(flight.isManual || (flight as any).isMerged) && (
                                  <div className={`absolute top-1 right-1 w-4 h-4 text-white rounded flex items-center justify-center text-[8px] font-black z-10 ${(flight as any).isMerged ? 'bg-indigo-600' : 'bg-slate-900'}`}>
                                    {(flight as any).isMerged ? '+' : 'S'}
                                  </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm text-white py-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity flex flex-col items-center pointer-events-none">
                                  <span className="text-[7px] font-black uppercase leading-none">{(flight as any).isMerged ? 'MULTI' : (flight.exactTime || '--:--')}</span>
                                  <span className="text-[7px] font-bold leading-none mt-0.5">Total: {formatVal(flight.freq)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="absolute -left-16 top-0 bottom-0 flex flex-col justify-between pointer-events-none w-16">
                    <div className="flex-1 flex items-center justify-center">
                       <span className="-rotate-90 whitespace-nowrap text-sm font-black text-slate-900 tracking-[0.2em] uppercase opacity-40">Arrivals</span>
                    </div>
                    <div className="h-14 flex items-center justify-center bg-slate-900/10">
                       <i className="fas fa-clock text-slate-800 text-xl opacity-20"></i>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                       <span className="-rotate-90 whitespace-nowrap text-sm font-black text-slate-900 tracking-[0.2em] uppercase opacity-40">Departures</span>
                    </div>
                </div>
              </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default HubBankChart;
