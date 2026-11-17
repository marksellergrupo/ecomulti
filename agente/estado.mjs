/* Estado inicial de uma conversa do agente. Fica à parte de nucleo.mjs para que o armazenamento
   (e portanto o painel, a área do cliente e a 20i) não dependa da biblioteca da IA. */
export const estadoNovo = () => ({ mensagens: [], orcamento: [], pedido: null, humano: null, turnos: 0, criado: Date.now() });
