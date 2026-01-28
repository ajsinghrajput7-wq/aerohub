
import { Region } from './types';

export const REGION_COLORS: Record<Region, string> = {
  [Region.Africa]: 'bg-[#001529] text-white',      // Deep Dark Blue
  [Region.AsiaPacific]: 'bg-[#214a7c] text-white', // Navy
  [Region.Europe]: 'bg-[#e7d5b1] text-slate-800',  // Beige
  [Region.MiddleEast]: 'bg-[#bdbdbd] text-slate-800', // Grey
  [Region.Americas]: 'bg-[#4a90e2] text-white',    // Sky Blue
  [Region.Unknown]: 'bg-slate-200 text-slate-500'
};

export const BLR_CATCHMENT = new Set([
  'HYD', 'MAA', 'IXG', 'VGA', 'VTZ', 'RJA', 'HBX', 'GOI', 'IXE', 'MYQ', 'TIR', 
  'PNY', 'TRZ', 'IXM', 'TRV', 'COK', 'CJB', 'CCJ', 'CNN', 'VDY', 'GBI', 'TCR', 
  'BLR', 'NAG', 'AGX', 'PNQ', 'RQY', 'KJB'
]);

export const INDIAN_AIRPORTS = new Set([
  'BLR', 'BOM', 'DEL', 'MAA', 'HYD', 'CCU', 'COK', 'AMD', 'LKO', 'TRV', 'PNQ', 'CNN', 'GWL', 'JAI', 
  'IXE', 'AYJ', 'CCJ', 'GOX', 'GAU', 'BBI', 'VGA', 'VTZ', 'NMI', 'NAG', 'TRZ', 'IXZ', 'IXR', 'UDR', 
  'IXC', 'IXB', 'HDO', 'JDH', 'STV', 'IDR', 'DED', 'IXD', 'IXA', 'RPR', 'HBX', 'BDQ', 'BHO', 'CJB', 
  'IXM', 'IXG', 'NDC', 'VDY', 'KJB', 'TCR', 'JLR', 'BEK', 'ISK', 'SXV', 'DGH', 'IXJ', 'RDP', 'TIR', 
  'SDW', 'JSA', 'KLH', 'HSR', 'RJA', 'AGR', 'IXU', 'AGX', 'RQY', 'SAG', 'JRG', 'KNU', 'PNY', 'VNS', 
  'PAT', 'ATQ', 'GOI', 'IXX', 'SXR', 'GOP'
]);

export const AIRPORT_REGIONS: Record<string, Region> = {
  // Asia / Pacific
  'ICN': Region.AsiaPacific, 'NRT': Region.AsiaPacific, 'HKG': Region.AsiaPacific, 'SIN': Region.AsiaPacific,
  'BKK': Region.AsiaPacific, 'PVG': Region.AsiaPacific, 'PEK': Region.AsiaPacific, 'KUL': Region.AsiaPacific,
  'MNL': Region.AsiaPacific, 'CGK': Region.AsiaPacific, 'SYD': Region.AsiaPacific, 'MEL': Region.AsiaPacific,
  'BLR': Region.AsiaPacific, 'BOM': Region.AsiaPacific, 'DEL': Region.AsiaPacific, 'MAA': Region.AsiaPacific,
  'HYD': Region.AsiaPacific, 'CCU': Region.AsiaPacific, 'COK': Region.AsiaPacific, 'AMD': Region.AsiaPacific,
  'LKO': Region.AsiaPacific, 'HKT': Region.AsiaPacific, 'CNX': Region.AsiaPacific, 'USM': Region.AsiaPacific,
  'HND': Region.AsiaPacific, 'KIX': Region.AsiaPacific, 'NGO': Region.AsiaPacific, 'FUK': Region.AsiaPacific,
  'TPE': Region.AsiaPacific, 'KHH': Region.AsiaPacific, 'SGN': Region.AsiaPacific, 'HAN': Region.AsiaPacific,
  'DAC': Region.AsiaPacific, 'KTM': Region.AsiaPacific, 'ISB': Region.AsiaPacific, 'KHI': Region.AsiaPacific,
  'LHE': Region.AsiaPacific, 'CMB': Region.AsiaPacific, 'MLE': Region.AsiaPacific, 'BJS': Region.AsiaPacific,
  'CAN': Region.AsiaPacific, 'SZX': Region.AsiaPacific, 'CTU': Region.AsiaPacific, 'KMG': Region.AsiaPacific,
  'AKL': Region.AsiaPacific, 'CHC': Region.AsiaPacific, 'BNE': Region.AsiaPacific, 'PER': Region.AsiaPacific,
  'VNS': Region.AsiaPacific, 'PAT': Region.AsiaPacific, 'ATQ': Region.AsiaPacific, 'GOI': Region.AsiaPacific,
  'PEW': Region.AsiaPacific, 'MUX': Region.AsiaPacific, 'LYP': Region.AsiaPacific, 'SKT': Region.AsiaPacific,
  'DMK': Region.AsiaPacific,
  
  // Indian Airports
  'TRV': Region.AsiaPacific, 'PNQ': Region.AsiaPacific, 'CNN': Region.AsiaPacific, 'GWL': Region.AsiaPacific,
  'JAI': Region.AsiaPacific, 'IXE': Region.AsiaPacific, 'AYJ': Region.AsiaPacific, 'CCJ': Region.AsiaPacific,
  'GOX': Region.AsiaPacific, 'GAU': Region.AsiaPacific, 'BBI': Region.AsiaPacific, 'VGA': Region.AsiaPacific,
  'VTZ': Region.AsiaPacific, 'NMI': Region.AsiaPacific, 'NAG': Region.AsiaPacific, 'TRZ': Region.AsiaPacific,
  'IXZ': Region.AsiaPacific, 'IXR': Region.AsiaPacific, 'UDR': Region.AsiaPacific, 'IXC': Region.AsiaPacific,
  'IXB': Region.AsiaPacific, 'HDO': Region.AsiaPacific, 'JDH': Region.AsiaPacific, 'STV': Region.AsiaPacific,
  'IDR': Region.AsiaPacific, 'DED': Region.AsiaPacific, 'IXD': Region.AsiaPacific, 'IXA': Region.AsiaPacific,
  'RPR': Region.AsiaPacific, 'HBX': Region.AsiaPacific, 'BDQ': Region.AsiaPacific, 'BHO': Region.AsiaPacific,
  'CJB': Region.AsiaPacific, 'IXM': Region.AsiaPacific, 'IXG': Region.AsiaPacific, 'NDC': Region.AsiaPacific,
  'VDY': Region.AsiaPacific, 'KJB': Region.AsiaPacific, 'TCR': Region.AsiaPacific, 'JLR': Region.AsiaPacific,
  'BEK': Region.AsiaPacific, 'ISK': Region.AsiaPacific, 'SXV': Region.AsiaPacific, 'DGH': Region.AsiaPacific,
  'KBV': Region.AsiaPacific, 'LGK': Region.AsiaPacific, 'IXX': Region.AsiaPacific, 'SXR': Region.AsiaPacific,
  'IXJ': Region.AsiaPacific, 'RDP': Region.AsiaPacific, 'TIR': Region.AsiaPacific, 'SDW': Region.AsiaPacific,
  'JSA': Region.AsiaPacific, 'KLH': Region.AsiaPacific, 'HSR': Region.AsiaPacific, 'GOP': Region.AsiaPacific,
  'RJA': Region.AsiaPacific, 'AGR': Region.AsiaPacific, 'IXU': Region.AsiaPacific, 'AGX': Region.AsiaPacific,
  'RQY': Region.AsiaPacific, 'SAG': Region.AsiaPacific, 'DPS': Region.AsiaPacific, 'JRG': Region.AsiaPacific,
  'KNU': Region.AsiaPacific, 'PNY': Region.AsiaPacific,

  // Europe
  'LHR': Region.Europe, 'CDG': Region.Europe, 'FRA': Region.Europe, 'AMS': Region.Europe,
  'MAD': Region.Europe, 'FCO': Region.Europe, 'IST': Region.Europe, 'MUC': Region.Europe,
  'LGW': Region.Europe, 'STN': Region.Europe, 'MAN': Region.Europe, 'EDI': Region.Europe,
  'ORY': Region.Europe, 'NCE': Region.Europe, 'LYS': Region.Europe, 'BCN': Region.Europe,
  'AGP': Region.Europe, 'ZRH': Region.Europe, 'GVA': Region.Europe, 'VIE': Region.Europe,
  'CPH': Region.Europe, 'ARN': Region.Europe, 'OSL': Region.Europe, 'HEL': Region.Europe,
  'DME': Region.Europe, 'SVO': Region.Europe, 'LED': Region.Europe, 'WAW': Region.Europe,
  'PRG': Region.Europe, 'BUD': Region.Europe, 'ATH': Region.Europe, 'LIS': Region.Europe,
  'DUB': Region.Europe, 'BRU': Region.Europe, 'MXP': Region.Europe, 'VCE': Region.Europe,
  'BHX': Region.Europe,

  // Middle East
  'JED': Region.MiddleEast, 'RUH': Region.MiddleEast, 'DXB': Region.MiddleEast, 'DOH': Region.MiddleEast,
  'AUH': Region.MiddleEast, 'KWI': Region.MiddleEast, 'AMM': Region.MiddleEast, 'BAH': Region.MiddleEast,
  'MCT': Region.MiddleEast, 'DMM': Region.MiddleEast, 'MED': Region.MiddleEast, 'TJV': Region.MiddleEast,
  'BEY': Region.MiddleEast, 'THR': Region.MiddleEast, 'IKA': Region.MiddleEast, 'BGW': Region.MiddleEast,
  'SLL': Region.MiddleEast, 'SHJ': Region.MiddleEast, 'HAS': Region.MiddleEast, 'ABW': Region.MiddleEast,
  'ELQ': Region.MiddleEast, 'TUO': Region.MiddleEast, 'WAE': Region.MiddleEast, 'AQI': Region.MiddleEast,

  // Americas
  'JFK': Region.Americas, 'LAX': Region.Americas, 'ORD': Region.Americas, 'DFW': Region.Americas,
  'SFO': Region.Americas, 'YYZ': Region.Americas, 'GRU': Region.Americas, 'EZE': Region.Americas,
  'IAD': Region.Americas, 'ATL': Region.Americas, 'MIA': Region.Americas, 'IAH': Region.Americas,
  'DEN': Region.Americas, 'SEA': Region.Americas, 'BOS': Region.Americas, 'EWR': Region.Americas,
  'MEX': Region.Americas, 'CUN': Region.Americas, 'PTY': Region.Americas, 'BOG': Region.Americas,
  'LIM': Region.Americas, 'SCL': Region.Americas, 'GIG': Region.Americas, 'YVR': Region.Americas,
  'YUL': Region.Americas, 'PHX': Region.Americas, 'LAS': Region.Americas, 'MCO': Region.Americas,

  // Africa
  'CAI': Region.Africa, 'JNB': Region.Africa, 'CPT': Region.Africa, 'NBO': Region.Africa,
  'LOS': Region.Africa, 'ADD': Region.Africa, 'CAS': Region.Africa, 'ACC': Region.Africa,
  'ALG': Region.Africa, 'TUN': Region.Africa, 'CMN': Region.Africa, 'RAK': Region.Africa,
  'TNG': Region.Africa, 'DJE': Region.Africa, 'MIR': Region.Africa, 'AGA': Region.Africa,
  'HBE': Region.Africa, 'SSH': Region.Africa, 'KAN': Region.Africa, 'CZL': Region.Africa,
  'ORN': Region.Africa, 'NBE': Region.Africa, 'LXR': Region.Africa, 'ASW': Region.Africa,
  'HRG': Region.Africa, 'DKR': Region.Africa, 'ABJ': Region.Africa, 'LUN': Region.Africa,
  'HRE': Region.Africa, 'DAR': Region.Africa, 'EBB': Region.Africa, 'KGL': Region.Africa,
  'MRU': Region.Africa, 'TNR': Region.Africa, 'MPM': Region.Africa, 'LAD': Region.Africa,
  'BJM': Region.Africa
};

export const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0');
  return `${hour}:00`;
});
