param(
    [string]$Gcloud = 'gcloud',
    [string]$Project = 'scoutx-230b0',
    [Parameter(Mandatory = $true)][string]$OutDirectory
)

# Read-only: no authentication changes, API enables, uploads or resource creation.
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $OutDirectory) { throw 'Use a new output directory.' }
$accountsJson = & $Gcloud auth list --format=json
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect CLI authentication.' }
$activeAccounts = @($accountsJson | ConvertFrom-Json | Where-Object { $_.status -eq 'ACTIVE' })
if ($activeAccounts.Count -eq 0 -and -not ($env:CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE -and
    (Test-Path -LiteralPath $env:CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE -PathType Leaf))) {
    throw 'No active gcloud account. Complete gcloud auth login locally, then rerun this read-only inspection.'
}
New-Item -ItemType Directory -Path $OutDirectory | Out-Null
$queries = @(
    @{ Name = 'instances'; Args = @('compute', 'instances', 'list', "--project=$Project", '--format=json') },
    @{ Name = 'disks'; Args = @('compute', 'disks', 'list', "--project=$Project", '--format=json') },
    @{ Name = 'snapshots'; Args = @('compute', 'snapshots', 'list', "--project=$Project", '--format=json') },
    @{ Name = 'buckets'; Args = @('storage', 'buckets', 'list', "--project=$Project", '--format=json') },
    @{ Name = 'operations'; Args = @('compute', 'operations', 'list', "--project=$Project", '--limit=20', '--format=json') },
    @{ Name = 'benchmark-results'; Args = @('storage', 'ls', "gs://$Project-benchmarks/results/", "--project=$Project") },
    @{ Name = 'billing-project'; Args = @('billing', 'projects', 'describe', $Project, '--format=json') }
)
$results = @()
foreach ($query in $queries) {
    $cliArgs = $query.Args
    $content = & $Gcloud @cliArgs 2>&1
    $code = $LASTEXITCODE
    ($content | Out-String) | Set-Content -LiteralPath (Join-Path $OutDirectory "$($query.Name).txt") -Encoding utf8
    $results += @{ query = $query.Name; exitCode = $code; command = @('gcloud') + $cliArgs }
}
@{ project = $Project; timestampUtc = [DateTime]::UtcNow.ToString('o'); queries = $results; readOnly = $true } |
    ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutDirectory 'inspection.json') -Encoding utf8
if ($results.Where({ $_.exitCode -ne 0 }).Count) { exit 2 }
