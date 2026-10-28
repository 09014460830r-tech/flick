import { describe, expect, it } from "vitest";
import { normalizeTasks } from "../../src/worker/ai";

describe("normalizeTasks", () => {
  it("accepts structured output", () => {
    expect(normalizeTasks({ tasks: ["牛乳を買う", "メールを返す"] })).toEqual(["牛乳を買う", "メールを返す"]);
  });
  it("extracts JSON embedded in prose", () => {
    expect(normalizeTasks('はい：{"tasks":["A","B"]} 以上')).toEqual(["A", "B"]);
  });
  it("falls back to lines and strips bullets", () => {
    expect(normalizeTasks("- 洗濯する\n2. 掃除する\n・料理する")).toEqual(["洗濯する", "掃除する", "料理する"]);
  });
  it("drops duplicates, blanks and non-strings, caps at 8", () => {
    expect(normalizeTasks({ tasks: ["A", "A", " ", 3, ...Array.from({ length: 12 }, (_, i) => `T${i}`)] })).toHaveLength(8);
    expect(normalizeTasks({ tasks: ["A", "A", " "] })).toEqual(["A"]);
  });
  it("returns [] for garbage", () => {
    expect(normalizeTasks(null)).toEqual([]);
    expect(normalizeTasks({ nope: 1 })).toEqual([]);
  });
});
