<?php
/* Copie este ficheiro para config-bd.php e coloque-o UMA PASTA ACIMA de public_html
   (ao lado do config-20i.php), nunca dentro da pasta pública.
   Não envie o config-bd.php preenchido para o Git. */
return [
    // Dados do MySQL (cPanel → Bases de dados MySQL). Na AngoWeb o host é normalmente "localhost".
    'host'       => 'localhost',
    'porta'      => 3306,                 // no XAMPP deste computador é 3900
    'base'       => 'ecomulti_ecomulti',
    'utilizador' => 'COLE-AQUI-O-UTILIZADOR-MYSQL',
    'senha'      => 'COLE-AQUI-A-SENHA-MYSQL',
    // Segredo partilhado com o servidor Node (variável BD_CHAVE). 24+ caracteres aleatórios,
    // diferente do segredo do proxy da 20i.
    'chave_api'  => 'COLE-AQUI-UM-SEGREDO-LONGO-E-ALEATORIO',
];
