@echo off
title CC AI SOLUTIONS - local website (http://localhost:8080)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
