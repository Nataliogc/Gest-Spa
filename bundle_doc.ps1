$htmlPath = "c:\Users\comun\Documents\GitHub\Gest-Spa\Manual_Reservas_Spa.html"
$docPath = "c:\Users\comun\Documents\GitHub\Gest-Spa\Manual_Reservas_Spa_Embedded.doc"

$content = Get-Content $htmlPath -Raw -Encoding UTF8

# Regex to find images
# <img src="Imagenes/manual_spa/agenda_view.png" alt="Agenda de Spa Zenith">
$pattern = 'src="(Imagenes/manual_spa/[^"]+)"'
$matches = [regex]::Matches($content, $pattern)

foreach ($match in $matches) {
    $relativePath = $match.Groups[1].Value
    $fullPath = Join-Path "c:\Users\comun\Documents\GitHub\Gest-Spa" $relativePath
    
    if (Test-Path $fullPath) {
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $b64 = [System.Convert]::ToBase64String($bytes)
        $newSrc = "src=""data:image/png;base64,$b64"""
        
        # Replace only this specific occurrence (simple replace might be risky if duplicates, but here paths are unique enough or same)
        $content = $content.Replace("src=""$relativePath""", $newSrc)
    }
}

# Add Word-specific headers for better compatibility
$header = @"
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="utf-8">
<title>Manual de Reservas</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
<!-- 
 /* Style Definitions */
 @page Section1
    {size:595.45pt 841.7pt;
    margin:70.85pt 70.85pt 70.85pt 70.85pt;
    mso-header-margin:35.4pt;
    mso-footer-margin:35.4pt;
    mso-paper-source:0;}
 div.Section1
    {page:Section1;}
-->
</style>
</head>
<body>
<div class=Section1>
"@

# We need to strip the original <html><head>...<body> tags from $content to wrap it properly or just inject the style.
# Simpler: Just save the modified content as .doc, Word is forgiving. 
# But let's try to prepend the MSO xml for "Print View" which makes it look like a doc.

Set-Content -Path $docPath -Value $content -Encoding UTF8

Write-Host "Created $docPath"
