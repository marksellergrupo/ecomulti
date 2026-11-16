# Cria um .zip com caminhos "/" (compatível com Linux/cPanel). O Compress-Archive do PowerShell 5.1 usa "\".
# Uso: powershell -File ferramentas/zip.ps1 -Origem <pasta> -Destino <ficheiro.zip> [-IncluirPasta]
param([Parameter(Mandatory)][string]$Origem, [Parameter(Mandatory)][string]$Destino, [switch]$IncluirPasta)
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$Origem = (Resolve-Path $Origem).Path.TrimEnd('\')
$base = if ($IncluirPasta) { Split-Path $Origem -Parent } else { $Origem }
if (Test-Path $Destino) { Remove-Item $Destino -Force }
$zip = [System.IO.Compression.ZipFile]::Open($Destino, 'Create')
try {
  Get-ChildItem -Path $Origem -Recurse -File -Force | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length + 1).Replace('\', '/')
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, 'Optimal')
  }
} finally { $zip.Dispose() }
