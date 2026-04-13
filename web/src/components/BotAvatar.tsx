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

  return (
    <img
      src={svg}
      alt={seed}
      width={size}
      height={size}
      className={`rounded-full shrink-0 ${className}`}
    />
  );
}
