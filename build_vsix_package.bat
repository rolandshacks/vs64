@ECHO OFF

REM *
REM * Build VSIX Package
REM *

SETLOCAL
call npm install
vsce package --no-yarn --dependencies
ENDLOCAL
