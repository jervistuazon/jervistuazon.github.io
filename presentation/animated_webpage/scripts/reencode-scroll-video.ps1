param(
  [string]$InputPath = "Video\Sequence 01.mp4",
  [string]$OutputPath = "Video\Sequence 01_scrub.mp4",
  [string]$MobileOutputPath = "Video\Sequence 01_mobile_scrub.mp4",
  [int]$FrameRate = 24,
  [int]$MobileFrameRate = 24,
  [int]$MobileWidth = 960,
  [int]$MobileHeight = 1080,
  [int]$DesktopCrf = 18,
  [int]$MobileCrf = 22,
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

if ($OnlyMobile -and (Test-Path $OutputFile)) {
  Write-Host "Using desktop scrub as mobile crop source: $OutputFile"
  $InputFile = $OutputFile
} elseif (!(Test-Path $InputFile)) {
  throw "Missing input video: $InputFile"
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
  $MobileVideoFilter = "crop='min(iw,ceil(ih*9/16/2)*2)':ih:(iw-ow)/2:0,scale=-2:'min($MobileHeight,ih)'"

  & $Ffmpeg `
    -y `
    -i $InputFile `
    -an `
    -vf $MobileVideoFilter `
    -c:v libx264 `
    -pix_fmt yuv420p `
    -r $MobileFrameRate `
    -preset medium `
    -tune fastdecode `
    -crf $MobileCrf `
    -g 4 `
    -keyint_min 4 `
    -bf 0 `
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
