# Herramienta SOLO de desarrollo local. Detecta la IP LAN de esta PC (donde
# sea que estés: universidad, casa, oficina) y actualiza mobile/.env para que
# el celular (en la misma Wi-Fi) encuentre el backend local.
#
# En producción el app NO usa esto — apunta directo a https://dominiowisp.com/api
# (el valor por defecto de api.ts cuando no hay EXPO_PUBLIC_API_URL). Esta
# carpeta scripts/ se puede borrar sin tocar nada del resto del proyecto.
#
# Uso: parado en cada lugar nuevo, antes de "npx expo start":
#   .\scripts\set-api-url.ps1

$candidato = Get-NetIPConfiguration | Where-Object {
    $_.IPv4DefaultGateway -and
    $_.InterfaceAlias -match '^(Wi-Fi|Ethernet)' -and
    $_.IPv4Address.IPAddress -notmatch '^169\.254\.'
} | Select-Object -First 1

if (-not $candidato) {
    Write-Host "No se encontro una red Wi-Fi/Ethernet activa con salida a internet." -ForegroundColor Red
    Write-Host "Conectate a una red y vuelve a correr este script." -ForegroundColor Red
    exit 1
}

$ip = $candidato.IPv4Address.IPAddress
$envPath = Join-Path $PSScriptRoot "..\.env"

"EXPO_PUBLIC_API_URL=http://${ip}:8000/api" | Out-File -FilePath $envPath -Encoding ascii

Write-Host "mobile/.env actualizado -> http://${ip}:8000/api" -ForegroundColor Green
Write-Host "Reinicia el servidor de Expo (Ctrl+C y 'npx expo start') para que tome el cambio." -ForegroundColor Yellow
