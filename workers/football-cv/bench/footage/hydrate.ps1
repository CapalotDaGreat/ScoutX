<#
PitchProof footage library: make exact iCloud Photos videos available on this PC, in bounded batches.

  powershell -ExecutionPolicy Bypass -File hydrate.ps1 -Action Inventory
      Lists every video with size and cloud/local state from file attributes only (downloads nothing).
  powershell -ExecutionPolicy Bypass -File hydrate.ps1 -Action Pin -Batch batch-01.txt
      Marks the listed files "Always keep on this device" (attrib +P -U) only if, after the batch,
      at least -MinFreeGB stay free; then waits and reports until every file is local or -MaxHours pass.
  powershell -ExecutionPolicy Bypass -File hydrate.ps1 -Action Status -Batch batch-01.txt

Never deletes, moves, renames or evicts anything. Logs to hydrate.log next to this script.
#>
param(
  [ValidateSet('Inventory','Pin','Status')][string]$Action = 'Status',
  [string]$Batch,
  [string]$Photos = (Join-Path $env:USERPROFILE 'iCloudPhotos\Photos'),
  [int]$MinFreeGB = 120,
  [double]$MaxHours = 8
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $here 'hydrate.log'
function Log($m) { $line = "$(Get-Date -Format s) $m"; Add-Content -Path $log -Value $line; Write-Host $line }
function State($f) {
  $a = [int64]$f.Attributes
  $cloud = (($a -band 0x400000) -ne 0) -or (($a -band 0x1000) -ne 0)   # RecallOnDataAccess / Offline
  $pinned = ($a -band 0x80000) -ne 0
  if ($cloud -and $pinned) { 'downloading' } elseif ($cloud) { 'cloud' } else { 'local' }
}
if (-not (Test-Path -LiteralPath $Photos)) { throw "Photos folder not found: $Photos" }
$drive = (Get-Item -LiteralPath $Photos).PSDrive
function FreeGB { [math]::Round((Get-PSDrive $drive.Name).Free / 1GB, 1) }

if ($Action -eq 'Inventory') {
  $out = Join-Path $here 'inventory_windows.csv'
  Get-ChildItem -LiteralPath $Photos -File | Where-Object { $_.Extension -match '^\.(mov|mp4|m4v)$' } |
    ForEach-Object { [pscustomobject]@{ Name = $_.Name; Bytes = $_.Length; LastWriteUtc = $_.LastWriteTimeUtc.ToString('s');
                                        State = (State $_); Attributes = [int64]$_.Attributes } } |
    Export-Csv -NoTypeInformation -Path $out
  Log "inventory written: $out (free $(FreeGB) GB)"
  exit 0
}
if (-not $Batch) { throw '-Batch file required' }
$names = Get-Content -LiteralPath (Resolve-Path $Batch) | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() }
$files = foreach ($n in $names) {
  $p = Join-Path $Photos $n
  if (-not (Test-Path -LiteralPath $p)) { Log "MISSING $n"; continue }
  Get-Item -LiteralPath $p
}
if ($Action -eq 'Pin') {
  $need = ($files | Where-Object { (State $_) -ne 'local' } | Measure-Object Length -Sum).Sum / 1GB
  $free = FreeGB
  Log "batch $Batch: $($files.Count) files, $([math]::Round($need,1)) GB to download, free $free GB, floor $MinFreeGB GB"
  if ($free - $need -lt $MinFreeGB) { Log 'STOP: batch would go below the free-space floor; nothing pinned'; exit 2 }
  foreach ($f in $files) { attrib +P -U $f.FullName | Out-Null; Log "pinned $($f.Name)" }
}
$deadline = (Get-Date).AddHours($MaxHours)
do {
  $states = foreach ($f in $files) { $g = Get-Item -LiteralPath $f.FullName; [pscustomobject]@{ Name = $g.Name; State = (State $g) } }
  $left = @($states | Where-Object { $_.State -ne 'local' })
  Log "local $($files.Count - $left.Count)/$($files.Count); waiting: $(($left | ForEach-Object Name) -join ', '); free $(FreeGB) GB"
  if ($Action -eq 'Status' -or $left.Count -eq 0) { break }
  Start-Sleep -Seconds 60
} while ((Get-Date) -lt $deadline)
if ($left.Count) { Log "NOT COMPLETE: $($left.Count) file(s) still in the cloud"; exit 1 }
Log 'batch complete: all files local (still verify readability and hashes in the VM)'
