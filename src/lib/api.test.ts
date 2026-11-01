import { describe, expect, it, vi } from "vitest";
import { ApiError, readSymbol, readSymbols, respond } from "./api";
import { MAX_QUOTE_SYMBOLS } from "./types";

const answer = async (response: Response) => ({ status: response.status, body: await response.json() });

describe("respond", () => {
  it("answers with the work's JSON", async () => {
    expect(await answer(await respond(async () => ({ ok: 1 })))).toEqual({ status: 200, body: { ok: 1 } });
  });

  it("answers an ApiError with its status and message", async () => {
    const response = await respond(async () => {
      throw new ApiError(404, "No data for ZZZZ");
    });
    expect(await answer(response)).toEqual({ status: 404, body: { error: "No data for ZZZZ" } });
  });

  it("answers any other failure with a 502 and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await respond(async () => {
      throw new Error("fetch failed");
    });
    expect(response.status).toBe(502);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("readSymbol", () => {
  const read = (query: string) => readSymbol(new URLSearchParams(query), "symbol");

  it("upper-cases and trims", () => {
    expect(read("symbol=%20eurusd=x%20")).toBe("EURUSD=X");
  });

  it.each(["", "symbol=", "symbol=AA PL"])("rejects %j with a 400", (query) => {
    expect(() => read(query)).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe("readSymbols", () => {
  const read = (query: string) => readSymbols(new URLSearchParams(query), "symbols");

  it("splits on commas, upper-cases and trims, skipping empty entries", () => {
    expect(read("symbols=aapl,%20^gspc%20,,eurusd=x")).toEqual(["AAPL", "^GSPC", "EURUSD=X"]);
  });

  it(`takes ${MAX_QUOTE_SYMBOLS} symbols but not one more`, () => {
    const many = Array.from({ length: MAX_QUOTE_SYMBOLS + 1 }, (_, i) => `S${i}`);
    expect(read(`symbols=${many.slice(1).join(",")}`)).toHaveLength(MAX_QUOTE_SYMBOLS);
    expect(() => read(`symbols=${many.join(",")}`)).toThrow(`At most ${MAX_QUOTE_SYMBOLS} symbols per request`);
  });

  it.each(["", "symbols=", "symbols=,", "symbols=AAPL,AA%20PL"])("rejects %j with a 400", (query) => {
    expect(() => read(query)).toThrow(expect.objectContaining({ status: 400 }));
  });
});
