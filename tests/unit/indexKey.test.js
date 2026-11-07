import { describe, it, expect } from "vitest";
import { accessMultikey, assembleOrder, groupEvents, stripIndex } from "../../docs/.vitepress/utils.js";

// `&` appends to the keys of a level instead of adding new ones (`+`). `&index` appends
// "#<position>", so events that share all their data at that level stay in separate groups.
describe("`&` append operator", () => {
  const twins = [
    { title: "Misa", times: ["10:00"], locations: ["Paris"] },
    { title: "Misa", times: ["10:00"], locations: ["Paris"] },
  ];

  describe("accessMultikey: &index", () => {
    it("appends #<position> (1-based) to the keys of the level", () => {
      expect(accessMultikey(twins[0], "locations&index", 0)).toEqual(["Paris#1"]);
      expect(accessMultikey(twins[1], "locations&index", 1)).toEqual(["Paris#2"]);
    });

    it("suffixes every key of a multi-valued level, with the same number", () => {
      const event = { times: ["10:00", "12:00"] };
      expect(accessMultikey(event, "times&index", 2)).toEqual(["10:00#3", "12:00#3"]);
    });

    it("binds tighter than `+`: it only touches its own group", () => {
      const event = { locations: ["Paris"], notes: ["Entrada libre"] };
      expect(accessMultikey(event, "locations&index+notes", 0)).toEqual(["Paris#1", "Entrada libre"]);
      expect(accessMultikey(event, "locations&index+notes&index", 0)).toEqual(["Paris#1", "Entrada libre#1"]);
    });

    it("binds looser than `/`: it applies to whichever fallback was used", () => {
      const event = { byday: [], dates: ["2099-12-25"] };
      expect(accessMultikey(event, "byday/dates&index", 0)).toEqual(["2099-12-25#1"]);
    });

    it("gives an empty level a bare #<n> key, so it can still split events", () => {
      expect(accessMultikey({}, "skip&index", 0)).toEqual(["#1"]);
      expect(accessMultikey({}, "&index", 3)).toEqual(["#4"]);
    });
  });

  describe("accessMultikey: &<key>", () => {
    it("appends the value of another key after a space", () => {
      expect(accessMultikey({ times: ["10:00"], locations: ["Paris"] }, "times&locations", 0)).toEqual(["10:00 Paris"]);
    });

    it("does not multiply keys: several values are joined into each key", () => {
      const event = { times: ["10:00", "12:00"], locations: ["A", "B"] };
      expect(accessMultikey(event, "times&locations", 0)).toEqual(["10:00 A, B", "12:00 A, B"]);
    });

    it("appends nothing when the other key is empty", () => {
      expect(accessMultikey({ times: ["10:00"] }, "times&locations", 0)).toEqual(["10:00"]);
    });

    it("gives no key (not a dropped event) when both sides are empty", () => {
      expect(accessMultikey({}, "skip&locations", 0)).toEqual([""]);
    });

    it("can be chained, in order", () => {
      expect(accessMultikey({ times: ["10:00"], locations: ["Paris"] }, "times&locations&index", 0)).toEqual(["10:00 Paris#1"]);
    });

    it("changes nothing when no `&` is used", () => {
      expect(accessMultikey(twins[0], "locations", 5)).toEqual(["Paris"]);
      expect(accessMultikey({}, "skip", 5)).toEqual([""]);
      expect(accessMultikey({ title: "Misa", eventTypeTitle: "Misa", locations: ["Paris"] }, "title-eventTypeTitle+locations", 5)).toEqual(["Paris"]);
    });
  });

  describe("stripIndex", () => {
    it("drops the trailing #<n>", () => {
      expect(stripIndex("Paris#2")).toBe("Paris");
      expect(stripIndex("10:00 Paris#13")).toBe("10:00 Paris");
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
    it("collapses identical events when no level opts in", () => {
      expect(Object.keys(groupEvents(twins, ["times", "locations"]))).toEqual(["10:00"]);
    });

    it("keeps them apart when a level opts in", () => {
      const grouped = groupEvents(twins, ["times&index", "locations"]);
      expect(Object.keys(grouped)).toEqual(["10:00#1", "10:00#2"]);
      expect(Object.keys(grouped["10:00#1"])).toEqual(["Paris"]);
      expect(Object.keys(grouped["10:00#2"])).toEqual(["Paris"]);
    });

    it("still sorts a `times&index` level by time", () => {
      const events = [
        { times: ["18:00"], locations: ["A"] },
        { times: ["09:00"], locations: ["A"] },
      ];
      expect(Object.keys(groupEvents(events, ["times&index", "locations"]))).toEqual(["09:00#2", "18:00#1"]);
    });

    it("orders the events of one time by their number, not as text (#2 before #10)", () => {
      const many = Array.from({ length: 11 }, () => ({ times: ["10:00"] }));
      expect(Object.keys(groupEvents(many, ["times&index"]))).toEqual(Array.from({ length: 11 }, (_, i) => `10:00#${i + 1}`));
    });

    it("still orders weekday keys in week order", () => {
      const recurring = (byday) => ({ title: "Misa", byday, dates: [] });
      const grouped = groupEvents([recurring(["SU"]), recurring(["SA"]), recurring(["SA"])], ["byday&index"]);
      expect(Object.keys(grouped)).toEqual(["SA#2", "SA#3", "SU#1"]);
    });

    it("can split on the last level too", () => {
      const grouped = groupEvents(twins, ["times", "locations&index"]);
      expect(Object.keys(grouped["10:00"])).toEqual(["Paris#1", "Paris#2"]);
    });

    it("numbers events within the group being split, not globally", () => {
      const events = [
        { type: "A", times: ["10:00"] },
        { type: "B", times: ["10:00"] },
        { type: "B", times: ["10:00"] },
      ];
      const grouped = groupEvents(events, ["type", "times&index"]);
      expect(Object.keys(grouped.A)).toEqual(["10:00#1"]);
      expect(Object.keys(grouped.B)).toEqual(["10:00#1", "10:00#2"]);
    });

    it("keeps the `{ link }` stub of each event on its own line", () => {
      const events = [
        { times: ["10:00"], locations: ["Paris"], link: "/a/" },
        { times: ["10:00"], locations: ["Paris"], link: "/b/" },
      ];
      const grouped = groupEvents(events, ["times&index", "locations"]);
      expect(grouped["10:00#1"].Paris).toEqual([{ link: "/a/" }]);
      expect(grouped["10:00#2"].Paris).toEqual([{ link: "/b/" }]);
    });

    it("`&<key>` makes one group per combination instead of one per value", () => {
      const events = [
        { times: ["10:00"], locations: ["Paris"] },
        { times: ["10:00"], locations: ["Rome"] },
      ];
      expect(Object.keys(groupEvents(events, ["times&locations"]))).toEqual(["10:00 Paris", "10:00 Rome"]);
      expect(Object.keys(groupEvents(events, ["times+locations"]))).toEqual(["10:00", "Paris", "Rome"]);
    });
  });

  describe("default ordering", () => {
    it("keeps events that share day, time and everything else on separate lines", () => {
      const base = { byweek: [], notes: [], dates: [], eventTypeTitle: "Misa", title: "Misa", byday: ["SA"], times: ["19:00"] };
      const events = [
        { ...base, locations: ["Iglesia"] },
        { ...base, locations: ["Capilla"] },
      ];
      const grouped = groupEvents(events, assembleOrder({}));
      expect(Object.keys(grouped.Misa.SA[""])).toEqual(["19:00#1", "19:00#2"]);
      expect(Object.keys(grouped.Misa.SA[""]["19:00#2"])).toEqual(["Capilla"]);
    });
  });
});
