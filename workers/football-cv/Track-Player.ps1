<#
  ScoutX player tracking - one click.

  Right-click -> "Run with PowerShell", or:
    powershell -ExecutionPolicy Bypass -File .\Track-Player.ps1
    powershell -ExecutionPolicy Bypass -File .\Track-Player.ps1 -Video "C:\match.MOV" -Number 20 -Kit orange -Kit2 white

  First run installs everything into %LOCALAPPDATA%\ScoutX\tracker-venv (one-off, a few GB).
  A 90-minute match takes roughly 1.5-3 h on a laptop CPU (much faster with an NVIDIA GPU).
  Re-running on the same video skips work that is already done.
#>
param(
  [string]$Video,
  [string]$Number,
  [string]$Kit,
  [string]$Kit2 = "",
  [string]$Position = "",
  [string]$AgeGroup = "",
  [int]$Workers = 2
)

$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = Join-Path $env:LOCALAPPDATA "ScoutX\tracker-venv"
$Py = Join-Path $Venv "Scripts\python.exe"

function Say($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }

# 1. ffmpeg
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Say "ffmpeg is needed to read phone videos. Installing it with winget..."
  winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw "ffmpeg not found - please install it (winget install Gyan.FFmpeg) and re-run." }
}

# 2. Python environment (once)
if (-not (Test-Path $Py)) {
  Say "First run: setting up the tracking engine (one-off)..."
  py -3.12 -m venv $Venv
  & $Py -m pip install --upgrade pip
  & $Py -m pip install -r (Join-Path $Here "requirements-tracker.txt")
}

# 3. What to track
if (-not $Video) {
  Add-Type -AssemblyName System.Windows.Forms
  $dlg = New-Object System.Windows.Forms.OpenFileDialog
  $dlg.Title = "Choose the match video"
  $dlg.Filter = "Videos|*.mov;*.mp4;*.m4v;*.avi;*.mkv|All files|*.*"
  if ($dlg.ShowDialog() -ne "OK") { exit 1 }
  $Video = $dlg.FileName
}
if (-not $Number) { $Number = Read-Host "Shirt number of the player (e.g. 20)" }
if (-not $Kit)    { $Kit    = Read-Host "Main shirt colour (e.g. orange, red, blue, white, black, yellow, green, sky blue, navy)" }
if (-not $PSBoundParameters.ContainsKey("Kit2")) { $Kit2 = Read-Host "Second kit colour, e.g. sleeves (optional - press Enter to skip)" }
if (-not $Position) { $Position = Read-Host "Position: goalkeeper, centre_back, full_back, defensive_midfielder, midfielder, winger, striker (Enter = unknown)" }
if (-not $Position) { $Position = "unknown" }
if (-not $AgeGroup) { $AgeGroup = Read-Host "Age group for speed thresholds, e.g. u14, u17, adult (Enter = adult)" }

$Out = [System.IO.Path]::Combine([System.IO.Path]::GetDirectoryName($Video), [System.IO.Path]::GetFileNameWithoutExtension($Video) + "_scoutx")

# 4. Track
Say "Tracking #$Number ($Kit) in $(Split-Path -Leaf $Video). You can leave this running."
Push-Location $Here
try {
  & $Py -m scoutx_tracker track "$Video" --number $Number --kit $Kit --kit2 "$Kit2" --position $Position --age-group "$AgeGroup" --workers $Workers --out "$Out"
  if ($LASTEXITCODE -ne 0) { throw "tracking failed" }
  Start-Process (Join-Path $Out "report.html")

  # 5. Optional review loop: "is this your player?"
  while ($true) {
    Say "The report shows up to 8 numbered 'Is this you?' pictures under 'Help the AI'."
    $ans = Read-Host "Answer like '1y 2n 3u 4s' (y = me, n = not me, u = unsure, s = skip; 'undo' to undo; Enter to finish)"
    if (-not $ans.Trim()) {
      Say "Finishing: refreshing the highlights video with your answers..."
      & $Py -m scoutx_tracker render "$Out"
      Start-Process (Join-Path $Out "report.html")
      break
    }
    if ($ans.Trim() -eq "undo") { & $Py -m scoutx_tracker undo "$Out" }
    else { & $Py -m scoutx_tracker answer "$Out" $ans.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries) }
    Start-Process (Join-Path $Out "report.html")
  }
} finally { Pop-Location }
Say "Done. Report, highlight video and stats (result.json) are in $Out"
