import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export type HotelCliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type HotelCliRunner = (command: string, args: string[]) => Promise<HotelCliResult>;

type HotelToolHandler = (input: Record<string, unknown>) => Promise<CallToolResult>;

export type HotelToolDefinition = {
  name: string;
  annotations: ToolAnnotations;
};

const readOnly: ToolAnnotations = { readOnlyHint: true, destructiveHint: false };
const openWorld: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
const destructive: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

export const hotelToolDefinitions: HotelToolDefinition[] = [
  { name: "hotel_whoami", annotations: readOnly },
  { name: "hotel_login_status", annotations: readOnly },
  { name: "hotel_search_hotels", annotations: readOnly },
  { name: "hotel_detail", annotations: readOnly },
  { name: "hotel_price_confirm", annotations: openWorld },
  { name: "hotel_book", annotations: destructive },
  { name: "hotel_orders", annotations: readOnly },
];

const searchInputSchema = z.object({
  originQuery: z.string().min(1),
  place: z.string().min(1),
  placeType: z.string().min(1),
  countryCode: z.string().min(2).max(3).optional(),
  size: z.number().int().min(1).max(20).optional(),
  checkInDate: z.string().optional(),
  stayNights: z.number().int().min(1).optional(),
  adultCount: z.number().int().min(1).optional(),
  starRatings: z.string().optional(),
  distanceInMeter: z.number().int().min(0).optional(),
  preferredBrand: z.string().optional(),
  preferredTag: z.string().optional(),
  requiredTag: z.string().optional(),
  maxPricePerNight: z.number().positive().optional(),
});

const detailInputSchema = z.object({
  hotelId: z.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
  roomCount: z.number().int().min(1).optional(),
  adultCount: z.number().int().min(1).optional(),
  childCount: z.number().int().min(0).optional(),
  childAge: z.string().optional(),
  countryCode: z.string().min(2).max(3).optional(),
  currency: z.string().length(3).optional(),
}).refine(input => input.hotelId !== undefined || input.name !== undefined, {
  message: "hotelId or name is required",
});

const priceConfirmInputSchema = z.object({
  hotelId: z.number().int().positive(),
  ratePlanId: z.string().min(1),
  rooms: z.number().int().min(1),
  checkInDate: z.string().min(1),
  checkOutDate: z.string().min(1),
  adults: z.number().int().min(1),
  children: z.number().int().min(0).optional(),
  childAge: z.string().optional(),
  nationality: z.string().min(2).max(3).optional(),
  currency: z.string().length(3).optional(),
});

const bookInputSchema = z.object({
  referenceNo: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
});

export function createHotelToolHandlers(runner: HotelCliRunner): Record<string, HotelToolHandler> {
  return {
    hotel_whoami: () => executeHotelCli(runner, ["whoami"]),
    hotel_login_status: async () => {
      const result = await executeHotelCli(runner, ["whoami"]);
      if (result.isError) {
        return result;
      }
      return result;
    },
    hotel_search_hotels: input => {
      const parsed = searchInputSchema.parse(input);
      return executeHotelCli(runner, [
        "search-hotels",
        "--origin-query", parsed.originQuery,
        "--place", parsed.place,
        "--place-type", parsed.placeType,
        ...optionalFlag("--country-code", parsed.countryCode),
        ...optionalFlag("--size", parsed.size),
        ...optionalFlag("--check-in-date", parsed.checkInDate),
        ...optionalFlag("--stay-nights", parsed.stayNights),
        ...optionalFlag("--adult-count", parsed.adultCount),
        ...optionalFlag("--star-ratings", parsed.starRatings),
        ...optionalFlag("--distance-in-meter", parsed.distanceInMeter),
        ...optionalFlag("--preferred-brand", parsed.preferredBrand),
        ...optionalFlag("--preferred-tag", parsed.preferredTag),
        ...optionalFlag("--required-tag", parsed.requiredTag),
        ...optionalFlag("--max-price-per-night", parsed.maxPricePerNight),
      ]);
    },
    hotel_detail: input => {
      const parsed = detailInputSchema.parse(input);
      return executeHotelCli(runner, [
        "hotel-detail",
        ...optionalFlag("--hotel-id", parsed.hotelId),
        ...optionalFlag("--name", parsed.name),
        ...optionalFlag("--check-in-date", parsed.checkInDate),
        ...optionalFlag("--check-out-date", parsed.checkOutDate),
        ...optionalFlag("--room-count", parsed.roomCount),
        ...optionalFlag("--adult-count", parsed.adultCount),
        ...optionalFlag("--child-count", parsed.childCount),
        ...optionalFlag("--child-age", parsed.childAge),
        ...optionalFlag("--country-code", parsed.countryCode),
        ...optionalFlag("--currency", parsed.currency),
      ]);
    },
    hotel_price_confirm: input => {
      const parsed = priceConfirmInputSchema.parse(input);
      return executeHotelCli(runner, [
        "price-confirm",
        "--hotel-id", String(parsed.hotelId),
        "--rate-plan-id", parsed.ratePlanId,
        "--rooms", String(parsed.rooms),
        "--check-in-date", parsed.checkInDate,
        "--check-out-date", parsed.checkOutDate,
        "--adults", String(parsed.adults),
        ...optionalFlag("--children", parsed.children),
        ...optionalFlag("--child-age", parsed.childAge),
        ...optionalFlag("--nationality", parsed.nationality),
        ...optionalFlag("--currency", parsed.currency),
      ]);
    },
    hotel_book: input => {
      const parsed = bookInputSchema.parse(input);
      return executeHotelCli(runner, [
        "book",
        "--reference-no", parsed.referenceNo,
        "--first-name", parsed.firstName,
        "--last-name", parsed.lastName,
        "--email", parsed.email,
      ]);
    },
    hotel_orders: () => executeHotelCli(runner, ["orders"]),
  };
}

export function createRollingGoHotelServer(runner: HotelCliRunner = createDefaultHotelCliRunner()): McpServer {
  const server = new McpServer({ name: "rollinggo-hotel", version: "1.0.0" });
  const handlers = createHotelToolHandlers(runner);

  server.registerTool("hotel_whoami", {
    title: "Hotel account",
    description: "Show the currently authenticated RollingGo hotel account.",
    annotations: readOnly,
  }, handlers.hotel_whoami);
  server.registerTool("hotel_login_status", {
    title: "Hotel login status",
    description: "Check whether the RollingGo hotel CLI is authenticated.",
    annotations: readOnly,
  }, handlers.hotel_login_status);
  server.registerTool("hotel_search_hotels", {
    title: "Search hotels",
    description: "Search hotels by place, dates, guests, budget, brands, and tags. Returned prices are references until price confirmation.",
    inputSchema: searchInputSchema,
    annotations: readOnly,
  }, handlers.hotel_search_hotels);
  server.registerTool("hotel_detail", {
    title: "Hotel rooms and live prices",
    description: "Return hotel details, available room types, cancellation terms, and current prices.",
    inputSchema: detailInputSchema,
    annotations: readOnly,
  }, handlers.hotel_detail);
  server.registerTool("hotel_price_confirm", {
    title: "Confirm hotel price",
    description: "Confirm the selected room price and obtain a short-lived booking reference. This does not place an order.",
    inputSchema: priceConfirmInputSchema,
    annotations: openWorld,
  }, handlers.hotel_price_confirm);
  server.registerTool("hotel_book", {
    title: "Create hotel booking",
    description: "Create a hotel order using a confirmed booking reference. Call only after the user explicitly confirms the booking details.",
    inputSchema: bookInputSchema,
    annotations: destructive,
  }, handlers.hotel_book);
  server.registerTool("hotel_orders", {
    title: "Hotel orders",
    description: "List the current account's hotel orders.",
    annotations: readOnly,
  }, handlers.hotel_orders);

  return server;
}

export function createDefaultHotelCliRunner(command = process.env.ROLLINGGO_HOTEL_COMMAND || "rgh"): HotelCliRunner {
  return async (_command, args) => new Promise<HotelCliResult>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", exitCode => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}

export function redactHotelOutput(value: unknown): unknown {
  if (typeof value === "string") {
    return redactCredentialText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactHotelOutput);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      isSensitiveKey(key) ? "[REDACTED]" : redactHotelOutput(nested),
    ]));
  }
  return value;
}

async function executeHotelCli(runner: HotelCliRunner, args: string[]): Promise<CallToolResult> {
  try {
    const result = await runner("rgh", args);
    const rawOutput = result.stdout.trim() || result.stderr.trim();
    const output = parseCliOutput(rawOutput);
    if (result.exitCode !== 0) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: redactHotelOutput(output) }, null, 2) }],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(redactHotelOutput(output), null, 2) }],
    };
  } catch {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: "RollingGo hotel CLI could not be started." }) }],
    };
  }
}

function optionalFlag(flag: string, value: string | number | undefined): string[] {
  return value === undefined ? [] : [flag, String(value)];
}

function parseCliOutput(rawOutput: string): unknown {
  if (!rawOutput) {
    return { message: "RollingGo hotel CLI returned no output." };
  }
  try {
    return JSON.parse(rawOutput) as unknown;
  } catch {
    return { message: rawOutput };
  }
}

function isSensitiveKey(key: string): boolean {
  return /(?:token|cookie|authorization|password|secret|api[-_]?key|credential)/i.test(key);
}

function redactCredentialText(value: string): string {
  return value
    .replace(/\b(bearer|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]")
    .replace(/([?&](?:access_?token|refresh_?token|token|cookie|authorization|password|secret|api_?key)=)[^&#\s]+/gi, "$1[REDACTED]");
}

async function runStdioServer(): Promise<void> {
  const server = createRollingGoHotelServer();
  await server.connect(new StdioServerTransport());
}

if (require.main === module) {
  runStdioServer().catch(error => {
    console.error(error instanceof Error ? error.message : "Unable to start RollingGo hotel MCP server.");
    process.exitCode = 1;
  });
}
