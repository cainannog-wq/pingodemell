// RLS e permissões de "dias_off" e "segunda_reaberturas", numa transação
// desfeita — nada é gravado. Substitui scripts/test-rls-dias-off.mjs, que
// gravava registros temporários em produção.
//
// Uso: node scripts/banco/dias-off.mjs [--com-migracao]

import { cenario, descrever, emTransacaoDesfeita, registrar } from "./lib.mjs";

// Datas daqui a 5 anos: dias_off não aceita segunda-feira;
// segunda_reaberturas só aceita segunda-feira.
function dataDeProva(segunda) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 5);
  while ((d.getUTCDay() === 1) !== segunda) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const TABELAS = [
  { tabela: "dias_off", data: dataDeProva(false) },
  { tabela: "segunda_reaberturas", data: dataDeProva(true) },
];

await emTransacaoDesfeita("Dias off e reaberturas de segunda — RLS e permissões", async (db) => {
  for (const { tabela, data } of TABELAS) {
    const t = `public.${tabela}`;

    await cenario(db, async (c) => {
      await c.q(`insert into ${t} (data) values ($1)`, [data]);
      await c.como("anon");
      const le = await c.tentar(`select id from ${t}`);
      const insere = await c.tentar(`insert into ${t} (data) values ($1::date + 7)`, [data]);
      const altera = await c.tentar(`update ${t} set observacao = 'anônimo' where data = $1`, [data]);
      const apaga = await c.tentar(`delete from ${t} where data = $1`, [data]);
      await c.dono();
      const { rows } = await c.q(`select observacao from ${t} where data = $1`, [data]);
      registrar(`[${tabela}] 1. anônimo lê (leitura pública)`, le.ok && le.rowCount > 0, descrever(le));
      registrar(`[${tabela}] 2. anônimo não insere`, !insere.ok, descrever(insere));
      registrar(
        `[${tabela}] 3. anônimo não altera`,
        (!altera.ok || altera.rowCount === 0) && rows[0]?.observacao === null,
        `${descrever(altera)}; observação continua vazia`
      );
      registrar(`[${tabela}] 4. anônimo não apaga`, (!apaga.ok || apaga.rowCount === 0) && rows.length === 1, `${descrever(apaga)}; registro continua`);
    });

    await cenario(db, async (c) => {
      await c.como("authenticated");
      const insere = await c.tentar(`insert into ${t} (data) values ($1) returning id`, [data]);
      const altera = await c.tentar(`update ${t} set observacao = 'observação de teste' where data = $1`, [data]);
      const le = await c.tentar(`select observacao from ${t} where data = $1`, [data]);
      const apaga = await c.tentar(`delete from ${t} where data = $1`, [data]);
      registrar(`[${tabela}] 5. logado insere`, insere.ok && insere.rowCount === 1, descrever(insere));
      registrar(`[${tabela}] 6. logado altera a observação`, altera.ok && altera.rowCount === 1, descrever(altera));
      registrar(
        `[${tabela}] 7. logado lê o registro com a observação nova`,
        le.ok && le.rows[0]?.observacao === "observação de teste",
        le.ok ? `observação: "${le.rows[0]?.observacao}"` : descrever(le)
      );
      registrar(`[${tabela}] 8. logado apaga`, apaga.ok && apaga.rowCount === 1, descrever(apaga));
    });
  }
});
