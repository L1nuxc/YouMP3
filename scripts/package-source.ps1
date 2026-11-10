$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force build | Out-Null
$sourceStage = Join-Path (Resolve-Path build).Path ('source-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $sourceStage | Out-Null
$sourcePaths = @('docs', 'desktop', 'src', 'public', 'test', 'search-plugins', '.github', 'server.mjs', 'package.json', 'package-lock.json', 'setup.ps1', 'start.cmd', '.gitignore', 'LICENSE', 'README.md', 'ROADMAP.md', 'DISTRIBUTION.md', 'THIRD-PARTY-NOTICES.md', 'CHANGELOG.md')
foreach ($sourcePath in $sourcePaths) { Copy-Item -LiteralPath $sourcePath -Destination $sourceStage -Recurse }
New-Item -ItemType Directory -Path (Join-Path $sourceStage 'scripts') | Out-Null
foreach ($scriptFile in @('smoke.mjs','check-search.mjs','package-source.ps1','check-ui.cjs')) { Copy-Item -LiteralPath (Join-Path 'scripts' $scriptFile) -Destination (Join-Path $sourceStage 'scripts') }
Compress-Archive -Path (Join-Path $sourceStage '*') -DestinationPath build/YouMP3-source.zip -Force
Write-Host 'Source archive ready: build/YouMP3-source.zip'

$buildRoot = (Resolve-Path build).Path + [IO.Path]::DirectorySeparatorChar
if (-not [IO.Path]::GetFullPath($sourceStage).StartsWith($buildRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected source staging path' }
Remove-Item -LiteralPath $sourceStage -Recurse -Force
