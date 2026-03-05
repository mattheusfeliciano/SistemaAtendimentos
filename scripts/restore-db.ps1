param(
  [Parameter(Mandatory = $true)]
  [string]$InputFile
)

if (!(Test-Path $InputFile)) {
  Write-Error "Arquivo não encontrado: $InputFile"
  exit 1
}

$container = "dash_postgres"
$db = "dash_educacao"
$user = "postgres"

Write-Host "Restaurando backup $InputFile em $db ..."
Get-Content $InputFile -Raw | docker exec -i $container psql -U $user -d $db
Write-Host "Restauração concluída."
