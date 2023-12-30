@ECHO OFF

REM *
REM * Build VSIX Package
REM *

SETLOCAL
call npm install
call npm run vsix
ENDLOCAL
