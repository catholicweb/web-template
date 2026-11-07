import { describe, it, expect } from "vitest";
import { accessMultikey, groupEvents, stripIndex } from "../../docs/.vitepress/utils.js";

// The opt-in `index` token: a level such as "times+index" gets "#<position>" appended to
// every key, so events that share all their data stay in separate groups.
describe("index key", () => {
  const twins = [
    { title: "Misa", times: ["10:00"], locations: ["Paris"] },
    { title: "Misa", times: ["10:00"], locations: ["Paris"] },
  ];

  describe("accessMultikey", () => {
    it("appends #<position> (1-based) to the keys of the level", () => {
      expect(accessMultikey(twins[0], "locations+index", 0)).toEqual(["Paris#1"]);
      expect(accessMultikey(twins[1], "locations+index", 1)).toEqual(["Paris#2"]);
    });

    it("suffixes every key of a multi-valued level, with the same number", () => {
      const event = { times: ["10:00", "12:00"] };
      expect(accessMultikey(event, "times+index", 2)).toEqual(["10:00#3", "12:00#3"]);
    });

    it("works next to other additive groups and subtractions", () => {
      const event = { title: "Misa", eventTypeTitle: "Misa", locations: ["Paris"], notes: ["Entrada libre"] };
      expect(accessMultikey(event, "title-eventTypeTitle+locations+notes+index", 0)).toEqual(["Paris#1", "Entrada libre#1"]);
    });

    it("gives an empty level a bare #<n> key, so it can still split events", () => {
      expect(accessMultikey({}, "skip+index", 0)).toEqual(["#1"]);
    });

    it("changes nothing when the token is not used", () => {
      expect(accessMultikey(twins[0], "locations", 5)).toEqual(["Paris"]);
      expect(accessMultikey({}, "skip", 5)).toEqual([""]);
    });
  });

  describe("stripIndex", () => {
    it("drops the trailing #<n>", () => {
      expect(stripIndex("Paris#2")).toBe("Paris");
      expect(stripIndex("10:00#13")).toBe("10:00");
      expect(stripIndex("#1")).toBe("");
    });

    it("leaves keys without the suffix alone", () => {
      expect(stripIndex("Paris")).toBe("Paris");
      expect(stripIndex("")).toBe("");
      expect(stripIndex(undefined)).toBe("");
      expect(stripIndex("Misa #1 del mes")).toBe("Misa #1 del mes");
    });
  });

  describe("groupEvents", () => {
    it("collapses identical events by default", () => {
      expect(Object.keys(groupEvents(twins, ["times", "locations"]))).toEqual(["10:00"]);
    });

    it("keeps them apart when a level opts in", () => {
      const grouped = groupEvents(twins, ["times+index", "locations"]);
      expect(Object.keys(grouped)).toEqual(["10:00#1", "10:00#2"]);
      expect(Object.keys(grouped["10:00#1"])).toEqual(["Paris"]);
      expect(Object.keys(grouped["10:00#2"])).toEqual(["Paris"]);
    });

    it("still sorts a `times+index` level by time", () => {
      const events = [
        { times: ["18:00"], locations: ["A"] },
        { times: ["09:00"], locations: ["A"] },
      ];
      expect(Object.keys(groupEvents(events, ["times+index", "locations"]))).toEqual(["09:00#2", "18:00#1"]);
    });

    it("still orders weekday keys in week order", () => {
      const recurring = (byday) => ({ title: "Misa", byday, dates: [] });
      const grouped = groupEvents([recurring(["SU"]), recurring(["SA"]), recurring(["SA"])], ["byday+index"]);
      expect(Object.keys(grouped)).toEqual(["SA#2", "SA#3", "SU#1"]);
    });

    it("can split on the last level too", () => {
      const grouped = groupEvents(twins, ["times", "locations+index"]);
      expect(Object.keys(grouped["10:00"])).toEqual(["Paris#1", "Paris#2"]);
    });

    it("numbers events within the group being split, not globally", () => {
      const events = [
        { type: "A", times: ["10:00"] },
        { type: "B", times: ["10:00"] },
        { type: "B", times: ["10:00"] },
      ];
      const grouped = groupEvents(events, ["type", "times+index"]);
      expect(Object.keys(grouped.A)).toEqual(["10:00#1"]);
      expect(Object.keys(grouped.B)).toEqual(["10:00#1", "10:00#2"]);
    });

    it("keeps the `{ link }` stub of each event on its own line", () => {
      const events = [
        { times: ["10:00"], locations: ["Paris"], link: "/a/" },
        { times: ["10:00"], locations: ["Paris"], link: "/b/" },
      ];
      const grouped = groupEvents(events, ["times+index", "locations"]);
      expect(grouped["10:00#1"].Paris).toEqual([{ link: "/a/" }]);
      expect(grouped["10:00#2"].Paris).toEqual([{ link: "/b/" }]);
    });
  });
});
