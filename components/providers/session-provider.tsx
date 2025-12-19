// components/providers/session-provider.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export default function AuthSessionProvider({ children }: Props) {
  return (
    <SessionProvider
      basePath="/api/auth"
      refetchOnWindowFocus={true}
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  );
}