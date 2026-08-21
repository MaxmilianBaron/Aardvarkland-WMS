export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function numberFormat(value: number) {
  return new Intl.NumberFormat('cs-CZ').format(value);
}

export function percent(value: number) {
  return `${Math.round(value)} %`;
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
