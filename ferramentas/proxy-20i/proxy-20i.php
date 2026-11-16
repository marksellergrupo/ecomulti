<?php
/* Proxy da API de revenda da 20i para a ECOMULTI (vai na hospedagem da AngoWeb).

   Porquê: a 20i só aceita pedidos de IPs autorizados. Este ficheiro corre na AngoWeb (IP autorizado)
   e guarda a chave da 20i; o servidor Node chama-o com um segredo partilhado e ele
   reencaminha-os para https://api.20i.com com a chave da 20i, que só existe aqui.

   Segurança:
   • só aceita pedidos com o cabeçalho X-Proxy-Chave correcto;
   • só deixa passar os endereços da lista PERMITIDOS (hoje: só consultas);
   • a chave da 20i e a do proxy ficam em config-20i.php, FORA da pasta pública.

   Uso pelo servidor: https://SEU-DOMINIO/proxy-20i.php?p=/domain-search/exemplo.com
   Diagnóstico:       https://SEU-DOMINIO/proxy-20i.php?p=/ip  (com X-Proxy-Chave) → IP de saída a autorizar na 20i */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

function responder($estado, $mensagem) {
    http_response_code($estado);
    echo json_encode(['error' => ['message' => 'proxy: ' . $mensagem]], JSON_UNESCAPED_UNICODE);
    exit;
}

/* config-20i.php fica uma pasta acima de public_html, por exemplo /home/utilizador/config-20i.php */
$ficheiroConfig = dirname(__DIR__) . '/config-20i.php';
if (!is_file($ficheiroConfig)) responder(500, 'falta config-20i.php fora da pasta pública');
$config = require $ficheiroConfig;
$chave20i   = trim($config['chave_20i'] ?? '');
$chaveProxy = trim($config['chave_proxy'] ?? '');
if ($chave20i === '' || strlen($chaveProxy) < 24) responder(500, 'config-20i.php incompleto (chave_proxy precisa de 24+ caracteres)');

$recebida = $_SERVER['HTTP_X_PROXY_CHAVE'] ?? '';
if (!is_string($recebida) || !hash_equals($chaveProxy, $recebida)) { usleep(500000); responder(403, 'acesso negado'); }

$caminho = '/' . ltrim((string)($_GET['p'] ?? ''), '/');
$metodo  = $_SERVER['REQUEST_METHOD'];

function pedir($url, $cabecalhos = [], $metodo = 'GET', $corpo = null) {
    $c = curl_init($url);
    curl_setopt_array($c, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_CUSTOMREQUEST  => $metodo,
        CURLOPT_HTTPHEADER     => $cabecalhos,
    ]);
    if ($corpo !== null && $corpo !== '') curl_setopt($c, CURLOPT_POSTFIELDS, $corpo);
    $resposta = curl_exec($c);
    $estado   = curl_getinfo($c, CURLINFO_HTTP_CODE);
    $erro     = curl_error($c);
    curl_close($c);
    return [$estado, $resposta, $erro];
}

/* Diagnóstico: mostra o IP com que este servidor sai para a internet */
if ($caminho === '/ip') {
    [$estado, $ip, $erro] = pedir('https://api.ipify.org');
    if ($estado !== 200) responder(502, 'não foi possível obter o IP: ' . $erro);
    echo json_encode(['ip_de_saida' => trim($ip)]);
    exit;
}

/* Lista de endereços autorizados (método + expressão). Tudo o resto é recusado:
   apagar pacotes ou registar domínios NÃO passa por aqui. */
const PERMITIDOS = [
    ['GET',  '#^/reseller$#'],
    ['GET',  '#^/domain-search/[a-z0-9.-]{1,253}$#i'],
    ['GET',  '#^/reseller/\*/packageTypes$#'],   // tipos de pacote (para o painel escolher)
    ['POST', '#^/reseller/\*/addWeb$#'],         // criar alojamento ("Activar na 20i" no painel)
];
$autorizado = false;
foreach (PERMITIDOS as [$m, $padrao]) {
    if ($metodo === $m && preg_match($padrao, $caminho)) { $autorizado = true; break; }
}
if (!$autorizado) responder(404, 'endereço não permitido: ' . $metodo . ' ' . $caminho);

$cabecalhos = ['Authorization: Bearer ' . base64_encode($chave20i), 'Accept: application/json'];
$corpo = null;
if ($metodo !== 'GET') { $corpo = file_get_contents('php://input'); $cabecalhos[] = 'Content-Type: application/json'; }

$url20i = rtrim($config['url_20i'] ?? 'https://api.20i.com', '/');   // url_20i só se usa nos testes
[$estado, $resposta, $erro] = pedir($url20i . $caminho, $cabecalhos, $metodo, $corpo);
if ($estado === 0) responder(502, 'sem resposta da 20i: ' . $erro);
http_response_code($estado);
echo $resposta;
