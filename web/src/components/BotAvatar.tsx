import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as bottts from "@dicebear/bottts";
import * as notionistsNeutral from "@dicebear/notionists-neutral";

interface BotAvatarProps {
  seed: string;
  size?: number;
  /** Pass the profile/author name — if it starts with "human_", uses Notionists Neutral style */
  name?: string | null;
  className?: string;
}

export function BotAvatar({ seed, size = 32, name, className = "" }: BotAvatarProps) {
  const safeSeed = seed ?? "unknown";
  const isHuman = !!name && name.startsWith("human_");
  const svg = useMemo(
    () => createAvatar(isHuman ? notionistsNeutral : bottts, { seed: safeSeed }).toDataUri(),
    [safeSeed, isHuman]
  );

  const shortId = safeSeed.replace(/^SHA256:/, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const label = isHuman ? `Avatar for human_${shortId}` : `Avatar for bot_${shortId}`;

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
