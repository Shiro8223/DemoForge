# Runs DemoForge (production web on :3000 + generation worker) as a background
# Windows service: a per-user Scheduled Task that starts at logon, no window.
#
#   npm run service:install     build, register and start
#   npm run service:uninstall   stop and remove
#   powershell -File scripts/service.ps1 start|stop|restart|status
#
# Output goes to outputs/service.log.
param([ValidateSet("install", "uninstall", "start", "stop", "restart", "status")][string]$Action = "status")

$ErrorActionPreference = "Stop"
$TaskName = "DemoForge"
$Root = Split-Path -Parent $PSScriptRoot
$Log = Join-Path $Root "outputs\service.log"

function Stop-DemoForge {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $TaskName }
  # Stopping the task does not reliably end its node children, so end anything started from this project.
  $pattern = [regex]::Escape($Root)
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match $pattern -and $_.CommandLine -notmatch "next dev|next-dev" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Show-Status {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) { "Not installed. Run: npm run service:install"; return }
  "Task: $($task.State)"
  try { "Health: " + (Invoke-RestMethod http://localhost:3000/api/health -TimeoutSec 5 | ConvertTo-Json -Compress) }
  catch { "Health: web not responding on :3000 (see $Log)" }
}

switch ($Action) {
  "install" {
    # A running server would keep serving the old build, and the rebuild breaks it underneath.
    Stop-DemoForge
    Push-Location $Root
    # Windows PowerShell turns native stderr into errors, which "Stop" would make fatal.
    $ErrorActionPreference = "Continue"
    try {
      npm run build
      if ($LASTEXITCODE -ne 0) { throw "next build failed" }
    } finally { Pop-Location; $ErrorActionPreference = "Stop" }
    New-Item -ItemType Directory -Force (Split-Path $Log) | Out-Null
    # conhost --headless keeps the console hidden; cmd handles the log redirection.
    $taskAction = New-ScheduledTaskAction -Execute "conhost.exe" -WorkingDirectory $Root `
      -Argument "--headless cmd.exe /c npm run start:all > `"$Log`" 2>&1"
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $trigger -Settings $settings `
      -Description "DemoForge web (:3000) + generation worker" -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    "Installed and started. Open http://localhost:3000 (logs: $Log)"
  }
  "uninstall" {
    Stop-DemoForge
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    "Removed."
  }
  "start" { Start-ScheduledTask -TaskName $TaskName; "Started." }
  "stop" { Stop-DemoForge; "Stopped." }
  "restart" { Stop-DemoForge; Start-ScheduledTask -TaskName $TaskName; "Restarted." }
  "status" { Show-Status }
}
