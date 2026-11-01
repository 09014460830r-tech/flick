import {existsSync} from 'fs';
import {Config} from '@remotion/cli/config';
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
// Use the pre-installed headless shell when present (no download needed).
const shell = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
if (existsSync(shell)) {
  // Cloud container without GPU: use the bundled headless shell + software GL.
  Config.setBrowserExecutable(shell);
  Config.setChromiumOpenGlRenderer('swangle');
}
