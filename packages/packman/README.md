# Packman archive files

Package manifest entries can use a version string for the default ZIP archive,
or an object with an explicit archive filename:

```json
{
  "version": "1.0.0",
  "generic": {
    "legacy": "1.0.0",
    "tool": { "version": "1.0.0", "file": "tool.tar.gz" },
    "external": {
      "version": "1.0.0",
      "url": "https://downloads.example.com/tool/v1/release",
      "file": "release.tar.gz",
      "root": "tool-v1"
    }
  }
}
```

Without an explicit filename, packman downloads `<asset-name>.zip`. Other
archive names, such as `.tgz` or `.7z`, must be specified in `file`.

Archives are fetched from `<repository>/<group>/<file>` unless an item's
`url` supplies the full download URL. `file` names the downloaded temporary
file even when the URL ends with a different name. Every archive is installed
under a directory named after the asset. When `root` is omitted, packman
skips the common leading directory path shared by all archive contents. For
example, an archive containing only `release/bin/tool` installs `tool` directly
in the asset directory; if it also contains `release/docs/readme`, it installs
`bin/tool` and `docs/readme`. A file at the archive root prevents this
automatic skip. With `root: "aaa/bbb"`, only that directory and its contents
are extracted, so `aaa/bbb/ccc` becomes `<asset-name>/ccc`. Use `root: ""` to
keep archive paths exactly as they are, including a sole root directory. All
formats use `libarchive-wasm`.
Same-directory symbolic links are extracted when their targets stay inside the
asset directory. Hard links, links with path components, and entries outside
the extraction directory are rejected. On Linux and macOS, `.tar.xz`, `.tar.gz`,
and `.tgz` entries retain their Unix permission bits, including executable
bits. Packman uses the system `tar` command to read those modes because the
WASM reader does not expose them. Directory modes are applied after extraction
so restrictive directories do not block their own contents.
