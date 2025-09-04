document.addEventListener('DOMContentLoaded', () => {
    const selectVideosButton = document.getElementById('selectVideos');
    const startConversionButton = document.getElementById('startConversion');
    const progressDiv = document.getElementById('progress');
    const resolutionSelect = document.getElementById('resolution');
    const videoCodecSelect = document.getElementById('videoCodec');
    const outputFormatSelect = document.getElementById('outputFormat');
    const videoQualitySelect = document.getElementById('videoQuality');
    const videoBitrateSelect = document.getElementById('videoBitrate');
    const audioCodecSelect = document.getElementById('audioCodec');
    const audioBitrateSelect = document.getElementById('audioBitrate');
    const selectedFilesList = document.getElementById('selectedFilesList');
    const sameDirectoryAsInput = document.getElementById('sameDirectoryAsInput');
    const outputDirectoryInput = document.getElementById('outputDirectory');
    const browseOutputDirectoryButton = document.getElementById('browseOutputDirectory');
    const volumeSlider = document.getElementById('volume');
    const volumeValue = document.getElementById('volumeValue');
    const themeToggle = document.getElementById('themeToggle');

    // App state
    let selectedFiles = [];
    let conversionStatus = {};

    // disable context menu
    document.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });

    function applyTheme(theme) {
        document.documentElement.classList.remove('light-theme', 'dark-theme');
        document.documentElement.classList.add(theme);
        localStorage.setItem('theme', theme);
    }
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else if (prefersDarkScheme.matches) {
        applyTheme('dark-theme');
    } else {
        applyTheme('light-theme');
    }
    prefersDarkScheme.addEventListener('change', (event) => {
        if (!localStorage.getItem('theme')) {
            applyTheme(event.matches ? 'dark-theme' : 'light-theme');
        }
    });
    themeToggle.addEventListener('click', () => {
        const currentTheme = localStorage.getItem('theme') || (prefersDarkScheme.matches ? 'dark-theme' : 'light-theme');
        if (currentTheme === 'dark-theme') {
            applyTheme('light-theme');
        } else {
            applyTheme('dark-theme');
        }
    });

    volumeSlider.addEventListener('input', () => {
        volumeValue.textContent = `${volumeSlider.value} dB`;
    });

    selectVideosButton.addEventListener('click', async () => {
        const filePaths = await window.api.invoke('open-file-dialog');
        if (filePaths.length === 0) {
            alert('No video files selected.');
            return;
        }
        selectedFiles = filePaths.map(filePath => ({ name: filePath.split('\\').pop(), path: filePath }));
        updateFileList();
    });

    browseOutputDirectoryButton.addEventListener('click', async () => {
        const directoryPath = await window.api.invoke('open-directory-dialog');
        if (directoryPath) {
            outputDirectoryInput.value = directoryPath;
        }
    });

    sameDirectoryAsInput.addEventListener('change', () => {
        if (sameDirectoryAsInput.checked) {
            outputDirectoryInput.disabled = true;
            browseOutputDirectoryButton.disabled = true;
        } else {
            outputDirectoryInput.disabled = false;
            browseOutputDirectoryButton.disabled = false;
        }
    });

    startConversionButton.addEventListener('click', () => {
        if (selectedFiles.length === 0) {
            alert('Please select video files first.');
            return;
        }

        const filePaths = selectedFiles.map(file => file.path);
        const selectedResolution = resolutionSelect?.value || 'original';
        const selectedVideoCodec = videoCodecSelect?.value || 'libx264';
        const selectedOutputFormat = outputFormatSelect?.value || 'mp4';
        const selectedVideoQuality = videoQualitySelect?.value || '23';
        const selectedVideoBitrate = videoBitrateSelect?.value || 'auto';
        const selectedAudioCodec = audioCodecSelect?.value || 'aac';
        const selectedAudioBitrate = audioBitrateSelect?.value || '128k';
        const outputDirectory = sameDirectoryAsInput.checked ? null : outputDirectoryInput.value;
        const volume = volumeSlider.value;

        if (!sameDirectoryAsInput.checked && !outputDirectory) {
            alert('Please select an output directory.');
            return;
        }

        progressDiv.innerHTML = 'Starting conversion...';
        conversionStatus = {};
        selectedFiles.forEach(file => {
            conversionStatus[file.path] = { progress: 0, completed: false };
        });
        updateProgressDisplay();
        window.api.send('start-conversion', filePaths, selectedResolution, selectedVideoCodec, outputDirectory, volume, selectedOutputFormat, selectedVideoQuality, selectedVideoBitrate, selectedAudioCodec, selectedAudioBitrate);
    });

    progressDiv.addEventListener('click', (event) => {
        if (event.target.classList.contains('cancel-btn')) {
            const filePath = event.target.dataset.filePath;
            window.api.send('cancel-conversion', filePath);
        }
    });

    window.api.on('conversion-progress', (data) => {
        if (conversionStatus[data.file]) {
            conversionStatus[data.file].progress = data.progress;
            updateProgressDisplay();
        }
    });

    window.api.on('conversion-complete', (data) => {
        if (conversionStatus[data.file]) {
            conversionStatus[data.file].completed = true;
            if (data.success) {
                conversionStatus[data.file].progress = 100;
                conversionStatus[data.file].message = 'Completed';
            } else {
                conversionStatus[data.file].message = `Failed: (Error: ${data.error || data.code})`;
            }
            updateProgressDisplay();
        }
    });

    window.api.on('all-conversions-complete', () => {
        progressDiv.innerHTML += '<br>All conversions finished!';
    });

    function updateFileList() {
        selectedFilesList.innerHTML = ''; // clear previous list
        if (selectedFiles.length === 0) {
            selectedFilesList.innerHTML = '<li class="list-group-item">No files selected</li>';
        } else {
            selectedFiles.forEach(file => {
                const listItem = document.createElement('li');
                listItem.className = 'list-group-item';
                listItem.textContent = file.name;
                selectedFilesList.appendChild(listItem);
            });
        }
    }

    function updateProgressDisplay() {
        let display = '';
        for (const file in conversionStatus) {
            const fileName = file.split('\\').pop();
            const status = conversionStatus[file];
            const progress = status.progress || 0;
            const message = status.message || '';
            display += `
                <div class="progress-item">
                    <div>${fileName}</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${progress}%;">${progress}%</div>
                    </div>
                    <div class="progress-message">${message}</div>
                    ${status.completed ? '' : `<button class="cancel-btn" data-file-path="${file}">Cancel</button>`}
                </div>
            `;
        }
        progressDiv.innerHTML = display;
    }
});
