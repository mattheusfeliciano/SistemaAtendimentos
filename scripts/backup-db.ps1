param(
  [string]$OutputFile = "backup-$(Get-Date -Format yyyyMMdd-HHmmss).sql"
)

$container = "dash_postgres"
$db = "dash_educacao"
$user = "postgres"

Write-Host "Gerando backup do banco $db no arquivo $OutputFile ..."
docker exec $container pg_dump -U $user -d $db -F p | Out-File -FilePath $OutputFile -Encoding utf8
Write-Host "Backup concluído: $OutputFile"
