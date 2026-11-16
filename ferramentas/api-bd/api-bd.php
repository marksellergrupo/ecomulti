<?php
/* API da base de dados ECOMULTI (vai na hospedagem da AngoWeb, ao lado do proxy-20i.php).

   O servidor Node usa-a para gravar os pedidos nas tabelas clientes / encomendas / encomenda_itens.
   Corre na AngoWeb, liga ao MySQL localmente e só aceita pedidos com o cabeçalho X-Api-Chave correcto.

   Acções:
     GET  api-bd.php?acao=ping    → confirma a ligação à base de dados
     POST api-bd.php?acao=pedido  → grava cliente + encomenda + itens (corpo JSON, ver abaixo)

   A configuração (MySQL e chave) fica em config-bd.php, FORA da pasta pública. */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

function responder($estado, $dados) {
    http_response_code($estado);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}
function falhar($estado, $mensagem) { responder($estado, ['error' => ['message' => 'api-bd: ' . $mensagem]]); }

$ficheiroConfig = dirname(__DIR__) . '/config-bd.php';
if (!is_file($ficheiroConfig)) falhar(500, 'falta config-bd.php fora da pasta pública');
$config = require $ficheiroConfig;
$chaveApi = trim($config['chave_api'] ?? '');
if (strlen($chaveApi) < 24) falhar(500, 'config-bd.php incompleto (chave_api precisa de 24+ caracteres)');

$recebida = $_SERVER['HTTP_X_API_CHAVE'] ?? '';
if (!is_string($recebida) || !hash_equals($chaveApi, trim($recebida))) { usleep(500000); falhar(403, 'acesso negado'); }

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $config['host'] ?? 'localhost', (int)($config['porta'] ?? 3306), $config['base'] ?? ''),
        $config['utilizador'] ?? '', $config['senha'] ?? '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
    );
} catch (Throwable $e) {
    error_log('[api-bd] ligação: ' . $e->getMessage());
    falhar(503, 'sem ligação à base de dados');
}

$acao   = (string)($_GET['acao'] ?? '');
$metodo = $_SERVER['REQUEST_METHOD'];

/* ---------------- ping ---------------- */
if ($acao === 'ping' && $metodo === 'GET') {
    $n = (int)$pdo->query('SELECT COUNT(*) FROM encomendas')->fetchColumn();
    responder(200, ['ok' => true, 'encomendas' => $n]);
}

/* ---------------- pedido ----------------
   {
     "numero": "ECO-261113-1234", "canal": "site" | "whatsapp" | "orcamento-site",
     "metodo": "Multicaixa Express" | "Pagamento por referência" | "Transferência bancária",
     "cliente": { "nome", "tipo": "Empresa"|"Particular", "email", "telefone", "nif", "morada" },
     "itens":   [ { "codigo", "descricao", "valor", "anos" } ],
     "subtotal": 0, "iva": 0, "total": 0
   } */
if ($acao === 'pedido' && $metodo === 'POST') {
    $bruto = file_get_contents('php://input', false, null, 0, 200000);
    $d = json_decode($bruto ?: '', true);
    if (!is_array($d)) falhar(400, 'JSON inválido');

    $txt = function ($v, $max) { return mb_substr(trim(str_replace("\0", '', (string)($v ?? ''))), 0, $max); };
    $kz  = function ($v) { $n = is_numeric($v) ? (float)$v : 0; return max(0, min((int)round($n), 4000000000)); };

    $numero = $txt($d['numero'] ?? '', 20);
    if (!preg_match('/^ECO-\d{6}-\d{4}$/', $numero)) falhar(400, 'número de pedido inválido');

    $c = is_array($d['cliente'] ?? null) ? $d['cliente'] : [];
    $nome     = $txt($c['nome'] ?? '', 150);
    $email    = mb_strtolower($txt($c['email'] ?? '', 150));
    $telefone = $txt(preg_replace('/[^\d+]/', '', (string)($c['telefone'] ?? '')), 15);
    $nif      = mb_strtoupper($txt($c['nif'] ?? '', 20));
    $morada   = $txt($c['morada'] ?? '', 255);
    $tipo     = (($c['tipo'] ?? '') === 'Empresa') ? 'empresa' : 'particular';
    if (mb_strlen($nome) < 2) falhar(400, 'nome do cliente em falta');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $email = '';
    if ($email === '' && strlen(preg_replace('/\D/', '', $telefone)) < 9) falhar(400, 'contacto do cliente em falta');

    $itens = [];
    foreach (array_slice(is_array($d['itens'] ?? null) ? $d['itens'] : [], 0, 30) as $i) {
        if (!is_array($i)) continue;
        $desc = $txt($i['descricao'] ?? '', 200);
        if ($desc === '') continue;
        $anos = max(1, min((int)($i['anos'] ?? 1), 10));
        $itens[] = ['codigo' => $txt($i['codigo'] ?? 'item', 80) ?: 'item', 'nome' => $desc, 'valor' => $kz($i['valor'] ?? 0), 'anos' => $anos];
    }
    if (!$itens) falhar(400, 'pedido sem itens');

    $subtotal = $kz($d['subtotal'] ?? 0) ?: array_sum(array_column($itens, 'valor'));
    $total    = $kz($d['total'] ?? 0) ?: $subtotal;
    $iva      = array_key_exists('iva', $d) ? $kz($d['iva']) : max(0, $total - $subtotal);

    $m = (string)($d['metodo'] ?? '');
    $metodoBD = preg_match('/multicaixa|express|mcx/i', $m) ? 'mcx' : (preg_match('/transfer/i', $m) ? 'trf' : 'ref');

    try {
        $pdo->beginTransaction();

        /* pedido repetido (o site e o agente podem enviar o mesmo número) → não duplica */
        $q = $pdo->prepare('SELECT id, cliente_id FROM encomendas WHERE numero = ? FOR UPDATE');
        $q->execute([$numero]);
        if ($ja = $q->fetch()) {
            $pdo->commit();
            responder(200, ['ok' => true, 'repetido' => true, 'encomenda_id' => (int)$ja['id'], 'cliente_id' => (int)$ja['cliente_id']]);
        }

        /* cliente: procura pelo e-mail; sem e-mail, pelo telefone */
        if ($email !== '') { $q = $pdo->prepare('SELECT id FROM clientes WHERE email = ? ORDER BY id LIMIT 1'); $q->execute([$email]); }
        else               { $q = $pdo->prepare("SELECT id FROM clientes WHERE email = '' AND telefone = ? ORDER BY id LIMIT 1"); $q->execute([$telefone]); }
        $clienteId = $q->fetchColumn();
        if ($clienteId) {
            /* completa dados em falta, sem apagar o que já existe */
            $pdo->prepare("UPDATE clientes SET
                    nif = IF(? <> '' AND (nif = '' OR nif = 'Consumidor final'), ?, nif),
                    morada = IF(? <> '' AND (morada IS NULL OR morada = ''), ?, morada),
                    telefone = IF(? <> '' AND telefone = '', ?, telefone)
                WHERE id = ?")->execute([$nif, $nif, $morada, $morada, $telefone, $telefone, $clienteId]);
        } else {
            $pdo->prepare('INSERT INTO clientes (tipo, nif, nome, email, telefone, morada) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$tipo, $nif !== '' ? $nif : 'Consumidor final', $nome, $email, $telefone, $morada !== '' ? $morada : null]);
            $clienteId = $pdo->lastInsertId();
        }

        $pdo->prepare('INSERT INTO encomendas (numero, cliente_id, metodo, subtotal, iva, total, estado) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$numero, $clienteId, $metodoBD, $subtotal, $iva, $total, 'pendente']);
        $encomendaId = $pdo->lastInsertId();

        $ins = $pdo->prepare('INSERT INTO encomenda_itens (encomenda_id, plano_id, codigo, nome, preco_unit, recorrente, anos, periodo, total_linha) VALUES (?, NULL, ?, ?, ?, 0, ?, NULL, ?)');
        foreach ($itens as $i) {
            $ins->execute([$encomendaId, $i['codigo'], $i['nome'], intdiv($i['valor'], $i['anos']), $i['anos'], $i['valor']]);
        }

        $pdo->commit();
        responder(200, ['ok' => true, 'encomenda_id' => (int)$encomendaId, 'cliente_id' => (int)$clienteId]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('[api-bd] pedido ' . $numero . ': ' . $e->getMessage());
        falhar(500, 'erro ao gravar o pedido');
    }
}

falhar(404, 'acção desconhecida');
