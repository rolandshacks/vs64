#compatibility wreapper for the tmpx cross compiler so the problemMatcher can parse its output correctly.
import subprocess
import os
import re
import sys
from pathlib import Path

def rmnoise(input_string, cwd):
    input_lines = input_string.splitlines(keepends=False)
    output_lines = []
    for input_line in input_lines:
        output_line = input_line.rstrip()
        output_line = output_line.lstrip()
        # The file path is relative to the current working directory,
        # convert it to an absolute path.
        if re.search(r": error \d+:", output_line):
            output_line = str(Path(cwd) / output_line)
        if(len(output_line) > 0):
            output_lines.append(output_line)
    output_string = "\n".join(output_lines)
    return output_string

def syscmd(cmd):
    cwd = Path.cwd()
    print(cmd)
    argv = cmd.split()
    result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    stdoutstr = rmnoise(result.stdout.decode("utf-8"), cwd)
    print(stdoutstr, file=sys.stdout)
    return stdoutstr

if __name__ == '__main__':
    command = " ".join(sys.argv[1:])
    syscmd(command)
