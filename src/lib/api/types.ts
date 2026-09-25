export type CheckinFlags = {
  checkin_mobile?: number;
  checkinApi?: number;
  checkinManual?: number;
  localizedDate?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export type EstablishmentAddress = {
  street?: string;
  number?: string;
  neighborhood?: string;
  zipCode?: string;
  city?: string;
  state?: string;
  country?: string;
};

export type ReservationStay = {
  checkinDate?: string;
  checkoutDate?: string;
  checkinTime?: string;
  checkoutTime?: string;
  reservationDate?: string;
  guestsQuantity?: number;
  nights?: number;
};

export type ReservationFinancial = {
  price?: number;
  totalPaid?: number;
  balanceDue?: number;
  isPaid?: boolean;
};

export type Reservation = {
  reservationId?: number | string;
  localizer?: string;
  establishmentId?: number | string;
  /** ID do estabelecimento no PMS de origem (ex.: VB retorna 1). */
  pmsEstablishmentId?: number | string;
  /** PMS usado na consulta desta reserva (roteamento de hub/media/check-in). */
  pmsProvider?: "vb" | "vivakey";
  establishmentName?: string;
  reservationUnitId?: number;
  unitId?: number;
  categoryId?: number;
  categoryName?: string;
  roomName?: string;
  unitName?: string;
  unitNumber?: string | number;
  capacity?: number;
  roomPassword?: string | null;
  checkinDate?: string;
  checkinTime?: string;
  checkoutDate?: string;
  checkoutTime?: string;
  reservationDate?: string;
  guestsQuantity?: number;
  nights?: number;
  price?: number | string;
  totalPaid?: number;
  balanceDue?: number;
  isPaid?: boolean;
  label?: string;
  /** Código numérico do PMS (ex.: VB 3=confirmada, 4=cancelada, 6=check-in concluído). */
  reservationStatus?: number;
  isCancelled?: boolean;
  isPendingCancellation?: boolean;
  responsible?: { name?: string; email?: string; documentNumber?: string };
  mainGuest?: GuestLookup;
  dependents?: Dependent[];
  room?: {
    capacity?: number;
    unitName?: string;
    unitNumber?: string;
    roomNumber?: string;
    categoryName?: string;
  };
  stay?: ReservationStay;
  financial?: ReservationFinancial;
  establishment?: {
    establishmentId?: number | string;
    establishmentName?: string;
    address?: EstablishmentAddress;
    street?: string;
    number?: string;
    neighborhood?: string;
    zipCode?: string;
    city?: string;
    state?: string;
    country?: string;
    phone?: string;
    whatsapp?: string;
  };
  access?: { roomPassword?: string | null };
  checkin?: CheckinFlags;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export type GuestLookup = {
  name?: string;
  email?: string;
  documentNumber?: string;
  documentType?: string;
  rg?: string;
  expeditor?: string;
  mobilePhoneNumber?: string;
  birthDate?: string;
  gender?: string;
  profession?: string;
  citizenship?: string;
  zipCode?: string;
  country?: string;
  state?: string;
  city?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  profilePhotoUrl?: string;
  documentPhotoUrl?: string;
  profilePhotoId?: string | number;
  documentPhotoId?: string | number;
  /** URL resolvida só para exibição (S3/proxy); não enviar no check-in. */
  profilePhotoDisplayUrl?: string;
  documentPhotoDisplayUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export type MainGuestLookupResponse = {
  found?: boolean;
  matchedBy?: string;
  mainGuest?: GuestLookup | null;
};

export type MainGuest = GuestLookup;

export type Dependent = {
  dependentId: string | null;
  name: string;
  email?: string;
  documentNumber: string;
  documentType: string;
  gender: string;
  rg?: string;
  expeditor?: string;
  mobilePhoneNumber?: string;
  birthDate?: string;
  profession?: string;
  citizenship?: string;
  zipCode?: string;
  country?: string;
  state?: string;
  city?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  fnrhId: string | null;
  /** Selfie opcional — enviada somente à Inbox (portaria), nunca ao PMS. */
  profilePhotoUrl?: string;
  profilePhotoId?: string | number;
};

export type EmbraturField = { value: string; label: string };

export type EmbraturReference = {
  snmotvia: EmbraturField[];
  sntiptran: EmbraturField[];
  countries: EmbraturField[];
  cities: EmbraturField[];
};

export type EmbraturForm = {
  snmotvia: string;
  sntiptran: string;
  bgstdscpais: string;
  bgstdscpaisdest: string;
  snidcidadeibge: string;
  snidcidadeibgedest: string;
};

export function isAlreadyCheckedIn(r: Reservation | null): boolean {
  if (!r) return false;
  if (Number(r.reservationStatus) === 6) return true;

  const c = r.checkin;
  if (!c) return false;

  return (
    Number(c.checkin_mobile) === 1 ||
    Number(c.checkinApi) === 1 ||
    Number(c.checkinManual) === 1 ||
    Number(c.checkin) === 1
  );
}

/** Check-in aprovado/confirmado no PMS (approveCheckin → hasCheckinApproved = 1). */
export function isCheckinApproved(r: Reservation | null): boolean {
  return Number(r?.checkin?.hasCheckinApproved) === 1;
}

/** Pronto para sincronizar com a Inbox: aprovado ou check-in digital concluído + validado. */
export function isCheckinConfirmedForInbox(r: Reservation | null): boolean {
  if (!r) return false;
  if (isCheckinApproved(r)) return true;
  const c = r.checkin;
  if (!c) return false;
  return Number(c.validatedCheckin) === 1 && isAlreadyCheckedIn(r);
}
