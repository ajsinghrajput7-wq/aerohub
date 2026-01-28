
import React, { useRef, useState, useLayoutEffect, useMemo, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { HubSlot, Region, FlightInfo } from '../types';
import { REGION_COLORS, BLR_CATCHMENT, INDIAN_AIRPORTS } from '../constants';

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
  isBlrFile?: boolean;
}

interface PinnedIntel {
  id: string;
  slotIndex: number;
  type: 'arr' | 'dep';
  flight: FlightInfo;
  x: number;
  y: number;
}

interface SelectionRef {
  slotIndex: number;
  type: 'arr' | 'dep';
  flightId: string;
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
  freqMode = 'weekly',
  isBlrFile = false
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const aiSectionRef = useRef<HTMLDivElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  
  const [isFitToScreen, setIsFitToScreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [dragOverSlot, setDragOverSlot] = useState<{ slotIndex: number, type: 'arr' | 'dep' } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [pinnedIntels, setPinnedIntels] = useState<PinnedIntel[]>([]);
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [selectedRefs, setSelectedRefs] = useState<SelectionRef[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [editingFlight, setEditingFlight] = useState<{ slotIndex: number, type: 'arr' | 'dep', flight: FlightInfo } | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ slotIndex: number, type: 'arr' | 'dep', block: FlightInfo, fromSlot?: number } | null>(null);

  const consolidatedData = useMemo(() => {
    return data.map(slot => {
      const groupByType = (flights: FlightInfo[]) => {
        const manualOnes = flights.filter(f => f.isManual);
        const autoOnes = flights.filter(f => !f.isManual);
        
        const autoGroups: Record<string, FlightInfo[]> = {};
        autoOnes.forEach(f => {
          if (!autoGroups[f.code]) autoGroups[f.code] = [];
          autoGroups[f.code].push(f);
        });
        
        const processedAuto = Object.values(autoGroups).map(group => {
          if (group.length === 1) return group[0];
          const first = group[0];
          return {
            ...first,
            id: `merged-${first.code}-${Math.random()}`,
            freq: group.reduce((sum, f) => sum + f.freq, 0),
            seats: group.reduce((sum, f) => sum + (f.seats || 0), 0),
            pax: group.reduce((sum, f) => sum + (f.pax || 0), 0),
            isMerged: true,
            mergedFlights: group
          } as FlightInfo & { isMerged: boolean, mergedFlights: FlightInfo[] };
        });

        return [...processedAuto, ...manualOnes];
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

  const formatStats = (val: number | undefined) => {
    if (val === undefined) return '0';
    if (freqMode === 'daily') return (val / 7).toFixed(1);
    return val.toLocaleString(undefined, { maximumFractionDigits: 1 });
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

  useEffect(() => {
    if ((isAiLoading || aiInsight) && aiSectionRef.current) {
      aiSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isAiLoading, aiInsight]);

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
    if (blockData) {
      const block = JSON.parse(blockData) as FlightInfo;
      const fromSlot = fromSlotStr ? parseInt(fromSlotStr) : undefined;
      const hourStr = slotIndex.toString().padStart(2, '0');
      setPendingDrop({
        slotIndex,
        type,
        block: { ...block, exactTime: `${hourStr}:00` },
        fromSlot
      });
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
    const catchmentPorts: Record<string, number> = {};
    const otherIndianPorts: Record<string, number> = {};
    const intlPorts: Record<string, number> = {};
    
    let totalFreq = 0;
    let totalSeats = 0;
    let totalPax = 0;
    let catchmentFreq = 0;
    let catchmentSeats = 0;
    let catchmentPax = 0;
    let otherIndianFreq = 0;
    let otherIndianSeats = 0;
    let otherIndianPax = 0;
    let internationalFreq = 0;
    let internationalSeats = 0;
    let internationalPax = 0;

    const sourceFlights = source.type === 'arr' ? consolidatedData[source.slotIndex].arrivals : consolidatedData[source.slotIndex].departures;
    const sourceFlight = source.flightId 
      ? sourceFlights.find(f => f.id === source.flightId) 
      : (sourceFlights.find(f => f.code === 'BLR' || f.isManual) || sourceFlights[0]);

    if (!sourceFlight) return { 
      topRegions: [], totalFreq: 0, totalSeats: 0, totalPax: 0, catchmentFreq: 0, catchmentSeats: 0, catchmentPax: 0, otherIndianFreq: 0, otherIndianSeats: 0, otherIndianPax: 0, internationalFreq: 0, internationalSeats: 0, internationalPax: 0,
      windowStart: '00:00', windowEnd: '00:00', focusTime: '00:00', 
      catchmentPorts: [], otherIndianPorts: [], intlPorts: [],
      networkBreadth: 0, efficiencyIndex: 0
    };

    const individualFlights = (sourceFlight as any).mergedFlights || [sourceFlight];
    const timings = individualFlights.map((f: any) => getMinutes(source.slotIndex, f.exactTime)).sort((a: any, b: any) => a - b);
    const earliestMins = timings[0];
    const latestMins = timings[timings.length - 1];

    consolidatedData.forEach((slot, targetSlotIdx) => {
      const targetType = source.type === 'arr' ? 'dep' : 'arr';
      const targetFlights = targetType === 'arr' ? slot.arrivals : slot.departures;
      
      targetFlights.forEach(targetFlight => {
        if (isFlightInConnectionWindow(sourceFlight, source.slotIndex, source.type, targetFlight, targetSlotIdx, targetType)) {
          const code = targetFlight.code;
          const isCatchment = BLR_CATCHMENT.has(code);
          const isIndian = INDIAN_AIRPORTS.has(code);
          
          totalFreq += targetFlight.freq;
          totalSeats += (targetFlight.seats || 0);
          totalPax += (targetFlight.pax || 0);
          stats[targetFlight.region] = (stats[targetFlight.region] || 0) + targetFlight.freq;
          if (!uniquePortsByRegion[targetFlight.region]) uniquePortsByRegion[targetFlight.region] = new Set();
          uniquePortsByRegion[targetFlight.region].add(code);
          if (!regionAirportStats[targetFlight.region]) regionAirportStats[targetFlight.region] = {};
          regionAirportStats[targetFlight.region][code] = (regionAirportStats[targetFlight.region][code] || 0) + targetFlight.freq;

          if (isCatchment) {
            catchmentFreq += targetFlight.freq;
            catchmentSeats += (targetFlight.seats || 0);
            catchmentPax += (targetFlight.pax || 0);
            catchmentPorts[code] = (catchmentPorts[code] || 0) + targetFlight.freq;
          } else if (isIndian) {
            otherIndianFreq += targetFlight.freq;
            otherIndianSeats += (targetFlight.seats || 0);
            otherIndianPax += (targetFlight.pax || 0);
            otherIndianPorts[code] = (otherIndianPorts[code] || 0) + targetFlight.freq;
          } else {
            internationalFreq += targetFlight.freq;
            internationalSeats += (targetFlight.seats || 0);
            internationalPax += (targetFlight.pax || 0);
            intlPorts[code] = (intlPorts[code] || 0) + targetFlight.freq;
          }
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

    const offsetMins = Math.round(mct * 60);
    const windowMins = Math.round(maxConnectionWindow * 60);
    
    const windowStartMins = (earliestMins + (source.type === 'arr' ? offsetMins : -windowMins - offsetMins) + 1440) % 1440;
    const windowEndMins = (latestMins + (source.type === 'arr' ? windowMins + offsetMins : -offsetMins) + 1440) % 1440;

    return { 
      topRegions, 
      totalFreq, 
      totalSeats,
      totalPax,
      catchmentFreq,
      catchmentSeats,
      catchmentPax,
      otherIndianFreq,
      otherIndianSeats,
      otherIndianPax,
      internationalFreq,
      internationalSeats,
      internationalPax,
      catchmentPorts: Object.entries(catchmentPorts).sort((a, b) => b[1] - a[1]).slice(0, 5),
      otherIndianPorts: Object.entries(otherIndianPorts).sort((a, b) => b[1] - a[1]).slice(0, 5),
      intlPorts: Object.entries(intlPorts).sort((a, b) => b[1] - a[1]).slice(0, 5),
      windowStart: formatMins(windowStartMins), 
      windowEnd: formatMins(windowEndMins),
      focusTime: sourceFlight.isManual ? sourceFlight.exactTime : `${formatMins(earliestMins)}${individualFlights.length > 1 ? '+' : ''}`,
      networkBreadth: topRegions.length,
      efficiencyIndex: totalFreq > 0 ? (internationalFreq / totalFreq) * 100 : 0
    };
  };

  const connectionSummary = useMemo(() => {
    if (!hoveredManualFlight) return null;
    return getSummary(hoveredManualFlight);
  }, [hoveredManualFlight, consolidatedData, maxConnectionWindow, mct, freqMode]);

  const handleFlightClick = (e: React.MouseEvent, slotIndex: number, type: 'arr' | 'dep', flight: FlightInfo | undefined) => {
    if (!flight) return;

    if (e.ctrlKey || e.metaKey) {
      setSelectedRefs(prev => {
        const exists = prev.find(r => r.flightId === flight.id && r.slotIndex === slotIndex);
        if (exists) return prev.filter(r => !(r.flightId === flight.id && r.slotIndex === slotIndex));
        return [...prev, { slotIndex, type, flightId: flight.id! }];
      });
      return;
    }

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

  const generateAIComparison = async () => {
    setIsAiLoading(true);
    setAiInsight(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const comparisonData = selectedRefs.map(ref => {
        const slot = consolidatedData[ref.slotIndex];
        const flight = (ref.type === 'arr' ? slot.arrivals : slot.departures).find(f => f.id === ref.flightId);
        const summary = getSummary(ref);
        const isInternational = flight && !INDIAN_AIRPORTS.has(flight.code);
        return {
          code: flight?.code,
          type: ref.type === 'arr' ? 'Inbound/Arrival' : 'Outbound/Departure',
          bankTime: summary.focusTime,
          isInternational: isInternational,
          connectionWindow: `${summary.windowStart} - ${summary.windowEnd}`,
          metrics: {
            totalOps: formatVal(summary.totalFreq),
            totalSeats: formatStats(summary.totalSeats),
            totalPax: formatStats(summary.totalPax),
            catchmentOps: formatVal(summary.catchmentFreq),
            otherIndianOps: formatVal(summary.otherIndianFreq),
            intlOps: formatVal(summary.internationalFreq),
            internationalShare: summary.efficiencyIndex.toFixed(1) + '%',
            regionCoverage: summary.networkBreadth
          }
        };
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Act as a world-class Aviation Network Strategist. 
        Current Context: Hub is BLR (Bengaluru). Simulation: MCT=${mct}h, Window=${maxConnectionWindow}h.
        
        Mandate: Redesign the hub structure for BLR prioritizing INTERNATIONAL (INTL) routes.
        Constraint: Proposed shifts for current blocks must NOT exceed ONE HOUR (60 minutes).
        
        Selected Operational Blocks:
        ${JSON.stringify(comparisonData, null, 2)}
        
        Provide a tactical executive report including:
        1. **INTL Connectivity Redesign**: Specifically identify if any of the selected blocks are INTL flights and how their timings (HH:mm) can be shifted (max 60 mins) to catch better domestic feed or link with other INTL blocks for "International-to-International" connectivity.
        2. **Tactical Retiming (HH:mm)**: Provide precise suggestions (e.g., "Shift block from 10:15 to 11:00 (+45 mins)") to maximize the INTL load factor and connectivity.
        3. **Synergy Opportunity**: Identify if any two blocks could work as a 'tandem bank' to cover different global regions (Americas, Europe, Asia) more effectively.
        4. **Regional ROI**: Focus on how these INTL shifts impact the BLR Catchment (South India) connectivity.
        
        Use markdown with bold headers. Be precise, data-driven, and strictly adhere to the 1-hour shift constraint.`,
      });

      setAiInsight(response.text || "Insight generation returned empty.");
    } catch (err) {
      console.error(err);
      setAiInsight("Failed to synthesize strategic insights. Please ensure your API connection is stable.");
    } finally {
      setIsAiLoading(false);
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
      
      const isSourceEligible = sourceFlight && (
        sourceFlight.isManual || 
        sourceFlight.code === 'BLR' || 
        (isBlrFile && (sourceFlight as any).isInternational)
      );

      if (isSourceEligible) {
        isConn = isFlightInConnectionWindow(sourceFlight, hoveredManualFlight.slotIndex, hoveredManualFlight.type, flight, slotIndex, type);
      }
    }

    const isSelected = !!selectedRefs.find(r => r.flightId === flight?.id && r.slotIndex === slotIndex);

    if (flight) {
      const isBLR = flight.code === 'BLR';
      const isCatchment = BLR_CATCHMENT.has(flight.code);
      const isManual = flight.isManual;
      const isCopy = flight.code.includes(' NEW');

      if (isCopy) {
        classes += type === 'arr' ? 'bg-[#dfff00] text-black shadow-[0_0_20px_rgba(223,255,0,0.9)] z-40 cursor-pointer border-2 border-white/80 animate-pulse ' : 'bg-[#ff00ff] text-white shadow-[0_0_20px_rgba(255,0,255,0.9)] z-40 cursor-pointer border-2 border-white/80 animate-pulse ';
      } else if (isManual) {
        classes += type === 'arr' ? 'bg-[#00ff9d] text-[#004d30] shadow-[0_0_15px_rgba(0,255,157,0.5)] border-2 border-dashed border-white/60 z-30 cursor-pointer ' : 'bg-[#6366f1] text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] border-2 border-dashed border-white/60 z-30 cursor-pointer ';
      } else if (highlightCatchment && isCatchment) {
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
      classes += `ring-4 ring-inset ${ringColor} ${bgColor} z-[100] scale-105 `;
    }

    if (isSelected) {
      classes += 'ring-4 ring-amber-400 z-[110] scale-110 shadow-[0_0_30px_rgba(251,191,36,0.8)] ';
    }

    return classes;
  };

  const IntelCard = ({ source, flight, onRemove, isPinned, onDragStart }: { source: { slotIndex: number, type: 'arr' | 'dep', flightId?: string }, flight: FlightInfo, onRemove?: () => void, isPinned?: boolean, onDragStart?: (e: React.MouseEvent) => void }) => {
    const summary = getSummary(source);
    const individualFlights = (flight as any).mergedFlights || [flight];
    const isPrimaryTarget = flight.isManual || flight.code === 'BLR' || (isBlrFile && (flight as any).isInternational);
    
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
            <div className="grid grid-cols-1 gap-1">
               {individualFlights.map((f: any, i: number) => (
                 <div key={i} className="flex justify-between items-center bg-slate-800 rounded px-2 py-1 border border-white/5">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-[10px] font-black tabular-nums">{f.exactTime || '--:--'}</span>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-[8px] font-black uppercase text-indigo-400 leading-none">{f.flightNo || 'XX000'}</span>
                        <span className="text-[7px] font-bold uppercase text-slate-500 truncate max-w-[100px] leading-tight">{f.airline || '--'}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-[8px] font-bold text-indigo-400">{formatVal(f.freq)} {freqMode === 'weekly' ? 'W' : 'D'}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] font-black text-slate-400" title="Seats">{formatStats(f.seats)} S</span>
                        <span className="text-[7px] font-black text-indigo-300" title="Pax">{formatStats(f.pax)} P</span>
                      </div>
                    </div>
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
                <div className="flex flex-col items-end">
                  <span className="text-xs font-black text-white bg-white/10 px-2 py-0.5 rounded">
                    {formatVal(summary.totalFreq)} {freqMode === 'weekly' ? 'Ops' : 'Daily'}
                  </span>
                  <div className="flex flex-col items-end mt-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                      {freqMode === 'weekly' ? 'Seats (W)' : 'Seats (D)'}: {formatStats(summary.totalSeats)}
                    </span>
                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter">
                       {source.type === 'arr' ? 'Total Dep Pax' : 'Total Arr Pax'}: {formatStats(summary.totalPax)}
                    </span>
                  </div>
                </div>
              </div>
              
              {isBlrFile ? (
                <div className="space-y-3">
                  <div className="bg-[#ff5f1f]/10 border border-[#ff5f1f]/30 rounded-lg p-2 shadow-inner">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[10px] font-black text-[#ff5f1f] uppercase tracking-tighter">1. BLR-C Connections</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-white bg-[#ff5f1f] px-1.5 rounded">{formatVal(summary.catchmentFreq)}</span>
                        <span className="text-[8px] font-black text-[#ff5f1f] opacity-80">{formatStats(summary.catchmentPax)} P</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {summary.catchmentPorts.length > 0 ? summary.catchmentPorts.map(([code, f]) => (
                        <span key={code} className="text-[8px] font-black bg-slate-800 px-1.5 py-0.5 rounded border border-white/5">
                          {code} <span className="text-[#ff5f1f]">{formatVal(f)}</span>
                        </span>
                      )) : <span className="text-[8px] italic text-slate-500">None found</span>}
                    </div>
                  </div>

                  <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-2 shadow-inner">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[10px] font-black text-indigo-300 uppercase tracking-tighter">2. Other Indian Connections</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-white bg-indigo-500 px-1.5 rounded">{formatVal(summary.otherIndianFreq)}</span>
                        <span className="text-[8px] font-black text-indigo-300 opacity-80">{formatStats(summary.otherIndianPax)} P</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {summary.otherIndianPorts.length > 0 ? summary.otherIndianPorts.map(([code, f]) => (
                        <span key={code} className="text-[8px] font-black bg-slate-800 px-1.5 py-0.5 rounded border border-white/5">
                          {code} <span className="text-indigo-400">{formatVal(f)}</span>
                        </span>
                      )) : <span className="text-[8px] italic text-slate-500">None found</span>}
                    </div>
                  </div>

                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 shadow-inner">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[10px] font-black text-emerald-300 uppercase tracking-tighter">3. International Connections</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-white bg-emerald-500 px-1.5 rounded">{formatVal(summary.internationalFreq)}</span>
                        <span className="text-[8px] font-black text-emerald-300 opacity-80">{formatStats(summary.internationalPax)} P</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {summary.intlPorts.length > 0 ? summary.intlPorts.map(([code, f]) => (
                        <span key={code} className="text-[8px] font-black bg-slate-800 px-1.5 py-0.5 rounded border border-white/5">
                          {code} <span className="text-emerald-400">{formatVal(f)}</span>
                        </span>
                      )) : <span className="text-[8px] italic text-slate-500">None found</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-h-[250px] overflow-y-auto no-scrollbar pr-1">
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
                        <div className="h-full bg-indigo-50 rounded-full transition-all duration-1000" style={{ width: `${(freq / Math.max(1, summary.totalFreq)) * 100}%` }} />
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
              )}
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

      {/* Comparison & Strategic Analysis Modal */}
      {isCompareModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/90 backdrop-blur-2xl">
           <div className="bg-slate-50 rounded-3xl shadow-2xl w-[95vw] max-w-7xl h-[90vh] overflow-hidden border border-white/10 flex flex-col">
              <div className="px-10 py-8 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-white/5">
                 <div className="flex items-center gap-6">
                   <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-900 shadow-xl shadow-amber-500/20">
                      <i className="fas fa-project-diagram text-xl"></i>
                   </div>
                   <div>
                     <h2 className="text-3xl font-black uppercase tracking-tighter">Strategic Network Comparison</h2>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Multi-Bank Connectivity and Capacity Analysis</p>
                   </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="bg-slate-800 px-4 py-2 rounded-xl border border-white/5">
                       <span className="text-[10px] font-black text-slate-500 uppercase">Selected Banks:</span>
                       <span className="ml-2 text-sm font-black text-amber-500">{selectedRefs.length}</span>
                    </div>
                    <button onClick={() => { setIsCompareModalOpen(false); setAiInsight(null); }} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 hover:text-red-400 transition-all border border-white/5">
                      <i className="fas fa-times text-xl"></i>
                    </button>
                 </div>
              </div>
              
              <div ref={modalScrollRef} className="flex-1 overflow-auto p-10 flex flex-col gap-10">
                 {/* Individual Matrix Cards */}
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {selectedRefs.map((ref, idx) => {
                       const slot = consolidatedData[ref.slotIndex];
                       const flight = (ref.type === 'arr' ? slot.arrivals : slot.departures).find(f => f.id === ref.flightId);
                       const summary = getSummary(ref);
                       if (!flight) return null;
                       
                       const total = Math.max(1, summary.totalFreq);
                       const dna = [
                         { label: 'INTL', val: summary.internationalFreq, color: 'bg-emerald-500' },
                         { label: 'CATCH', val: summary.catchmentFreq, color: 'bg-[#ff5f1f]' },
                         { label: 'DOM', val: summary.otherIndianFreq, color: 'bg-indigo-500' },
                       ];

                       return (
                         <div key={idx} className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden flex flex-col transform hover:scale-[1.02] transition-transform">
                            <div className={`p-6 ${ref.type === 'arr' ? 'bg-indigo-600' : 'bg-[#006a4e]'} text-white shadow-inner`}>
                               <div className="flex justify-between items-start mb-2">
                                 <span className="text-3xl font-black leading-none">{flight.code}</span>
                                 <span className="text-[9px] font-black uppercase tracking-widest bg-white/20 px-2 py-1 rounded backdrop-blur-md">
                                   {ref.type === 'arr' ? 'INBOUND' : 'OUTBOUND'}
                                 </span>
                               </div>
                               <p className="text-[10px] font-black opacity-70 uppercase tracking-widest">Bank Focal Point: {summary.focusTime}</p>
                            </div>
                            
                            <div className="p-6 flex-1 space-y-6 bg-white">
                               {/* Connection DNA Sparkline */}
                               <div className="space-y-1.5">
                                  <div className="flex justify-between items-center text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                    <span>Connection DNA</span>
                                    <span>{dna.filter(d => d.val > 0).length} Segments</span>
                                  </div>
                                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                                    {dna.map((segment, si) => (
                                      <div key={si} className={`h-full ${segment.color} transition-all duration-700`} style={{ width: `${(segment.val / total) * 100}%` }} />
                                    ))}
                                  </div>
                                  <div className="flex gap-3 mt-1">
                                    {dna.map((segment, si) => (
                                      <div key={si} className="flex items-center gap-1">
                                        <div className={`w-1.5 h-1.5 rounded-full ${segment.color}`} />
                                        <span className="text-[7px] font-black text-slate-500">{segment.label}</span>
                                      </div>
                                    ))}
                                  </div>
                               </div>

                               <div className="grid grid-cols-2 gap-4">
                                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-1">TOTAL OPS</p>
                                     <p className="text-2xl font-black text-slate-900 tabular-nums">{formatVal(summary.totalFreq)}</p>
                                  </div>
                                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-center">
                                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mb-1">REACH (REG)</p>
                                     <p className="text-2xl font-black text-slate-900 tabular-nums">{summary.networkBreadth}</p>
                                  </div>
                               </div>

                               <div className="space-y-3">
                                  <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Category Split (Pax)</p>
                                  <div className="space-y-2">
                                     <div className="flex justify-between items-center bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                                        <span className="text-[9px] font-black text-emerald-800 uppercase">International</span>
                                        <span className="text-xs font-black text-emerald-900">{formatStats(summary.internationalPax)}</span>
                                     </div>
                                     <div className="flex justify-between items-center bg-[#ff5f1f]/5 px-3 py-1.5 rounded-xl border border-[#ff5f1f]/20">
                                        <span className="text-[9px] font-black text-[#ff5f1f] uppercase">Catchment (S.I.)</span>
                                        <span className="text-xs font-black text-[#ff5f1f]">{formatStats(summary.catchmentPax)}</span>
                                     </div>
                                     <div className="flex justify-between items-center bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                                        <span className="text-[9px] font-black text-indigo-800 uppercase">Domestic (Rest)</span>
                                        <span className="text-xs font-black text-indigo-900">{formatStats(summary.otherIndianPax)}</span>
                                     </div>
                                  </div>
                               </div>

                               <div className="pt-4 mt-auto">
                                  <div className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-slate-900 text-[#00ff9d] shadow-xl relative group">
                                     <span className="text-[8px] font-black uppercase tracking-widest opacity-60">OPTIMIZED RANGE</span>
                                     <span className="text-sm font-black tracking-widest tabular-nums">{summary.windowStart} - {summary.windowEnd}</span>
                                  </div>
                               </div>
                            </div>
                         </div>
                       );
                    })}
                 </div>

                 {/* Comparison Metrics Table */}
                 <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                    <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                       <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
                         <i className="fas fa-table text-indigo-500"></i>
                         Categorical Synergy matrix
                       </h3>
                    </div>
                    <table className="w-full text-left">
                       <thead>
                          <tr className="bg-slate-100/50">
                             <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Synergy Metric</th>
                             {selectedRefs.map((ref, i) => (
                               <th key={i} className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center">Bank {i + 1} ({consolidatedData[ref.slotIndex].label})</th>
                             ))}
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                          <tr className="hover:bg-slate-50/50 transition-colors">
                             <td className="px-6 py-4 text-xs font-bold text-slate-600">Catchment (S.I.) Pax Feed</td>
                             {selectedRefs.map((ref, i) => (
                               <td key={i} className="px-6 py-4 text-sm font-black text-[#ff5f1f] text-center">{formatStats(getSummary(ref).catchmentPax)}</td>
                             ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50 transition-colors">
                             <td className="px-6 py-4 text-xs font-bold text-slate-600">International Pax Load</td>
                             {selectedRefs.map((ref, i) => (
                               <td key={i} className="px-6 py-4 text-sm font-black text-emerald-600 text-center">{formatStats(getSummary(ref).internationalPax)}</td>
                             ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50 transition-colors">
                             <td className="px-6 py-4 text-xs font-bold text-slate-600">Rest of India Pax Load</td>
                             {selectedRefs.map((ref, i) => (
                               <td key={i} className="px-6 py-4 text-sm font-black text-indigo-600 text-center">{formatStats(getSummary(ref).otherIndianPax)}</td>
                             ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50 transition-colors">
                             <td className="px-6 py-4 text-xs font-bold text-slate-600">Total Aggregate Pax</td>
                             {selectedRefs.map((ref, i) => (
                               <td key={i} className="px-6 py-4 text-sm font-black text-slate-900 text-center">{formatStats(getSummary(ref).totalPax)}</td>
                             ))}
                          </tr>
                       </tbody>
                    </table>
                 </div>

                 {/* AI Insights Engine Section */}
                 <div ref={aiSectionRef} className="bg-slate-900 rounded-[2.5rem] p-10 border border-white/10 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12">
                       <i className="fas fa-brain text-[10rem] text-white"></i>
                    </div>
                    <div className="relative z-10">
                       <div className="flex flex-col md:flex-row items-center justify-between mb-10 gap-6">
                          <div>
                            <h3 className="text-2xl font-black text-white uppercase tracking-tight">Tactical Optimization Intelligence</h3>
                            <p className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.4em] mt-2">Regional Synergies & Retiming Recommendations</p>
                          </div>
                          {!aiInsight && !isAiLoading && (
                            <button 
                              onClick={generateAIComparison}
                              className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-2xl shadow-indigo-600/40 transition-all hover:-translate-y-1 flex items-center gap-4 group"
                            >
                               <i className="fas fa-bolt group-hover:animate-pulse"></i>
                               Run Synergy Analysis
                            </button>
                          )}
                       </div>

                       {isAiLoading ? (
                         <div className="flex flex-col items-center justify-center py-24 text-indigo-400">
                            <div className="relative">
                               <div className="animate-spin h-16 w-16 border-4 border-indigo-400 border-t-transparent rounded-full mb-6"></div>
                               <div className="absolute inset-0 animate-ping opacity-20 h-16 w-16 border-4 border-indigo-400 rounded-full"></div>
                            </div>
                            <p className="text-sm font-black uppercase tracking-[0.3em] animate-pulse mt-4">Simulating connection elasticity...</p>
                         </div>
                       ) : aiInsight ? (
                         <div className="prose prose-invert max-w-none text-slate-200 text-base leading-loose overflow-y-auto max-h-[600px] bg-white/5 p-10 rounded-[2.5rem] border border-white/5 shadow-inner">
                            <div className="whitespace-pre-wrap font-medium">{aiInsight}</div>
                         </div>
                       ) : (
                         <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-white/10 rounded-[2.5rem] bg-white/[0.02]">
                            <i className="fas fa-microchip text-4xl text-white/10 mb-6"></i>
                            <p className="text-xs font-black text-slate-500 uppercase tracking-[0.4em]">Initialize synergy models for HH:mm shift insights</p>
                         </div>
                       )}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {pendingDrop && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
           <div className="bg-white rounded-3xl shadow-2xl w-96 overflow-hidden border border-slate-200">
             <div className={`px-6 py-4 flex items-center justify-between ${pendingDrop.type === 'arr' ? 'bg-[#dfff00]' : 'bg-[#ff00ff]'}`}>
                <h3 className={`text-xs font-black uppercase tracking-widest ${pendingDrop.type === 'arr' ? 'text-black' : 'text-white'}`}>
                  New {pendingDrop.type === 'arr' ? 'Arrival' : 'Departure'} Entry
                </h3>
                <button onClick={() => setPendingDrop(null)} className={pendingDrop.type === 'arr' ? 'text-black' : 'text-white'}>
                  <i className="fas fa-times"></i>
                </button>
             </div>
             <div className="p-6 space-y-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                   <div className="flex flex-col">
                     <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Target Code</span>
                     <span className="text-xl font-black text-slate-800">{pendingDrop.block.code}</span>
                   </div>
                   <div className="text-right">
                     <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Bank Hour</span>
                     <span className="block text-xl font-black text-slate-800">{pendingDrop.slotIndex}:00</span>
                   </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Optimization Time (HH:mm)</label>
                  <input 
                    type="time" 
                    autoFocus
                    value={pendingDrop.block.exactTime}
                    onChange={(e) => {
                      const newTime = e.target.value;
                      setPendingDrop({ ...pendingDrop, block: { ...pendingDrop.block, exactTime: newTime } });
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-800 text-lg focus:outline-none focus:ring-2 focus:ring-[#006a4e]"
                  />
                </div>
                <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-[9px] font-bold text-amber-800 leading-tight">
                    <i className="fas fa-info-circle mr-1"></i>
                    Connections will be re-calculated in real-time based on this specific minute.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    if (pendingDrop && onManualDrop) {
                      onManualDrop(pendingDrop.slotIndex, pendingDrop.type, pendingDrop.block, pendingDrop.fromSlot);
                      setPendingDrop(null);
                    }
                  }}
                  className="w-full py-3 bg-[#006a4e] text-white rounded-xl font-black uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-[#006a4e]/20 hover:bg-[#00523c] transition-all"
                >
                  Confirm Entry
                </button>
             </div>
           </div>
        </div>
      )}

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
                      maxLength={12}
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

          {selectedRefs.length >= 1 && (
            <button 
              onClick={() => setIsCompareModalOpen(true)}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-lg shadow-amber-500/20 text-[11px] font-black uppercase tracking-widest transition-all animate-bounce flex items-center gap-2"
            >
              <i className="fas fa-microchip"></i>
              {selectedRefs.length === 1 ? 'Analyze Unit' : `Compare Selected (${selectedRefs.length})`}
            </button>
          )}

          {selectedRefs.length > 0 && (
            <button 
              onClick={() => setSelectedRefs([])}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-[9px] font-black uppercase text-slate-400 hover:text-red-500 hover:border-red-200 transition-all flex items-center gap-2 bg-slate-50"
            >
              <i className="fas fa-eraser"></i>
              Deselect All
            </button>
          )}

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
                            onClick={(e) => isTarget && handleFlightClick(e, slotIndex, 'arr', flight)}
                            onDoubleClick={() => isTarget && handleFlightDoubleClick(slotIndex, 'arr', flight)}
                            className={`w-24 border-r border-b border-slate-100 flex items-center justify-center cursor-default ${getCellClasses(flight, rowIndex, 'arr', slotIndex)}`}
                            draggable={!!flight}
                            onDragStart={(e) => {
                              if (flight) {
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
                                  <div className={`absolute top-1 right-1 w-4 h-4 text-white rounded flex items-center justify-center text-[8px] font-black z-10 ${ (flight as any).isMerged ? 'bg-indigo-600' : (flight.code.includes(' NEW') ? 'bg-red-600' : 'bg-slate-900') }`}>
                                    {(flight as any).isMerged ? '+' : (flight.code.includes(' NEW') ? 'N' : 'S')}
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
                  {consolidatedData.map((slot, slotIndex) => (
                    <div key={`spine-${slotIndex}`} className="w-24 border-r border-white/10 flex flex-col items-center justify-center">
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
                            onClick={(e) => isTarget && handleFlightClick(e, slotIndex, 'dep', flight)}
                            onDoubleClick={() => isTarget && handleFlightDoubleClick(slotIndex, 'dep', flight)}
                            className={`w-24 border-r border-b border-slate-100 flex items-center justify-center cursor-default ${getCellClasses(flight, rowIndex, 'dep', slotIndex)}`}
                            draggable={!!flight}
                            onDragStart={(e) => {
                              if (flight) {
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
                                  <div className={`absolute top-1 right-1 w-4 h-4 text-white rounded flex items-center justify-center text-[8px] font-black z-10 ${ (flight as any).isMerged ? 'bg-indigo-600' : (flight.code.includes(' NEW') ? 'bg-red-600' : 'bg-slate-900') }`}>
                                    {(flight as any).isMerged ? '+' : (flight.code.includes(' NEW') ? 'N' : 'S')}
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
