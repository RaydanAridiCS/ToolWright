import { getRequestService, REQUEST_STATUSES, type RequestStatus } from "@toolwright/db";
import { errorResponse, json, readJson, tokenFrom } from "../../../lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const service = await getRequestService();
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get("sort") === "new" ? "new" : "top";
    const statusParam = searchParams.get("status");
    const status = REQUEST_STATUSES.includes(statusParam as RequestStatus) ? (statusParam as RequestStatus) : undefined;
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));
    const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
    const requests = await service.list({ sort, status, limit, offset, token: tokenFrom(request) });
    return json({ requests, persistent: service.persistent });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const service = await getRequestService();
    const body = (await readJson(request)) as Record<string, unknown>;
    const created = await service.create({ ...body, token: tokenFrom(request) ?? body.token });
    return json({ request: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
