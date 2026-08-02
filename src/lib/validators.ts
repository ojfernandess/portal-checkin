export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function maskCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function maskPhone(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

export function maskCep(value: string) {
  return onlyDigits(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split("").map(Number);
  const rounds: Array<[number, number]> = [
    [9, 10],
    [10, 11],
  ];
  for (const [length, position] of rounds) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += digits[i]! * (position - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== digits[length]!) return false;
  }
  return true;
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export type ViaCepAddress = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

export async function fetchViaCep(cep: string): Promise<ViaCepAddress | null> {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return null;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) return null;
    const data = (await response.json()) as ViaCepAddress;
    return data.erro ? null : data;
  } catch {
    return null;
  }
}
