const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

const conversionProcesses = new Map();

function getDuration(filePath, callback) {
  execFile(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], (error, stdout, stderr) => {
    if (error) {
      console.error('ffprobe error:', stderr);
      callback(null, error);
      return;
    }
    callback(parseFloat(stdout));
  });
}

function parseProgress(progressString) {
  const timeMatch = progressString.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = parseInt(timeMatch[3], 10);
    const milliseconds = parseInt(timeMatch[4], 10) * 10;
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }
  return null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'icon.svg'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile('index.html');
  win.webContents.openDevTools();

  ipcMain.handle('open-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'flv', 'webm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (canceled) {
      return [];
    } else {
      return filePaths;
    }
  });

  ipcMain.handle('open-directory-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    });
    if (canceled) {
      return null;
    } else {
      return filePaths[0];
    }
  });

      ipcMain.on('start-conversion', (event, filePaths, selectedResolution, selectedVideoCodec, outputDirectory, volume, selectedOutputFormat, selectedVideoQuality, selectedVideoBitrate, selectedAudioCodec, selectedAudioBitrate) => {
    let completedConversions = 0;

    filePaths.forEach((inputPath, index) => {
      getDuration(inputPath, (duration, error) => {
        if (error) {
          event.sender.send('conversion-complete', { file: inputPath, success: false, error: 'Failed to get video duration.' });
          return;
        }

        const outputFileName = `converted_${path.basename(inputPath, path.extname(inputPath))}.${selectedOutputFormat}`;
        const outputPath = outputDirectory ? path.join(outputDirectory, outputFileName) : path.join(path.dirname(inputPath), outputFileName);

        let ffmpegArgs = [
          '-y', // Overwrite output files without asking
          '-i',
          inputPath,
          '-c:v', selectedVideoCodec,
          '-preset', 'medium',
          '-c:a', selectedAudioCodec,
          '-b:a', selectedAudioBitrate,
          '-progress', 'pipe:2'
        ];

        // Add video quality/bitrate settings
        if (selectedVideoBitrate === 'auto') {
          // Use CRF (Constant Rate Factor) for quality-based encoding
          ffmpegArgs.push('-crf', selectedVideoQuality);
        } else {
          // Use bitrate-based encoding
          ffmpegArgs.push('-b:v', selectedVideoBitrate);
        }

        let vfArgs = [];
        if (selectedResolution !== 'original') {
          vfArgs.push(`scale=${selectedResolution}`);
        }

        if (volume !== '0') {
          ffmpegArgs.push('-af', `volume=${volume}dB`);
        }

        if (vfArgs.length > 0) {
          ffmpegArgs.push('-vf', vfArgs.join(','));
        }

        ffmpegArgs.push(outputPath);

        const ffmpeg = spawn(ffmpegPath, ffmpegArgs);
        conversionProcesses.set(inputPath, ffmpeg);

        ffmpeg.stderr.on('data', (data) => {
          const progressString = data.toString();
          const currentTime = parseProgress(progressString);
          if (currentTime && duration) {
            const percentage = Math.round((currentTime / duration) * 100);
            event.sender.send('conversion-progress', { file: inputPath, progress: percentage });
          }
        });

        ffmpeg.on('close', (code) => {
          conversionProcesses.delete(inputPath);
          if (code === 0) {
            completedConversions++;
            event.sender.send('conversion-complete', { file: inputPath, success: true });
            if (completedConversions === filePaths.length) {
              event.sender.send('all-conversions-complete');
            }
          } else {
            event.sender.send('conversion-complete', { file: inputPath, success: false, code: code });
          }
        });

        ffmpeg.on('error', (err) => {
          console.error('Failed to start FFmpeg process:', err);
          conversionProcesses.delete(inputPath);
          event.sender.send('conversion-complete', { file: inputPath, success: false, error: err.message });
        });
      });
    });
  });

  ipcMain.on('cancel-conversion', (event, filePath) => {
    const process = conversionProcesses.get(filePath);
    if (process) {
      process.kill();
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Global error handlers for the main process
process.on('uncaughtException', (error) => {
  console.error('Main process uncaughtException:', error);
  // Optionally, you can show a dialog to the user
  // dialog.showErrorBox('Error', error.message);
  app.quit(); // Quit the app gracefully
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Main process unhandledRejection:', reason);
  // Optionally, you can show a dialog to the user
  // dialog.showErrorBox('Error', reason.message);
});
