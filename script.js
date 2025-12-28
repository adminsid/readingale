// Configure PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// App State
const state = {
    pdf: null,
    pdfMeta: null,
    currentPage: 1,
    words: [],
    currentIndex: -1,
    isPlaying: false,
    speed: 180, // WPM
    timer: null,
    selectedPage: null,
    isSpeaking: false,
    synth: window.speechSynthesis,
    voice: null,
    readPages: new Set(),
    currentSentences: [],
    sentenceIndex: -1,
    db: null,
    bgMusic: null,
    currentPdfId: null,
    selectedTrack: 'none',
    isMuted: false,
    customMusicBuffer: null,
    customMusicName: null,
    autoAdvance: false,
    autoAdvanceTimer: null,
    selectedVoiceURI: null,
    currentUtterance: null,
    lastUserScroll: 0,
    syncKey: null
};








// DOM Elements
const elements = {
    fileInput: document.getElementById('file-input'),
    importScreen: document.getElementById('import-screen'),
    selectionScreen: document.getElementById('selection-screen'),
    readerScreen: document.getElementById('reader-screen'),
    pageList: document.getElementById('page-list'),
    confirmBtn: document.getElementById('confirm-selection'),
    wordBox: document.getElementById('word-box'),
    startBtn: document.getElementById('start-btn'),
    resetBtn: document.getElementById('reset-btn'),
    exitBtn: document.getElementById('exit-btn'),
    speedRange: document.getElementById('speed-range'),
    speedValue: document.getElementById('speed-value'),
    progressText: document.getElementById('progress-text'),
    dropZone: document.getElementById('drop-zone'),
    voiceToggle: document.getElementById('voice-toggle'),
    prevPageBtn: document.getElementById('prev-page-btn'),
    nextPageBtn: document.getElementById('next-page-btn'),
    libraryScreen: document.getElementById('library-screen'),
    pdfLibrary: document.getElementById('pdf-library'),
    newImportBtn: document.getElementById('new-import-btn'),
    settingsModal: document.getElementById('settings-modal'),
    openSettingsBtn: document.getElementById('open-settings'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    autoAdvanceToggle: document.getElementById('auto-advance-toggle'),
    muteBtn: document.getElementById('mute-btn'),
    musicOptions: document.querySelectorAll('.music-option'),
    customMusicInput: document.getElementById('custom-music-input'),
    customMusicTrigger: document.getElementById('custom-music-trigger'),
    customTrackName: document.getElementById('custom-track-name'),
    deleteModal: document.getElementById('delete-modal'),


    deletePdfName: document.getElementById('delete-pdf-name'),
    confirmDeleteBtn: document.getElementById('confirm-delete'),
    cancelDeleteBtn: document.getElementById('cancel-delete'),
    voiceSelect: document.getElementById('voice-select'),
    syncKeyInput: document.getElementById('sync-key-input')
};


// --- Initialization ---

elements.fileInput.addEventListener('change', handleFileUpload);
elements.speedRange.addEventListener('input', updateSpeed);
elements.startBtn.addEventListener('click', togglePlayback);
elements.resetBtn.addEventListener('click', resetReader);
elements.exitBtn.addEventListener('click', () => {
    // If in reader, go back to library rather than full reload
    if (elements.readerScreen.classList.contains('active')) {
        loadLibrary();
    } else {
        location.reload();
    }
});
elements.confirmBtn.addEventListener('click', () => startReading(state.selectedPage));
elements.voiceToggle.addEventListener('change', (e) => {
    state.isSpeaking = e.target.checked;
    if (!state.isSpeaking) {
        state.synth.cancel();
    } else if (state.isPlaying) {
        // If we toggle ON while playing, start speech
        pause();
        play();
    }
});

// Periodic sync (Real-time feel)
setInterval(() => {
    if (state.syncKey) syncWithCloud();
}, 45000); // Pulse every 45s

window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.syncKey) {
        syncWithCloud();
    }
});

elements.prevPageBtn.addEventListener('click', () => navigatePage(-1));
elements.nextPageBtn.addEventListener('click', () => navigatePage(1));
elements.newImportBtn.addEventListener('click', showImportScreen);
elements.openSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('active'));
elements.saveSettingsBtn.addEventListener('click', () => {
    const originalText = elements.saveSettingsBtn.textContent;
    elements.saveSettingsBtn.textContent = 'Saving...';
    elements.saveSettingsBtn.disabled = true;
    
    saveSettings().then(() => {
        setTimeout(() => {
            elements.settingsModal.classList.remove('active');
            elements.saveSettingsBtn.textContent = originalText;
            elements.saveSettingsBtn.disabled = false;
        }, 500);
    });
});
elements.autoAdvanceToggle.addEventListener('change', (e) => state.autoAdvance = e.target.checked);
elements.muteBtn.addEventListener('click', toggleMute);
elements.cancelDeleteBtn.addEventListener('click', hideDeleteModal);
elements.confirmDeleteBtn.addEventListener('click', confirmDelete);

elements.customMusicTrigger.addEventListener('click', () => {
    elements.customMusicInput.click();
});

elements.customMusicInput.addEventListener('change', handleCustomMusicUpload);

elements.musicOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        elements.musicOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        state.selectedTrack = opt.dataset.value || 'custom';
        saveSettings();
        handleMusicChange(); 
    });
});

// Track manual scrolling to avoid fighting with auto-scroll
document.getElementById('reading-content').addEventListener('wheel', () => state.lastUserScroll = Date.now());
document.getElementById('reading-content').addEventListener('touchmove', () => state.lastUserScroll = Date.now());
document.getElementById('reading-content').addEventListener('mousedown', () => state.lastUserScroll = Date.now());



// Drag and Drop
elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.style.borderColor = 'var(--accent-color)';
});
elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.style.borderColor = 'var(--surface-border)';
});
elements.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.fileInput.files = e.dataTransfer.files;
    handleFileUpload({ target: elements.fileInput });
});

initDB().then(() => {
    loadLibrary();
    // Voice initialization
    if (state.synth.onvoiceschanged !== undefined) {
        state.synth.onvoiceschanged = populateVoiceList;
    }
    populateVoiceList();
});

function populateVoiceList() {
    let voices = state.synth.getVoices();
    if (voices.length === 0) return;

    // Filter and Sort: English first, then high quality markers, then alphabetical
    voices = voices.sort((a, b) => {
        const aEn = a.lang.startsWith('en');
        const bEn = b.lang.startsWith('en');
        if (aEn && !bEn) return -1;
        if (!aEn && bEn) return 1;

        const aPremium = a.name.includes('Google') || a.name.includes('Enhanced') || a.name.includes('Premium');
        const bPremium = b.name.includes('Google') || b.name.includes('Enhanced') || b.name.includes('Premium');
        if (aPremium && !bPremium) return -1;
        if (!aPremium && bPremium) return 1;

        return a.name.localeCompare(b.name);
    });

    elements.voiceSelect.innerHTML = voices
        .map(v => {
            const isSelected = v.voiceURI === state.selectedVoiceURI ? 'selected' : '';
            const isEn = v.lang.startsWith('en');
            const isPremium = v.name.includes('Google') || v.name.includes('Enhanced') || v.name.includes('Premium');
            const label = isPremium ? `✨ ${v.name}` : v.name;
            return `<option value="${v.voiceURI}" ${isSelected} data-lang="${v.lang}">${label} (${v.lang})</option>`;
        })
        .join('');

    // If no voice is selected yet, pick the best default
    if (!state.selectedVoiceURI) {
        const bestDefault = voices.find(v => v.lang.includes('en-US') && (v.name.includes('Google') || v.name.includes('Enhanced'))) 
                            || voices.find(v => v.lang.includes('en-US')) 
                            || voices.find(v => v.lang.startsWith('en'))
                            || voices[0];
        if (bestDefault) {
            state.selectedVoiceURI = bestDefault.voiceURI;
            state.voice = bestDefault;
            elements.voiceSelect.value = bestDefault.voiceURI;
        }
    } else {
        state.voice = voices.find(v => v.voiceURI === state.selectedVoiceURI) || voices[0];
    }
}

elements.voiceSelect.addEventListener('change', (e) => {
    state.selectedVoiceURI = e.target.value;
    state.voice = state.synth.getVoices().find(v => v.voiceURI === state.selectedVoiceURI);
    saveSettings();
    
    // Immediate feedback if playing
    if (state.isPlaying && state.isSpeaking) {
        state.synth.cancel();
        playWithSpeech();
    }
});




// Keyboard support
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && state.readerScreen.classList.contains('active')) {
        e.preventDefault();
        togglePlayback();
    }
});

// --- File Handling ---

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfId = 'pdf_' + Date.now();
        const pdfMeta = { 
            id: pdfId, 
            name: file.name, 
            readPages: [], 
            lastRead: Date.now() 
        };
        
        await saveToDB(pdfId, arrayBuffer, pdfMeta);
        await loadPdf(arrayBuffer, pdfMeta);
    } catch (error) {
        console.error('Error loading PDF:', error);
        alert('Failed to load PDF. Please try another file.');
    }
}

async function loadPdf(arrayBuffer, meta) {
    state.pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    state.pdfMeta = meta;
    state.readPages = new Set(meta.readPages || []);
    state.currentPdfId = meta.id;
    
    // Load voices
    state.voice = state.synth.getVoices().find(v => v.lang.includes('en')) || state.synth.getVoices()[0];
    
    showSelectionScreen();
}



function showSelectionScreen() {
    hideAllScreens();
    elements.selectionScreen.classList.add('active');

    
    elements.pageList.innerHTML = '';
    for (let i = 1; i <= state.pdf.numPages; i++) {
        const item = document.createElement('div');
        item.className = 'page-item';
        if (state.readPages.has(i)) item.classList.add('read');
        item.innerHTML = `Page ${i}`;
        item.onclick = () => selectPage(i, item);
        elements.pageList.appendChild(item);
    }
}


function selectPage(pageIndex, element) {
    state.selectedPage = pageIndex;
    
    // UI Update
    document.querySelectorAll('.page-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    elements.confirmBtn.disabled = false;
}

// --- Reader Logic ---

async function startReading(pageIndex) {
    state.selectedPage = pageIndex;
    const page = await state.pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    
    // Improved text extraction: maintain line breaks and spaces better
    let text = "";
    let lastY;
    for (let item of textContent.items) {
        if (lastY !== undefined && lastY !== item.transform[5]) {
            text += " \n ";
        }
        text += item.str;
        lastY = item.transform[5];
    }
    
    // Cache the extracted words locally in metadata for cloud sync
    state.pdfMeta.content = text.split(/\s+/).filter(word => word.trim().length > 0);
    updatePdfMeta();
    
    // Mark as reading
    state.readPages.add(pageIndex);
    updatePdfMeta();
    
    // Clean and split text into words while keeping punctuation
    if (state.pdfMeta && state.pdfMeta.content) {
        state.words = state.pdfMeta.content;
    } else {
        state.words = text.split(/\s+/).filter(word => word.trim().length > 0);
    }
    state.currentIndex = -1;
    
    // Prepare UI
    hideAllScreens();
    elements.readerScreen.classList.add('active');
    document.querySelector('.app-container').classList.add('reader-active');

    
    renderWords();
    updateProgress();
    updateNavButtons();
}

function updateNavButtons() {
    elements.prevPageBtn.disabled = state.selectedPage <= 1;
    elements.nextPageBtn.disabled = state.selectedPage >= state.pdf.numPages;
}

async function navigatePage(direction, autoPlay = false) {
    const newPage = state.selectedPage + direction;
    if (newPage >= 1 && newPage <= state.pdf.numPages) {
        pause();
        state.synth.cancel(); // Ensure all speech stops
        elements.nextPageBtn.classList.remove('pulse');
        await startReading(newPage);
        if (autoPlay) play();
    }
}



function renderWords() {
    elements.wordBox.innerHTML = '';
    state.words.forEach((word, index) => {
        const span = document.createElement('span');
        span.className = 'word';
        span.textContent = word;
        span.id = `word-${index}`;
        elements.wordBox.appendChild(span);
    });
}

function togglePlayback() {
    if (state.isPlaying) {
        pause();
    } else {
        play();
    }
}

function play() {
    if (state.currentIndex >= state.words.length - 1) {
        resetReader();
    }
    state.isPlaying = true;
    elements.startBtn.textContent = '⏸';
    
    if (state.isSpeaking) {
        playWithSpeech();
    } else {
        runTimer();
    }
}

function playWithSpeech() {
    if (!state.isPlaying) return;
    
    // Stop any current speech
    state.synth.cancel();

    const remainingWords = state.words.slice(state.currentIndex + 1);
    if (remainingWords.length === 0) {
        finishPage();
        return;
    }

    // 1. Natural Flow: Find next sentence boundary for better prosody and pauses
    let sentenceWords = [];
    let endIdxInRemaining = -1;
    for (let i = 0; i < remainingWords.length; i++) {
        const word = remainingWords[i];
        sentenceWords.push(word);
        // Break at sentence ends, but avoid common abbreviations
        const isCommonAbbrev = /^(Mr|Ms|Dr|St|Prof|etc|vs)\.$/i.test(word);
        if (/[.!?]$/.test(word) && !isCommonAbbrev) {
            endIdxInRemaining = i;
            break;
        }
        // Also break if it's getting too long (for sync stability)
        if (sentenceWords.length > 25) {
            endIdxInRemaining = i;
            break;
        }
    }
    
    const textToSpeak = sentenceWords.join(' ');
    const normalizedText = normalizeText(textToSpeak);
    const speechBaseIndex = state.currentIndex;

    const utterance = new SpeechSynthesisUtterance(normalizedText);
    utterance.voice = state.voice;
    // Speed matching: 180 WPM approx maps to 1.0 rate
    utterance.rate = state.speed / 185; 
    utterance.pitch = 1.05; // Slightly higher pitch for more "energetic/human" feel
    utterance.volume = 1.0;
    state.currentUtterance = utterance;

    // Word boundary tracking for karaoke sync
    utterance.onboundary = (event) => {
        if (event.name === 'word' && state.isPlaying) {
            const currentSubText = textToSpeak.substring(0, event.charIndex);
            // More robust word counting
            const wordOffset = currentSubText.trim() === "" ? 0 : currentSubText.trim().split(/\s+/).length;
            
            state.currentIndex = speechBaseIndex + 1 + wordOffset;
            
            highlightWord(state.currentIndex);
            updateProgress();
            
            const currentWordEl = document.getElementById(`word-${state.currentIndex}`);
            if (currentWordEl) {
                // Only auto-scroll if the user hasn't scrolled manually in the last 2 seconds
                const now = Date.now();
                if (now - state.lastUserScroll > 2000) {
                    currentWordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    };

    utterance.onend = () => {
        if (state.isPlaying) {
            if (state.currentIndex >= state.words.length - 1) {
                finishPage();
            } else {
                // NATURAL PAUSE: Human-like delay between sentences
                const pauseTime = /[.!?]$/.test(sentenceWords[sentenceWords.length-1]) ? 600 : 200;
                state.timer = setTimeout(() => {
                    if (state.isPlaying) playWithSpeech();
                }, pauseTime);
            }
        }
    };

    utterance.onerror = (e) => {
        console.error('TTS Error:', e);
        if (state.isPlaying) {
            state.timer = setTimeout(() => playWithSpeech(), 100);
        }
    };

    state.synth.speak(utterance);
}


function runTimer() {
    if (!state.isPlaying) return;

    const interval = (60 / state.speed) * 1000;
    let delay = interval;

    // Natural Flow: Add delay for punctuation
    const currentWord = state.words[state.currentIndex];
    if (currentWord) {
        if (/[.!?]$/.test(currentWord)) delay = interval * 3; // Long pause for end of sentence
        else if (/[,;:]$/.test(currentWord)) delay = interval * 1.5; // Short pause
    }

    state.timer = setTimeout(() => {
        if (state.currentIndex < state.words.length - 1) {
            nextWord();
            runTimer();
        } else {
            finishPage();
        }
    }, delay);
}

function finishPage() {
    state.isPlaying = false;
    elements.startBtn.textContent = '▶';
    clearTimeout(state.timer);
    
    // Visual cue for next page
    if (state.selectedPage < state.pdf.numPages) {
        elements.nextPageBtn.classList.add('pulse');
        
        // AUTO-ADVANCE LOGIC: Functional & Interruptible
        if (state.autoAdvance) {
            state.autoAdvanceTimer = setTimeout(() => navigatePage(1, true), 2000); 
        }
    }
}

function pause() {
    state.isPlaying = false;
    elements.startBtn.textContent = '▶';
    clearTimeout(state.timer);
    clearTimeout(state.autoAdvanceTimer); // STOP auto-advance if user pauses
    state.synth.cancel(); // Stop talking when paused
}



function nextWord() {
    if (state.currentIndex < state.words.length - 1) {
        state.currentIndex++;
        const word = state.words[state.currentIndex];
        highlightWord(state.currentIndex);
        updateProgress();
        
        if (state.isSpeaking) {
            handleProfessionalVoice(word);
        }
        
        const currentWordEl = document.getElementById(`word-${state.currentIndex}`);
        if (currentWordEl) {
            const now = Date.now();
            if (now - state.lastUserScroll > 2000) {
                currentWordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
}



function normalizeText(text) {
    if (!text) return "";
    return text
        .replace(/\bI\b/g, 'i') // Fix 'I' sounding like 'Capital I'
        .replace(/(\b[0-9]+)\s?-\s?([0-9]+\b)/g, '$1 to $2') // 10-20 -> 10 to 20
        .replace(/(\w)-(\w)/g, '$1 $2'); // hypenated-words -> hypenated words
}

function handleProfessionalVoice(word) {
    // This is used for word-by-word fallback if needed
    const speakWord = normalizeText(word);
    const utterance = new SpeechSynthesisUtterance(speakWord);
    utterance.voice = state.voice;
    utterance.rate = state.speed / 160;
    utterance.pitch = 1.0;
    state.synth.speak(utterance);
}




function highlightWord(index) {
    // Reset previous
    document.querySelectorAll('.word').forEach(el => {
        el.classList.remove('active');
    });
    
    // Mark previous as read if desired, but karaoke usually shows current
    for(let i = 0; i < index; i++) {
        document.getElementById(`word-${i}`).classList.add('read');
    }

    const current = document.getElementById(`word-${index}`);
    if (current) {
        current.classList.add('active');
        current.classList.remove('read');
    }
}

function resetReader() {
    pause();
    state.currentIndex = -1;
    document.querySelectorAll('.word').forEach(el => {
        el.classList.remove('active', 'read');
    });
    updateProgress();
    document.getElementById('reading-content').scrollTop = 0;
}

function updateSpeed(e) {
    state.speed = parseInt(e.target.value);
    elements.speedValue.textContent = state.speed;
    
    // If playing, restart timer with new speed
    if (state.isPlaying) {
        pause();
        play();
    }
}

function updateProgress() {
    const current = Math.max(0, state.currentIndex + 1);
    elements.progressText.textContent = `Word ${current} / ${state.words.length}`;
}

// --- Storage & Helper Logic ---

function hideAllScreens() {
    pause(); // Ensure everything stops
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelector('.app-container').classList.remove('reader-active');
}

function showImportScreen() {
    hideAllScreens();
    elements.importScreen.classList.add('active');
}

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ReadingaleDB', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            db.createObjectStore('pdfs', { keyPath: 'id' });
            db.createObjectStore('meta', { keyPath: 'id' });
            db.createObjectStore('settings', { keyPath: 'id' });
        };
        request.onsuccess = (e) => {
            state.db = e.target.result;
            loadSettings();
            resolve();
        };

        request.onerror = reject;
    });
}

async function saveToDB(id, buffer, meta) {
    const tx = state.db.transaction(['pdfs', 'meta'], 'readwrite');
    tx.objectStore('pdfs').put({ id, data: buffer });
    tx.objectStore('meta').put(meta);
    return new Promise(resolve => tx.oncomplete = resolve);
}

async function updatePdfMeta() {
    if (!state.pdfMeta) return;
    state.pdfMeta.readPages = Array.from(state.readPages);
    state.pdfMeta.lastRead = Date.now();
    const tx = state.db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(state.pdfMeta);
    syncWithCloud();
}

async function loadLibrary() {
    const tx = state.db.transaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    const request = store.getAll();
    request.onsuccess = () => {
        const items = request.result;
        if (items.length === 0) {
            showImportScreen();
            return;
        }
        hideAllScreens();
        elements.libraryScreen.classList.add('active');
        renderLibrary(items);
    };
}

function renderLibrary(items) {
    elements.pdfLibrary.innerHTML = '';
    items.sort((a,b) => b.lastRead - a.lastRead).forEach(item => {
        const card = document.createElement('div');
        card.className = 'pdf-card';
        card.innerHTML = `
            <h3>${item.name}</h3>
            <div class="meta">
                ${item.readPages.length} pages read • last seen: ${new Date(item.lastRead).toLocaleDateString()}
            </div>
            <button class="delete-pdf-btn" title="Delete">×</button>
        `;
        card.querySelector('.delete-pdf-btn').onclick = (e) => {
            e.stopPropagation();
            showDeleteModal(item);
        };
        card.onclick = () => loadFromLibrary(item.id);
        elements.pdfLibrary.appendChild(card);
    });
}

async function loadFromLibrary(id) {
    const tx = state.db.transaction(['pdfs', 'meta'], 'readonly');
    const pdfReq = tx.objectStore('pdfs').get(id);
    const metaReq = tx.objectStore('meta').get(id);
    
    Promise.all([
        new Promise(r => pdfReq.onsuccess = () => r(pdfReq.result)),
        new Promise(r => metaReq.onsuccess = () => r(metaReq.result))
    ]).then(([pdfObj, metaObj]) => {
        if (!pdfObj && metaObj && metaObj.content) {
            // Book from cloud, no local PDF binary - but we have the words!
            state.pdf = null;
            state.pdfMeta = metaObj;
            state.readPages = new Set(metaObj.readPages || []);
            state.currentPdfId = metaObj.id;
            state.words = metaObj.content;
            state.currentIndex = -1;
            
            hideAllScreens();
            elements.readerScreen.classList.add('active');
            document.querySelector('.app-container').classList.add('reader-active');
            renderWords();
            updateProgress();
            updateNavButtons();
        } else if (pdfObj) {
            loadPdf(pdfObj.data, metaObj);
        }
    });
}

let pendingDelete = null;
function showDeleteModal(item) {
    pendingDelete = item;
    elements.deletePdfName.textContent = item.name;
    elements.deleteModal.classList.add('active');
}

function hideDeleteModal() {
    elements.deleteModal.classList.remove('active');
    pendingDelete = null;
}

async function confirmDelete() {
    if (!pendingDelete) return;
    const tx = state.db.transaction(['pdfs', 'meta'], 'readwrite');
    tx.objectStore('pdfs').delete(pendingDelete.id);
    tx.objectStore('meta').delete(pendingDelete.id);
    tx.oncomplete = () => {
        hideDeleteModal();
        loadLibrary();
    };
}

// Background Music Logic
const tracks = {
    lofi: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    rain: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    waves: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    zen: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
    space: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3',
    cafe: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3'
};

function handleMusicChange() {
    if (state.bgMusic) {
        state.bgMusic.pause();
        state.bgMusic = null;
    }
    
    if (state.selectedTrack !== 'none') {
        let src = tracks[state.selectedTrack];
        
        // Handle custom music
        if (state.selectedTrack === 'custom') {
            if (state.customMusicBuffer) {
                const blob = new Blob([state.customMusicBuffer]);
                src = URL.createObjectURL(blob);
            } else {
                return; // Nothing to play
            }
        }
        
        state.bgMusic = new Audio(src);
        state.bgMusic.loop = true;
        state.bgMusic.volume = state.isMuted ? 0 : 0.3;
        state.bgMusic.play().catch(e => console.log("Music play blocked", e));
    }
}

async function handleCustomMusicUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    state.customMusicBuffer = buffer;
    state.customMusicName = file.name;
    elements.customTrackName.textContent = file.name;
    
    // Auto-select custom track
    state.selectedTrack = 'custom';
    elements.musicOptions.forEach(o => {
        o.classList.remove('selected');
        if (o.id === 'custom-music-trigger') o.classList.add('selected');
    });

    saveSettings();
    handleMusicChange();
}

async function saveSettings() {
    if (!state.db) return;
    return new Promise((resolve) => {
        const tx = state.db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put({
            id: 'user_preferences',
            track: state.selectedTrack,
            customBuffer: state.customMusicBuffer,
            customName: state.customMusicName,
            autoAdvance: state.autoAdvance,
            voiceURI: state.selectedVoiceURI,
            syncKey: elements.syncKeyInput.value.trim()
        });
        tx.oncomplete = () => {
            state.syncKey = elements.syncKeyInput.value.trim();
            syncWithCloud();
            resolve();
        };
    });
}

async function loadSettings() {
    const tx = state.db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get('user_preferences');
    req.onsuccess = () => {
        const set = req.result;
        if (set) {
            state.selectedTrack = set.track;
            state.customMusicBuffer = set.customBuffer;
            state.customMusicName = set.customName;
            state.autoAdvance = set.autoAdvance || false;
            state.selectedVoiceURI = set.voiceURI;
            state.syncKey = set.syncKey;
            
            // Sync UI
            elements.autoAdvanceToggle.checked = state.autoAdvance;
            if (state.selectedVoiceURI && state.voiceSelect) {
                state.voiceSelect.value = state.selectedVoiceURI;
            }
            if (state.customMusicName) {
                elements.customTrackName.textContent = state.customMusicName;
            }
            if (state.syncKey && elements.syncKeyInput) {
                elements.syncKeyInput.value = state.syncKey;
            }
            
            elements.musicOptions.forEach(o => {
                if (o.dataset.value === state.selectedTrack || (state.selectedTrack === 'custom' && o.id === 'custom-music-trigger')) {
                    o.classList.add('selected');
                }
            });
            
            handleMusicChange();
            syncWithCloud();
        }
    };
}

async function syncWithCloud() {
    if (!state.syncKey) return;

    try {
        // Collect local library metadata
        const tx = state.db.transaction('meta', 'readonly');
        const store = tx.objectStore('meta');
        const localLibrary = await new Promise(resolve => {
            store.getAll().onsuccess = (e) => resolve(e.target.result);
        });

        const syncData = {
            syncKey: state.syncKey,
            settings: {
                speed: state.speed,
                voiceURI: state.selectedVoiceURI,
                selectedTrack: state.selectedTrack,
                autoAdvance: state.autoAdvance
            },
            library: localLibrary.map(item => ({
                id: item.id,
                name: item.name,
                lastRead: item.lastRead,
                readPages: item.readPages,
                content: item.content // Sync extracted text
            }))
        };

        const response = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncData)
        });

        if (!response.ok) throw new Error('Sync failed');

        const cloudState = await response.json();
        
        // Merge cloud library metadata into local IndexedDB
        if (cloudState.library) {
            const mtx = state.db.transaction('meta', 'readwrite');
            const mstore = mtx.objectStore('meta');
            for (const item of cloudState.library) {
                const localItemRequest = mstore.get(item.id);
                localItemRequest.onsuccess = (e) => {
                    const localItem = e.target.result;
                    // If doesn't exist locally, or cloud is newer (higher lastRead)
                    if (!localItem || item.lastRead > localItem.lastRead) {
                        mstore.put({
                            id: item.id,
                            name: item.name,
                            lastRead: item.lastRead,
                            readPages: item.readPages,
                            content: item.content || (localItem ? localItem.content : null)
                        });
                        
                        // If we are currently reading this PDF, we might want to update the UI
                        // but let's keep it simple for now: it will be updated next time they open the library
                    }
                };
            }
        }

        // Apply cloud settings if they differ significantly (optional refinement)
        if (cloudState.settings) {
            // Note: We might want to be careful here to not overwrite recent local changes
            // For now, let's just ensure settings are loaded on app start
        }

        console.log('Cloud sync complete');
    } catch (err) {
        console.error('Cloud sync error:', err);
    }
}



function toggleMute() {
    state.isMuted = !state.isMuted;
    if (state.bgMusic) {
        state.bgMusic.volume = state.isMuted ? 0 : 0.3;
    }
    elements.muteBtn.textContent = state.isMuted ? '🔇' : '🔊';
}


