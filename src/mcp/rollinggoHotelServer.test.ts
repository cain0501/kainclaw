import { describe, expect, it } from "vitest";
import {
  createHotelToolHandlers,
  hotelToolDefinitions,
  redactHotelOutput,
  type HotelCliResult,
} from "./rollinggoHotelServer";

function createRunner(result: Partial<HotelCliResult> = {}) {
  const calls: Array<{ command: string; args: string[] }> = [];
  return {
    calls,
    runner: async (command: string, args: string[]): Promise<HotelCliResult> => {
      calls.push({ command, args });
      return {
        exitCode: 0,
        stdout: JSON.stringify({ success: true }),
        stderr: "",
        ...result,
      };
    },
  };
}

function contentText(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  if (first.type !== "text" || !first.text) {
    throw new Error("Expected a text result");
  }
  return first.text;
}

describe("RollingGo hotel MCP server", () => {
  it("declares only booking as destructive and keeps read-only hotel lookups read-only", () => {
    expect(hotelToolDefinitions.map(tool => tool.name)).toEqual([
      "hotel_whoami",
      "hotel_login_status",
      "hotel_search_hotels",
      "hotel_detail",
      "hotel_price_confirm",
      "hotel_book",
      "hotel_orders",
    ]);
    expect(hotelToolDefinitions.find(tool => tool.name === "hotel_book")?.annotations.destructiveHint).toBe(true);
    expect(hotelToolDefinitions.filter(tool => tool.name !== "hotel_book" && tool.name !== "hotel_price_confirm")
      .every(tool => tool.annotations.readOnlyHint)).toBe(true);
    expect(hotelToolDefinitions.find(tool => tool.name === "hotel_price_confirm")?.annotations).toMatchObject({
      destructiveHint: false,
      openWorldHint: true,
    });
  });

  it("maps search, detail, price confirmation, booking, and orders to the CLI contract", async () => {
    const { calls, runner } = createRunner();
    const handlers = createHotelToolHandlers(runner);

    await handlers.hotel_search_hotels({
      originQuery: "London Westminster Bridge cheapest room",
      place: "Westminster Bridge",
      placeType: "landmark",
      checkInDate: "2026-12-28",
      stayNights: 6,
      adultCount: 2,
      size: 3,
      maxPricePerNight: 300,
    });
    await handlers.hotel_detail({ hotelId: 123, checkInDate: "2026-12-28", checkOutDate: "2027-01-03", roomCount: 1, adultCount: 2 });
    await handlers.hotel_price_confirm({ hotelId: 123, ratePlanId: "rate-1", rooms: 1, checkInDate: "2026-12-28", checkOutDate: "2027-01-03", adults: 2 });
    await handlers.hotel_book({ referenceNo: "ref-1", firstName: "Jane", lastName: "Doe", email: "jane@example.com" });
    await handlers.hotel_orders({});

    expect(calls).toEqual([
      {
        command: "rgh",
        args: ["search-hotels", "--origin-query", "London Westminster Bridge cheapest room", "--place", "Westminster Bridge", "--place-type", "landmark", "--size", "3", "--check-in-date", "2026-12-28", "--stay-nights", "6", "--adult-count", "2", "--max-price-per-night", "300"],
      },
      {
        command: "rgh",
        args: ["hotel-detail", "--hotel-id", "123", "--check-in-date", "2026-12-28", "--check-out-date", "2027-01-03", "--room-count", "1", "--adult-count", "2"],
      },
      {
        command: "rgh",
        args: ["price-confirm", "--hotel-id", "123", "--rate-plan-id", "rate-1", "--rooms", "1", "--check-in-date", "2026-12-28", "--check-out-date", "2027-01-03", "--adults", "2"],
      },
      {
        command: "rgh",
        args: ["book", "--reference-no", "ref-1", "--first-name", "Jane", "--last-name", "Doe", "--email", "jane@example.com"],
      },
      { command: "rgh", args: ["orders"] },
    ]);
  });

  it("redacts credential fields and credential-like output from successful and failed CLI calls", async () => {
    const { runner } = createRunner({
      stdout: JSON.stringify({ token: "top-secret", nested: { cookie: "session=abc" }, url: "https://example.test/?access_token=123456789" }),
    });
    const handlers = createHotelToolHandlers(runner);
    const success = await handlers.hotel_whoami({});

    expect(contentText(success)).not.toContain("top-secret");
    expect(contentText(success)).not.toContain("session=abc");
    expect(contentText(success)).not.toContain("123456789");
    expect(redactHotelOutput("Bearer abcdefghijklmnop")).toBe("Bearer [REDACTED]");

    const failed = await createHotelToolHandlers(createRunner({
      exitCode: 1,
      stdout: "",
      stderr: "Authorization: Bearer abcdefghijklmnop",
    }).runner).hotel_orders({});
    expect(failed.isError).toBe(true);
    expect(contentText(failed)).not.toContain("abcdefghijklmnop");
  });
});
