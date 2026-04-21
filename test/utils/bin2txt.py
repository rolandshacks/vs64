import sys

def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.bin> <output.txt>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    with open(input_file, "rb") as f:
        data = f.read()

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("const testData = new Uint8Array([\n  ")

        for i, b in enumerate(data):
            f.write(f"0x{b:02x},")
            if (i + 1) % 16 == 0:
                f.write("\n  ")

        f.write("\n]);\n")
        f.write("export { testData };\n")


if __name__ == "__main__":
    main()
