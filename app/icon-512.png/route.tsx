import { appIcon } from "@/lib/icon";

export const dynamic = "force-static";

export function GET() {
  return appIcon(512);
}
