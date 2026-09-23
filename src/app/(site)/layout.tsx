import type { ReactNode } from "react";
import { SiteChrome } from "@/components/site/SiteChrome";

// Layout do site público (páginas do cliente). O admin fica fora deste
// grupo e não herda nada daqui.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
