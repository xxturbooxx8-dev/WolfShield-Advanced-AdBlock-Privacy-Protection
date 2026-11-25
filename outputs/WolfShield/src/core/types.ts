export type Category = "ads" | "trackers" | "malware" | "annoyances" | "custom";
export type Features = {
  ads: boolean;
  trackers: boolean;
  malware: boolean;
  cosmetic: boolean;
  cleanup: boolean;
  https: boolean;
  thirdPartyScripts: boolean;
  fingerprint: boolean;
  compat: boolean;
  popups: boolean;
  notifications: boolean;
  cookies: boolean;
};
export type Site = Partial<Features> & {
  enabled?: boolean;
  level?: "standard" | "aggressive" | "custom";
};
export type Subscription = {
  id: string;
  name: string;
  url: string;
  category: Category;
  enabled: boolean;
  license: string;
  expectedHash?: string;
};
export type Settings = {
  version: 1;
  enabled: boolean;
  features: Features;
  sites: Record<string, Site>;
  theme: "dark" | "light" | "auto";
  customFilters: string;
  lists: Subscription[];
  autoUpdate: boolean;
  statistics: boolean;
  requestLog: boolean;
  webrtc: boolean;
  thirdPartyCookies: boolean;
};
export type Cosmetic = {
  domains: string[];
  excluded: string[];
  selector: string;
  exception: boolean;
};
export type Rule = Omit<chrome.declarativeNetRequest.Rule, "id">;
export type Compiled = {
  rules: Rule[];
  cosmetic: Cosmetic[];
  rejected: number;
  duplicates: number;
  examples: string[];
  sourceRules?: number;
};
export type CachedList = {
  text: string;
  hash: string;
  updated: string;
  compiled: Compiled;
};
export type Snapshot = {
  settings: Settings;
  report: Record<string, unknown>;
  stats: Stats;
  capabilities: {
    feedback: boolean;
    contentSettings: boolean;
    privacy: boolean;
  };
  host?: string;
  site?: Site & Features;
  counts?: Record<string, number>;
};
export type Stats = {
  days: Record<string, Record<string, number>>;
  domains: Record<string, number>;
  domainDays?: Record<string, Record<string, number>>;
  log: { time: number; domain: string; category: string; type: string }[];
};
