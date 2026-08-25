export type InboxPaginationMeta = {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
};

export type InboxPaginated<T> = {
  data: T[];
  meta: InboxPaginationMeta;
};

export type InboxEnterprise = {
  id: number;
  name: string;
  slug?: string;
  status?: string;
};

export type InboxManagedUnit = {
  id: number;
  status: string;
  display_name: string;
  enterprise_id: number;
  apartment_id: number;
  auto_approve_guests?: boolean;
  notes?: string;
  enterprise?: { id: number; name: string };
  apartment?: {
    id: number;
    identifier: string;
    block?: { id: number; name: string };
  };
};

export type InboxApartmentOption = {
  id: number;
  identifier: string;
  block?: { id: number; name: string };
};

export type InboxStayGuest = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  is_primary?: boolean;
  check_in_completed?: boolean;
  status?: string;
};

export type InboxStay = {
  id: number;
  managed_unit_id: number;
  enterprise_id?: number;
  apartment_id?: number;
  status?: string;
  timezone?: string;
  check_in_at?: string;
  check_out_at?: string;
  guest_count?: number;
  check_in_url?: string;
  external_id?: string;
  external_uid?: string;
  notes?: string;
  guests?: InboxStayGuest[];
};

export type InboxHardwareDevice = {
  id: number;
  enterprise_id?: number;
  name: string;
  driver: string;
  reader_scope?: "operator_entrance" | "operator_unit";
  endpoint?: string;
  credentials?: string;
  qr_range_start: number;
  qr_range_end: number;
  access_apartment_ids?: number[];
  access_allow_residents?: boolean;
  access_allow_visitors?: boolean;
  status?: string;
  last_sync_at?: string;
};

export type CreateInboxStayInput = {
  managed_unit_id: number;
  check_in_at: string;
  check_out_at: string;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  external_id?: string;
  external_uid?: string;
  notes?: string;
  guest_count?: number;
  photo_base64?: string;
};

export type CreateInboxStayGuestInput = {
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  is_primary?: boolean;
  photo_base64?: string;
};

export type RequestManagedUnitInput = {
  access_secret: string;
  apartment_id: number;
  display_name?: string;
  auto_approve_guests?: boolean;
  notes?: string;
};

export type CreateHardwareDeviceInput = {
  name: string;
  driver: string;
  reader_scope?: "operator_entrance" | "operator_unit";
  endpoint?: string;
  credentials?: string;
  qr_range_start: number;
  qr_range_end: number;
  access_apartment_ids?: number[];
  access_allow_residents?: boolean;
  access_allow_visitors?: boolean;
};

export type InboxStaySyncStatus = {
  localizer: string;
  sent: boolean;
  inboxStayId: number | null;
  lastSyncAction: string | null;
  lastSyncAt: string | null;
  error: string | null;
  partial: boolean;
};
