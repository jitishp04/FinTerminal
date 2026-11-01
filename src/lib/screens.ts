// EQS: Yahoo's predefined stock screens, and sorting and filtering what one returns.

/** The equity screens, in the order the panel offers them. Gainers, losers and the most active are in MOST. */
export const SCREENS = [
  { id: "undervalued_growth_stocks", label: "Undervalued growth" },
  { id: "growth_technology_stocks", label: "Growth tech" },
  { id: "undervalued_large_caps", label: "Undervalued large caps" },
  { id: "aggressive_small_caps", label: "Aggressive small caps" },
  { id: "small_cap_gainers", label: "Small-cap gainers" },
  { id: "most_shorted_stocks", label: "Most shorted" },
] as const;
export type ScreenId = (typeof SCREENS)[number]["id"];

export const isScreenId = (id: string): id is ScreenId => SCREENS.some((screen) => screen.id === id);
