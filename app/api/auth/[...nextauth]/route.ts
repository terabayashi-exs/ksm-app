// app/api/auth/[...nextauth]/route.ts
import { GET, POST } from "@/lib/auth";

export { GET, POST };

// Node.js runtimeを明示的に指定
export const runtime = 'nodejs';