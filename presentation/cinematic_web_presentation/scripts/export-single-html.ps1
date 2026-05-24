param(
  [string]$IndexPath = "index.html",
  [string]$OutputPath = "dist\animated-presentation.html",
  [string]$Title = "",
  [string]$FaviconPath = "",
  [switch]$StartupScreen,
  [string]$StartButtonText = "Start Experience",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Get-MimeType {
  param([string]$Path)

  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".avif" { "image/avif"; break }
    ".css" { "text/css"; break }
    ".gif" { "image/gif"; break }
    ".html" { "text/html"; break }
    ".ico" { "image/x-icon"; break }
    ".jpeg" { "image/jpeg"; break }
    ".jpg" { "image/jpeg"; break }
    ".js" { "text/javascript"; break }
    ".m4v" { "video/mp4"; break }
    ".mp4" { "video/mp4"; break }
    ".png" { "image/png"; break }
    ".svg" { "image/svg+xml"; break }
    ".webm" { "video/webm"; break }
    ".webp" { "image/webp"; break }
    ".woff" { "font/woff"; break }
    ".woff2" { "font/woff2"; break }
    default { "application/octet-stream" }
  }
}

function Convert-FileToDataUri {
  param([string]$Path)

  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  $mime = Get-MimeType -Path $resolvedPath
  $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
  $base64 = [System.Convert]::ToBase64String($bytes)
  "data:$mime;base64,$base64"
}

function Test-IsEmbeddableUrl {
  param([string]$Url)

  if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
  $trimmed = $Url.Trim()
  $decoded = [System.Uri]::UnescapeDataString($trimmed)
  if ($trimmed.StartsWith("#") -or $decoded.StartsWith("#")) { return $false }
  if ($trimmed -match "^(?i)(data:|blob:|http:|https:|mailto:|tel:|javascript:)") { return $false }
  return $true
}

function Resolve-AssetPath {
  param(
    [string]$Url,
    [string]$BaseDir
  )

  $clean = ($Url -split "#", 2)[0]
  $clean = ($clean -split "\?", 2)[0]
  $clean = [System.Uri]::UnescapeDataString($clean)
  $clean = $clean.Replace("/", [System.IO.Path]::DirectorySeparatorChar)

  if ([System.IO.Path]::IsPathRooted($clean)) {
    return $clean
  }

  [System.IO.Path]::GetFullPath((Join-Path $BaseDir $clean))
}

function Inline-CssAssets {
  param(
    [string]$Css,
    [string]$CssBaseDir
  )

  $pattern = "url\(\s*(['""]?)([^'"")]+)\1\s*\)"
  $evaluator = [System.Text.RegularExpressions.MatchEvaluator]{
    param($match)

    $url = $match.Groups[2].Value.Trim()
    if (-not (Test-IsEmbeddableUrl -Url $url)) {
      return $match.Value
    }

    $assetPath = Resolve-AssetPath -Url $url -BaseDir $CssBaseDir
    if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
      Write-Warning "CSS asset not found: $url"
      return $match.Value
    }

    $dataUri = Convert-FileToDataUri -Path $assetPath
    "url(`"$dataUri`")"
  }

  [System.Text.RegularExpressions.Regex]::Replace($Css, $pattern, $evaluator)
}

function Escape-StyleContent {
  param([string]$Css)
  $Css -replace "</style", "<\/style"
}

function Escape-ScriptContent {
  param([string]$Script)
  $Script -replace "</script", "<\/script"
}

function Set-HtmlTitle {
  param(
    [string]$Html,
    [string]$NextTitle
  )

  if ([string]::IsNullOrWhiteSpace($NextTitle)) {
    return $Html
  }

  $encodedTitle = [System.Net.WebUtility]::HtmlEncode($NextTitle)
  if ($Html -match "(?is)<title>.*?</title>") {
    return [System.Text.RegularExpressions.Regex]::Replace($Html, "(?is)<title>.*?</title>", "<title>$encodedTitle</title>", 1)
  }

  [System.Text.RegularExpressions.Regex]::Replace($Html, "(?i)</head>", "    <title>$encodedTitle</title>`r`n  </head>", 1)
}

function Set-HtmlFavicon {
  param(
    [string]$Html,
    [string]$IconPath
  )

  if ([string]::IsNullOrWhiteSpace($IconPath)) {
    return $Html
  }

  $dataUri = Convert-FileToDataUri -Path $IconPath
  $iconTag = "    <link rel=`"icon`" href=`"$dataUri`">"
  $withoutOldIcons = [System.Text.RegularExpressions.Regex]::Replace(
    $Html,
    "(?is)\s*<link\b(?=[^>]*\brel\s*=\s*(['""])[^'""]*(?:icon|shortcut icon|apple-touch-icon)[^'""]*\1)[^>]*>",
    ""
  )

  if ($withoutOldIcons -match "(?is)</title>") {
    return [System.Text.RegularExpressions.Regex]::Replace($withoutOldIcons, "(?is)</title>", "</title>`r`n$iconTag", 1)
  }

  [System.Text.RegularExpressions.Regex]::Replace($withoutOldIcons, "(?i)</head>", "$iconTag`r`n  </head>", 1)
}

function Add-StartupGate {
  param(
    [string]$Html,
    [string]$ButtonText
  )

  $encodedButtonText = [System.Net.WebUtility]::HtmlEncode($ButtonText)
  $style = @"
    <style data-startup-gate>
      body[data-startup-locked] {
        overflow: hidden;
      }

      .startup-gate {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: grid;
        place-items: center;
        padding: 32px;
        color: #f4f4f0;
        background:
          radial-gradient(circle at 50% 42%, rgba(212, 181, 149, 0.14), transparent 24rem),
          linear-gradient(180deg, rgba(4, 5, 6, 0.82), rgba(4, 5, 6, 0.96));
        transition: opacity 520ms cubic-bezier(0.16, 1, 0.3, 1), visibility 520ms linear;
      }

      .startup-gate.is-dismissed {
        opacity: 0;
        visibility: hidden;
      }

      .startup-gate__inner {
        display: grid;
        gap: 18px;
        justify-items: center;
      }

      .startup-gate__line {
        width: 84px;
        height: 1px;
        background: rgba(212, 181, 149, 0.68);
        box-shadow: 0 0 18px rgba(212, 181, 149, 0.28);
      }

      .startup-gate__button {
        min-width: 162px;
        min-height: 50px;
        border: 1px solid rgba(212, 181, 149, 0.62);
        border-radius: 999px;
        padding: 0 26px;
        color: #f4f4f0;
        background: rgba(212, 181, 149, 0.08);
        font: 600 0.78rem/1 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        cursor: pointer;
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.34);
        transition: background 180ms ease, border-color 180ms ease, transform 180ms ease;
      }

      .startup-gate__button:hover,
      .startup-gate__button:focus-visible {
        border-color: #d4b595;
        background: rgba(212, 181, 149, 0.17);
        outline: none;
        transform: translateY(-1px);
      }
    </style>
"@

  $markup = @"
    <div class="startup-gate" data-startup-gate role="dialog" aria-modal="true" aria-label="Start presentation">
      <div class="startup-gate__inner">
        <span class="startup-gate__line" aria-hidden="true"></span>
        <button class="startup-gate__button" type="button" data-startup-button>$encodedButtonText</button>
      </div>
    </div>
"@

  $script = @"
    <script data-startup-gate>
      (function () {
        var gate = document.querySelector(".startup-gate[data-startup-gate]");
        var button = document.querySelector("[data-startup-button]");
        if (!gate || !button) return;

        function requestFullscreen() {
          var element = document.documentElement;
          var request = element.requestFullscreen ||
            element.webkitRequestFullscreen ||
            element.msRequestFullscreen;

          if (!request) {
            return Promise.resolve();
          }

          try {
            return Promise.resolve(request.call(element)).catch(function () {});
          } catch (error) {
            return Promise.resolve();
          }
        }

        function openPresentation() {
          requestFullscreen().then(function () {
            gate.classList.add("is-dismissed");
            document.body.removeAttribute("data-startup-locked");
            window.scrollTo(0, 0);
            window.dispatchEvent(new Event("resize"));
            window.dispatchEvent(new Event("scroll"));
            window.setTimeout(function () {
              gate.remove();
            }, 540);
          });
        }

        button.addEventListener("click", openPresentation, { once: true });
        button.focus({ preventScroll: true });
      })();
    </script>
"@

  $withStyle = [System.Text.RegularExpressions.Regex]::Replace($Html, "(?i)</head>", "$style`r`n  </head>", 1)
  $withBodyLock = [System.Text.RegularExpressions.Regex]::Replace($withStyle, "(?i)<body([^>]*)>", "<body`$1 data-startup-locked>", 1)
  $withMarkup = [System.Text.RegularExpressions.Regex]::Replace($withBodyLock, "(?i)<body[^>]*>", "`$0`r`n$markup", 1)
  [System.Text.RegularExpressions.Regex]::Replace($withMarkup, "(?i)</body>", "$script`r`n  </body>", 1)
}

$resolvedIndex = (Resolve-Path -LiteralPath $IndexPath).Path
$rootDir = Split-Path -Parent $resolvedIndex
$html = Get-Content -LiteralPath $resolvedIndex -Raw

$html = Set-HtmlTitle -Html $html -NextTitle $Title
$html = Set-HtmlFavicon -Html $html -IconPath $FaviconPath

if ($StartupScreen) {
  $html = Add-StartupGate -Html $html -ButtonText $StartButtonText
}

$stylesheetPattern = "<link\b(?=[^>]*\brel\s*=\s*(['""])stylesheet\1)(?=[^>]*\bhref\s*=\s*(['""])([^'""]+)\2)[^>]*>"
$stylesheetEvaluator = [System.Text.RegularExpressions.MatchEvaluator]{
  param($match)

  $href = $match.Groups[3].Value
  if (-not (Test-IsEmbeddableUrl -Url $href)) {
    return $match.Value
  }

  $cssPath = Resolve-AssetPath -Url $href -BaseDir $rootDir
  if (-not (Test-Path -LiteralPath $cssPath -PathType Leaf)) {
    Write-Warning "Stylesheet not found: $href"
    return $match.Value
  }

  $css = Get-Content -LiteralPath $cssPath -Raw
  $css = Inline-CssAssets -Css $css -CssBaseDir (Split-Path -Parent $cssPath)
  $css = Escape-StyleContent -Css $css
  "<style data-inlined-from=`"$href`">`r`n$css`r`n    </style>"
}
$html = [System.Text.RegularExpressions.Regex]::Replace($html, $stylesheetPattern, $stylesheetEvaluator)

$scriptPattern = "<script\b(?=[^>]*\bsrc\s*=\s*(['""])([^'""]+)\1)[^>]*>\s*</script>"
$scriptEvaluator = [System.Text.RegularExpressions.MatchEvaluator]{
  param($match)

  $src = $match.Groups[2].Value
  if (-not (Test-IsEmbeddableUrl -Url $src)) {
    return $match.Value
  }

  $scriptPath = Resolve-AssetPath -Url $src -BaseDir $rootDir
  if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    Write-Warning "Script not found: $src"
    return $match.Value
  }

  $script = Get-Content -LiteralPath $scriptPath -Raw
  $script = Escape-ScriptContent -Script $script
  "<script data-inlined-from=`"$src`">`r`n$script`r`n    </script>"
}
$html = [System.Text.RegularExpressions.Regex]::Replace($html, $scriptPattern, $scriptEvaluator)

$assetAttributePattern = "\b(src|poster)\s*=\s*(['""])([^'""]+)\2"
$assetAttributeEvaluator = [System.Text.RegularExpressions.MatchEvaluator]{
  param($match)

  $attributeName = $match.Groups[1].Value
  $quote = $match.Groups[2].Value
  $url = $match.Groups[3].Value

  if (-not (Test-IsEmbeddableUrl -Url $url)) {
    return $match.Value
  }

  $assetPath = Resolve-AssetPath -Url $url -BaseDir $rootDir
  if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
    Write-Warning "Asset not found: $url"
    return $match.Value
  }

  $dataUri = Convert-FileToDataUri -Path $assetPath
  "$attributeName=$quote$dataUri$quote"
}
$html = [System.Text.RegularExpressions.Regex]::Replace($html, $assetAttributePattern, $assetAttributeEvaluator)

$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath
} else {
  Join-Path $rootDir $OutputPath
}

$outputDir = Split-Path -Parent $resolvedOutput
if (-not [string]::IsNullOrWhiteSpace($outputDir)) {
  New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

if ((Test-Path -LiteralPath $resolvedOutput -PathType Leaf) -and -not $Force) {
  throw "Output file already exists. Use -Force to overwrite: $resolvedOutput"
}

[System.IO.File]::WriteAllText($resolvedOutput, $html, [System.Text.UTF8Encoding]::new($false))

$fileInfo = Get-Item -LiteralPath $resolvedOutput
[pscustomobject]@{
  OutputPath = $fileInfo.FullName
  SizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
}
