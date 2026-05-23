param(
  [string]$InputPath = "Video\Sequence 01.mp4",
  [string]$OutputPath = "Video\Sequence 01_scrub.mp4",
  [int]$FrameRate = 60
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Ffmpeg = Join-Path $ProjectRoot "Tools\ffmpeg\bin\ffmpeg.exe"
$Ffprobe = Join-Path $ProjectRoot "Tools\ffmpeg\bin\ffprobe.exe"
$InputFile = Join-Path $ProjectRoot $InputPath
$OutputFile = Join-Path $ProjectRoot $OutputPath

if (!(Test-Path $Ffmpeg)) {
  throw "Missing FFmpeg executable: $Ffmpeg"
}

if (!(Test-Path $InputFile)) {
  throw "Missing input video: $InputFile"
}

& $Ffmpeg `
  -y `
  -i $InputFile `
  -an `
  -c:v libx264 `
  -pix_fmt yuv420p `
  -r $FrameRate `
  -preset slow `
  -crf 18 `
  -g 6 `
  -keyint_min 6 `
  -sc_threshold 0 `
  -movflags +faststart `
  $OutputFile

if (Test-Path $Ffprobe) {
  & $Ffprobe `
    -v error `
    -select_streams v:0 `
    -show_entries stream=duration,nb_frames,r_frame_rate,avg_frame_rate,bit_rate `
    -show_entries format=duration,size,bit_rate `
    -of default=noprint_wrappers=1 `
    $OutputFile
}
