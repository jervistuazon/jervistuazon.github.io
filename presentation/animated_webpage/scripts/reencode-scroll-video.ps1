param(
  [string]$InputPath = "Video\Sequence 01.mp4",
  [string]$OutputPath = "Video\Sequence 01_scrub.mp4",
  [string]$MobileOutputPath = "Video\Sequence 01_mobile_scrub.mp4",
  [int]$FrameRate = 60,
  [int]$MobileFrameRate = 30,
  [int]$MobileWidth = 960,
  [int]$DesktopCrf = 18,
  [int]$MobileCrf = 24,
  [switch]$OnlyMobile,
  [switch]$SkipMobile
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Ffmpeg = Join-Path $ProjectRoot "Tools\ffmpeg\bin\ffmpeg.exe"
$Ffprobe = Join-Path $ProjectRoot "Tools\ffmpeg\bin\ffprobe.exe"
$InputFile = Join-Path $ProjectRoot $InputPath
$OutputFile = Join-Path $ProjectRoot $OutputPath
$MobileOutputFile = Join-Path $ProjectRoot $MobileOutputPath

if ($OnlyMobile -and $SkipMobile) {
  throw "Use either -OnlyMobile or -SkipMobile, not both."
}

if (!(Test-Path $Ffmpeg)) {
  throw "Missing FFmpeg executable: $Ffmpeg"
}

if (!(Test-Path $InputFile)) {
  $FallbackInputFile = Join-Path $ProjectRoot "Video\New folder\Sequence 01.mp4"

  if (Test-Path $FallbackInputFile) {
    Write-Warning "Missing input video: $InputFile. Using fallback source: $FallbackInputFile"
    $InputFile = $FallbackInputFile
  } else {
    throw "Missing input video: $InputFile"
  }
}

if (!$OnlyMobile) {
  & $Ffmpeg `
    -y `
    -i $InputFile `
    -an `
    -c:v libx264 `
    -pix_fmt yuv420p `
    -r $FrameRate `
    -preset slow `
    -crf $DesktopCrf `
    -g 6 `
    -keyint_min 6 `
    -sc_threshold 0 `
    -movflags +faststart `
    $OutputFile
}

if (!$SkipMobile) {
  & $Ffmpeg `
    -y `
    -i $InputFile `
    -an `
    -vf "scale='min($MobileWidth,iw)':-2" `
    -c:v libx264 `
    -pix_fmt yuv420p `
    -r $MobileFrameRate `
    -preset medium `
    -crf $MobileCrf `
    -g 4 `
    -keyint_min 4 `
    -sc_threshold 0 `
    -movflags +faststart `
    $MobileOutputFile
}

if (Test-Path $Ffprobe) {
  if (!$OnlyMobile -and (Test-Path $OutputFile)) {
    & $Ffprobe `
      -v error `
      -select_streams v:0 `
      -show_entries stream=duration,nb_frames,r_frame_rate,avg_frame_rate,bit_rate `
      -show_entries format=duration,size,bit_rate `
      -of default=noprint_wrappers=1 `
      $OutputFile
  }

  if (!$SkipMobile -and (Test-Path $MobileOutputFile)) {
    & $Ffprobe `
      -v error `
      -select_streams v:0 `
      -show_entries stream=width,height,duration,nb_frames,r_frame_rate,avg_frame_rate,bit_rate `
      -show_entries format=duration,size,bit_rate `
      -of default=noprint_wrappers=1 `
      $MobileOutputFile
  }
}
