
import { GoogleGenAI } from "@google/genai";
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { HubSlot, Region, MarketSegment, FlightInfo } from './types';
import { AIRPORT_REGIONS, TIME_SLOTS, REGION_COLORS, INDIAN_AIRPORTS } from './constants';
import HubBankChart from './components/HubBankChart';
import DataTable from './components/DataTable';

const App: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'raw' | 'hub'>('hub');
  const [loading, setLoading] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<Region[]>(Object.values(Region).filter(r => r !== Region.Unknown));
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
  const [marketFilter, setMarketFilter] = useState<MarketSegment>(MarketSegment.All);
  const [alwaysFocusBLR, setAlwaysFocusBLR] = useState(true);
  const [highlightCatchment, setHighlightCatchment] = useState(false);
  const [airlineDropdownOpen, setAirlineDropdownOpen] = useState(false);
  const [airlineSearchQuery, setAirlineSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [freqMode, setFreqMode] = useState<'weekly' | 'daily'>('weekly');
  
  const [manualBlocks, setManualBlocks] = useState<Record<number, { arrivals: FlightInfo[], departures: FlightInfo[] }>>({});
  const [isDraggingOverTrash, setIsDraggingOverTrash] = useState(false);
  const [highlightConnections, setHighlightConnections] = useState(true);
  const [maxConnectionWindow, setMaxConnectionWindow] = useState(6);
  const [mct, setMct] = useState(1.5); 

  const [hoveredManualFlight, setHoveredManualFlight] = useState<{ slotIndex: number, type: 'arr' | 'dep', flightId?: string } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setAirlineDropdownOpen(false);
      }
    };
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  };

  const isBlrFile = useMemo(() => fileName.toUpperCase().includes('BLR'), [fileName]);

  const handleManualDrop = (slotIndex: number, type: 'arr' | 'dep', block: FlightInfo, fromSlot?: number) => {
    setManualBlocks(prev => {
      const newBlocks = { ...prev };
      
      if (fromSlot !== undefined && newBlocks[fromSlot]) {
        if (type === 'arr') {
           newBlocks[fromSlot].arrivals = newBlocks[fromSlot].arrivals.filter(b => b.id !== block.id);
        } else {
           newBlocks[fromSlot].departures = newBlocks[fromSlot].departures.filter(b => b.id !== block.id);
        }
      }

      if (!newBlocks[slotIndex]) newBlocks[slotIndex] = { arrivals: [], departures: [] };
      const blockWithId = block.id ? block : { ...block, id: Math.random().toString(36).substr(2, 9) };
      
      if (!blockWithId.exactTime) {
        blockWithId.exactTime = `${slotIndex.toString().padStart(2, '0')}:00`;
      }

      if (type === 'arr') {
        newBlocks[slotIndex].arrivals = [...newBlocks[slotIndex].arrivals, blockWithId];
      } else {
        newBlocks[slotIndex].departures = [...newBlocks[slotIndex].departures, blockWithId];
      }
      
      return newBlocks;
    });
  };

  const updateManualFlight = (slotIndex: number, type: 'arr' | 'dep', updatedFlight: FlightInfo) => {
    setManualBlocks(prev => {
      const newBlocks = { ...prev };
      
      let targetSlot = slotIndex;
      if (updatedFlight.exactTime) {
        const hour = parseInt(updatedFlight.exactTime.split(':')[0]);
        if (!isNaN(hour) && hour >= 0 && hour <= 23) {
          targetSlot = hour;
        }
      }

      if (newBlocks[slotIndex]) {
        if (type === 'arr') {
          newBlocks[slotIndex].arrivals = newBlocks[slotIndex].arrivals.filter(f => f.id !== updatedFlight.id);
        } else {
          newBlocks[slotIndex].departures = newBlocks[slotIndex].departures.filter(f => f.id !== updatedFlight.id);
        }
      }

      if (!newBlocks[targetSlot]) newBlocks[targetSlot] = { arrivals: [], departures: [] };
      if (type === 'arr') {
        newBlocks[targetSlot].arrivals = [...newBlocks[targetSlot].arrivals, updatedFlight];
      } else {
        newBlocks[targetSlot].departures = [...newBlocks[targetSlot].departures, updatedFlight];
      }

      return newBlocks;
    });
  };

  const handleTrashDrop = (blockId: string, fromSlot: number, type: 'arr' | 'dep') => {
    setManualBlocks(prev => {
      const newBlocks = { ...prev };
      if (newBlocks[fromSlot]) {
        if (type === 'arr') {
          newBlocks[fromSlot].arrivals = newBlocks[fromSlot].arrivals.filter(b => b.id !== blockId);
        } else {
          newBlocks[fromSlot].departures = newBlocks[fromSlot].departures.filter(b => b.id !== blockId);
        }
      }
      return newBlocks;
    });
    setIsDraggingOverTrash(false);
  };

  const processedHubData = useMemo(() => {
    const slots: HubSlot[] = TIME_SLOTS.map(time => ({
      label: time,
      arrivals: [],
      departures: []
    }));

    const aggregation: Record<number, { arrivals: Record<string, {freq: number, airline?: string, exactTime?: string, id?: string}>, departures: Record<string, {freq: number, airline?: string, exactTime?: string, id?: string}> }> = {};
    TIME_SLOTS.forEach((_, i) => aggregation[i] = { arrivals: {}, departures: {} });

    data.forEach((row: any) => {
      if (!row.hub_time || !row.hub_time.includes(':')) return;
      const hourStr = row.hub_time.split(':')[0];
      const slotIndex = parseInt(hourStr);
      if (isNaN(slotIndex) || slotIndex < 0 || slotIndex > 23) return;

      const getRegion = (code: string) => AIRPORT_REGIONS[code?.toUpperCase()] || Region.Unknown;

      if (row.arrivalCode && row.arrivalCode.length >= 3) {
        const code = row.arrivalCode.toUpperCase();
        const region = getRegion(code);
        const airline = row.arrivalAirline;
        const market = INDIAN_AIRPORTS.has(code) ? MarketSegment.Domestic : MarketSegment.International;
        
        const passesRegion = selectedRegions.includes(region) || (alwaysFocusBLR && code === 'BLR');
        const passesAirline = !!airline && (selectedAirlines.length === 0 || selectedAirlines.includes(airline));
        const passesMarket = marketFilter === MarketSegment.All || market === marketFilter;
        
        if (passesRegion && passesAirline && passesMarket) {
          const key = `${code}-${row.hub_time}`;
          if (!aggregation[slotIndex].arrivals[key]) aggregation[slotIndex].arrivals[key] = { freq: 0, airline, exactTime: row.hub_time, id: Math.random().toString(36).substr(2, 9) };
          aggregation[slotIndex].arrivals[key].freq += (row.arrivalFreq || 0);
        }
      }
      
      if (row.departureCode && row.departureCode.length >= 3) {
        const code = row.departureCode.toUpperCase();
        const region = getRegion(code);
        const airline = row.departureAirline;
        const market = INDIAN_AIRPORTS.has(code) ? MarketSegment.Domestic : MarketSegment.International;

        const passesRegion = selectedRegions.includes(region) || (alwaysFocusBLR && code === 'BLR');
        const passesAirline = !!airline && (selectedAirlines.length === 0 || selectedAirlines.includes(airline));
        const passesMarket = marketFilter === MarketSegment.All || market === marketFilter;

        if (passesRegion && passesAirline && passesMarket) {
          const key = `${code}-${row.hub_time}`;
          if (!aggregation[slotIndex].departures[key]) aggregation[slotIndex].departures[key] = { freq: 0, airline, exactTime: row.hub_time, id: Math.random().toString(36).substr(2, 9) };
          aggregation[slotIndex].departures[key].freq += (row.departureFreq || 0);
        }
      }
    });

    Object.keys(aggregation).forEach((key) => {
      const idx = parseInt(key);
      const getRegion = (code: string) => AIRPORT_REGIONS[code.split('-')[0].toUpperCase()] || Region.Unknown;
      
      const realArrivals = Object.entries(aggregation[idx].arrivals).map(([keyStr, val]) => {
        const code = keyStr.split('-')[0];
        return {
          code, freq: val.freq, region: getRegion(keyStr), airline: val.airline, exactTime: val.exactTime, id: val.id,
          isInternational: !INDIAN_AIRPORTS.has(code)
        };
      });
      const realDepartures = Object.entries(aggregation[idx].departures).map(([keyStr, val]) => {
        const code = keyStr.split('-')[0];
        return {
          code, freq: val.freq, region: getRegion(keyStr), airline: val.airline, exactTime: val.exactTime, id: val.id,
          isInternational: !INDIAN_AIRPORTS.has(code)
        };
      });

      const manual = manualBlocks[idx] || { arrivals: [], departures: [] };
      slots[idx].arrivals = [...realArrivals, ...manual.arrivals];
      slots[idx].departures = [...realDepartures, ...manual.departures];
    });
    return slots;
  }, [data, selectedRegions, selectedAirlines, marketFilter, alwaysFocusBLR, manualBlocks]);

  const uniqueAirlinesFound = useMemo(() => {
    const airlines = data.flatMap(d => [d.arrivalAirline, d.departureAirline]).filter(Boolean);
    return Array.from(new Set(airlines)).sort() as string[];
  }, [data]);

  const filteredAirlines = useMemo(() => {
    if (!airlineSearchQuery) return uniqueAirlinesFound;
    return uniqueAirlinesFound.filter(a => a.toLowerCase().includes(airlineSearchQuery.toLowerCase()));
  }, [uniqueAirlinesFound, airlineSearchQuery]);

  const toggleAirline = (airline: string) => {
    setSelectedAirlines(prev => 
      prev.includes(airline) ? prev.filter(a => a !== airline) : [...prev, airline]
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = text.split('\n').filter(row => row.trim().length > 0);
      if (rows.length < 2) { setLoading(false); return; }
      const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
      const findIdx = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h === k.toLowerCase()));
      const headerMap = {
        airline: headers.findIndex(h => h.includes('airline')),
        origin: findIdx(['origin', 'origin airport']),
        depTime: headers.findIndex(h => h.includes('departure time')),
        hubTime: headers.findIndex(h => h.includes('hub time')),
        arrTime: headers.findIndex(h => h.includes('arrival time')),
        arrival: findIdx(['arrival', 'arrival airport']),
      };
      const parsedData: any[] = rows.slice(1).map(row => {
        const cols = row.split(',').map(c => c.trim());
        const arrivalFreq = (cols[3]?.match(/[1-7]/g) || []).length;
        const departureFreq = (cols[13]?.match(/[1-7]/g) || []).length;
        return {
          arrivalAirline: cols[headerMap.airline] || "",
          arrivalCode: cols[headerMap.origin] || "",
          arrivalFreq,
          arrivalTime: cols[headerMap.depTime] || "",
          hub_time: cols[headerMap.hubTime] || "",
          departureCode: cols[headerMap.arrival] || "", 
          departureTime: cols[headerMap.arrTime] || "",
          departureFreq,
          departureAirline: cols[cols.length - 1] || "",
          _raw: cols 
        };
      }).filter(r => !!r.hub_time);
      setData(parsedData);
      setSelectedAirlines([]);
      setLoading(false);
    };
    reader.readAsText(file);
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
        
        {activeTab === 'hub' && (
          <div className="flex items-center gap-4 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700 shadow-xl">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">MCT Simulator</span>
              <div className="flex items-center gap-2">
                <div 
                  draggable 
                  onDragStart={(e) => {
                    e.dataTransfer.setData('type', 'arr');
                    e.dataTransfer.setData('block', JSON.stringify({ code: 'NEW', freq: 1, region: Region.AsiaPacific, isManual: true }));
                  }}
                  className="bg-[#00ff9d] text-[#004d30] px-3 py-1 rounded text-[9px] font-black uppercase cursor-grab active:cursor-grabbing shadow-sm hover:brightness-110"
                >
                  + Arr Block
                </div>
                <div 
                  draggable 
                  onDragStart={(e) => {
                    e.dataTransfer.setData('type', 'dep');
                    e.dataTransfer.setData('block', JSON.stringify({ code: 'NEW', freq: 1, region: Region.AsiaPacific, isManual: true }));
                  }}
                  className="bg-[#6366f1] text-white px-3 py-1 rounded text-[9px] font-black uppercase cursor-grab active:cursor-grabbing shadow-sm hover:brightness-110"
                >
                  + Dep Block
                </div>
              </div>
              <div className="h-4 w-px bg-slate-700"></div>
              
              <div className="flex flex-col gap-0.5 min-w-[100px]">
                <div className="flex justify-between items-center text-[7px] font-black text-slate-400 uppercase">
                  <span>MCT Offset: {mct}h</span>
                </div>
                <input 
                  type="range" min="0" max="6" step="0.25" 
                  value={mct} 
                  onChange={(e) => setMct(parseFloat(e.target.value))}
                  className="w-full accent-[#00ff9d] h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-0.5 min-w-[100px]">
                <div className="flex justify-between items-center text-[7px] font-black text-slate-400 uppercase">
                  <span>Window: {maxConnectionWindow}h</span>
                </div>
                <input 
                  type="range" min="1" max="12" step="0.5" 
                  value={maxConnectionWindow} 
                  onChange={(e) => setMaxConnectionWindow(parseFloat(e.target.value))}
                  className="w-full accent-[#6366f1] h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div 
                 onDragOver={(e) => { e.preventDefault(); setIsDraggingOverTrash(true); }}
                 onDragLeave={() => setIsDraggingOverTrash(false)}
                 onDrop={(e) => {
                   const blockId = e.dataTransfer.getData('blockId');
                   const fromSlot = parseInt(e.dataTransfer.getData('fromSlot'));
                   const type = e.dataTransfer.getData('type') as 'arr' | 'dep';
                   if (blockId && !isNaN(fromSlot)) handleTrashDrop(blockId, fromSlot, type);
                 }}
                 className={`flex items-center justify-center w-7 h-7 rounded border transition-all ${isDraggingOverTrash ? 'bg-red-500 border-red-400 text-white scale-110' : 'bg-slate-800 border-slate-600 text-slate-500'}`}
              >
                <i className="fas fa-trash text-[10px]"></i>
              </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={toggleFullscreen} className="text-slate-400 hover:text-slate-600 p-1.5 transition-colors">
            <i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'} text-sm`}></i>
          </button>
          <label className="flex items-center gap-2 bg-[#006a4e] hover:bg-[#00523c] text-white px-3 py-1.5 rounded-lg cursor-pointer transition-all shadow-sm">
            <i className="fas fa-file-csv text-xs"></i>
            <span className="text-[10px] font-black uppercase tracking-wider">CSV</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </header>
      
      <nav className="bg-white border-b border-slate-100 px-6 flex shrink-0 justify-between items-center z-50 relative h-10">
        <div className="flex h-full">
          <button onClick={() => setActiveTab('hub')} className={`px-4 h-full text-[10px] font-black tracking-widest uppercase border-b-2 transition-all ${activeTab === 'hub' ? 'border-[#006a4e] text-[#006a4e]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Hub View</button>
          <button onClick={() => setActiveTab('raw')} className={`px-4 h-full text-[10px] font-black tracking-widest uppercase border-b-2 transition-all ${activeTab === 'raw' ? 'border-[#006a4e] text-[#006a4e]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Raw Data</button>
        </div>

        {activeTab === 'hub' && (
          <div className="flex items-center gap-4 py-1">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
               <button 
                 onClick={() => setFreqMode('weekly')} 
                 className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all ${freqMode === 'weekly' ? 'bg-[#006a4e] text-white shadow-lg' : 'text-slate-400'}`}
               >
                 Weekly Freq
               </button>
               <button 
                 onClick={() => setFreqMode('daily')} 
                 className={`px-3 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all ${freqMode === 'daily' ? 'bg-[#006a4e] text-white shadow-lg' : 'text-slate-400'}`}
               >
                 Daily Dep
               </button>
            </div>

            <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter mr-1">Regions:</span>
              {[Region.Africa, Region.AsiaPacific, Region.Europe, Region.MiddleEast, Region.Americas].map(region => (
                <button key={region} onClick={() => setSelectedRegions(prev => prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region])}
                  className={`px-2 py-0.5 rounded text-[8px] font-black uppercase transition-all border ${selectedRegions.includes(region) ? REGION_COLORS[region] : 'bg-white text-slate-300 border-slate-100'}`}
                >
                  {region.split('/')[0]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[8px] font-black text-slate-500 uppercase">BLR-C</span>
              <button 
                onClick={() => setHighlightCatchment(!highlightCatchment)} 
                className={`relative inline-flex h-3.5 w-7 items-center rounded-full transition-colors ${highlightCatchment ? 'bg-[#ff5f1f]' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${highlightCatchment ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              {Object.values(MarketSegment).map((segment) => (
                <button key={segment} onClick={() => setMarketFilter(segment)} className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest transition-all ${marketFilter === segment ? 'bg-white text-[#006a4e] shadow-xs' : 'text-slate-400'}`}>
                  {segment}
                </button>
              ))}
            </div>

            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setAirlineDropdownOpen(!airlineDropdownOpen)} className={`px-3 py-1 rounded border transition-all text-[8px] font-black uppercase tracking-widest ${selectedAirlines.length > 0 ? 'bg-[#006a4e] border-[#006a4e] text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                Airlines ({selectedAirlines.length || 'All'})
              </button>
              {airlineDropdownOpen && (
                <div className="absolute top-full right-0 w-64 mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl z-[100] overflow-hidden flex flex-col max-h-[300px]">
                  <div className="p-2 bg-slate-50 border-b border-slate-200">
                    <input 
                      type="text" 
                      placeholder="Search..." 
                      value={airlineSearchQuery}
                      onChange={(e) => setAirlineSearchQuery(e.target.value)}
                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold focus:outline-none focus:ring-1 focus:ring-[#006a4e]"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1 p-1">
                    {filteredAirlines.map(airline => (
                      <button 
                        key={airline} 
                        onClick={() => toggleAirline(airline)} 
                        className={`w-full text-left px-2 py-1.5 rounded text-[10px] font-bold flex items-center justify-between ${selectedAirlines.includes(airline) ? 'bg-[#006a4e]/5 text-[#006a4e]' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        {airline}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[8px] font-black text-slate-500 uppercase">Focus BLR</span>
              <button onClick={() => setAlwaysFocusBLR(!alwaysFocusBLR)} className={`relative inline-flex h-3.5 w-7 items-center rounded-full ${alwaysFocusBLR ? 'bg-[#006a4e]' : 'bg-slate-300'}`}>
                <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${alwaysFocusBLR ? 'translate-x-4' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className={`flex-1 overflow-hidden transition-all bg-[#f1f5f9]`}>
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#006a4e] mb-2"></div>
            <p className="text-[10px] font-black uppercase tracking-widest">Processing Data...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center m-6 border-2 border-dashed border-slate-200 rounded-3xl bg-white/50">
            <i className="fas fa-file-import text-xl text-slate-300 mb-2"></i>
            <h2 className="text-xs font-black text-slate-700 uppercase">Upload CSV To Start</h2>
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
                 isBlrFile={isBlrFile}
               />
            ) : (
               <DataTable data={data} freqMode={freqMode} />
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
