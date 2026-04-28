
$logPath = "C:\Users\Usuario\.gemini\antigravity\brain\2a9e0f37-ddd3-4a93-b887-ccb2e5bd8815\.system_generated\logs\overview.txt"
$lines = Get-Content $logPath
$code = $null

foreach ($line in $lines) {
    try {
        $json = $line | ConvertFrom-Json
        if ($json.step_index -eq 90) {
            $content = $json.content
            $pattern = '(?s)```javascript\n(.*?)\n```'
            if ($content -match $pattern) {
                $code = $matches[1]
                break
            }
        }
    } catch {
        # Skip invalid JSON
    }
}

if ($code) {
    $code | Out-File -FilePath "C:\Users\Usuario\Documents\maxi\src\pages\InventoryPage.jsx.new" -Encoding utf8
    Write-Output "Code extracted successfully to InventoryPage.jsx.new"
} else {
    Write-Output "Code block not found in the logs"
}
