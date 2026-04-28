import { describe, it, expect } from "vitest";
import {
  COLORS,
  VALUES,
  TILES_PER_COPY,
  TOTAL_NUMBERED_TILES,
  INITIAL_HAND_SIZE,
  INITIAL_MELD_MINIMUM,
  MIN_SET_SIZE,
  MAX_GROUP_SIZE,
  GAME_CODE_LENGTH,
} from "./constants";

describe("COLORS", () => {
  it("should have exactly 4 colors", () => {
    expect(COLORS).toHaveLength(4);
  });

  it("should contain red, blue, orange, black", () => {
    expect(COLORS).toEqual(["red", "blue", "orange", "black"]);
  });
});

describe("VALUES", () => {
  it("should have values 1 through 13", () => {
    expect(VALUES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});

describe("TILES_PER_COPY", () => {
  it("should be 2", () => {
    expect(TILES_PER_COPY).toBe(2);
  });
});

describe("TOTAL_NUMBERED_TILES", () => {
  it("should be 104 (4 colors × 13 values × 2 copies)", () => {
    expect(TOTAL_NUMBERED_TILES).toBe(104);
  });
});

describe("INITIAL_HAND_SIZE", () => {
  it("should be 14", () => {
    expect(INITIAL_HAND_SIZE).toBe(14);
  });
});

describe("INITIAL_MELD_MINIMUM", () => {
  it("should be 30", () => {
    expect(INITIAL_MELD_MINIMUM).toBe(30);
  });
});

describe("MIN_SET_SIZE", () => {
  it("should be 3", () => {
    expect(MIN_SET_SIZE).toBe(3);
  });
});

describe("MAX_GROUP_SIZE", () => {
  it("should be 4", () => {
    expect(MAX_GROUP_SIZE).toBe(4);
  });
});

describe("GAME_CODE_LENGTH", () => {
  it("should be 6", () => {
    expect(GAME_CODE_LENGTH).toBe(6);
  });
});
