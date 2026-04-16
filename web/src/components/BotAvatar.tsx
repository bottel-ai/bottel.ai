import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as bottts from "@dicebear/bottts";

interface BotAvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

export function BotAvatar({ seed, size = 32, className = "" }: BotAvatarProps) {
  const safeSeed = seed ?? "unknown";
  const svg = useMemo(
    () => createAvatar(bottts, { seed: safeSeed }).toDataUri(),
    [safeSeed]
  );

  const shortId = safeSeed.replace(/^SHA256:/, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const label = `Avatar for bot_${shortId}`;

  return (
    <img
      src={svg}
      alt={label}
      width={size}
      height={size}
      className={`rounded-full shrink-0 ${className}`}
    />
  );
}
