# Cai dat moi truong cho skill reel-doc-3d (Windows). Chay 1 lan:
#   chuot phai file nay -> "Run with PowerShell"   (hoac trong PowerShell: powershell -ExecutionPolicy Bypass -File cai-dat.ps1)
# Can co san: Python 3.10/3.11/3.12 va ffmpeg (xem HUONG-DAN-CAI-DAT.md).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "1/6 Kiem tra Python va ffmpeg..."
python --version
ffmpeg -version | Select-Object -First 1
Write-Host "2/6 Tao moi truong rieng (venv) trong thu muc skill..."
python -m venv "$here\venv"
Write-Host "3/6 Cai thu vien (mat vai phut)..."
& "$here\venv\Scripts\python.exe" -m pip install --upgrade pip
& "$here\venv\Scripts\python.exe" -m pip install -r "$here\requirements.txt"
Write-Host "4/6 Tai truoc mo hinh tach nguoi du phong u2net (khoang 170 MB, chi 1 lan)..."
& "$here\venv\Scripts\python.exe" -c "from rembg import new_session; new_session('u2net_human_seg'); print('ok')"
Write-Host "5/6 Tai font Inter Tight + Playfair Display tu Google Fonts (khoang 1,4 MB, giay phep SIL Open Font License)..."
New-Item -ItemType Directory -Force "$here\fonts" | Out-Null
$ProgressPreference = 'SilentlyContinue'
$gf = 'https://raw.githubusercontent.com/google/fonts/main/ofl'
$fonts = @{ 'InterTight-VF.ttf' = "$gf/intertight/InterTight%5Bwght%5D.ttf"; 'InterTight-Italic-VF.ttf' = "$gf/intertight/InterTight-Italic%5Bwght%5D.ttf";
            'PlayfairDisplay-Italic-VF.ttf' = "$gf/playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf";
            'OFL-InterTight.txt' = "$gf/intertight/OFL.txt"; 'OFL-PlayfairDisplay.txt' = "$gf/playfairdisplay/OFL.txt" }
foreach ($k in $fonts.Keys) { if (-not (Test-Path "$here\fonts\$k")) { Invoke-WebRequest -Uri $fonts[$k] -OutFile "$here\fonts\$k" -UseBasicParsing } }
Write-Host "6/6 Tai mo hinh tach nguoi cho video RobustVideoMatting (khoang 117 MB, giay phep GPL-3.0, tac gia PeterL1n)..."
New-Item -ItemType Directory -Force "$here\models" | Out-Null
$ProgressPreference = 'SilentlyContinue'
foreach ($n in 'rvm_resnet50_fp32.onnx', 'rvm_mobilenetv3_fp32.onnx') {
    if (-not (Test-Path "$here\models\$n")) { Invoke-WebRequest -Uri "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/$n" -OutFile "$here\models\$n" -UseBasicParsing }
}
Write-Host ""
Write-Host "XONG. Python cua skill: $here\venv\Scripts\python.exe"
