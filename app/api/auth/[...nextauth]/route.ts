// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;

// Node.js runtimeを明示的に指定
export const runtime = 'nodejs';