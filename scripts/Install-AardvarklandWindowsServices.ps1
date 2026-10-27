[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateSet('Install', 'Uninstall', 'Restart', 'Status')]
  [string]$Action = 'Status',
  [string]$WinSwPath = '.\service\winsw.exe',
  [string]$EnvironmentFile = '.\backend\.env.production',
  [string]$PrintAgentConfig = '.\print-agent\print-agent.config.json',
  [string]$ServiceDirectory = '.\service\installed',
  [switch]$IncludePrintAgent
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Resolve-ProjectPath {
  param([string]$Path)
  if ([IO.Path]::IsPathRooted($Path)) { return $Path }
  return Join-Path $root $Path
}

$winSw = Resolve-ProjectPath $WinSwPath
$environment = Resolve-ProjectPath $EnvironmentFile
$serviceRoot = Resolve-ProjectPath $ServiceDirectory
$logs = Join-Path $root 'logs\services'
$node = (Get-Command node -ErrorAction Stop).Source

$definitions = @(
  [pscustomobject]@{ Id = 'AardvarklandWmsBackend'; Name = 'Aardvarkland WMS Backend'; WorkDir = (Join-Path $root 'backend'); Arguments = 'dist/main.js'; Dependencies = @() },
  [pscustomobject]@{ Id = 'AardvarklandWmsQueueWorker'; Name = 'Aardvarkland WMS Queue Worker'; WorkDir = (Join-Path $root 'backend'); Arguments = 'dist/queue-worker.main.js'; Dependencies = @('AardvarklandWmsBackend') },
  [pscustomobject]@{ Id = 'AardvarklandWmsFrontend'; Name = 'Aardvarkland WMS Frontend'; WorkDir = (Join-Path $root 'frontend'); Arguments = 'server.js'; Dependencies = @('AardvarklandWmsBackend') }
)
if ($IncludePrintAgent) {
  $definitions += [pscustomobject]@{ Id = 'AardvarklandWmsPrintAgent'; Name = 'Aardvarkland WMS Print Agent'; WorkDir = (Join-Path $root 'print-agent'); Arguments = 'agent.mjs'; Dependencies = @('AardvarklandWmsBackend') }
}

function Invoke-WinSw {
  param([string]$Executable, [string]$Verb)
  & $Executable $Verb
  if ($LASTEXITCODE -ne 0) { throw "$Executable $Verb failed with exit code $LASTEXITCODE." }
}

function Get-EnvironmentEntries {
  $entries = [ordered]@{}
  foreach ($line in Get-Content -LiteralPath $environment) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#') -or $trimmed -notmatch '=') { continue }
    $parts = $trimmed.Split('=', 2)
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $entries[$name] = $value
  }
  return $entries
}

function ConvertTo-XmlText {
  param([string]$Value)
  return [Security.SecurityElement]::Escape($Value)
}

function New-ServiceXml {
  param($Definition, [string]$ExecutablePath)
  $dependencyXml = ($Definition.Dependencies | ForEach-Object { "<depend>$_</depend>" }) -join ''
  $serviceEnvironment = Get-EnvironmentEntries
  if ($Definition.Id -eq 'AardvarklandWmsFrontend') {
    $serviceEnvironment['PORT'] = '4000'
    $serviceEnvironment['NODE_ENV'] = 'production'
  }
  if ($Definition.Id -eq 'AardvarklandWmsPrintAgent') {
    $config = Resolve-ProjectPath $PrintAgentConfig
    if (-not (Test-Path -LiteralPath $config)) { throw "Print Agent configuration was not found: $config" }
    $serviceEnvironment['AARD_PRINT_AGENT_CONFIG'] = $config
  }
  $envXml = ($serviceEnvironment.GetEnumerator() | ForEach-Object {
    "<env name=`"$(ConvertTo-XmlText ([string]$_.Key))`" value=`"$(ConvertTo-XmlText ([string]$_.Value))`" />"
  }) -join [Environment]::NewLine
  @"
<service>
  <id>$($Definition.Id)</id>
  <name>$($Definition.Name)</name>
  <description>Managed Aardvarkland warehouse runtime service.</description>
  <executable>$node</executable>
  <arguments>$($Definition.Arguments)</arguments>
  <workingdirectory>$($Definition.WorkDir)</workingdirectory>
  $envXml
  $dependencyXml
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <onfailure action="restart" delay="60 sec" />
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>30 sec</stoptimeout>
  <logpath>$logs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10485760</sizeThreshold>
    <keepFiles>10</keepFiles>
  </log>
</service>
"@ | Set-Content -LiteralPath ([IO.Path]::ChangeExtension($ExecutablePath, '.xml')) -Encoding utf8
}

if ($Action -in @('Install', 'Uninstall', 'Restart')) {
  if (-not (Test-Path -LiteralPath $winSw)) { throw "WinSW executable was not found: $winSw" }
  if (-not (Test-Path -LiteralPath $environment)) { throw "Production environment file was not found: $environment" }
}

New-Item -ItemType Directory -Force -Path $serviceRoot, $logs | Out-Null
foreach ($definition in $definitions) {
  $exe = Join-Path $serviceRoot "$($definition.Id).exe"
  if ($Action -eq 'Install') {
    if ($PSCmdlet.ShouldProcess($definition.Name, 'Install Windows service')) {
      Copy-Item -LiteralPath $winSw -Destination $exe -Force
      New-ServiceXml -Definition $definition -ExecutablePath $exe
      Invoke-WinSw $exe 'install'
      Invoke-WinSw $exe 'start'
    }
  } elseif ($Action -eq 'Uninstall') {
    if ((Test-Path $exe) -and $PSCmdlet.ShouldProcess($definition.Name, 'Uninstall Windows service')) {
      try { Invoke-WinSw $exe 'stop' } catch { Write-Warning $_.Exception.Message }
      Invoke-WinSw $exe 'uninstall'
    }
  } elseif ($Action -eq 'Restart') {
    if ((Test-Path $exe) -and $PSCmdlet.ShouldProcess($definition.Name, 'Restart Windows service')) {
      Invoke-WinSw $exe 'restart'
    }
  } else {
    $service = Get-Service -Name $definition.Id -ErrorAction SilentlyContinue
    [pscustomobject]@{
      id = $definition.Id
      installed = $null -ne $service
      status = if ($service) { $service.Status.ToString() } else { 'NotInstalled' }
    }
  }
}
