$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pptxPath = Join-Path $root '7addak_Stakeholder_Presentation.pptx'
$pdfPath = Join-Path $root '7addak_Stakeholder_Presentation.pdf'
$renderDir = Join-Path $root 'presentation_source\7addak\qa\rendered-slides'

if (-not (Test-Path -LiteralPath $pptxPath)) {
  throw "Presentation not found: $pptxPath"
}

New-Item -ItemType Directory -Force -Path $renderDir | Out-Null
Get-ChildItem -LiteralPath $renderDir -Filter 'Slide*.PNG' -File -ErrorAction SilentlyContinue | Remove-Item -Force

$powerPoint = New-Object -ComObject PowerPoint.Application
$powerPoint.Visible = -1
$deck = $null

try {
  $deck = $powerPoint.Presentations.Open($pptxPath, 0, 0, -1)
  if ($deck.Slides.Count -ne 10) {
    throw "Expected exactly 10 slides; PowerPoint opened $($deck.Slides.Count)."
  }

  $deck.SaveAs($pdfPath, 32)
  $deck.Export($renderDir, 'PNG', 1600, 900)
  Write-Output "PowerPoint validation succeeded: $($deck.Slides.Count) slides"
  Write-Output "PDF: $pdfPath"
  Write-Output "Rendered slides: $renderDir"
}
finally {
  if ($null -ne $deck) {
    $deck.Close()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($deck)
  }
  $powerPoint.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
