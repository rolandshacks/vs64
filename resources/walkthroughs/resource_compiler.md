
# Resource Compiler  []()

VS64 provides a resource compiler tool to directly translate and embed media assets into the program binaries.

As the resource compiler (rc.py) is written in Python, there needs to be a Python language interpreter to execute the tool. Preferrably, an installed version is used (Python 3.x) - but for Windows platforms, there is a minimalistic embedded Python distribution coming with the VS64 extension. All should work out of the box.

In case you still want to use a specific Python installation, you can specify that in the build tool settings.

Currently supported media formats:

- SpritePad/Pro sprite data
- CharPad/Pro charset, tile and map data
- SpriteMate sprite data
- SID music
- Raw resource data (.raw)

<p align="center">
<br/>
<img src="./spritepad.png" height=24/>&nbsp;
<img src="./charpad.png" height=24/>&nbsp;
<img src="./spritemate.png" height=24/>&nbsp;
<br/>
<img src="./python_powered.png" width=64/>
</p>
