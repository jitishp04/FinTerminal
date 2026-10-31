import { ColorType, CrosshairMode } from "lightweight-charts";

/** A color from globals.css, by its variable's name. */
export const cssColor = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** What every chart shares, in the terminal's colors. */
export function chartLook() {
  const border = cssColor("--border");
  return {
    // attributionLogo stays on (the default): the license asks for a link to TradingView.
    layout: {
      background: { type: ColorType.Solid as const, color: cssColor("--background") },
      textColor: cssColor("--muted"),
      fontFamily: getComputedStyle(document.body).fontFamily,
      fontSize: 11,
    },
    grid: { vertLines: { color: border }, horzLines: { color: border } },
    crosshair: { mode: CrosshairMode.Normal },
  };
}
