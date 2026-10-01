param(
  [string]$InputPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'SUPPLIFY_Stakeholder_Presentation.pptx'),
  [string]$PdfPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'SUPPLIFY_Stakeholder_Presentation.pdf'),
  [string]$RenderDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'presentation_source\qa\rendered-slides')
)

$ErrorActionPreference = 'Stop'
$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$resolvedPdf = [System.IO.Path]::GetFullPath($PdfPath)
$resolvedRenderDirectory = [System.IO.Path]::GetFullPath($RenderDirectory)
New-Item -ItemType Directory -Path $resolvedRenderDirectory -Force | Out-Null

$powerPoint = $null
$presentation = $null
try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $powerPoint.Visible = -1
  $presentation = $powerPoint.Presentations.Open($resolvedInput, 0, 0, -1)
  $presentation.SaveAs($resolvedPdf, 32)
  $presentation.Export($resolvedRenderDirectory, 'PNG', 1600, 900)
  Write-Output "Exported PDF: $resolvedPdf"
  Write-Output "Rendered slides: $resolvedRenderDirectory"
  Write-Output "Slide count: $($presentation.Slides.Count)"
}
finally {
  if ($null -ne $presentation) {
    $presentation.Close()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)
  }
  if ($null -ne $powerPoint) {
    $powerPoint.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
