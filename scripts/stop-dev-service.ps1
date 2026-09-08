param(
  [int]$Port,
  [string]$Label,
  [string]$ProjectDir,
  [string[]]$Patterns = @()
)

$ErrorActionPreference = 'Stop'

$projectPath = $null
if ($ProjectDir) {
  $resolvedProject = Resolve-Path $ProjectDir -ErrorAction SilentlyContinue
  if ($resolvedProject) {
    $projectPath = $resolvedProject.Path
  }
}

function Add-Children {
  param(
    [int]$ParentId,
    [System.Collections.Generic.HashSet[int]]$Ids,
    [object[]]$Processes
  )

  foreach ($child in $Processes | Where-Object { $_.ParentProcessId -eq $ParentId }) {
    if ($Ids.Add([int]$child.ProcessId)) {
      Add-Children -ParentId ([int]$child.ProcessId) -Ids $Ids -Processes $Processes
    }
  }
}

function Get-ProtectedProcessIds {
  param([object[]]$Processes)

  $byId = @{}
  foreach ($process in $Processes) {
    $byId[[int]$process.ProcessId] = $process
  }

  $protected = [System.Collections.Generic.HashSet[int]]::new()
  $processId = [int]$PID
  while ($processId -gt 0 -and $byId.ContainsKey($processId)) {
    if (-not $protected.Add($processId)) {
      break
    }
    $processId = [int]$byId[$processId].ParentProcessId
  }
  return $protected
}

function Get-TargetProcessIds {
  param(
    [object[]]$Processes,
    [System.Collections.Generic.HashSet[int]]$ProtectedIds
  )

  $byId = @{}
  foreach ($process in $Processes) {
    $byId[[int]$process.ProcessId] = $process
  }

  $seedIds = [System.Collections.Generic.HashSet[int]]::new()
  $portOwnerIds = [System.Collections.Generic.HashSet[int]]::new()
  if ($Port -gt 0) {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
      if ($connection.OwningProcess -gt 0) {
        $ownerId = [int]$connection.OwningProcess
        [void]$seedIds.Add($ownerId)
        [void]$portOwnerIds.Add($ownerId)
      }
    }
  }

  foreach ($process in $Processes) {
    $commandLine = [string]$process.CommandLine
    if (-not $commandLine) {
      continue
    }
    if ($projectPath -and -not $commandLine.Contains($projectPath)) {
      continue
    }
    foreach ($pattern in $Patterns) {
      if ($pattern -and $commandLine.Contains($pattern)) {
        [void]$seedIds.Add([int]$process.ProcessId)
        break
      }
    }
  }

  foreach ($ownerId in $portOwnerIds) {
    $parentId = if ($byId.ContainsKey($ownerId)) { [int]$byId[$ownerId].ParentProcessId } else { 0 }
    while ($parentId -gt 0 -and $byId.ContainsKey($parentId) -and -not $ProtectedIds.Contains($parentId)) {
      $parent = $byId[$parentId]
      $parentCommandLine = [string]$parent.CommandLine
      $matchesPattern = $false
      foreach ($pattern in $Patterns) {
        if ($pattern -and $parentCommandLine.Contains($pattern)) {
          $matchesPattern = $true
          break
        }
      }
      if ($matchesPattern) {
        [void]$seedIds.Add($parentId)
      }
      $parentId = [int]$parent.ParentProcessId
    }
  }

  $targetIds = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($seedId in $seedIds) {
    if ($ProtectedIds.Contains($seedId)) {
      continue
    }
    [void]$targetIds.Add($seedId)
    Add-Children -ParentId $seedId -Ids $targetIds -Processes $Processes
  }
  return @($targetIds) | Where-Object { -not $ProtectedIds.Contains([int]$_) }
}

$stoppedAny = $false
$deadline = (Get-Date).AddSeconds(15)
do {
  $allProcesses = @(Get-CimInstance Win32_Process)
  $protectedIds = Get-ProtectedProcessIds -Processes $allProcesses
  $orderedIds = @(Get-TargetProcessIds -Processes $allProcesses -ProtectedIds $protectedIds) |
    Sort-Object -Descending

  foreach ($processId in $orderedIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
      $stoppedAny = $true
      Write-Host ('Stopping ' + $Label + ' process ' + $process.ProcessName + ' PID ' + $processId + '.')
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }

  Start-Sleep -Milliseconds 300
} while ($orderedIds.Count -gt 0 -and (Get-Date) -lt $deadline)

$remainingProcesses = @(Get-CimInstance Win32_Process)
$remainingProtectedIds = Get-ProtectedProcessIds -Processes $remainingProcesses
$remainingIds = @(Get-TargetProcessIds -Processes $remainingProcesses -ProtectedIds $remainingProtectedIds)
if ($remainingIds.Count -gt 0) {
  throw ('Unable to stop all ' + $Label + ' processes. Remaining PIDs: ' + ($remainingIds -join ', '))
}

if (-not $stoppedAny) {
  Write-Host ('No ' + $Label + ' process is running.')
}
