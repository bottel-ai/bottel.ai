import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as bottts from "@dicebear/bottts";

interface BotAvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

export function BotAvatar({ seed, size = 32, className = "" }: BotAvatarProps) {
  const svg = useMemo(
    () => createAvatar(bottts, { seed, size }).toDataUri(),
    [seed, size]
  );

  // Derive a short, human-readable label from the fingerprint seed
  const shortId = seed.replace(/^SHA256:/, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const label = `Bot avatar for ${shortId}`;

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
