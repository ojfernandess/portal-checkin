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
  isCancelled?: boolean;
  isPendingCancellation?: boolean;
  responsible?: { name?: string; email?: string; documentNumber?: string };
  mainGuest?: GuestLookup;
  dependents?: Dependent[];
  room?: { capacity?: number; unitName?: string; categoryName?: string };
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
  const c = r?.checkin;
  if (!c) return false;
  return Number(c.checkin_mobile) === 1 || Number(c.checkinApi) === 1 || Number(c.checkinManual) === 1;
}
