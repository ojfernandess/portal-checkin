import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enrichManagedUnitOptionsFromStay,
  normalizeInboxStay,
  normalizeManagedUnitOptions,
  resolveStayManagedUnitId,
} from "./normalize.ts";

describe("resolveStayManagedUnitId", () => {
  it("reads nested managed_unit id", () => {
    const stay = normalizeInboxStay({
      id: 10,
      managed_unit: { id: 5, display_name: "Apto 101" },
    } as never);

    assert.equal(resolveStayManagedUnitId(stay), 5);
    assert.equal(stay.managed_unit_id, 5);
  });
});

describe("normalizeManagedUnitOptions", () => {
  it("normalizes mixed payloads", () => {
    const units = normalizeManagedUnitOptions([
      { id: "1", display_name: "Unidade A" },
      { id: 2, name: "Unidade B" },
      { id: 3 },
    ]);

    assert.deepEqual(units, [
      { id: 1, display_name: "Unidade A" },
      { id: 2, display_name: "Unidade B" },
      { id: 3, display_name: "#3" },
    ]);
  });
});

describe("enrichManagedUnitOptionsFromStay", () => {
  it("adds current stay unit when missing from active list", () => {
    const units = enrichManagedUnitOptionsFromStay([], {
      id: 10,
      managed_unit_id: 7,
      managed_unit: { id: 7, display_name: "Suite 701" },
    } as never);

    assert.deepEqual(units, [{ id: 7, display_name: "Suite 701" }]);
  });
});
