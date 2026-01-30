
import { GoogleGenAI } from "@google/genai";
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { HubSlot, Region, MarketSegment, FlightInfo, WorkspaceSnapshot, AirportDataset } from './types';
import { AIRPORT_REGIONS, TIME_SLOTS, REGION_COLORS, INDIAN_AIRPORTS } from './constants';
import HubBankChart from './components/HubBankChart';
import DataTable from './components/DataTable';

const STORAGE_KEY_SETTINGS = 'aerohub_workspace_settings';
const STORAGE_KEY_BLOCKS = 'aerohub_manual_blocks_v2';
const STORAGE_KEY_SNAPSHOTS = 'aerohub_snapshots_v2';
const STORAGE_KEY_DATASETS = 'aerohub_datasets_v2';

// Helper to calculate time deltas and new times
const getMins = (timeStr: string) => {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const minsToTime = (mins: number) => {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const App: React.FC = () => {
  const [datasets, setDatasets] = useState<AirportDataset[]>([]);
  const [activeAirportId, setActiveAirportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'raw' | 'hub'>('hub');
  const [loading, setLoading] = useState(false);
  
  const [selectedRegions, setSelectedRegions] = useState<Region[]>([Region.Africa, Region.AsiaPacific, Region.Europe, Region.MiddleEast, Region.Americas]);
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
  const [marketFilter, setMarketFilter] = useState<MarketSegment>(MarketSegment.All);
  const [alwaysFocusBLR, setAlwaysFocusBLR] = useState(true);
  const [highlightCatchment, setHighlightCatchment] = useState(false);
  const [airlineDropdownOpen, setAirlineDropdownOpen] = useState(false);
  const [airlineSearchQuery, setAirlineSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [freqMode, setFreqMode] = useState<'weekly' | 'daily'>('weekly');
  
  const [manualBlocks, setManualBlocks] = useState<Record<string, Record<number, { arrivals: FlightInfo[], departures: FlightInfo[] }>>>({});
  
  const [isDraggingOverTrash, setIsDraggingOverTrash] = useState(false);
  const [highlightConnections, setHighlightConnections] = useState(true);
  const [maxConnectionWindow, setMaxConnectionWindow] = useState(6);
  const [mct, setMct] = useState(1.5); 

  const [hoveredManualFlight, setHoveredManualFlight] = useState<{ slotIndex: number, type: 'arr' | 'dep', flightId?: string } | null>(null);
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([]);
  const [snapshotMenuOpen, setSnapshotMenuOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLDivElement>(null);

  const activeDataset = useMemo(() => 
    datasets.find(d => d.id === activeAirportId) || datasets[0] || null
  , [datasets, activeAirportId]);

  useEffect(() => {
    if (datasets.length > 0 && (!activeAirportId || !datasets.find(d => d.id === activeAirportId))) {
      setActiveAirportId(datasets[0].id);
    }
  }, [datasets, activeAirportId]);

  useEffect(() => {
    const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    const savedBlocks = localStorage.getItem(STORAGE_KEY_BLOCKS);
    const savedSnapshots = localStorage.getItem(STORAGE_KEY_SNAPSHOTS);
    const savedDatasets = localStorage.getItem(STORAGE_KEY_DATASETS);

    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setMct(settings.mct || 1.5);
      setMaxConnectionWindow(settings.maxConnectionWindow || 6);
      setSelectedRegions(settings.selectedRegions || [Region.Africa, Region.AsiaPacific, Region.Europe, Region.MiddleEast, Region.Americas]);
      setMarketFilter(settings.marketFilter || MarketSegment.All);
    }
    if (savedBlocks) setManualBlocks(JSON.parse(savedBlocks));
    if (savedSnapshots) setSnapshots(JSON.parse(savedSnapshots));
    if (savedDatasets) {
      const ds = JSON.parse(savedDatasets);
      setDatasets(ds);
      if (ds.length > 0) setActiveAirportId(ds[0].id);
    }
  }, []);

  useEffect(() => {
    const settings = { mct, maxConnectionWindow, selectedRegions, marketFilter };
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [mct, maxConnectionWindow, selectedRegions, marketFilter]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_BLOCKS, JSON.stringify(manualBlocks));
  }, [manualBlocks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(snapshots));
  }, [snapshots]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DATASETS, JSON.stringify(datasets));
  }, [datasets]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setAirlineDropdownOpen(false);
      if (snapshotRef.current && !snapshotRef.current.contains(event.target as Node)) setSnapshotMenuOpen(false);
    };
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const createSnapshot = () => {
    const name = prompt("Enter Scenario Name:", `Analysis ${new Date().toLocaleTimeString()}`);
    if (!name) return;
    const newSnapshot: WorkspaceSnapshot = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      timestamp: Date.now(),
      manualBlocks,
      mct,
      maxConnectionWindow,
      selectedRegions,
      marketFilter
    };
    setSnapshots(prev => [newSnapshot, ...prev]);
    setSnapshotMenuOpen(false);
  };

  const loadSnapshot = (s: WorkspaceSnapshot) => {
    setManualBlocks(s.manualBlocks);
    setMct(s.mct);
    setMaxConnectionWindow(s.maxConnectionWindow);
    setSelectedRegions(s.selectedRegions);
    setMarketFilter(s.marketFilter);
    setSnapshotMenuOpen(false);
  };

  const deleteSnapshot = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSnapshots(prev => prev.filter(s => s.id !== id));
  };

  const clearWorkspace = () => {
    if (confirm("Reset current workspace? This will remove all manual blocks for all airports.")) {
      setManualBlocks({});
      setMct(1.5);
      setMaxConnectionWindow(6);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  };

  /**
   * syncReciprocalUpdate: ABSOLUTE HUB RECIPROCITY ENGINE
   * 
   * logic: 
   * 1. Calculate the 'Total Delta' between the focal block's current time and its original CSV base time.
   * 2. Find the target hub (Dataset) corresponding to the focal block's destination/origin.
   * 3. Apply that same delta to the target flight's original CSV base time to get its new sync time.
   * 4. Update the target hub's manual block list, replacing existing sync blocks if they exist.
   */
  const syncReciprocalUpdate = (newBlocks: any, sourceHubCode: string, focalBlock: FlightInfo, type: 'arr' | 'dep') => {
    // 1. Identify Target Hub and Airline
    const airportPart = focalBlock.code.split(' ')[0].toUpperCase();
    const airline = focalBlock.airline || (focalBlock.code.split(' ').length > 1 ? focalBlock.code.split(' ')[1] : undefined);
    
    const targetDataset = datasets.find(d => d.code === airportPart);
    if (!targetDataset) return; 

    // 2. Calculate Absolute Delta from Anchor
    if (!focalBlock.originalHubTime || !focalBlock.exactTime) return;
    const absoluteDelta = getMins(focalBlock.exactTime) - getMins(focalBlock.originalHubTime);
    
    const reciprocalType = type === 'arr' ? 'dep' : 'arr';
    
    // 3. Extract all manual flights for target to avoid duplication/orphans
    const currentTargetBlocks = newBlocks[targetDataset.id] || {};
    const allManualFlights: { type: 'arr' | 'dep', flight: FlightInfo }[] = [];
    Object.keys(currentTargetBlocks).forEach(k => {
      const slot = currentTargetBlocks[parseInt(k)];
      (slot.arrivals || []).forEach((f: any) => allManualFlights.push({ type: 'arr', flight: f }));
      (slot.departures || []).forEach((f: any) => allManualFlights.push({ type: 'dep', flight: f }));
    });

    // Determine if we already have a manual block for this connection
    const matchingFIDs: string[] = [];
    allManualFlights.forEach(({ type: fType, flight: f }) => {
      if (fType === reciprocalType) {
        const isPortMatch = f.code.toUpperCase().startsWith(sourceHubCode);
        const isAirlineMatch = !airline || f.airline === airline || f.code.toUpperCase().includes(airline.toUpperCase());
        if (isPortMatch && isAirlineMatch) {
          matchingFIDs.push(f.id!);
        }
      }
    });

    let updatedTargetBlocks: Record<number, { arrivals: FlightInfo[], departures: FlightInfo[] }> = {};

    if (matchingFIDs.length > 0) {
      // SCENARIO: Link exists. Update all existing ones using their own original anchors + source delta
      allManualFlights.forEach(({ type: fType, flight: f }) => {
        let finalF = { ...f };
        if (matchingFIDs.includes(f.id!)) {
          // Recalculate based on original anchor
          const anchor = f.originalHubTime || f.exactTime || "00:00";
          finalF.exactTime = minsToTime(getMins(anchor) + absoluteDelta);
        }
        
        const hour = parseInt(finalF.exactTime!.split(':')[0]);
        if (!updatedTargetBlocks[hour]) updatedTargetBlocks[hour] = { arrivals: [], departures: [] };
        if (fType === 'arr') updatedTargetBlocks[hour].arrivals.push(finalF);
        else updatedTargetBlocks[hour].departures.push(finalF);
      });
    } else {
      // SCENARIO: No link. Create new from CSV data
      const typeKey = reciprocalType === 'arr' ? 'arrival' : 'departure';
      const matchInCSV = targetDataset.data.find(row => 
        row[`${typeKey}Code`]?.toUpperCase() === sourceHubCode && 
        (!airline || row[`${typeKey}Airline`]?.toUpperCase().includes(airline?.toUpperCase()))
      );

      // Carry over existing unrelated manual blocks
      allManualFlights.forEach(({ type: fType, flight: f }) => {
        const hour = parseInt(f.exactTime!.split(':')[0]);
        if (!updatedTargetBlocks[hour]) updatedTargetBlocks[hour] = { arrivals: [], departures: [] };
        if (fType === 'arr') updatedTargetBlocks[hour].arrivals.push(f);
        else updatedTargetBlocks[hour].departures.push(f);
      });

      if (matchInCSV) {
        const anchorTime = matchInCSV.hub_time;
        const newSyncTime = minsToTime(getMins(anchorTime) + absoluteDelta);
        const newHour = parseInt(newSyncTime.split(':')[0]);
        
        const syncFlight: FlightInfo = {
          id: Math.random().toString(36).substr(2, 9),
          code: `${sourceHubCode}${airline ? ' ' + airline : ''} SYNC`,
          airline: airline,
          freq: focalBlock.freq,
          region: AIRPORT_REGIONS[sourceHubCode] || Region.Unknown,
          isManual: true,
          exactTime: newSyncTime,
          originalHubTime: anchorTime // Seal the anchor for Hub B
        };

        if (!updatedTargetBlocks[newHour]) updatedTargetBlocks[newHour] = { arrivals: [], departures: [] };
        if (reciprocalType === 'arr') updatedTargetBlocks[newHour].arrivals.push(syncFlight);
        else updatedTargetBlocks[newHour].departures.push(syncFlight);
      }
    }

    newBlocks[targetDataset.id] = updatedTargetBlocks;
  };

  const handleManualDrop = (slotIndex: number, type: 'arr' | 'dep', block: FlightInfo, fromSlot?: number) => {
    if (!activeDataset) return;
    setManualBlocks(prev => {
      const newBlocks = { ...prev };
      const airportBlocks = { ...(newBlocks[activeDataset.id] || {}) };
      
      const airportCode = block.code.split(' ')[0].toUpperCase();
      const airline = block.airline || (block.code.split(' ').length > 1 ? block.code.split(' ')[1] : undefined);
      const typeKey = type === 'arr' ? 'arrival' : 'departure';

      let originalAnchor = block.originalHubTime;
      
      // If converting an automatic block for the first time, establish the IMMUTABLE ANCHOR
      if (!block.isManual) {
        const autoMatch = activeDataset.data.find(row => 
          row[`${typeKey}Code`]?.toUpperCase() === airportCode && 
          (!airline || row[`${typeKey}Airline`]?.toUpperCase().includes(airline?.toUpperCase()))
        );
        originalAnchor = autoMatch ? autoMatch.hub_time : `${(fromSlot ?? slotIndex).toString().padStart(2, '0')}:00`;
      }
      
      // Remove from old slot
      if (block.isManual && fromSlot !== undefined && airportBlocks[fromSlot]) {
        if (type === 'arr') airportBlocks[fromSlot].arrivals = (airportBlocks[fromSlot].arrivals || []).filter(b => b.id !== block.id);
        else airportBlocks[fromSlot].departures = (airportBlocks[fromSlot].departures || []).filter(b => b.id !== block.id);
      }

      const targetHour = block.exactTime ? parseInt(block.exactTime.split(':')[0]) : slotIndex;
      const safeSlot = isNaN(targetHour) ? slotIndex : targetHour;

      if (!airportBlocks[safeSlot]) airportBlocks[safeSlot] = { arrivals: [], departures: [] };
      
      let finalCode = block.code;
      if (!block.isManual) {
        const base = block.code.replace(/ NEW( \d+)?$/, "");
        const existingInSlot = type === 'arr' ? (airportBlocks[safeSlot].arrivals || []) : (airportBlocks[safeSlot].departures || []);
        const regex = new RegExp(`^${base} NEW( (\\d+))?$`);
        let maxSuffix = 0;
        let foundAnyNew = false;
        
        existingInSlot.forEach(f => {
          const match = f.code.match(regex);
          if (match) {
            foundAnyNew = true;
            if (match[2]) maxSuffix = Math.max(maxSuffix, parseInt(match[2]));
            else maxSuffix = Math.max(maxSuffix, 1);
          }
        });
        finalCode = !foundAnyNew ? `${base} NEW` : `${base} NEW ${maxSuffix + 1}`;
      }

      const newBlock: FlightInfo = {
        ...block,
        id: block.id || Math.random().toString(36).substr(2, 9),
        isManual: true,
        code: finalCode,
        exactTime: block.exactTime || `${safeSlot.toString().padStart(2, '0')}:00`,
        originalHubTime: originalAnchor // Persistent Anchor
      };

      if (type === 'arr') airportBlocks[safeSlot].arrivals = [...(airportBlocks[safeSlot].arrivals || []), newBlock];
      else airportBlocks[safeSlot].departures = [...(airportBlocks[safeSlot].departures || []), newBlock];
      
      newBlocks[activeDataset.id] = airportBlocks;
      
      // Propagate change to reciprocal hub
      syncReciprocalUpdate(newBlocks, activeDataset.code, newBlock, type);
      
      return newBlocks;
    });
  };

  const updateManualFlight = (slotIndex: number, type: 'arr' | 'dep', updatedFlight: FlightInfo) => {
    if (!activeDataset) return;
    setManualBlocks(prev => {
      const newBlocks = { ...prev };
      const airportBlocks = { ...(newBlocks[activeDataset.id] || {}) };
      
      const oldFlight = (type === 'arr' ? airportBlocks[slotIndex]?.arrivals : airportBlocks[slotIndex]?.departures)?.find(f => f.id === updatedFlight.id);
      
      // Ensure anchor preservation
      let finalUpdated = { ...updatedFlight };
      if (!finalUpdated.originalHubTime && oldFlight?.originalHubTime) {
        finalUpdated.originalHubTime = oldFlight.originalHubTime;
      }

      let targetSlot = slotIndex;
      if (finalUpdated.exactTime) {
        const hour = parseInt(finalUpdated.exactTime.split(':')[0]);
        if (!isNaN(hour) && hour >= 0 && hour <= 23) targetSlot = hour;
      }

      if (airportBlocks[slotIndex]) {
        if (type === 'arr') airportBlocks[slotIndex].arrivals = (airportBlocks[slotIndex].arrivals || []).filter(f => f.id !== finalUpdated.id);
        else airportBlocks[slotIndex].departures = (airportBlocks[slotIndex].departures || []).filter(f => f.id !== finalUpdated.id);
      }

      if (!airportBlocks[targetSlot]) airportBlocks[targetSlot] = { arrivals: [], departures: [] };
      if (type === 'arr') airportBlocks[targetSlot].arrivals = [...(airportBlocks[targetSlot].arrivals || []), finalUpdated];
      else airportBlocks[targetSlot].departures = [...(airportBlocks[targetSlot].departures || []), finalUpdated];

      newBlocks[activeDataset.id] = airportBlocks;
      
      // Bidirectional Push
      syncReciprocalUpdate(newBlocks, activeDataset.code, finalUpdated, type);
      
      return newBlocks;
    });
  };

  const handleTrashDrop = (blockId: string, fromSlot: number, type: 'arr' | 'dep') => {
    if (!activeDataset) return;
    setManualBlocks(prev => {
      const newBlocks = { ...prev };
      const airportBlocks = { ...(newBlocks[activeDataset.id] || {}) };
      if (airportBlocks[fromSlot]) {
        if (type === 'arr') airportBlocks[fromSlot].arrivals = (airportBlocks[fromSlot].arrivals || []).filter(b => b.id !== blockId);
        else airportBlocks[fromSlot].departures = (airportBlocks[fromSlot].departures || []).filter(b => b.id !== blockId);
      }
      newBlocks[activeDataset.id] = airportBlocks;
      return newBlocks;
    });
    setIsDraggingOverTrash(false);
  };

  const processedHubData = useMemo(() => {
    if (!activeDataset) return [];
    const slots: HubSlot[] = TIME_SLOTS.map(time => ({ label: time, arrivals: [], departures: [] }));
    const aggregation: Record<number, { arrivals: any, departures: any }> = {};
    TIME_SLOTS.forEach((_, i) => aggregation[i] = { arrivals: {}, departures: {} });

    activeDataset.data.forEach((row: any) => {
      if (!row.hub_time || !row.hub_time.includes(':')) return;
      const slotIndex = parseInt(row.hub_time.split(':')[0]);
      if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 23) return;

      const processDirection = (dir: 'arrival' | 'departure') => {
        const prefix = dir === 'arrival' ? 'arrival' : 'departure';
        const code = row[`${prefix}Code`]?.toUpperCase();
        if (!code || code.length < 3) return;
        const region = AIRPORT_REGIONS[code] || Region.Unknown;
        const airline = row[`${prefix}Airline`];
        const market = INDIAN_AIRPORTS.has(code) ? MarketSegment.Domestic : MarketSegment.International;
        
        const passesRegion = selectedRegions.includes(region) || (alwaysFocusBLR && code === activeDataset.code);
        const passesAirline = !!airline && (selectedAirlines.length === 0 || selectedAirlines.includes(airline));
        const passesMarket = marketFilter === MarketSegment.All || market === marketFilter;
        
        if (passesRegion && passesAirline && passesMarket) {
          const key = `${code}-${row.hub_time}-${row[`${prefix}FlightNo`] || 'XX'}`;
          const target = aggregation[slotIndex][`${prefix}s`];
          if (!target[key]) {
            target[key] = { freq: 0, seats: 0, pax: 0, airline, flightNo: row[`${prefix}FlightNo`], exactTime: row.hub_time, id: Math.random().toString(36).substr(2, 9) };
          }
          target[key].freq += (row[`${prefix}Freq`] || 0);
          target[key].seats += (row[`${prefix}Seats`] || 0);
          target[key].pax += (row[`${prefix}Pax`] || 0);
        }
      };
      processDirection('arrival');
      processDirection('departure');
    });

    Object.keys(aggregation).forEach((key) => {
      const idx = parseInt(key);
      const manual = (manualBlocks[activeDataset.id] || {})[idx] || { arrivals: [], departures: [] };
      
      const mapEntries = (obj: any) => Object.entries(obj).map(([keyStr, val]: [string, any]) => {
        const code = keyStr.split('-')[0];
        return {
          code, freq: val.freq, seats: val.seats, pax: val.pax, region: AIRPORT_REGIONS[code] || Region.Unknown, 
          airline: val.airline, flightNo: val.flightNo, exactTime: val.exactTime, id: val.id, isManual: false
        } as FlightInfo;
      });

      slots[idx].arrivals = [...mapEntries(aggregation[idx].arrivals), ...manual.arrivals];
      slots[idx].departures = [...mapEntries(aggregation[idx].departures), ...manual.departures];
    });
    return slots;
  }, [activeDataset, selectedRegions, selectedAirlines, marketFilter, alwaysFocusBLR, manualBlocks]);

  const uniqueAirlinesFound = useMemo(() => {
    if (!activeDataset) return [];
    const airlines = activeDataset.data.flatMap(d => [d.arrivalAirline, d.departureAirline]).filter(Boolean);
    return Array.from(new Set(airlines)).sort() as string[];
  }, [activeDataset]);

  const filteredAirlines = useMemo(() => {
    if (!airlineSearchQuery) return uniqueAirlinesFound;
    return uniqueAirlinesFound.filter(a => a.toLowerCase().includes(airlineSearchQuery.toLowerCase()));
  }, [uniqueAirlinesFound, airlineSearchQuery]);

  const toggleAirline = (airline: string) => {
    setSelectedAirlines(prev => prev.includes(airline) ? prev.filter(a => a !== airline) : [...prev, airline]);
  };

  const parseCSVData = (text: string): any[] => {
    const rows = text.split('\n').filter(row => row.trim().length > 0);
    if (rows.length < 2) return [];
    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
    
    const findIdx = (keywords: string[]) => {
      let idx = headers.findIndex(h => keywords.some(k => h === k.toLowerCase()));
      if (idx !== -1) return idx;
      return headers.findIndex(h => keywords.some(k => h.includes(k.toLowerCase())));
    };
    
    const seatIndices = headers.reduce((acc: number[], h, i) => h.includes('seats') ? [...acc, i] : acc, []);
    const arrSeatsIdx = seatIndices.length > 1 ? seatIndices[0] : (seatIndices[0] || -1);
    const depSeatsIdx = seatIndices.length > 1 ? seatIndices[1] : -1;

    const paxIndices = headers.reduce((acc: number[], h, i) => h.includes('pax') ? [...acc, i] : acc, []);
    const arrPaxIdx = paxIndices.length > 1 ? paxIndices[0] : (paxIndices[0] || -1);
    const depPaxIdx = paxIndices.length > 1 ? paxIndices[1] : -1;

    const headerMap = {
      airline: headers.findIndex(h => h.includes('airline')),
      origin: findIdx(['origin', 'origin airport', 'from']),
      depTime: headers.findIndex(h => h.includes('departure time')),
      hubTime: headers.findIndex(h => h.includes('hub time')),
      arrTime: headers.findIndex(h => h.includes('arrival time')),
      arrival: findIdx(['arrival', 'arrival airport', 'destination', 'to']),
    };

    return rows.slice(1).map(row => {
      const cols = row.split(',').map(c => c.trim());
      return {
        arrivalAirline: cols[headerMap.airline] || "",
        arrivalFlightNo: cols[1] || "", 
        arrivalCode: cols[headerMap.origin] || "",
        arrivalFreq: (cols[3]?.match(/[1-7]/g) || []).length,
        arrivalSeats: parseInt(cols[arrSeatsIdx]) || 0,
        arrivalPax: parseInt(cols[arrPaxIdx]) || 0,
        arrivalTime: cols[headerMap.depTime] || "",
        hub_time: cols[headerMap.hubTime] || "",
        departureCode: cols[headerMap.arrival] || "", 
        departureTime: cols[headerMap.arrTime] || "",
        departureFreq: (cols[13]?.match(/[1-7]/g) || []).length,
        departureSeats: parseInt(cols[depSeatsIdx]) || 0,
        departurePax: parseInt(cols[depPaxIdx]) || 0,
        departureFlightNo: cols[cols.length - 2] || "", 
        departureAirline: cols[16] || cols[cols.length - 1] || "",
        _raw: cols 
      };
    }).filter(r => !!r.hub_time);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    setLoading(true);
    
    const newDatasets: AirportDataset[] = [];
    for (const file of files) {
      const text = await file.text();
      const parsed = parseCSVData(text);
      if (parsed.length > 0) {
        const match = file.name.toUpperCase().match(/[A-Z]{3}/);
        const code = match ? match[0] : "UNK";
        newDatasets.push({
          id: Math.random().toString(36).substr(2, 9),
          code,
          fileName: file.name,
          data: parsed
        });
      }
    }
    
    setDatasets(prev => [...prev, ...newDatasets]);
    setLoading(false);
  };

  const removeDataset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDatasets(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div ref={appRef} className="flex flex-col h-screen overflow-hidden bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#006a4e] rounded-lg flex items-center justify-center text-white shadow-md">
            <i className="fas fa-plane-arrival text-sm"></i>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-none">AeroHub</h1>
            <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.15em] mt-0.5">Operation Visualizer</p>
          </div>
        </div>
        
        {activeTab === 'hub' && activeDataset && (
          <div className="flex items-center gap-4 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700 shadow-xl">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">MCT Simulator</span>
              <div className="flex items-center gap-2">
                <div draggable onDragStart={(e) => { e.dataTransfer.setData('type', 'arr'); e.dataTransfer.setData('block', JSON.stringify({ code: 'NEW', freq: 1, region: Region.AsiaPacific, isManual: true })); }}
                  className="bg-[#00ff9d] text-[#004d30] px-3 py-1 rounded text-[9px] font-black uppercase cursor-grab shadow-sm hover:brightness-110">+ Arr Block</div>
                <div draggable onDragStart={(e) => { e.dataTransfer.setData('type', 'dep'); e.dataTransfer.setData('block', JSON.stringify({ code: 'NEW', freq: 1, region: Region.AsiaPacific, isManual: true })); }}
                  className="bg-[#6366f1] text-white px-3 py-1 rounded text-[9px] font-black uppercase cursor-grab shadow-sm hover:brightness-110">+ Dep Block</div>
              </div>
              <div className="h-4 w-px bg-slate-700"></div>
              <div className="flex flex-col gap-0.5 min-w-[100px]">
                <div className="flex justify-between items-center text-[7px] font-black text-slate-400 uppercase"><span>MCT Offset: {mct}h</span></div>
                <input type="range" min="0" max="6" step="0.25" value={mct} onChange={(e) => setMct(parseFloat(e.target.value))} className="w-full accent-[#00ff9d] h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
              </div>
              <div className="flex flex-col gap-0.5 min-w-[100px]">
                <div className="flex justify-between items-center text-[7px] font-black text-slate-400 uppercase"><span>Window: {maxConnectionWindow}h</span></div>
                <input type="range" min="1" max="12" step="0.5" value={maxConnectionWindow} onChange={(e) => setMaxConnectionWindow(parseFloat(e.target.value))} className="w-full accent-[#6366f1] h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
              </div>
              <div onDragOver={(e) => { e.preventDefault(); setIsDraggingOverTrash(true); }} onDragLeave={() => setIsDraggingOverTrash(false)} onDrop={(e) => {
                   const blockId = e.dataTransfer.getData('blockId');
                   const fromSlot = parseInt(e.dataTransfer.getData('fromSlot'));
                   const type = e.dataTransfer.getData('type') as 'arr' | 'dep';
                   if (blockId && !isNaN(fromSlot)) handleTrashDrop(blockId, fromSlot, type);
                 }}
                 className={`flex items-center justify-center w-7 h-7 rounded border transition-all ${isDraggingOverTrash ? 'bg-red-500 border-red-400 text-white scale-110' : 'bg-slate-800 border-slate-600 text-slate-500'}`}><i className="fas fa-trash text-[10px]"></i></div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="relative" ref={snapshotRef}>
            <button onClick={() => setSnapshotMenuOpen(!snapshotMenuOpen)} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg shadow-sm">
              <i className="fas fa-history text-xs text-indigo-400"></i><span className="text-[10px] font-black uppercase tracking-wider">Scenarios</span>
            </button>
            {snapshotMenuOpen && (
              <div className="absolute top-full right-0 w-72 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[200] overflow-hidden flex flex-col max-h-[400px]">
                <div className="p-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Snapshot Manager</span>
                  <button onClick={createSnapshot} className="text-[8px] font-black bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-500 uppercase">Capture</button>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-2 no-scrollbar">
                  {snapshots.length === 0 && <p className="text-[9px] text-slate-500 text-center py-4 uppercase font-bold">No saved scenarios</p>}
                  {snapshots.map(s => (
                    <div key={s.id} onClick={() => loadSnapshot(s)} className="w-full text-left p-3 rounded-lg bg-slate-800 border border-slate-700 hover:border-indigo-500 group cursor-pointer transition-all">
                      <div className="flex justify-between items-start mb-1"><span className="text-xs font-black text-white group-hover:text-indigo-400">{s.name}</span>
                        <button onClick={(e) => deleteSnapshot(s.id, e)} className="text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><i className="fas fa-trash text-[10px]"></i></button>
                      </div>
                      <div className="flex items-center gap-3 text-[8px] font-black text-slate-500 uppercase">
                        <span><i className="fas fa-clock mr-1"></i>{new Date(s.timestamp).toLocaleDateString()}</span>
                        <span><i className="fas fa-plane mr-1"></i>MCT: {s.mct}h</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t border-slate-700 bg-slate-800/50"><button onClick={clearWorkspace} className="w-full py-2 text-[8px] font-black text-red-400 hover:text-red-300 uppercase tracking-widest">Reset Workspace</button></div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleFullscreen} className="text-slate-400 hover:text-slate-600 p-1.5 transition-colors"><i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'} text-sm`}></i></button>
            <label className="flex items-center gap-2 bg-[#006a4e] hover:bg-[#00523c] text-white px-3 py-1.5 rounded-lg cursor-pointer transition-all shadow-sm">
              <i className="fas fa-file-csv text-xs"></i><span className="text-[10px] font-black uppercase tracking-wider">Upload CSV(s)</span>
              <input type="file" accept=".csv" multiple className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      </header>

      {datasets.length > 0 && (
        <div className="bg-slate-50 px-6 border-b border-slate-200 flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0 h-10">
          {datasets.map(d => (
            <button key={d.id} onClick={() => setActiveAirportId(d.id)}
              className={`flex items-center gap-2 px-4 h-full text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeAirportId === d.id ? 'border-[#006a4e] text-[#006a4e] bg-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              <i className="fas fa-location-dot text-[8px]"></i>{d.code}
              <i onClick={(e) => removeDataset(d.id, e)} className="fas fa-times ml-1 hover:text-red-500 cursor-pointer"></i>
            </button>
          ))}
        </div>
      )}
      
      <nav className="bg-white border-b border-slate-100 px-6 flex shrink-0 justify-between items-center z-50 relative h-10">
        <div className="flex h-full">
          <button onClick={() => setActiveTab('hub')} className={`px-4 h-full text-[10px] font-black tracking-widest uppercase border-b-2 transition-all ${activeTab === 'hub' ? 'border-[#006a4e] text-[#006a4e]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Hub View</button>
          <button onClick={() => setActiveTab('raw')} className={`px-4 h-full text-[10px] font-black tracking-widest uppercase border-b-2 transition-all ${activeTab === 'raw' ? 'border-[#006a4e] text-[#006a4e]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Raw Data</button>
        </div>

        {activeTab === 'hub' && activeDataset && (
          <div className="flex items-center gap-4 py-1">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
               <button onClick={() => setFreqMode('weekly')} className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all ${freqMode === 'weekly' ? 'bg-[#006a4e] text-white shadow-lg' : 'text-slate-400'}`}>Weekly</button>
               <button onClick={() => setFreqMode('daily')} className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all ${freqMode === 'daily' ? 'bg-[#006a4e] text-white shadow-lg' : 'text-slate-400'}`}>Daily</button>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mr-1">Regions:</span>
              {[Region.Africa, Region.AsiaPacific, Region.Europe, Region.MiddleEast, Region.Americas].map(region => (
                <button key={region} onClick={() => setSelectedRegions(prev => prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region])}
                  className={`px-2 py-0.5 rounded text-[8px] font-black uppercase transition-all border ${selectedRegions.includes(region) ? REGION_COLORS[region] : 'bg-white text-slate-300 border-slate-100'}`}>
                  {region.split('/')[0]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2"><span className="text-[8px] font-black text-slate-500 uppercase">CATCHMENT</span>
              <button onClick={() => setHighlightCatchment(!highlightCatchment)} className={`relative inline-flex h-3.5 w-7 items-center rounded-full transition-colors ${highlightCatchment ? 'bg-[#ff5f1f]' : 'bg-slate-300'}`}>
                <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${highlightCatchment ? 'translate-x-4' : 'translate-x-1'}`} /></button>
            </div>
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {Object.values(MarketSegment).map((segment) => (
                <button key={segment} onClick={() => setMarketFilter(segment)} className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all ${marketFilter === segment ? 'bg-white text-[#006a4e] shadow-xs' : 'text-slate-400'}`}>{segment}</button>
              ))}
            </div>
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setAirlineDropdownOpen(!airlineDropdownOpen)} className={`px-3 py-1 rounded border transition-all text-[8px] font-black uppercase tracking-widest ${selectedAirlines.length > 0 ? 'bg-[#006a4e] border-[#006a4e] text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                Airlines ({selectedAirlines.length || 'All'})
              </button>
              {airlineDropdownOpen && (
                <div className="absolute top-full right-0 w-64 mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl z-[100] overflow-hidden flex flex-col max-h-[300px]">
                  <div className="p-2 bg-slate-50 border-b border-slate-200"><input type="text" placeholder="Search..." value={airlineSearchQuery} onChange={(e) => setAirlineSearchQuery(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-[#006a4e]" /></div>
                  <div className="overflow-y-auto flex-1 p-1">{filteredAirlines.map(airline => (
                      <button key={airline} onClick={() => toggleAirline(airline)} className={`w-full text-left px-2 py-1.5 rounded text-[10px] font-bold flex items-center justify-between ${selectedAirlines.includes(airline) ? 'bg-[#006a4e]/5 text-[#006a4e]' : 'text-slate-600 hover:bg-slate-50'}`}>{airline}</button>
                    ))}</div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2"><span className="text-[8px] font-black text-slate-500 uppercase">Focus Hub</span>
              <button onClick={() => setAlwaysFocusBLR(!alwaysFocusBLR)} className={`relative inline-flex h-3.5 w-7 items-center rounded-full ${alwaysFocusBLR ? 'bg-[#006a4e]' : 'bg-slate-300'}`}>
                <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${alwaysFocusBLR ? 'translate-x-4' : 'translate-x-1'}`} /></button>
            </div>
          </div>
        )}
      </nav>

      <main className={`flex-1 overflow-hidden transition-all bg-[#f1f5f9]`}>
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006a4e] mb-2"></div>
            <p className="text-[10px] font-black uppercase tracking-widest">Processing Datasets...</p>
          </div>
        ) : datasets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center m-6 border-2 border-dashed border-slate-200 rounded-3xl bg-white/50">
            <i className="fas fa-file-import text-xl text-slate-300 mb-2"></i>
            <h2 className="text-xs font-black text-slate-700 uppercase">Upload CSVs (e.g. BLR.csv, JED.csv) To Start</h2>
          </div>
        ) : (
          <div className="h-full px-4 py-4">
            {activeTab === 'hub' ? (
               <HubBankChart 
                 data={processedHubData} 
                 onManualDrop={handleManualDrop}
                 onUpdateManualFlight={updateManualFlight}
                 highlightConnections={highlightConnections}
                 maxConnectionWindow={maxConnectionWindow}
                 mct={mct}
                 onHoverManualFlight={setHoveredManualFlight}
                 hoveredManualFlight={hoveredManualFlight}
                 freqMode={freqMode}
                 highlightCatchment={highlightCatchment}
                 isBlrFile={activeDataset?.code === 'BLR'}
               />
            ) : (
               <DataTable data={activeDataset?.data || []} freqMode={freqMode} />
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
