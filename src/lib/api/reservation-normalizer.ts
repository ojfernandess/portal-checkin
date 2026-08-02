import type { Dependent, GuestLookup, Reservation } from "./types";

type Address = {
  street?: string;
  number?: string;
  neighborhood?: string;
  zipCode?: string;
  city?: string;
  state?: string;
  country?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  return String(value);
}

function num(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseAddress(raw: unknown): Address | undefined {
  const row = asRecord(raw);
  if (!row) return undefined;
  const address: Address = {
    street: str(row.street),
    number: str(row.number),
    neighborhood: str(row.neighborhood),
    zipCode: str(row.zipCode),
    city: str(row.city),
    state: str(row.state),
    country: str(row.country),
  };
  return Object.values(address).some(Boolean) ? address : undefined;
}

function parseMainGuest(raw: unknown): GuestLookup | undefined {
  const row = asRecord(raw);
  if (!row) return undefined;

  const guest: GuestLookup = {
    name: str(row.name),
    email: str(row.email),
    documentNumber: str(row.documentNumber),
    documentType: str(row.documentType),
    rg: str(row.rg),
    expeditor: str(row.expeditor),
    mobilePhoneNumber: str(row.mobilePhoneNumber) ?? str(row.phone),
    birthDate: str(row.birthDate),
    gender: str(row.gender),
    profession: str(row.profession),
    citizenship: str(row.citizenship),
    zipCode: str(row.zipCode),
    country: str(row.country),
    state: str(row.state),
    city: str(row.city),
    street: str(row.street),
    number: str(row.number),
    neighborhood: str(row.neighborhood),
    profilePhotoUrl: str(row.profilePhotoUrl),
    documentPhotoUrl: str(row.documentPhotoUrl),
    profilePhotoId: row.profilePhotoId as string | number | undefined,
    documentPhotoId: row.documentPhotoId as string | number | undefined,
  };

  return guest.name || guest.email || guest.documentNumber ? guest : undefined;
}

export function mergeGuests(...guests: Array<GuestLookup | undefined>): GuestLookup | undefined {
  const merged = Object.assign({}, ...guests.filter(Boolean)) as GuestLookup;
  return merged.name || merged.email || merged.documentNumber ? merged : undefined;
}

function isFlatReservationPayload(root: Record<string, unknown>): boolean {
  const hasNestedSections =
    root.reservation != null ||
    root.stay != null ||
    root.room != null ||
    root.financial != null ||
    root.status != null ||
    root.establishment != null ||
    root.checkin != null ||
    root.access != null;

  if (hasNestedSections) return false;
  return !!(root.localizer || root.reservationId);
}

function pickReservationUnit(
  room: Record<string, unknown> | null,
  root: Record<string, unknown>,
): Record<string, unknown> | null {
  const roomUnits = Array.isArray(room?.units) ? room.units : [];
  const fromRoom = asRecord(roomUnits[0]);
  if (fromRoom) return fromRoom;

  const rootUnits = Array.isArray(root.units) ? root.units : [];
  const fromRoot = asRecord(rootUnits[0]);
  if (fromRoot) return fromRoot;

  const singleUnit = asRecord(root.unit);
  if (singleUnit) return singleUnit;

  if (root.unitName || root.categoryName || root.unitNumber) {
    return root;
  }

  if (room && (room.roomName || room.categoryName || room.roomNumber)) {
    return room;
  }

  return null;
}

function mergeDefinedReservation(base: Reservation, overlay: Reservation): Reservation {
  const merged: Reservation = { ...base };

  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined || value === null) continue;

    const current = merged[key as keyof Reservation];
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof current === "object" &&
      current !== null &&
      !Array.isArray(current)
    ) {
      merged[key as keyof Reservation] = {
        ...(current as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      } as Reservation[keyof Reservation];
      continue;
    }

    merged[key as keyof Reservation] = value as Reservation[keyof Reservation];
  }

  return merged;
}

/** Preserva acomodação, estadia e estabelecimento quando a atualização parcial não traz esses campos. */
export function preserveReservationDetails(
  base: Reservation,
  overlay: Reservation,
): Reservation {
  return {
    ...overlay,
    reservationUnitId: overlay.reservationUnitId ?? base.reservationUnitId,
    unitId: overlay.unitId ?? base.unitId,
    unitName: overlay.unitName ?? base.unitName,
    unitNumber: overlay.unitNumber ?? base.unitNumber,
    roomName: overlay.roomName ?? base.roomName,
    categoryId: overlay.categoryId ?? base.categoryId,
    categoryName: overlay.categoryName ?? base.categoryName,
    capacity: overlay.capacity ?? base.capacity ?? base.room?.capacity,
    establishmentId: overlay.establishmentId ?? base.establishmentId,
    establishmentName: overlay.establishmentName ?? base.establishmentName,
    establishment: overlay.establishment ?? base.establishment,
    stay: overlay.stay ?? base.stay,
    room: {
      ...(base.room ?? {}),
      ...(overlay.room ?? {}),
      capacity: overlay.capacity ?? overlay.room?.capacity ?? base.capacity ?? base.room?.capacity,
    },
    checkinDate: overlay.checkinDate ?? base.checkinDate,
    checkoutDate: overlay.checkoutDate ?? base.checkoutDate,
    checkinTime: overlay.checkinTime ?? base.checkinTime,
    checkoutTime: overlay.checkoutTime ?? base.checkoutTime,
    reservationDate: overlay.reservationDate ?? base.reservationDate,
    guestsQuantity: overlay.guestsQuantity ?? base.guestsQuantity,
    nights: overlay.nights ?? base.nights,
    price: overlay.price ?? base.price,
    totalPaid: overlay.totalPaid ?? base.totalPaid,
    financial: overlay.financial ?? base.financial,
    label: overlay.label ?? base.label,
  };
}

function parseDependents(raw: unknown): Dependent[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const dependents = raw
    .map((item) => {
      const row = asRecord(item);
      if (!row?.name) return null;
      return {
        dependentId: row.dependentId != null ? String(row.dependentId) : null,
        name: String(row.name),
        email: row.email != null ? String(row.email) : undefined,
        documentNumber: String(row.documentNumber ?? ""),
        documentType: String(row.documentType ?? "CPF"),
        gender: String(row.gender ?? ""),
        mobilePhoneNumber:
          row.mobilePhoneNumber != null ? String(row.mobilePhoneNumber) : undefined,
        rg: row.rg != null ? String(row.rg) : undefined,
        expeditor: row.expeditor != null ? String(row.expeditor) : undefined,
        birthDate: row.birthDate != null ? String(row.birthDate) : undefined,
        profession: row.profession != null ? String(row.profession) : undefined,
        citizenship: row.citizenship != null ? String(row.citizenship) : undefined,
        zipCode: row.zipCode != null ? String(row.zipCode) : undefined,
        country: row.country != null ? String(row.country) : undefined,
        state: row.state != null ? String(row.state) : undefined,
        city: row.city != null ? String(row.city) : undefined,
        street: row.street != null ? String(row.street) : undefined,
        number: row.number != null ? String(row.number) : undefined,
        neighborhood: row.neighborhood != null ? String(row.neighborhood) : undefined,
        fnrhId: row.fnrhId != null ? String(row.fnrhId) : null,
      } satisfies Dependent;
    })
    .filter(Boolean) as Dependent[];
  return dependents.length > 0 ? dependents : undefined;
}

/** Converte o payload aninhado de GET /api/reservations/localizer/{id} em Reservation plano. */
export function normalizeReservationPayload(payload: unknown): Reservation | null {
  const root = asRecord(payload);
  if (!root) return null;

  // Resposta já plana (lista admin ou formato legado), sem blocos aninhados
  if (isFlatReservationPayload(root)) {
    return payload as Reservation;
  }

  const reservation = asRecord(root.reservation);
  const stay = asRecord(root.stay);
  const room = asRecord(root.room);
  const financial = asRecord(root.financial);
  const status = asRecord(root.status);
  const checkin = asRecord(root.checkin);
  const establishment = asRecord(root.establishment);
  const access = asRecord(root.access);
  const guest = asRecord(root.guest);
  const responsible = asRecord(root.responsible);

  const unit = pickReservationUnit(room, root);

  const establishmentAddress =
    parseAddress(establishment?.address) ??
    parseAddress(establishment);

  const establishmentId =
    num(unit?.establishmentId) ??
    num(establishment?.establishmentId) ??
    num(root.establishmentId);

  const establishmentName =
    str(unit?.establishmentName) ??
    str(establishment?.establishmentName) ??
    str(root.establishmentName);

  const roomPassword =
    str(access?.roomPassword) ??
    str(checkin?.roomPassword) ??
    str(checkin?.magickey_passwd) ??
    str(root.roomPassword);

  const dependents =
    parseDependents(root.dependents) ??
    parseDependents(root.companions) ??
    parseDependents(root.guests);

  const normalized: Reservation = {
    reservationId: num(reservation?.reservationId) ?? num(root.reservationId),
    localizer: str(reservation?.localizer) ?? str(root.localizer),
    establishmentId,
    establishmentName,
    reservationUnitId: num(unit?.reservationUnitId),
    unitId: num(unit?.unitId),
    unitName:
      str(unit?.unitName) ??
      str(room?.roomName) ??
      str(room?.name) ??
      str(root.unitName),
    unitNumber:
      str(unit?.unitNumber) ??
      str(room?.roomNumber) ??
      str(root.unitNumber),
    roomName: str(room?.roomName) ?? str(room?.name) ?? str(unit?.unitName) ?? str(root.roomName),
    categoryId: num(unit?.categoryId) ?? num(room?.categoryId) ?? num(root.categoryId),
    categoryName:
      str(unit?.categoryName) ??
      str(room?.categoryName) ??
      str(root.categoryName),
    capacity: num(unit?.capacity) ?? num(room?.capacity) ?? num(root.capacity),
    roomPassword: roomPassword ?? null,
    checkinDate: str(stay?.checkinDate) ?? str(root.checkinDate),
    checkinTime: str(stay?.checkinTime) ?? str(root.checkinTime),
    checkoutDate: str(stay?.checkoutDate) ?? str(root.checkoutDate),
    checkoutTime: str(stay?.checkoutTime) ?? str(root.checkoutTime),
    reservationDate: str(stay?.reservationDate) ?? str(root.reservationDate),
    guestsQuantity: num(stay?.guestsQuantity) ?? num(root.guestsQuantity),
    nights: num(stay?.nights) ?? num(root.nights),
    price: num(financial?.price) ?? num(root.price),
    totalPaid: num(financial?.totalPaid) ?? num(root.totalPaid),
    balanceDue: num(financial?.balanceDue) ?? num(root.balanceDue),
    isPaid: financial?.isPaid === true || root.isPaid === true,
    label: str(status?.label) ?? str(root.label),
    isCancelled: status?.isCancelled === true || root.isCancelled === true,
    isPendingCancellation:
      status?.isPendingCancellation === true || root.isPendingCancellation === true,
    responsible: responsible
      ? {
          name: str(responsible.name),
          email: str(responsible.email),
          documentNumber: str(responsible.documentNumber),
        }
      : root.responsible as Reservation["responsible"],
    mainGuest: mergeGuests(
      parseMainGuest(guest),
      parseMainGuest(root.guest),
      parseMainGuest(root.mainGuest),
    ),
    room: {
      capacity: num(unit?.capacity) ?? num(room?.capacity) ?? num(root.capacity),
      unitName:
        str(unit?.unitName) ??
        str(room?.roomName) ??
        str(root.unitName),
      categoryName:
        str(unit?.categoryName) ??
        str(room?.categoryName) ??
        str(root.categoryName),
    },
    stay: stay
      ? {
          checkinDate: str(stay.checkinDate),
          checkoutDate: str(stay.checkoutDate),
          checkinTime: str(stay.checkinTime),
          checkoutTime: str(stay.checkoutTime),
          reservationDate: str(stay.reservationDate),
          guestsQuantity: num(stay.guestsQuantity),
          nights: num(stay.nights),
        }
      : (root.stay as Reservation["stay"]),
    establishment: establishment
      ? {
          establishmentId,
          establishmentName,
          address: establishmentAddress,
          phone: str(establishment.phone),
          whatsapp: str(establishment.whatsapp),
          ...(establishmentAddress ?? {}),
        }
      : (root.establishment as Reservation["establishment"]),
    financial: financial
      ? {
          price: num(financial.price),
          totalPaid: num(financial.totalPaid),
          balanceDue: num(financial.balanceDue),
          isPaid: financial.isPaid === true,
        }
      : (root.financial as Reservation["financial"]),
    checkin: checkin ? (checkin as Reservation["checkin"]) : (root.checkin as Reservation["checkin"]),
    dependents,
    access: access
      ? { roomPassword: roomPassword ?? null }
      : (root.access as Reservation["access"]),
  };

  return normalized;
}

/** Mescla dados retornados após POST check-in (senha do quarto, flags, hub). */
export function mergeCheckinResult(
  reservation: Reservation,
  result: unknown,
): Reservation {
  const root = asRecord(result);
  if (!root) return reservation;

  const data = asRecord(root.data);
  const hubRaw = root.hub ?? data?.hub;
  const hub = hubRaw ? normalizeReservationPayload(hubRaw) : null;
  const checkin = asRecord(root.checkin) ?? asRecord(data?.checkin);

  const roomPassword =
    str(checkin?.roomPassword) ??
    str(checkin?.magickey_passwd) ??
    hub?.roomPassword ??
    reservation.roomPassword;

  const merged = hub ? mergeDefinedReservation(reservation, hub) : reservation;
  const withDetails = preserveReservationDetails(reservation, merged);

  return {
    ...withDetails,
    mainGuest: mergeGuests(withDetails.mainGuest, reservation.mainGuest),
    roomPassword: roomPassword ?? withDetails.roomPassword ?? null,
    checkin: {
      ...withDetails.checkin,
      ...(checkin as Reservation["checkin"]),
    },
  };
}
