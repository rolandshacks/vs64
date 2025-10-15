#compatibility wreapper for the tmpx cross compiler so the problemMatcher can parse its output correctly.
import subprocess
import os
import sys

def rmnoise(input_string):
    input_lines = input_string.splitlines(keepends=False)
    output_lines = []
    for input_line in input_lines:
        output_line = input_line.rstrip()
        output_line = output_line.lstrip()
        if(len(output_line) > 0):
            output_lines.append(output_line)
    output_string = "\n".join(output_lines)
    return output_string

def syscmd(cmd):
    print(cmd)
    argv = cmd.split()
    result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    stdoutstr = rmnoise(result.stdout.decode("utf-8"))
    print(stdoutstr, file=sys.stdout)
    return stdoutstr

if __name__ == '__main__':
    command = " ".join(sys.argv[1:])
    syscmd(command)
