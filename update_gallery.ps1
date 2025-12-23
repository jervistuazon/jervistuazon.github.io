# Portfolio Gallery Updater
# This script scans the "assets" folder and updates "gallery-data.js"
# allowing the website to automatically reflect new folders and images.

$AssetsDir = "assets"
$OutputFile = "gallery-data.js"
$ValidExtensions = @(".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".webm")

Write-Host "Scanning '$AssetsDir' for gallery content..."

$GalleryData = @{}
$Folders = Get-ChildItem -Path $AssetsDir -Directory

foreach ($Folder in $Folders) {
    $FolderName = $Folder.Name
    # Skip the "00_HERO SHOT" folder or any system folders if needed
    if ($FolderName -eq "00_HERO SHOT") { continue }

    $Files = Get-ChildItem -Path $Folder.FullName -File | Where-Object { $ValidExtensions -contains $_.Extension.ToLower() }
    
    if ($Files.Count -gt 0) {
        $FileList = @()
        foreach ($File in $Files) {
            $FileList += $File.Name
        }
        $GalleryData[$FolderName] = $FileList
    }
}

# Convert to JSON-like string for JS file
$JsonRaw = $GalleryData | ConvertTo-Json -Depth 3
# Make it a valid JS variable assignment
$JsContent = "const galleryData = $JsonRaw;"

# Write to file
Set-Content -Path $OutputFile -Value $JsContent -Encoding UTF8

Write-Host "Successfully updated '$OutputFile'!"
Write-Host "Found $($GalleryData.Count) project folders."
