# Run in PowerShell **as Administrator** to allow Expo Go LAN connections on Windows.
# Default Metro port for this project is 8081 (see scripts/start-expo.mjs).
foreach ($port in @(8081, 8082, 8083)) {
  $ruleName = "Expo Metro $port"
  netsh advfirewall firewall delete rule name="$ruleName" | Out-Null
  netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$port profile=private
  Write-Host "Firewall rule added for TCP port $port (private networks)."
}
