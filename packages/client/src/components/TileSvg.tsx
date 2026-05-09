import React from "react";
import type { Tile, Color } from "@rummikub/shared";

interface TileSvgProps {
  color: Tile["color"];
  value: number;
  displayValue?: string;
}

const TEXT_COLORS: Record<Color, string> = {
  red: "#E02020",
  blue: "#0055A4",
  orange: "#F5A623",
  black: "#1C1C1C",
};

function JokerFace() {
  return (
    <g transform="translate(25, 35)">
      <circle cx="0" cy="0" r="10.5" fill="none" stroke="#333333" strokeWidth="1.5" />
      <ellipse cx="-3.5" cy="-2.5" rx="2.5" ry="2" fill="none" stroke="#333333" strokeWidth="0.7" />
      <circle cx="-3.5" cy="-2.5" r="1" fill="#333333" />
      <ellipse cx="3.5" cy="-2.5" rx="2.5" ry="2" fill="none" stroke="#333333" strokeWidth="0.7" />
      <circle cx="3.5" cy="-2.5" r="1" fill="#333333" />
      <path d="M -1,1.5 Q 0,3 1,1.5" fill="none" stroke="#333333" strokeWidth="1" strokeLinecap="round" />
      <path d="M -5.5,5 Q 0,9.5 5.5,5" fill="none" stroke="#333333" strokeWidth="1" strokeLinecap="round" />
    </g>
  );
}

export function TileSvg({ color, value, displayValue }: TileSvgProps) {
  const baseId = React.useId().replace(/:/g, "");
  const convexId = baseId + "-cvex";
  const concaveId = baseId + "-ccve";

  const isJoker = color === "joker";
  const label = displayValue ?? String(value);

  return (
    <svg
      viewBox="0 0 50 70"
      width="100%"
      height="100%"
      style={{ filter: "drop-shadow(1px 2px 1.5px rgba(0,0,0,0.25))" }}
    >
      <defs>
        <linearGradient id={convexId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={concaveId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="48" height="68" rx="3" fill="#FAF3E0" />
      <rect x="1" y="1" width="48" height="68" rx="3" fill={`url(#${convexId})`} />
      <rect x="5" y="5" width="40" height="60" rx="2" fill="#F5F0E1" />
      <circle cx="25" cy="35" r="16" fill={`url(#${concaveId})`} />
      {isJoker ? (
        <JokerFace />
      ) : (
        <text
          x="25"
          y="43"
          textAnchor="middle"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="bold"
          fontSize="22"
          fill={TEXT_COLORS[color]}
        >
          {label}
        </text>
      )}
    </svg>
  );
}
