import { describe, expect, it } from "vitest";
import { SITE_INDEXAVEL } from "@/lib/site/indexacao";
import robots from "./robots";

// O robots.txt libera tudo mesmo com a trava ligada: com "Disallow: /" o
// Google não visitaria as páginas e não leria o noindex (ver robots.ts).
describe("robots.txt (PR noindex-site)", () => {
  it("com SITE_INDEXAVEL false: Allow para / e nenhum Disallow para /", () => {
    expect(SITE_INDEXAVEL).toBe(false);
    const { rules } = robots();
    const lista = Array.isArray(rules) ? rules : [rules];
    expect(lista).toHaveLength(1);
    expect(lista[0].userAgent).toBe("*");
    expect(lista[0].allow).toBe("/");
    const disallow = [lista[0].disallow ?? []].flat();
    expect(disallow).not.toContain("/");
    expect(disallow).toHaveLength(0);
  });
});
