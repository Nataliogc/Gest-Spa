$filePath = 'C:\Users\comun\Documents\GitHub\gestion-Salones\restaurante.html'
$content = Get-Content $filePath -Raw

# Remove any corrupted previous attempts
$content = $content -replace '\s*<!-- Bridge script for Spa voucher integration -->.*?</script>', ''
$content = $content -replace '\s*<script src=" file:///.*?temp_restaurante.*?</script>', ''

# Add clean script tag before </body>
$scriptTag = "`n    <!-- Bridge script for Spa voucher integration -->`n    <script src=`"file:///C:/Users/comun/Documents/GitHub/Gest-Spa/temp_restaurante_v6.js`"></script>"
$newContent = $content -replace '</body>', ($scriptTag + "`n</body>")

[System.IO.File]::WriteAllText($filePath, $newContent, [System.Text.Encoding]::UTF8)
Write-Output "Script added successfully"
