
import React from 'react';
import { AIRPORT_REGIONS, REGION_COLORS } from '../constants';
import { Region } from '../types';

interface DataTableProps {
  data: any[];
  freqMode?: 'weekly' | 'daily';
}

const DataTable: React.FC<DataTableProps> = ({ data, freqMode = 'weekly' }) => {
  const getRegionTag = (code: string) => {
    const region = AIRPORT_REGIONS[code?.toUpperCase()] || Region.Unknown;
    const colorClass = REGION_COLORS[region];
    return (
      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${colorClass}`}>
        {region}
      </span>
    );
  };

  const formatFreq = (val: number) => {
    if (freqMode === 'daily') return (val / 7).toFixed(1);
    return val;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
      <div className="overflow-x-auto overflow-y-auto">
        <table className="w-full text-left text-sm border-collapse min-w-[1300px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-4 font-black text-slate-500 uppercase text-[10px] tracking-wider">Arr Airline</th>
              <th className="px-4 py-4 font-black text-slate-500 uppercase text-[10px] tracking-wider">Origin</th>
              <th className="px-4 py-4 font-black text-slate-500 uppercase text-[10px] tracking-wider">Region</th>
              <th className="px-4 py-4 font-black text-[#006a4e] bg-[#006a4e]/5 uppercase text-[10px] tracking-wider text-center">
                {freqMode === 'weekly' ? 'Arr Freq (W)' : 'Arr Daily'}
              </th>
              <th className="px-4 py-4 font-black text-slate-500 uppercase text-[10px] tracking-wider">Arr Time</th>
              <th className="px-4 py-4 font-black text-white bg-[#006a4e] uppercase text-[10px] tracking-widest text-center">Hub Time</th>
              <th className="px-4 py-4 font-black text-indigo-700 bg-indigo-50/10 uppercase text-[10px] tracking-wider">Dest Airport</th>
              <th className="px-4 py-4 font-black text-slate-500 uppercase text-[10px] tracking-wider">Dest Region</th>
              <th className="px-4 py-4 font-black text-slate-500 uppercase text-[10px] tracking-wider">Dep Time</th>
              <th className="px-4 py-4 font-black text-indigo-700 bg-indigo-50/50 uppercase text-[10px] tracking-wider text-center">
                {freqMode === 'weekly' ? 'Dep Freq (W)' : 'Dep Daily'}
              </th>
              <th className="px-4 py-4 font-black text-slate-500 uppercase text-[10px] tracking-wider text-right">Dep Airline</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-bold text-slate-500 italic">{row.arrivalAirline || '—'}</td>
                <td className="px-4 py-3 font-bold text-[#006a4e]">{row.arrivalCode || '—'}</td>
                <td className="px-4 py-3">{getRegionTag(row.arrivalCode)}</td>
                <td className="px-4 py-3 text-slate-900 font-black text-center bg-[#006a4e]/5">
                  {formatFreq(row.arrivalFreq || 0)}
                </td>
                <td className="px-4 py-3 text-slate-500">{row.arrivalTime || ''}</td>
                <td className="px-4 py-3 font-black text-slate-900 bg-slate-100/50 text-center">{row.hub_time}</td>
                <td className="px-4 py-3 font-bold text-indigo-700 bg-indigo-50/5">{row.departureCode || '—'}</td>
                <td className="px-4 py-3">{getRegionTag(row.departureCode)}</td>
                <td className="px-4 py-3 text-slate-500">{row.departureTime || ''}</td>
                <td className="px-4 py-3 text-slate-900 font-black text-center bg-indigo-50/50">
                  {formatFreq(row.departureFreq || 0)}
                </td>
                <td className="px-4 py-3 font-bold text-slate-500 italic text-right">{row.departureAirline || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
