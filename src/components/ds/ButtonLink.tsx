"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "./Button";

// Button com a aparência de sempre, mas navegando como link interno
// (next/link). Existe porque um Server Component não consegue passar
// `as={Link}` pro Button (função não atravessa a fronteira servidor →
// navegador); aqui o Link é escolhido já do lado do navegador.
export function ButtonLink({ href, ...props }: Omit<ComponentProps<typeof Button>, "as" | "href"> & { href: string }) {
  return <Button as={Link} href={href} {...props} />;
}
