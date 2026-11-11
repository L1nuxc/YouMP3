$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
Set-Location -LiteralPath $workspace
New-Item -ItemType Directory -Force build | Out-Null
$buildRoot = (Resolve-Path -LiteralPath build).Path
$sourceStage = Join-Path $buildRoot ('source-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $sourceStage | Out-Null
$rootFiles = @('server.mjs','package.json','package-lock.json','setup.ps1','start.cmd','.gitignore','.prettierrc.json','.prettierignore','LICENSE','README.md','DISTRIBUTION.md','THIRD-PARTY-NOTICES.md')
$allowed = '^(desktop/[a-zA-Z0-9.-]+\.(cjs|svg|png|ico)|public/[a-zA-Z0-9.-]+\.(js|css|html|svg)|src/[a-zA-Z0-9.-]+\.(mjs|cjs)|test/[a-zA-Z0-9.-]+\.mjs|search-plugins/yoump3/yt_dlp_plugins/extractor/[a-zA-Z0-9_-]+\.py|\.github/workflows/release\.yml|scripts/(smoke\.mjs|check-search\.mjs|package-source\.ps1|check-ui\.cjs))$'
$candidates = @($rootFiles | Where-Object { Test-Path -LiteralPath (Join-Path $workspace $_) -PathType Leaf })
foreach ($directory in @('desktop','public','src','test','search-plugins','.github/workflows','scripts')) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $workspace $directory) -File -Recurse) {
        $relative = $file.FullName.Substring($workspace.Length + 1).Replace('\','/')
        if ($relative -match $allowed) { $candidates += $relative }
    }
}
try {
    foreach ($relative in $candidates | Sort-Object -Unique) {
        $source = [IO.Path]::GetFullPath((Join-Path $workspace $relative))
        if (-not $source.StartsWith($workspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected source path' }
        $destination = Join-Path $sourceStage $relative
        New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination
    }
    Compress-Archive -Path (Join-Path $sourceStage '*') -DestinationPath (Join-Path $buildRoot 'YouMP3-source.zip') -Force
    Write-Host 'Source archive ready: build/YouMP3-source.zip'
} finally {
    $resolvedStage = [IO.Path]::GetFullPath($sourceStage)
    if (-not $resolvedStage.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected staging path' }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}
