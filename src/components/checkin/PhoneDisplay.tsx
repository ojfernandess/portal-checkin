import { parsePhoneDisplay } from "@/lib/phone-display";
import { CountryFlag } from "@/components/checkin/CountryFlag";

type Props = {
  phone: string;
  className?: string;
};

export function PhoneDisplay({ phone, className }: Props) {
  const parts = parsePhoneDisplay(phone);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`.trim()}>
      <CountryFlag iso={parts.iso} />
      <span>{parts.formatted}</span>
    </span>
  );
}
