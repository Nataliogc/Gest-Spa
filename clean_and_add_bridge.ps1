# Script to clean up restaurante.html and properly add the bridge script
$filePath = 'C:\Users\comun\Documents\GitHub\gestion-Salones\restaurante.html'

# Read the original content
$content = Get-Content $filePath -Raw

# Remove all corrupted previous bridge script attempts (multiple patterns)
$content = $content -replace '(?s)\s*<!-- Bridge script for Spa voucher integration -->.*?temp_restaurante.*?</script>', ''
$content = $content -replace '(?s)\s*<script src="[^"]*temp_restaurante[^"]*">[^<]*</script>', ''
$content = $content -replace '(?s)\s*<script src=" file:///[^"]*temp_restaurante[^"]*">[^<]*</script>', ''

# Make sure we have a clean </body> tag
$content = $content -replace '\s*</body>\s*</html>\s*$', "`n</body>`n</html>"

# Now insert the clean script tag before </body>
$scriptBlock = @"

    <!-- Bridge script for Spa voucher integration -->
    <script src="file:///C:/Users/comun/Documents/GitHub/Gest-Spa/temp_restaurante_v6.js"></script>
"@

$content = $content -replace '</body>', "$scriptBlock`n</body>"

# Write with UTF8 encoding, no BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($filePath, $content, $utf8NoBom)

Write-Output "HTML cleaned and script added successfully"
