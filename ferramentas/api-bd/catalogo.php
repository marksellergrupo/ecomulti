<?php
/* Preços do site lidos da base de dados (tabela regras_preco), em JavaScript.
   Vai em public_html/api/catalogo.php — as páginas carregam-no com <script src="api/catalogo.php">.
   Define window.precoDe(chave). Se a base de dados falhar, não define nada e o site usa os
   preços do assets/js/config.js (o app.js também ignora valores absurdos).
   Usa o mesmo config-bd.php da api-bd.php (fora da pasta pública). */

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('X-Robots-Tag: noindex');

function sair($motivo) { echo "/* catálogo indisponível ($motivo): o site usa os preços do config.js */\n"; exit; }

$ficheiroConfig = dirname(__DIR__, 2) . '/config-bd.php';   // public_html/api/ → duas pastas acima
if (!is_file($ficheiroConfig)) sair('sem config-bd.php');
$config = require $ficheiroConfig;

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $config['host'] ?? 'localhost', (int)($config['porta'] ?? 3306), $config['base'] ?? ''),
        $config['utilizador'] ?? '', $config['senha'] ?? '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    $linhas = $pdo->query('SELECT chave, valor, unidade FROM regras_preco')->fetchAll();
} catch (Throwable $e) {
    error_log('[catalogo] ' . $e->getMessage());
    sair('erro na base de dados');
}
if (!$linhas) sair('tabela vazia');

$valores = []; $unidades = [];
foreach ($linhas as $l) {
    if (!preg_match('/^[a-z0-9._-]{1,60}$/i', $l['chave'])) continue;
    $valores[$l['chave']] = (int)$l['valor'];
    $unidades[$l['chave']] = $l['unidade'];
}
$jsValores = json_encode($valores, JSON_UNESCAPED_UNICODE);
$jsUnidades = json_encode($unidades, JSON_UNESCAPED_UNICODE);
?>
(function () {
  "use strict";
  var valores = <?= $jsValores ?>;
  var unidades = <?= $jsUnidades ?>;
  window.precoDe = function (chave) {
    if (!(chave in valores)) throw new Error("Preço desconhecido: " + chave);
    return valores[chave];
  };
  window.precoUnidade = function (chave) { return unidades[chave]; };
})();
