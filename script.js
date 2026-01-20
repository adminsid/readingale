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
    currentUtterance: null,
    lastUserScroll: 0,
    token: null, // Replaces syncKey
    username: null,
    isLoggedIn: false
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
    syncKeyInput: document.getElementById('sync-key-input'),
    // Auth Elements
    loginScreen: document.getElementById('login-screen'),
    authForm: document.getElementById('auth-form'),
    authUsername: document.getElementById('auth-username'),
    authPin: document.getElementById('auth-pin'),
    authTabs: document.querySelectorAll('.auth-tab'),
    authSubmit: document.getElementById('auth-submit'),
    authError: document.getElementById('auth-error'),
    userProfile: document.getElementById('user-profile'),
    profileUsername: document.getElementById('profile-username'),
    profileModal: document.getElementById('profile-modal'),
    modalUsername: document.getElementById('modal-username'),
    closeProfileBtn: document.getElementById('close-profile'),
    logoutBtn: document.getElementById('logout-btn'),
    openSettingsProfileBtn: document.getElementById('open-settings-profile')
};


// --- Initialization ---
async function apiCall(endpoint, method = 'GET', body = null) {
    if (!state.token) return null;
    
    const options = {
        method,
        headers: {
            'Authorization': state.token,
            'Content-Type': 'application/json'
        }
    };

    if (body) options.body = JSON.stringify(body);

    const response = await fetch(endpoint, options);
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return await response.json();
}

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

// Periodic sync removed
// Visibility change sync removed

elements.prevPageBtn.addEventListener('click', () => navigatePage(-1));
elements.nextPageBtn.addEventListener('click', () => navigatePage(1));
elements.newImportBtn.addEventListener('click', showImportScreen);
if (elements.openSettingsBtn) {
    elements.openSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('active'));
}
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

// Auth Logic
let authMode = 'login';

elements.authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        elements.authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        authMode = tab.dataset.tab;
        elements.authSubmit.textContent = authMode === 'login' ? 'Login' : 'Sign Up';
        elements.authError.textContent = '';
    });
});

elements.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = elements.authUsername.value.trim();
    const pin = elements.authPin.value.trim();
    
    if (!username || pin.length !== 4) {
        elements.authError.textContent = 'Please enter a valid username and 4-digit PIN.';
        return;
    }

    elements.authSubmit.textContent = 'Processing...';
    elements.authSubmit.disabled = true;
    elements.authError.textContent = '';

    try {
        const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, pin })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Authentication failed');
        }

        // Success
        handleAuthSuccess(data.username, data.token);

    } catch (err) {
        elements.authError.textContent = err.message;
    } finally {
        elements.authSubmit.textContent = authMode === 'login' ? 'Login' : 'Sign Up';
        elements.authSubmit.disabled = false;
    }
});

function handleAuthSuccess(username, token) {
    state.username = username;
    state.token = token;
    state.isLoggedIn = true;

    // Persist session locally
    localStorage.setItem('readingale_user', JSON.stringify({ username, token }));

    // Update UI
    elements.profileUsername.textContent = username;
    elements.modalUsername.textContent = username;
    elements.loginScreen.classList.remove('active');
    
    // Header UI
    elements.userProfile.style.display = 'flex';
    
    // Load Data
    loadSettings();
    loadLibrary();
}

elements.userProfile.addEventListener('click', () => {
    elements.profileModal.classList.add('active');
});

elements.closeProfileBtn.addEventListener('click', () => {
    elements.profileModal.classList.remove('active');
});

elements.logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('readingale_user');
        location.reload();
    }
});

elements.openSettingsProfileBtn.addEventListener('click', () => {
    elements.profileModal.classList.remove('active');
    elements.settingsModal.classList.add('active');
});

initDB().then(() => {
    // Check for existing session
    const storedUser = localStorage.getItem('readingale_user');
    if (storedUser) {
        try {
            const { username, token } = JSON.parse(storedUser);
            if (username && token) {
                handleAuthSuccess(username, token);
                // Also init voice list
                if (state.synth.onvoiceschanged !== undefined) {
                    state.synth.onvoiceschanged = populateVoiceList;
                }
                populateVoiceList();
            } else {
                // Invalid storage
                elements.loginScreen.classList.add('active'); 
            }
        } catch (e) {
             elements.loginScreen.classList.add('active');
        }
    } else {
        // Show Login
        elements.loginScreen.classList.add('active');
    }
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
        
        // 1. Save metadata to Cloud DB
        await apiCall('/api/books', 'POST', pdfMeta);

        // 2. Save to Local DB (Cache)
        await saveToDB(pdfId, arrayBuffer, pdfMeta);
        
        // 3. Load into Reader
        await loadPdf(arrayBuffer, pdfMeta);
        
        // 4. Background upload to R2
        uploadToR2(pdfId, file);
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
    
    // Save to Local DB
    const tx = state.db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(state.pdfMeta);
    
    // Save to Cloud DB
    // Fire and forget to avoid blocking reader
    apiCall(`/api/books/${state.pdfMeta.id}`, 'PUT', {
        lastRead: state.pdfMeta.lastRead,
        readPages: state.pdfMeta.readPages
    }).catch(e => console.error('Progress save failed', e));
}

async function loadLibrary() {
    try {
        const response = await apiCall('/api/books');
        if (response && response.success) {
            // Update Local Cache
            const tx = state.db.transaction('meta', 'readwrite');
            const store = tx.objectStore('meta');
            // Clear existing metadata to avoid stale items? Or merge?
            // Merging is safer for now, or just overwrite since server is truth
            for (const item of response.library) {
                 store.put(item);
            }
            // If offline, we might have items locally not on server? 
            // For now, let's just render what we get from server + local
            // But to keep it simple, we render from local AFTER updating from server
        }
    } catch (e) {
        console.log('Offline or API error, loading from local cache');
    }

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
        const backupIcon = item.hasBinary ? '<span class="cloud-icon" title="Backed up to cloud">☁️</span>' : '';
        card.innerHTML = `
            <h3>${item.name} ${backupIcon}</h3>
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
    
    const [pdfObj, metaObj] = await Promise.all([
        new Promise(r => pdfReq.onsuccess = () => r(pdfReq.result)),
        new Promise(r => metaReq.onsuccess = () => r(metaReq.result))
    ]);

    if (!pdfObj && metaObj && metaObj.hasBinary) {
        // Missing locally but in R2 - download first
        console.log('PDF missing locally, downloading from cloud...');
        const downloadedBlob = await downloadFromR2(metaObj.id);
        if (downloadedBlob) {
            const arrayBuffer = await downloadedBlob.arrayBuffer();
            await saveToDB(metaObj.id, arrayBuffer, metaObj);
            loadPdf(arrayBuffer, metaObj);
        } else {
            // Fallback to text sync if download fails
            renderReaderFromMetadata(metaObj);
        }
    } else if (!pdfObj && metaObj && metaObj.content) {
        // Legacy/Text-only fallback
        renderReaderFromMetadata(metaObj);
    } else if (pdfObj) {
        loadPdf(pdfObj.data, metaObj);
    }
}

function renderReaderFromMetadata(metaObj) {
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

    // R2 Backup for custom music
    uploadToR2('music_' + state.syncKey, file);
}

async function saveSettings() {
    if (!state.db) return;
    return new Promise((resolve) => {
        const settings = {
            id: 'user_preferences',
            track: state.selectedTrack,
            customBuffer: state.customMusicBuffer,
            customName: state.customMusicName, // Note: Binary buffer won't sync via JSON well, custom music needs rework if we want full sync
            autoAdvance: state.autoAdvance,
            voiceURI: state.selectedVoiceURI
        };

        const tx = state.db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put(settings);
        tx.oncomplete = () => {
            // Sync lightweight settings to cloud
            apiCall('/api/settings', 'PUT', {
                track: settings.track,
                adjustSpeed: state.speed, // Add speed to settings
                autoAdvance: settings.autoAdvance,
                voiceURI: settings.voiceURI,
                customName: settings.customName
            }).catch(e => console.error('Settings sync failed', e));
            
            resolve();
        };
    });
}

async function loadSettings() {
    // Try Cloud first
    try {
        const res = await apiCall('/api/settings');
        if (res && res.success && res.settings) {
            const set = res.settings;
            // Merge with local state
            if (set.track) state.selectedTrack = set.track;
            if (set.autoAdvance !== undefined) state.autoAdvance = set.autoAdvance;
            if (set.voiceURI) state.selectedVoiceURI = set.voiceURI;
            if (set.adjustSpeed) state.speed = set.adjustSpeed;
            if (set.customName) state.customMusicName = set.customName;
            
            // Should also update local DB
            // ... (skipping for brevity, UI update is more important)
        }
    } catch (e) {
        console.log('Settings load failed, using local');
    }

    // Load from local DB (for custom music buffer which is heavy)
    const tx = state.db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const req = store.get('user_preferences');
    req.onsuccess = () => {
        const set = req.result;
        if (set) {
            // Local might have the binary buffer which cloud doesn't have
            if (set.customBuffer) state.customMusicBuffer = set.customBuffer;
            if (!state.selectedTrack) state.selectedTrack = set.track; // Fallback if cloud failed
            
            // Sync UI
            elements.autoAdvanceToggle.checked = state.autoAdvance;
            if (state.selectedVoiceURI && state.voiceSelect) {
                state.voiceSelect.value = state.selectedVoiceURI;
            }
            if (state.customMusicName) {
                elements.customTrackName.textContent = state.customMusicName;
            }
            
            elements.musicOptions.forEach(o => {
                if (o.dataset.value === state.selectedTrack || (state.selectedTrack === 'custom' && o.id === 'custom-music-trigger')) {
                    o.classList.add('selected');
                }
            });
            
            handleMusicChange();
        }
    };
}

async function confirmDelete() {
    if (!pendingDelete) return;
    
    // API Call
    apiCall(`/api/books/${pendingDelete.id}`, 'DELETE');

    const tx = state.db.transaction(['pdfs', 'meta'], 'readwrite');
    tx.objectStore('pdfs').delete(pendingDelete.id);
    tx.objectStore('meta').delete(pendingDelete.id);
    tx.oncomplete = () => {
        hideDeleteModal();
        loadLibrary();
    };
}

// Sync function removed - fully replaced by API calls in specific actions

async function uploadToR2(id, file) {
    if (!state.token) return;
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('id', id);
        formData.append('token', state.token); // Updated key

        const response = await fetch('/api/assets/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            console.log(`Resource ${id} backed up to R2`);
            // Update local metadata to show it's backed up
            if (id.startsWith('pdf_')) {
                const tx = state.db.transaction('meta', 'readwrite');
                const store = tx.objectStore('meta');
                const req = store.get(id);
                req.onsuccess = () => {
                    const meta = req.result;
                    if (meta) {
                        meta.hasBinary = true;
                        store.put(meta);
                        // Refresh library UI if visible
                        if (elements.libraryScreen.classList.contains('active')) {
                            loadLibrary();
                        }
                    }
                };
            }
        }
    } catch (err) {
        console.error('R2 upload failed:', err);
    }
}

async function downloadFromR2(id) {
    try {
        const response = await fetch(`/api/assets/download/${id}`);
        if (!response.ok) throw new Error('Download failed');
        return await response.blob();
    } catch (err) {
        console.error('R2 download failed:', err);
        return null;
    }
}



function toggleMute() {
    state.isMuted = !state.isMuted;
    if (state.bgMusic) {
        state.bgMusic.volume = state.isMuted ? 0 : 0.3;
    }
    elements.muteBtn.textContent = state.isMuted ? '🔇' : '🔊';
}


