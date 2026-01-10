# Simple and safe addition of the bridge script
$filePath = 'C:\Users\comun\Documents\GitHub\gestion-Salones\restaurante.html'

# Read lines
$lines = Get-Content $filePath

# Find the line number with </body>
$bodyLineIndex = -1
for ($i = $lines.Length - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match '</body>') {
        $bodyLineIndex = $i
        break
    }
}

if ($bodyLineIndex -eq -1) {
    Write-Output "ERROR: </body> tag not found"
    exit 1
}

# Create the new content
$before = $lines[0..($bodyLineIndex - 1)]
$scriptLines = @(
    "",
    "    <!-- Bridge script for Spa voucher integration -->",
    '    <script src="file:///C:/Users/comun/Documents/GitHub/Gest-Spa/temp_restaurante_v6.js"></script>'
)
$after = $lines[$bodyLineIndex..($lines.Length - 1)]

$newContent = $before + $scriptLines + $after

# Write the file
$newContent | Set-Content $filePath -Encoding UTF8

Write-Output "Script added successfully at line $bodyLineIndex"
