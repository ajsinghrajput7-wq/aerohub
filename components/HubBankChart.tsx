
import React, { useRef, useState, useLayoutEffect, useMemo, useEffect } from 'react';
import { HubSlot, Region, FlightInfo } from '../types';
import { REGION_COLORS, BLR_CATCHMENT, INDIAN_AIRPORTS, AIRPORT_REGIONS } from '../constants';
import { GoogleGenAI } from "@google/genai";

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

interface ConnectionDetails {
  timeMins: number;
  focalTime: string;
  focalFreq: number;
  connectingTime: string;
  connectingFreq: number;
}

interface TwoWayConnection {
  code: string;
  region: Region;
  outbounds: ConnectionDetails[];
  inbounds: ConnectionDetails[];
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
  const [modalTab, setModalTab] = useState<'two-way' | 'outbound' | 'inbound' | 'metrics'>('two-way');
  const [subtractMct, setSubtractMct] = useState(false);

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

  const formatDiff = (m: number) => {
    const h = Math.floor(m / 60);
    const min = Math.round(m % 60);
    return `${h}h ${min}m`;
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

  const getTwoWaySummary = (airportCode: string) => {
    const portSummaryMap: Record<string, TwoWayConnection> = {};
    const mctMins = Math.round(mct * 60);
    const windowMins = Math.round(maxConnectionWindow * 60);

    const checkInWindow = (val: number, start: number, duration: number) => {
      let relativeVal = (val - start + 1440) % 1440;
      return relativeVal >= 0 && relativeVal <= duration;
    };

    const targetArrivals = consolidatedData.flatMap((s, idx) => s.arrivals.filter(f => f.code === airportCode).map(f => ({ ...f, slotIndex: idx }))) as (FlightInfo & { slotIndex: number })[];
    const targetDepartures = consolidatedData.flatMap((s, idx) => s.departures.filter(f => f.code === airportCode).map(f => ({ ...f, slotIndex: idx }))) as (FlightInfo & { slotIndex: number })[];

    // Grouping by airport code
    consolidatedData.forEach((slot, sIdx) => {
      // Find valid outbounds (Focal Port Arrival -> Other Port Departure)
      slot.departures.forEach(dep => {
        if (dep.code === airportCode) return;
        
        let bestConnectionForThisFlight: ConnectionDetails | null = null;
        targetArrivals.forEach(arr => {
          const arrExact = arr.exactTime || `${arr.slotIndex.toString().padStart(2, '0')}:00`;
          const depExact = dep.exactTime || `${sIdx.toString().padStart(2, '0')}:00`;
          const sfMins = getMinutes(arr.slotIndex, arrExact);
          const tfMins = getMinutes(sIdx, depExact);
          const validStart = (sfMins + mctMins) % 1440;
          
          if (checkInWindow(tfMins, validStart, windowMins)) {
            const diff = (tfMins - sfMins + 1440) % 1440;
            if (!bestConnectionForThisFlight || diff < bestConnectionForThisFlight.timeMins) {
              bestConnectionForThisFlight = {
                timeMins: diff,
                focalTime: arrExact,
                focalFreq: arr.freq,
                connectingTime: depExact,
                connectingFreq: dep.freq
              };
            }
          }
        });

        if (bestConnectionForThisFlight) {
          if (!portSummaryMap[dep.code]) {
            portSummaryMap[dep.code] = { code: dep.code, region: dep.region as Region, outbounds: [], inbounds: [] };
          }
          // Avoid duplicate rows for the exact same connecting flight time
          if (!portSummaryMap[dep.code].outbounds.some(o => o.connectingTime === (bestConnectionForThisFlight as ConnectionDetails).connectingTime)) {
            portSummaryMap[dep.code].outbounds.push(bestConnectionForThisFlight);
          }
        }
      });

      // Find valid inbounds (Other Port Arrival -> Focal Port Departure)
      slot.arrivals.forEach(arr => {
        if (arr.code === airportCode) return;

        let bestConnectionForThisFlight: ConnectionDetails | null = null;
        targetDepartures.forEach(dep => {
          const arrExact = arr.exactTime || `${sIdx.toString().padStart(2, '0')}:00`;
          const depExact = dep.exactTime || `${dep.slotIndex.toString().padStart(2, '0')}:00`;
          const sfMins = getMinutes(sIdx, arrExact);
          const tfMins = getMinutes(dep.slotIndex, depExact);
          const validStart = (sfMins + mctMins) % 1440;

          if (checkInWindow(tfMins, validStart, windowMins)) {
            const diff = (tfMins - sfMins + 1440) % 1440;
            if (!bestConnectionForThisFlight || diff < bestConnectionForThisFlight.timeMins) {
              bestConnectionForThisFlight = {
                timeMins: diff,
                focalTime: depExact,
                focalFreq: dep.freq,
                connectingTime: arrExact,
                connectingFreq: arr.freq
              };
            }
          }
        });

        if (bestConnectionForThisFlight) {
          if (!portSummaryMap[arr.code]) {
            portSummaryMap[arr.code] = { code: arr.code, region: arr.region as Region, outbounds: [], inbounds: [] };
          }
          if (!portSummaryMap[arr.code].inbounds.some(i => i.connectingTime === (bestConnectionForThisFlight as ConnectionDetails).connectingTime)) {
            portSummaryMap[arr.code].inbounds.push(bestConnectionForThisFlight);
          }
        }
      });
    });

    return Object.values(portSummaryMap);
  };

  const getSummary = (source: { slotIndex: number, type: 'arr' | 'dep', flightId?: string }) => {
    const slot = consolidatedData[source.slotIndex];
    const sourceFlights = source.type === 'arr' ? slot.arrivals : slot.departures;
    const sourceFlight = source.flightId 
      ? sourceFlights.find(f => f.id === source.flightId) 
      : (sourceFlights.find(f => f.code === 'BLR' || f.isManual) || sourceFlights[0]);

    if (!sourceFlight) return null;

    const twoWayList = getTwoWaySummary(sourceFlight.code);
    const individualFlights = (sourceFlight as any).mergedFlights || [sourceFlight];
    const timings = individualFlights.map((f: any) => getMinutes(source.slotIndex, f.exactTime)).sort((a: any, b: any) => a - b);
    const earliestMins = timings[0];
    const latestMins = timings[timings.length - 1];

    const stats: Record<string, number> = {};
    const catchmentPorts: [string, number][] = [];
    const otherIndianPorts: [string, number][] = [];
    const intlPorts: [string, number][] = [];
    let totalFreq = 0, totalSeats = 0, totalPax = 0;
    let catchmentFreq = 0, catchmentSeats = 0, catchmentPax = 0;
    let otherIndianFreq = 0, otherIndianSeats = 0, otherIndianPax = 0;
    let internationalFreq = 0, internationalSeats = 0, internationalPax = 0;

    twoWayList.forEach(conn => {
      const hasOut = conn.outbounds.length > 0;
      const hasIn = conn.inbounds.length > 0;
      const isRelevant = source.type === 'arr' ? hasOut : hasIn;
      if (!isRelevant) return;

      const code = conn.code;
      const isCatchment = BLR_CATCHMENT.has(code);
      const isIndian = INDIAN_AIRPORTS.has(code);
      
      const matchingFlights: FlightInfo[] = [];
      consolidatedData.forEach(s => {
        const list = source.type === 'arr' ? s.departures : s.arrivals;
        list.filter(f => f.code === code).forEach(f => matchingFlights.push(f));
      });

      const freq = matchingFlights.reduce((sum, f) => sum + f.freq, 0);
      const seats = matchingFlights.reduce((sum, f) => sum + (f.seats || 0), 0);
      const pax = matchingFlights.reduce((sum, f) => sum + (f.pax || 0), 0);

      totalFreq += freq;
      totalSeats += seats;
      totalPax += pax;
      stats[conn.region] = (stats[conn.region] || 0) + freq;

      if (isCatchment) {
        catchmentFreq += freq; catchmentSeats += seats; catchmentPax += pax;
        catchmentPorts.push([code, freq]);
      } else if (isIndian) {
        otherIndianFreq += freq; otherIndianSeats += seats; otherIndianPax += pax;
        otherIndianPorts.push([code, freq]);
      } else {
        internationalFreq += freq; internationalSeats += seats; internationalPax += pax;
        intlPorts.push([code, freq]);
      }
    });

    const offsetMins = Math.round(mct * 60);
    const windowMins = Math.round(maxConnectionWindow * 60);
    const windowStartMins = (earliestMins + (source.type === 'arr' ? offsetMins : -windowMins - offsetMins) + 1440) % 1440;
    const windowEndMins = (latestMins + (source.type === 'arr' ? windowMins + offsetMins : -offsetMins) + 1440) % 1440;

    return {
      topRegions: Object.entries(stats).sort((a,b) => b[1]-a[1]).map(([region, freq]) => ({ region, freq })),
      totalFreq, totalSeats, totalPax,
      catchmentFreq, catchmentSeats, catchmentPax,
      otherIndianFreq, otherIndianSeats, otherIndianPax,
      internationalFreq, internationalSeats, internationalPax,
      catchmentPorts: catchmentPorts.sort((a,b) => b[1]-a[1]).slice(0, 5),
      otherIndianPorts: otherIndianPorts.sort((a,b) => b[1]-a[1]).slice(0, 5),
      intlPorts: intlPorts.sort((a,b) => b[1]-a[1]).slice(0, 5),
      windowStart: formatMins(windowStartMins), 
      windowEnd: formatMins(windowEndMins),
      focusTime: sourceFlight.isManual ? sourceFlight.exactTime : `${formatMins(earliestMins)}${individualFlights.length > 1 ? '+' : ''}`,
      networkBreadth: Object.keys(stats).length,
      efficiencyIndex: totalFreq > 0 ? (internationalFreq / totalFreq) * 100 : 0,
      twoWayList
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
    const x = window.innerWidth - 450;
    const y = 80 + (pinnedIntels.length * 40);
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

  const generateAIComparison = async () => {
    setIsAiLoading(true);
    setAiInsight(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const comparisonData = selectedRefs.map(ref => {
        const summary = getSummary(ref);
        const slot = consolidatedData[ref.slotIndex];
        const flight = (ref.type === 'arr' ? slot.arrivals : slot.departures).find(f => f.id === ref.flightId);
        return {
          code: flight?.code,
          type: ref.type === 'arr' ? 'Arrival' : 'Departure',
          bankTime: summary?.focusTime,
          metrics: summary ? {
            totalOps: formatVal(summary.totalFreq),
            intlOps: formatVal(summary.internationalFreq),
            catchmentOps: formatVal(summary.catchmentFreq),
            efficiency: summary.efficiencyIndex.toFixed(1) + '%'
          } : null
        };
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Analyze these hub blocks for BLR. prioritized INTL. Retiming allowed +/- 60m. 
        Data: ${JSON.stringify(comparisonData, null, 2)}. 
        MCT: ${mct}h, Window: ${maxConnectionWindow}h. 
        Provide tactical shifts (HH:mm) to maximize INTL and Domestic feed synergy.`,
      });
      setAiInsight(response.text || "No insights found.");
    } catch (err) {
      console.error(err);
      setAiInsight("Failed to generate AI insights.");
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
      
      if (sourceFlight) {
        const mctMins = Math.round(mct * 60);
        const windowMins = Math.round(maxConnectionWindow * 60);
        const checkInWindow = (val: number, start: number, duration: number) => {
          let relativeVal = (val - start + 1440) % 1440;
          return relativeVal >= 0 && relativeVal <= duration;
        };

        const sfMins = getMinutes(hoveredManualFlight.slotIndex, sourceFlight.exactTime);
        const tfMins = getMinutes(slotIndex, flight.exactTime);

        if (hoveredManualFlight.type === 'arr' && type === 'dep') {
          const validStart = (sfMins + mctMins) % 1440;
          isConn = checkInWindow(tfMins, validStart, windowMins);
        } else if (hoveredManualFlight.type === 'dep' && type === 'arr') {
          const validStart = (tfMins + mctMins) % 1440;
          isConn = checkInWindow(sfMins, validStart, windowMins);
        }
      }
    }

    const isSelected = !!selectedRefs.find(r => r.flightId === flight?.id && r.slotIndex === slotIndex);

    if (flight) {
      const isManual = flight.isManual;
      const isCatchment = BLR_CATCHMENT.has(flight.code);
      if (flight.code.includes(' NEW')) {
        classes += type === 'arr' ? 'bg-[#dfff00] text-black shadow-lg z-40 animate-pulse border-2 border-white ' : 'bg-[#ff00ff] text-white shadow-lg z-40 animate-pulse border-2 border-white ';
      } else if (isManual) {
        classes += type === 'arr' ? 'bg-[#00ff9d] text-[#004d30] border-2 border-dashed border-white/60 ' : 'bg-[#6366f1] text-white border-2 border-dashed border-white/60 ';
      } else if (highlightCatchment && isCatchment) {
        classes += 'bg-[#ff5f1f] text-white ';
      } else {
        classes += `${REGION_COLORS[flight.region as Region] || 'bg-slate-100'} `;
      }
      if (flight.code === 'BLR' && !isManual) classes += 'ring-2 ring-red-500 z-30 ';
    } else {
      classes += 'bg-transparent ';
    }
    
    if (dragOverSlot?.slotIndex === slotIndex && dragOverSlot?.type === type) classes += 'bg-[#006a4e]/20 ring-4 ring-[#006a4e] ';
    if (isConn) classes += `ring-4 ring-inset ${hoveredManualFlight?.type === 'arr' ? 'ring-indigo-400 bg-indigo-500/20' : 'ring-teal-400 bg-teal-500/20'} z-[100] scale-105 `;
    if (isSelected) classes += 'ring-4 ring-amber-400 z-[110] scale-110 shadow-2xl ';

    return classes;
  };

  const TwoWayCard: React.FC<{ conn: TwoWayConnection }> = ({ conn }) => {
    const mctMins = Math.round(mct * 60);
    
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group min-h-[160px]">
        <div className="absolute top-0 right-0 p-1 opacity-20 group-hover:opacity-40 transition-opacity">
          <div className={`w-1.5 h-1.5 rounded-full ${REGION_COLORS[conn.region] || 'bg-slate-200'}`} />
        </div>
        <div className="flex justify-between items-baseline mb-3">
          <h4 className="text-base font-black text-slate-900 leading-none">{conn.code}</h4>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{conn.region}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 border-t border-slate-50 pt-3">
          {/* Outbound Window based on Hub Arrival */}
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-white bg-indigo-600 px-3 py-1 rounded-lg mb-2 uppercase text-center shadow-md">
              Outbounds ({conn.outbounds.length})
            </span>
            <div className="space-y-1 max-h-24 overflow-y-auto no-scrollbar">
              {conn.outbounds.length === 0 && <p className="text-[8px] text-slate-300 text-center py-2 uppercase font-black">— No Out —</p>}
              {conn.outbounds.map((out, idx) => {
                const displayTime = subtractMct ? Math.max(0, out.timeMins - mctMins) : out.timeMins;
                return (
                  <div key={idx} className="flex justify-between items-center px-1 border-b border-slate-50 pb-1 last:border-0">
                    <span className="text-xs font-black text-slate-700">{out.connectingTime.split(':').slice(0, 2).join(':')}</span>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                      {formatDiff(displayTime)} {subtractMct ? 'Buff' : ''} • F:{formatVal(out.connectingFreq)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Inbound Window based on Hub Departure */}
          <div className="flex flex-col mt-2 pt-2 border-t border-slate-100">
            <span className="text-[9px] font-black text-white bg-[#006a4e] px-3 py-1 rounded-lg mb-2 uppercase text-center shadow-md">
              Inbounds ({conn.inbounds.length})
            </span>
            <div className="space-y-1 max-h-24 overflow-y-auto no-scrollbar">
              {conn.inbounds.length === 0 && <p className="text-[8px] text-slate-300 text-center py-2 uppercase font-black">— No In —</p>}
              {conn.inbounds.map((inc, idx) => {
                const displayTime = subtractMct ? Math.max(0, inc.timeMins - mctMins) : inc.timeMins;
                return (
                  <div key={idx} className="flex justify-between items-center px-1 border-b border-slate-50 pb-1 last:border-0">
                    <span className="text-xs font-black text-slate-700">{inc.connectingTime.split(':').slice(0, 2).join(':')}</span>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                      {formatDiff(displayTime)} {subtractMct ? 'Buff' : ''} • F:{formatVal(inc.connectingFreq)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const IntelCard: React.FC<{ source: { slotIndex: number, type: 'arr' | 'dep', flightId?: string }, flight: FlightInfo, onRemove?: () => void, isPinned?: boolean, onDragStart?: (e: React.MouseEvent) => void }> = ({ source, flight, onRemove, isPinned, onDragStart }) => {
    const summary = getSummary(source);
    if (!summary) return null;
    
    return (
      <div className={`bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 w-[380px] text-white overflow-hidden ${isPinned ? 'cursor-default' : 'pointer-events-none'}`}>
        <div onMouseDown={onDragStart} className={`flex items-center justify-between mb-3 ${isPinned ? 'cursor-grab border-b border-white/10 pb-2' : ''}`}>
          <div className="flex flex-col">
            <span className="text-lg font-black uppercase text-indigo-400 leading-none">{flight.code} ANALYSIS</span>
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Bank Focal: {summary.focusTime.split(':').slice(0, 2).join(':')}</span>
          </div>
          {onRemove && (
            <button 
              type="button"
              onMouseDown={(e) => e.stopPropagation()} 
              onClick={(e) => { e.stopPropagation(); onRemove(); }} 
              className="text-slate-500 hover:text-white transition-colors p-1"
            >
              <i className="fas fa-times-circle text-lg"></i>
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/5 rounded-lg p-2 border border-white/5 text-center">
              <span className="block text-[7px] font-black text-slate-400 uppercase mb-0.5">Ops</span>
              <span className="text-lg font-black text-white leading-none">{formatVal(summary.totalFreq)}</span>
            </div>
            <div className="bg-white/5 rounded-lg p-2 border border-white/5 text-center">
              <span className="block text-[7px] font-black text-slate-400 uppercase mb-0.5">Seats</span>
              <span className="text-lg font-black text-white leading-none">{formatStats(summary.totalSeats)}</span>
            </div>
            <div className="bg-white/5 rounded-lg p-2 border border-white/5 text-center">
              <span className="block text-[7px] font-black text-slate-400 uppercase mb-0.5">Pax</span>
              <span className="text-lg font-black text-white leading-none">{formatStats(summary.totalPax)}</span>
            </div>
          </div>

          <div className="space-y-2">
             <div className="flex justify-between items-center px-1">
               <span className="text-[8px] font-black text-slate-400 uppercase">REGIONAL SPREAD</span>
               <span className="text-[8px] font-black text-indigo-400 uppercase">{summary.networkBreadth} REGIONS</span>
             </div>
             <div className="space-y-1.5">
               {summary.topRegions.map(r => (
                 <div key={r.region} className="space-y-0.5">
                   <div className="flex justify-between text-[7px] font-bold uppercase px-1">
                     <span>{r.region}</span>
                     <span>{formatVal(r.freq)}</span>
                   </div>
                   <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                     <div className={`h-full ${REGION_COLORS[r.region as Region]}`} style={{ width: `${(r.freq / summary.totalFreq) * 100}%` }} />
                   </div>
                 </div>
               ))}
             </div>
          </div>

          <div className="bg-white/5 rounded-lg p-3 border border-white/5">
             <p className="text-[8px] font-black text-slate-400 uppercase mb-1.5 flex items-center gap-1.5">
               <i className="fas fa-link text-indigo-400 text-[9px]"></i> VALID CONNECTION INTERVAL
             </p>
             <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-indigo-400 tracking-tight leading-none">{summary.windowStart} — {summary.windowEnd}</p>
                </div>
                <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded">
                  <span className="text-[7px] font-bold text-slate-500 uppercase">MCT Buff</span>
                  <span className="text-[10px] font-black text-white leading-none">{mct}h</span>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <span className="text-[7px] font-black text-emerald-400 uppercase block tracking-widest leading-none">INTL</span>
              <div className="space-y-1">
                {summary.intlPorts.slice(0, 4).map(([p, f]) => (
                  <div key={p} className="flex justify-between text-[8px] font-black bg-white/5 px-1.5 py-1 rounded border border-white/5">
                    <span className="text-white/80">{p}</span>
                    <span className="text-emerald-400">{formatVal(f)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[7px] font-black text-amber-400 uppercase block tracking-widest leading-none">BLR-C</span>
              <div className="space-y-1">
                {summary.catchmentPorts.slice(0, 4).map(([p, f]) => (
                  <div key={p} className="flex justify-between text-[8px] font-black bg-white/5 px-1.5 py-1 rounded border border-white/5">
                    <span className="text-white/80">{p}</span>
                    <span className="text-amber-400">{formatVal(f)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[7px] font-black text-indigo-400 uppercase block tracking-widest leading-none">OTHER</span>
              <div className="space-y-1">
                {summary.otherIndianPorts.slice(0, 4).map(([p, f]) => (
                  <div key={p} className="flex justify-between text-[8px] font-black bg-white/5 px-1.5 py-1 rounded border border-white/5">
                    <span className="text-white/80">{p}</span>
                    <span className="text-indigo-400">{formatVal(f)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 relative h-full overflow-hidden" ref={containerRef}>
      {isCompareModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4 sm:p-6 lg:p-8">
           <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-[90rem] h-full flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="bg-slate-900 px-8 py-6 flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-[#00ff9d] rounded-2xl flex items-center justify-center text-slate-950 shadow-xl ring-4 ring-[#00ff9d]/20">
                       <i className="fas fa-network-wired text-2xl"></i>
                    </div>
                    <div>
                       <h2 className="text-white text-3xl font-black uppercase tracking-tighter">Bank Analysis: {selectedRefs.length > 0 ? (consolidatedData[selectedRefs[0].slotIndex].arrivals.find(f => f.id === selectedRefs[0].flightId) || consolidatedData[selectedRefs[0].slotIndex].departures.find(f => f.id === selectedRefs[0].flightId))?.code : 'Global Network'}</h2>
                       <p className="text-indigo-400 text-[11px] font-black uppercase tracking-[0.4em]">Connection Synergy Platform</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
                        <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Subtract MCT</span>
                        <button 
                          onClick={() => setSubtractMct(!subtractMct)}
                          className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${subtractMct ? 'bg-[#00ff9d]' : 'bg-slate-700'}`}
                        >
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${subtractMct ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    <nav className="flex bg-white/5 p-1 rounded-2xl border border-white/10">
                       {[
                         { id: 'two-way', label: 'Two-Way', icon: 'fa-exchange-alt' },
                         { id: 'outbound', label: 'Outbound', icon: 'fa-plane-departure' },
                         { id: 'inbound', label: 'Inbound', icon: 'fa-plane-arrival' },
                         { id: 'metrics', label: 'AI Strategy', icon: 'fa-brain' }
                       ].map(t => (
                         <button 
                           key={t.id}
                           onClick={() => setModalTab(t.id as any)}
                           className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2.5 transition-all ${modalTab === t.id ? 'bg-white text-slate-950 shadow-lg scale-105' : 'text-white/50 hover:text-white'}`}
                         >
                           <i className={`fas ${t.icon}`}></i>
                           {t.label}
                         </button>
                       ))}
                    </nav>
                    <button onClick={() => setIsCompareModalOpen(false)} className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-red-500 hover:scale-110 transition-all shadow-lg border border-white/10"><i className="fas fa-times text-xl"></i></button>
                 </div>
              </div>

              <div className="flex-1 overflow-auto bg-slate-50 p-8">
                 {(() => {
                    const firstRef = selectedRefs[0];
                    if (!firstRef) return <div className="h-full flex items-center justify-center text-slate-400 font-black uppercase tracking-widest text-xl opacity-20">Select a focal hub block to analyze</div>;
                    const flight = (firstRef.type === 'arr' ? consolidatedData[firstRef.slotIndex].arrivals : consolidatedData[firstRef.slotIndex].departures).find(f => f.id === firstRef.flightId);
                    if (!flight) return null;
                    const summary = getTwoWaySummary(flight.code);
                    
                    const filtered = summary.filter(c => {
                      if (modalTab === 'two-way') return c.outbounds.length > 0 && c.inbounds.length > 0;
                      if (modalTab === 'outbound') return c.outbounds.length > 0 && c.inbounds.length === 0;
                      if (modalTab === 'inbound') return c.inbounds.length > 0 && c.outbounds.length === 0;
                      return false;
                    });

                    // For the headers, we grab the focal times from the connection arrays
                    const focalArrTimeSet = new Set<string>();
                    const focalDepTimeSet = new Set<string>();
                    filtered.forEach(c => {
                      c.outbounds.forEach(o => focalArrTimeSet.add(`${o.focalTime}|${o.focalFreq}`));
                      c.inbounds.forEach(i => focalDepTimeSet.add(`${i.focalTime}|${i.focalFreq}`));
                    });
                    
                    const focalArr = Array.from(focalArrTimeSet)[0]?.split('|');
                    const focalDep = Array.from(focalDepTimeSet)[0]?.split('|');

                    if (modalTab === 'metrics') {
                      return (
                        <div className="h-full">
                           <div className="bg-slate-900 rounded-[3rem] p-12 text-white relative overflow-hidden h-full shadow-2xl">
                              <div className="relative z-10">
                                 <h3 className="text-4xl font-black mb-8 tracking-tighter">Strategic AI Insight Engine</h3>
                                 {isAiLoading ? (
                                   <div className="flex flex-col items-center justify-center h-96 gap-6">
                                     <div className="w-20 h-20 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                                     <p className="text-indigo-400 font-black uppercase tracking-widest animate-pulse">Calculating Market Synergy...</p>
                                   </div>
                                 ) : aiInsight ? (
                                   <div className="whitespace-pre-wrap text-slate-300 leading-relaxed font-medium bg-white/5 p-10 rounded-3xl border border-white/10 max-h-[600px] overflow-auto no-scrollbar">{aiInsight}</div>
                                 ) : (
                                   <div className="flex flex-col items-center justify-center h-96 gap-8">
                                      <i className="fas fa-brain text-8xl text-indigo-500/20"></i>
                                      <button onClick={generateAIComparison} className="bg-indigo-600 px-12 py-5 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-indigo-500 transition-all hover:scale-105 shadow-2xl shadow-indigo-600/30">Initiate AI Simulation</button>
                                   </div>
                                 )}
                              </div>
                           </div>
                        </div>
                      );
                    }

                    const grouped = filtered.reduce((acc, c) => {
                      if (!acc[c.region]) acc[c.region] = [];
                      acc[c.region].push(c);
                      return acc;
                    }, {} as Record<string, TwoWayConnection[]>);

                    return (
                      <div className="space-y-12">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-8">
                           <div className="flex gap-16 items-end">
                              <div><p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none">PORT ANALYSIS</p><p className="text-5xl font-black text-slate-900 leading-none mt-2">{flight.code}</p></div>
                              <div className="flex gap-12 border-l border-slate-200 pl-12 h-12 items-center">
                                {focalArr && (
                                  <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">HUB ARRIVAL</p>
                                    <p className="text-lg font-black text-[#006a4e] flex items-center gap-2">
                                      {focalArr[0].split(':').slice(0, 2).join(':')} <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 rounded border border-emerald-100 uppercase">F: {formatVal(parseInt(focalArr[1]))}</span>
                                    </p>
                                  </div>
                                )}
                                {focalDep && (
                                  <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">HUB DEPARTURE</p>
                                    <p className="text-lg font-black text-indigo-600 flex items-center gap-2">
                                      {focalDep[0].split(':').slice(0, 2).join(':')} <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 rounded border border-indigo-100 uppercase">F: {formatVal(parseInt(focalDep[1]))}</span>
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="border-l border-slate-200 pl-12 h-12 flex flex-col justify-center">
                                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-none">TOTAL SYNERGIES</p>
                                <p className="text-4xl font-black text-indigo-600 leading-none mt-1.5">{filtered.length}</p>
                              </div>
                           </div>
                        </div>
                        {Object.entries(grouped).sort().map(([region, conns]) => (
                          <div key={region} className="space-y-6">
                            <h3 className="text-sm font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-4">
                               <span className={`w-3.5 h-3.5 rounded-full shadow-lg ${REGION_COLORS[region as Region]}`} />
                               {region} ({conns.length})
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                               {conns.map(c => <TwoWayCard key={c.code} conn={c} />)}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                 })()}
              </div>
           </div>
        </div>
      )}

      {pendingDrop && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
           <div className="bg-white rounded-[2rem] shadow-2xl w-96 overflow-hidden border border-slate-200 animate-in fade-in slide-in-from-bottom-10">
             <div className={`px-8 py-5 flex items-center justify-between ${pendingDrop.type === 'arr' ? 'bg-[#dfff00]' : 'bg-[#6366f1] text-white'}`}>
                <h3 className={`text-xs font-black uppercase tracking-widest ${pendingDrop.type === 'arr' ? 'text-black' : 'text-white'}`}>Manual Block Injection</h3>
                <button onClick={() => setPendingDrop(null)} className="hover:scale-110 transition-transform"><i className="fas fa-times text-lg"></i></button>
             </div>
             <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Target Bank Time</label>
                  <input type="time" value={pendingDrop.block.exactTime} onChange={e => setPendingDrop({ ...pendingDrop, block: { ...pendingDrop.block, exactTime: e.target.value } })} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl text-slate-800 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all" />
                </div>
                <button onClick={() => { onManualDrop?.(pendingDrop.slotIndex, pendingDrop.type, pendingDrop.block, pendingDrop.fromSlot); setPendingDrop(null); }} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-black transition-all shadow-xl active:scale-[0.98]">Confirm Schedule Placement</button>
             </div>
           </div>
        </div>
      )}

      {editingFlight && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
           <div className="bg-white rounded-[2rem] shadow-2xl w-96 overflow-hidden border border-slate-200">
             <div className="bg-slate-900 px-8 py-5 flex items-center justify-between">
                <h3 className="text-white text-xs font-black uppercase tracking-widest">Entry Optimization</h3>
                <button onClick={() => setEditingFlight(null)} className="text-slate-400 hover:text-white transition-colors"><i className="fas fa-times text-lg"></i></button>
             </div>
             <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Retiming (HH:mm)</label>
                  <input type="time" value={editingFlight.flight.exactTime} onChange={e => setEditingFlight({ ...editingFlight, flight: { ...editingFlight.flight, exactTime: e.target.value } })} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl focus:outline-none transition-all" />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Carrier/Port IATA</label>
                   <input type="text" value={editingFlight.flight.code} onChange={e => setEditingFlight({ ...editingFlight, flight: { ...editingFlight.flight, code: e.target.value.toUpperCase() } })} className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-800" />
                </div>
                <button onClick={() => { onUpdateManualFlight?.(editingFlight.slotIndex, editingFlight.type, editingFlight.flight); setEditingFlight(null); }} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-lg shadow-indigo-600/20 active:scale-[0.98]">Update Hub Matrix</button>
             </div>
           </div>
        </div>
      )}

      {connectionSummary && hoveredManualFlight && !draggingPanelId && (
        <div className="fixed z-[9999] pointer-events-none" style={{ left: mousePos.x + 20, top: mousePos.y + 20 }}>
          {(() => {
            const slot = consolidatedData[hoveredManualFlight.slotIndex];
            const list = hoveredManualFlight.type === 'arr' ? slot.arrivals : slot.departures;
            const flight = hoveredManualFlight.flightId ? list.find(f => f.id === hoveredManualFlight.flightId) : (list.find(f => f.code === 'BLR' || f.isManual) || list[0]);
            return flight ? <IntelCard source={hoveredManualFlight} flight={flight} /> : null;
          })()}
        </div>
      )}

      {pinnedIntels.map(intel => (
        <div key={intel.id} className="fixed z-[9500]" style={{ left: intel.x, top: intel.y }}>
          <IntelCard source={{ slotIndex: intel.slotIndex, type: intel.type, flightId: intel.flight.id }} flight={intel.flight} isPinned onDragStart={e => startPanelDrag(e, intel.id)} onRemove={() => setPinnedIntels(prev => prev.filter(p => p.id !== intel.id))} />
        </div>
      ))}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-3 flex justify-between items-center shrink-0 mx-4 mt-2">
        <div className="flex items-center gap-6">
          <h2 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.3em]">Operational Bank Hub Structure</h2>
          <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-black border border-white/10">
             <span className="opacity-40">ZOOM:</span><span className="tabular-nums">{(scale * 100).toFixed(0)}%</span>
          </div>
          {selectedRefs.length >= 1 && (
            <button onClick={() => { setSubtractMct(false); setModalTab('two-way'); setIsCompareModalOpen(true); }} className="px-7 py-2.5 bg-amber-500 text-slate-950 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-amber-400 transition-all hover:scale-105 active:scale-95 flex items-center gap-3 shadow-xl shadow-amber-500/20 animate-pulse">
              <i className="fas fa-microchip"></i> ANALYZE CONNECTIVITY MATRIX
            </button>
          )}
          {selectedRefs.length > 0 && (
            <button onClick={() => setSelectedRefs([])} className="px-4 py-2 border border-slate-200 rounded-xl text-[10px] font-black text-slate-400 hover:text-red-500 hover:border-red-500 transition-all uppercase tracking-widest">CLEAR SELECTION</button>
          )}
        </div>
        <button onClick={() => setIsFitToScreen(!isFitToScreen)} className={`flex items-center gap-3 px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border ${isFitToScreen ? 'bg-[#006a4e] text-white border-[#006a4e] shadow-xl shadow-emerald-500/20' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
          <i className="fas fa-compress-arrows-alt"></i> {isFitToScreen ? 'RESET VIEW' : 'FIT TO SCREEN'}
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden flex items-center justify-center bg-slate-100/50 p-4">
        <div className="w-full h-full overflow-auto flex items-center justify-center no-scrollbar">
          <div ref={chartRef} style={{ transform: `scale(${scale})`, transformOrigin: 'center center', minWidth: 'max-content' }} className="bg-white rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.15)] border border-slate-200 relative p-12">
            <div className="relative inline-block border-x border-slate-200 ml-20">
              <div className="flex flex-col-reverse">
                {arrivalRows.map((_, rowIndex) => (
                  <div key={`arr-row-${rowIndex}`} className="flex h-14">
                    {consolidatedData.map((slot, slotIndex) => {
                      const flight = slot.arrivals[rowIndex];
                      return (
                        <div 
                          key={`arr-slot-${slotIndex}-${rowIndex}`} 
                          onDragOver={e => handleDragOver(e, slotIndex, 'arr')}
                          onDrop={e => handleDrop(e, slotIndex, 'arr')}
                          onMouseEnter={() => flight && onHoverManualFlight?.({ slotIndex, type: 'arr', flightId: flight.id })}
                          onMouseLeave={() => onHoverManualFlight?.(null)}
                          onClick={e => flight && handleFlightClick(e, slotIndex, 'arr', flight)}
                          onDoubleClick={() => flight && handleFlightDoubleClick(slotIndex, 'arr', flight)}
                          className={`w-28 border-r border-b border-slate-100 flex items-center justify-center cursor-default ${getCellClasses(flight, rowIndex, 'arr', slotIndex)}`}
                          draggable={!!flight}
                          onDragStart={e => { if (flight) { e.dataTransfer.setData('block', JSON.stringify(flight)); e.dataTransfer.setData('blockId', flight.id || ''); e.dataTransfer.setData('fromSlot', slotIndex.toString()); e.dataTransfer.setData('type', 'arr'); } }}
                        >
                          {flight && <span className="text-3xl font-black tracking-tighter select-none">{flight.code}</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex h-16 bg-slate-900 text-white relative z-[70] shadow-[0_0_40px_rgba(0,0,0,0.2)]">
                {consolidatedData.map((slot, i) => (
                  <div key={i} className="w-28 border-r border-white/5 flex items-center justify-center text-3xl font-black tabular-nums">{slot.label.split(':')[0]}</div>
                ))}
              </div>
              <div className="flex flex-col">
                {departureRows.map((_, rowIndex) => (
                  <div key={`dep-row-${rowIndex}`} className="flex h-14">
                    {consolidatedData.map((slot, slotIndex) => {
                      const flight = slot.departures[rowIndex];
                      return (
                        <div 
                          key={`dep-slot-${slotIndex}-${rowIndex}`} 
                          onDragOver={e => handleDragOver(e, slotIndex, 'dep')}
                          onDrop={e => handleDrop(e, slotIndex, 'dep')}
                          onMouseEnter={() => flight && onHoverManualFlight?.({ slotIndex, type: 'dep', flightId: flight.id })}
                          onMouseLeave={() => onHoverManualFlight?.(null)}
                          onClick={e => flight && handleFlightClick(e, slotIndex, 'dep', flight)}
                          onDoubleClick={() => flight && handleFlightDoubleClick(slotIndex, 'dep', flight)}
                          className={`w-28 border-r border-b border-slate-100 flex items-center justify-center cursor-default ${getCellClasses(flight, rowIndex, 'dep', slotIndex)}`}
                          draggable={!!flight}
                          onDragStart={e => { if (flight) { e.dataTransfer.setData('block', JSON.stringify(flight)); e.dataTransfer.setData('blockId', flight.id || ''); e.dataTransfer.setData('fromSlot', slotIndex.toString()); e.dataTransfer.setData('type', 'dep'); } }}
                        >
                          {flight && <span className="text-3xl font-black tracking-tighter select-none">{flight.code}</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="absolute -left-20 top-0 bottom-0 flex flex-col justify-between pointer-events-none w-20 bg-slate-50/80">
                  <div className="flex-1 flex items-center justify-center"><span className="-rotate-90 text-[11px] font-black uppercase opacity-20 tracking-widest">Arrivals</span></div>
                  <div className="h-16 flex items-center justify-center"><i className="fas fa-clock text-slate-800 opacity-20 text-xl"></i></div>
                  <div className="flex-1 flex items-center justify-center"><span className="-rotate-90 text-[11px] font-black uppercase opacity-20 tracking-widest">Departures</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HubBankChart;
