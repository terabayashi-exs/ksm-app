"use client";

import { useEffect, useRef, useState } from "react";

interface ArchivedHtmlViewerProps {
  tournamentId: string;
}

export function ArchivedHtmlViewer({ tournamentId }: ArchivedHtmlViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(800);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "archive-height" && typeof event.data.height === "number") {
        setHeight(event.data.height + 20); // Add small buffer
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={`/api/tournaments/${tournamentId}/archived-html`}
      className="w-full border-0 rounded-lg"
      style={{ minHeight: "100vh", height: `${height}px` }}
      title="アーカイブ表示"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
