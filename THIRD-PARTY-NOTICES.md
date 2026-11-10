# Bundled software

Version 1.2 includes Essentia.js 0.1.3 (AGPL-3.0), by the Music Technology Group, Universitat Pompeu Fabra. License: resources/tools/licenses/Essentia-AGPL.txt. Source and build instructions: https://github.com/MTG/essentia.js and https://github.com/MTG/essentia. Application source is bundled as resources/YouMP3-source.zip, excluding third-party binaries and user audio.

YouMP3 includes Electron (MIT), Node.js (MIT and bundled third-party licenses), yt-dlp (Unlicense; its standalone executable includes other libraries), and FFmpeg (GPL version 3 or later in the included Gyan Essentials build).

License texts and upstream notices are in resources/tools/licenses in the installed application. FFmpeg build configuration is available by running resources/tools/ffmpeg.exe -buildconf.

Corresponding source and build information:
- Electron: https://github.com/electron/electron
- Node.js: https://github.com/nodejs/node
- yt-dlp: https://github.com/yt-dlp/yt-dlp (standalone executable dependencies and licensing: https://github.com/yt-dlp/yt-dlp#license)
- FFmpeg: https://ffmpeg.org/ ; Gyan build sources and build scripts: https://www.gyan.dev/ffmpeg/builds/ and https://github.com/GyanD/codexffmpeg

Before public redistribution, retain these notices, the bundled license texts, and provide corresponding source for copyleft components as required by their licenses. This build is unsigned.
