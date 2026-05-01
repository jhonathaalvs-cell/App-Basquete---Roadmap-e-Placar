$src = Join-Path $PSScriptRoot "estilos\liga.css"
$dir = Join-Path $PSScriptRoot "estilos\liga"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$f   = [System.IO.File]::ReadAllLines($src)
$enc = New-Object System.Text.UTF8Encoding $false

# base.css (1-1248) — reset, layout, cards, modais, draft, calendário base
[System.IO.File]::WriteAllLines("$dir\base.css", $f[0..1247], $enc)
Write-Host "base.css: 1248 linhas"

# calendario.css — 2a ocorrência de EDICAO (1355-1490) + 2a de ABA TIMES (1566-1660)
$cal = $f[1354..1489] + $f[1565..1659]
[System.IO.File]::WriteAllLines("$dir\calendario.css", $cal, $enc)
Write-Host "calendario.css: $($cal.Count) linhas"

# vjc.css (1661-2095) — view jogador + classificação
[System.IO.File]::WriteAllLines("$dir\vjc.css", $f[1660..2094], $enc)
Write-Host "vjc.css: 435 linhas"

# playoffs.css (2096-2472) — bracket admin + view jogador
[System.IO.File]::WriteAllLines("$dir\playoffs.css", $f[2095..2471], $enc)
Write-Host "playoffs.css: 377 linhas"

# responsivo.css (2473-fim) — media queries
[System.IO.File]::WriteAllLines("$dir\responsivo.css", $f[2472..($f.Count-1)], $enc)
Write-Host "responsivo.css: $($f.Count-2472) linhas"

Write-Host "`nTodos os arquivos criados com sucesso!"
