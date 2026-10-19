import { getRequestService } from "@toolwright/db";
import { errorResponse, json, tokenFrom } from "../../../../../lib/api";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const service = await getRequestService();
    return json(await service.vote(id, { token: tokenFrom(request) }));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const service = await getRequestService();
    return json(await service.vote(id, { token: tokenFrom(request) }, true));
  } catch (err) {
    return errorResponse(err);
  }
}
