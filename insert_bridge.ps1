# Safe line-by-line insertion
$filePath = 'C:\Users\comun\Documents\GitHub\gestion-Salones\restaurante.html'

# Read all lines
$lines = [System.IO.File]::ReadAllLines($filePath)

# Find </body> line (search from end)
$bodyIdx = -1
for ($i = $lines.Length - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match '</body>') {
        $bodyIdx = $i
        break
    }
}

if ($bodyIdx -lt 0) {
    Write-Error "</body> not found!"
    exit 1
}

# Create new list with inserted lines
$newLines = [System.Collections.Generic.List[string]]::new()
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($i -eq $bodyIdx) {
        $newLines.Add('')
        $newLines.Add('    <!-- Bridge script for Spa voucher integration -->')
        $newLines.Add('    <script src="file:///C:/Users/comun/Documents/GitHub/Gest-Spa/temp_restaurante_v6.js"></script>')
    }
    $newLines.Add($lines[$i])
}

# Write back
[System.IO.File]::WriteAllLines($filePath, $newLines)
Write-Output "Successfully added bridge script before line $bodyIdx"
