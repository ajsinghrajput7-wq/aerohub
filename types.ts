
export enum Region {
  Africa = 'Africa',
  AsiaPacific = 'Asia/Pacific',
  Europe = 'Europe',
  MiddleEast = 'Middle East',
  Americas = 'Americas',
  Unknown = 'Unknown'
}

export enum MarketSegment {
  All = 'All',
  Domestic = 'Domestic',
  International = 'International'
}

export interface FlightRow {
  hub_time: string; // Expected format HH:mm
  origin?: string;
  arrival?: string;
  frequency: number;
  region?: string;
}

export interface HubSlot {
  label: string;
  arrivals: FlightInfo[];
  departures: FlightInfo[];
}

export interface FlightInfo {
  id?: string; // For manual blocks
  code: string;
  freq: number;
  region: Region;
  airline?: string;
  market?: MarketSegment;
  isManual?: boolean;
  exactTime?: string; // e.g. "10:15"
}
