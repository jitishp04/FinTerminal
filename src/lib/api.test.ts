import { describe, expect, it, vi } from "vitest";
import { ApiError, readSymbol, respond } from "./api";

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
