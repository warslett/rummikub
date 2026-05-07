export const COLORS = ["red", "blue", "orange", "black"] as const;
export type Color = (typeof COLORS)[number];

export const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export type Value = (typeof VALUES)[number];

export const JOKER_VALUE = 0;
export const JOKER_COLOR = "joker";
export const JOKER_PENALTY = 30;
export const JOKER_COUNT = 2;

export const TILES_PER_COPY = 2;
export const TOTAL_NUMBERED_TILES = COLORS.length * VALUES.length * TILES_PER_COPY;
export const TOTAL_TILES = TOTAL_NUMBERED_TILES + JOKER_COUNT;
export const INITIAL_HAND_SIZE = 14;
export const INITIAL_MELD_MINIMUM = 30;
export const MIN_SET_SIZE = 3;
export const MAX_GROUP_SIZE = 4;
export const GAME_CODE_LENGTH = 6;

export const GAME_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
