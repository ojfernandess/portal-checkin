import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkinRecordShowsCompanionsBadge,
  type CheckinRecordBadgeInput,
} from "./checkin-record-status.ts";
import {
  dedupeCheckinRecordsForDisplay,
  type CheckinRecordDisplayRow,
} from "./checkin-record-status.ts";

function baseRecord(overrides: Partial<CheckinRecordBadgeInput> = {}): CheckinRecordBadgeInput {
  return {
    reservation_id: "res-1",
    reservation_snapshot: { localizer: "ABC123" } as CheckinRecordBadgeInput["reservation_snapshot"],
    dependents: [],
    terms_accepted: true,
    ...overrides,
  };
}

describe("checkinRecordShowsCompanionsBadge", () => {
  it("returns true for companion-only reservation updates", () => {
    const record = baseRecord({
      terms_accepted: false,
      dependents: [{ name: "Maria", documentNumber: "123", documentType: "CPF", gender: "FEMALE" }],
    });
    assert.equal(checkinRecordShowsCompanionsBadge(record), true);
  });

  it("returns true when dependents exceed reservation snapshot", () => {
    const record = baseRecord({
      dependents: [
        { name: "Maria", documentNumber: "123", documentType: "CPF", gender: "FEMALE" },
        { name: "Joao", documentNumber: "456", documentType: "CPF", gender: "MALE" },
      ],
      reservation_snapshot: {
        localizer: "ABC123",
        dependents: [{ name: "Maria", documentNumber: "123", documentType: "CPF", gender: "FEMALE" }],
      } as CheckinRecordBadgeInput["reservation_snapshot"],
    });
    assert.equal(checkinRecordShowsCompanionsBadge(record), true);
  });

  it("returns false for initial reservation check-in with companions", () => {
    const dependents = [{ name: "Maria", documentNumber: "123", documentType: "CPF", gender: "FEMALE" }];
    const record = baseRecord({
      dependents,
      reservation_snapshot: {
        localizer: "ABC123",
        dependents,
      } as CheckinRecordBadgeInput["reservation_snapshot"],
    });
    assert.equal(checkinRecordShowsCompanionsBadge(record), false);
  });
});

function adminRecord(overrides: Partial<CheckinRecordDisplayRow>): CheckinRecordDisplayRow {
  return {
    id: overrides.id ?? "id-1",
    localizer: "ABC123",
    reservation_id: "res-1",
    dependents: [],
    reservation_snapshot: { localizer: "ABC123", dependents: [] } as CheckinRecordBadgeInput["reservation_snapshot"],
    terms_accepted: true,
    checked_in_at: "2026-08-31T10:00:00.000Z",
    ...overrides,
  };
}

describe("dedupeCheckinRecordsForDisplay", () => {
  it("merges duplicate localizer rows and keeps the original check-in", () => {
    const primary = adminRecord({
      id: "primary",
      checked_in_at: "2026-08-31T10:00:00.000Z",
      terms_accepted: true,
      reservation_snapshot: { localizer: "ABC123", dependents: [] } as CheckinRecordBadgeInput["reservation_snapshot"],
    });
    const duplicate = adminRecord({
      id: "duplicate",
      checked_in_at: "2026-08-31T12:00:00.000Z",
      terms_accepted: false,
      dependents: [{ name: "Maria", documentNumber: "123", documentType: "CPF", gender: "FEMALE" }],
    });

    const result = dedupeCheckinRecordsForDisplay([duplicate, primary]);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, "primary");
    assert.equal(result[0]?.dependents.length, 1);
    assert.equal(checkinRecordShowsCompanionsBadge(result[0]!), true);
  });
});
