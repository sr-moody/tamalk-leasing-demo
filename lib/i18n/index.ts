import ar from "./ar.json";

type Dict = typeof ar;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TKey = Leaves<Dict>;
export type TVars = Record<string, string | number>;

const lookup = (key: string): string | undefined => {
  let node: unknown = ar;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
};

/** ترجمة مفتاح مع استبدال المتغيرات `{name}` */
export function t(key: TKey, vars?: TVars): string {
  const raw = lookup(key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export const locale = "ar";
export const dir = "rtl";
