import { describe, it, expect } from "vitest";
import { isValidRun, isValidGroup, isValidSet, calculateSetValue } from "./validation";
import type { Tile } from "./types";

function tile(color: Tile["color"], value: number, id?: string): Tile {
  return { id: id ?? `${color}-${value}-a`, color, value: value as Tile["value"] };
}

describe("isValidRun", () => {
  it("should accept a valid run of 3 consecutive same-color tiles", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 5)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should accept a run longer than 3", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 5), tile("red", 6), tile("red", 7)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should reject a run with fewer than 3 tiles", () => {
    const tiles = [tile("red", 3), tile("red", 4)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should reject non-consecutive values", () => {
    const tiles = [tile("red", 3), tile("red", 5), tile("red", 6)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should reject mixed colors", () => {
    const tiles = [tile("red", 3), tile("blue", 4), tile("red", 5)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should reject run that wraps from 13 to 1", () => {
    const tiles = [tile("red", 12), tile("red", 13), tile("red", 1)];
    expect(isValidRun(tiles)).toBe(false);
  });

  it("should accept a run starting at 1", () => {
    const tiles = [tile("blue", 1), tile("blue", 2), tile("blue", 3)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should accept a run ending at 13", () => {
    const tiles = [tile("black", 11), tile("black", 12), tile("black", 13)];
    expect(isValidRun(tiles)).toBe(true);
  });

  it("should reject unsorted tiles", () => {
    const tiles = [tile("red", 5), tile("red", 3), tile("red", 4)];
    expect(isValidRun(tiles)).toBe(false);
  });
});

describe("isValidGroup", () => {
  it("should accept a valid group of 3 same-value different-color tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7)];
    expect(isValidGroup(tiles)).toBe(true);
  });

  it("should accept a group of 4 tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7), tile("orange", 7)];
    expect(isValidGroup(tiles)).toBe(true);
  });

  it("should reject a group with fewer than 3 tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7)];
    expect(isValidGroup(tiles)).toBe(false);
  });

  it("should reject a group with more than 4 tiles", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7), tile("orange", 7), tile("red", 7, "red-7-b")];
    expect(isValidGroup(tiles)).toBe(false);
  });

  it("should reject duplicate colors in a group", () => {
    const tiles = [tile("red", 7), tile("red", 7, "red-7-b"), tile("blue", 7)];
    expect(isValidGroup(tiles)).toBe(false);
  });

  it("should reject different values in a group", () => {
    const tiles = [tile("red", 7), tile("blue", 8), tile("black", 7)];
    expect(isValidGroup(tiles)).toBe(false);
  });
});

describe("isValidSet", () => {
  it("should accept a valid run", () => {
    const tiles = [tile("red", 3), tile("red", 4), tile("red", 5)];
    expect(isValidSet(tiles)).toBe(true);
  });

  it("should accept a valid group", () => {
    const tiles = [tile("red", 7), tile("blue", 7), tile("black", 7)];
    expect(isValidSet(tiles)).toBe(true);
  });

  it("should reject an invalid set", () => {
    const tiles = [tile("red", 3), tile("blue", 7), tile("black", 10)];
    expect(isValidSet(tiles)).toBe(false);
  });
});

describe("calculateSetValue", () => {
  it("should sum tile values", () => {
    const tiles = [tile("red", 10), tile("red", 11), tile("red", 12)];
    expect(calculateSetValue(tiles)).toBe(33);
  });

  it("should sum values for a group", () => {
    const tiles = [tile("red", 5), tile("blue", 5), tile("black", 5)];
    expect(calculateSetValue(tiles)).toBe(15);
  });
});
