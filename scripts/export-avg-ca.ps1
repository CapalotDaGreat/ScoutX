# Exports the AVG Web/Mail Shield root CA from the Windows certificate store.
# Required because Node.js does not trust Windows-installed antivirus SSL inspection roots by default.

$thumbprint = '7FA8DF612087C5A634CC1600E788CBD08B1F2023'
$cert = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Thumbprint -eq $thumbprint }

if (-not $cert) {
  Write-Error 'AVG Web/Mail Shield Root certificate was not found in Cert:\LocalMachine\Root.'
  exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $projectRoot 'certs\avg-web-mail-shield-root.pem'
New-Item -ItemType Directory -Force -Path (Split-Path $outputPath) | Out-Null

$bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$b64 = [Convert]::ToBase64String($bytes)
$lines = [System.Text.RegularExpressions.Regex]::Split($b64, '(.{64})') | Where-Object { $_ -ne '' }
$pem = @('-----BEGIN CERTIFICATE-----') + $lines + @('-----END CERTIFICATE-----') -join "`n"

Set-Content -Path $outputPath -Value $pem -Encoding ascii
Write-Host "Exported certificate to $outputPath"
