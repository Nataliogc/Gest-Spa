# Simple and working bridge addition
$src = 'C:\Users\comun\Documents\GitHub\gestion-Salones\restaurante.html'

# Read
$content = [System.IO.File]::ReadAllText($src)

# Check if already added
if ($content.Contains('temp_restaurante_v6.js')) {
    Write-Output "Script already present"
    exit 0
}

# Simple string replacement
$oldTag = '</body>'
$newTag = @'

    <!-- Bridge script for Spa voucher integration -->
    <script src="https://nataliogc.github.io/Gest-Spa/temp_restaurante_v6.js"></script>
</body>
'@

$newContent = $content.Replace($oldTag, $newTag)

# Write
[System.IO.File]::WriteAllText($src, $newContent, [System.Text.Encoding]::UTF8)

Write-Output "Script added successfully"
