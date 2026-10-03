// Estado de supabase/pedidos-permissoes.sql no banco (aplicada de verdade
// ou por --com-migracao), para os testes que passam nos dois estados.
// Não é teste: não entra em scripts/banco/rodar-todos.mjs.
//
//   "antes"  -> authenticated apaga pedido, política de exclusão existe e a
//               função registrar_tentativa_pedido existe;
//   "depois" -> nenhum dos três;
//   estado misto -> erro (alguém mexeu à mão: nenhum teste deve passar).

import path from "node:path";
import { raiz } from "./lib.mjs";

export const MIGRACAO_PERMISSOES_PEDIDOS = path.join(raiz, "supabase", "pedidos-permissoes.sql");
export const DESFAZER_PERMISSOES_PEDIDOS = path.join(raiz, "supabase", "pedidos-permissoes-desfazer.sql");

// db: a conexão (db.query) ou o contexto de um cenário (c.q), no papel do
// dono da conexão.
export async function estadoPermissoesPedidos(db) {
  const consultar = db.query ? (sql) => db.query(sql) : (sql) => db.q(sql);
  const { rows } = await consultar(
    `select has_table_privilege('authenticated', 'public.pedidos', 'DELETE') apaga,
            exists (select 1 from pg_policy where polrelid = 'public.pedidos'::regclass and polname = 'Autenticado pode excluir pedidos') politica,
            to_regprocedure('public.registrar_tentativa_pedido(text, integer, integer)') is not null funcao`
  );
  const { apaga, politica, funcao } = rows[0];
  if (apaga && politica && funcao) return "antes";
  if (!apaga && !politica && !funcao) return "depois";
  throw new Error(
    `estado misto de pedidos-permissoes.sql: logado apaga ${apaga}, política de exclusão ${politica}, função antiga ${funcao}`
  );
}
