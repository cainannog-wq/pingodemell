-- Lista de produtos do site público: visitante anônimo passa a ler só
-- produto ativo; usuário logado (admin) continua lendo todos, ativos e
-- inativos. Escrita não muda.
--
-- NÃO-ADITIVA: muda a política de RLS de uma tabela que já está em uso.
-- Pela regra fechada com o Cainan em 22/09/2026 (ver CLAUDE.md), só vai
-- para produção DEPOIS do merge do PR lista-produtos, quando o Cainan pedir.
-- Status: NÃO aplicada em produção.
--
-- Prova antes do merge (23/09/2026): executada uma única vez dentro de uma
-- transação desfeita de propósito (erro no fim, lock_timeout 2s,
-- statement_timeout 5s). Com a política nova: anônimo lê 13 (só ativos),
-- anônimo buscando um inativo pelo id lê 0, logado lê 16. Políticas de
-- produtos conferidas antes e depois: idênticas (nada mudou em produção).
--
-- O site não depende desta migração: a Lista e a Home já filtram ativo na
-- consulta (e de novo no código, porque um admin logado navegando no site
-- lê com a própria sessão, que continua vendo todos).
--
-- Todo o admin lê produtos com a sessão do usuário logado (papel
-- authenticated), nunca com a chave anônima pura — por isso nada no admin
-- deixa de ver inativos.
--
-- Consequência aceita: produto_cento_itens continua com leitura pública,
-- mas quando a página do Cento buscar os produtos de cada sabor como
-- visitante, um sabor inativo não virá — sabor desativado deixa de
-- aparecer para o cliente.
--
-- Prova depois da aplicação: node scripts/test-rls.mjs

begin;

drop policy "Leitura publica de produtos" on public.produtos;

create policy "Anonimo le so produto ativo"
  on public.produtos for select
  to anon
  using (ativo = true);

create policy "Autenticado le todos os produtos"
  on public.produtos for select
  to authenticated
  using (true);

commit;
