import {
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    doc,
    setDoc,
    collection,
    query,
    onSnapshot,
    increment,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- DOM ELEMENTS ---
const audioPlayer = document.getElementById('audioPlayer');
const playlistContainer = document.getElementById('playlist');
const searchInput = document.getElementById('searchInput');
const playPauseBtn = document.getElementById('playPauseBtn');
const playPauseIcon = document.getElementById('playPauseIcon');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const seekBar = document.getElementById('seekBar');
const volumeBar = document.getElementById('volumeBar');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const playerAlbumArt = document.getElementById('player-album-art');
const playerSongTitle = document.getElementById('player-song-title');
const playerSongArtist = document.getElementById('player-song-artist');
const userAuthContainer = document.getElementById('user-auth-container');
const accountModal = document.getElementById('accountModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const logoutBtn = document.getElementById('logoutBtn');
const accountInfoContainer = document.getElementById('account-info');
const lyricsContent = document.getElementById('lyrics-content');
const lyricsSongTitle = document.getElementById('lyrics-song-title');
const lyricsSongArtist = document.getElementById('lyrics-song-artist');
const topTracksList = document.getElementById('top-tracks-list');
const downloadBtn = document.getElementById('downloadBtn');
const lyricsSection = document.getElementById('lyrics-section');
const lyricsToggleBtn = document.getElementById('lyricsToggleBtn');

// --- APP STATE ---
let hls;
let playlist = [];
let currentIndex = -1;
let isPlaying = false;
let currentUser = null;

const playlistUrl = 'https://raw.githubusercontent.com/oxyisbad222/eviltwins/main/juice.m3u8';
const geniusApiUrl = '/api/lyrics';

// --- INITIALIZATION ---
document.addEventListener('firebase-ready', async () => {
    console.log("Firebase is ready. Initializing app...");
    const auth = window.auth;
    const db = window.db;

    // **FIXED: Await playlist loading to prevent race conditions**
    await loadPlaylist(); 
    
    setupEventListeners(auth);
    setupAuthObserver(auth);
    setupTopTracksListener(db);
});

/**
 * Loads and parses the M3U8 playlist file.
 */
async function loadPlaylist() {
    try {
        // Use a cache-busting query parameter to ensure we get the latest version
        const response = await fetch(`${playlistUrl}?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
        }
        const m3u8Content = await response.text();
        if (!m3u8Content) {
            throw new Error("Playlist file is empty.");
        }
        parseM3u8(m3u8Content);
        if (playlist.length === 0) {
            throw new Error("Playlist parsed, but no valid songs were found. Check the format of juice.m3u8.");
        }
        renderPlaylist(); // Render the full playlist now that it's loaded
    } catch (error) {
        console.error("Fatal Error loading playlist:", error);
        playlistContainer.innerHTML = `
            <div class="p-4 text-center text-red-400 bg-red-900/20 rounded-lg">
                <p class="font-bold">Failed to load music library.</p>
                <p class="text-sm mt-2">Please ensure the <a href="${playlistUrl}" target="_blank" class="underline">playlist file</a> is accessible and correctly formatted. Refreshing the page might help.</p>
            </div>
        `;
    }
}

/**
 * Parses the text content of an M3U8 file to build the playlist array.
 */
function parseM3u8(m3u8Content) {
    const lines = m3u8Content.trim().split('\n');
    let newPlaylist = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXTINF:')) {
            const infoLine = lines[i];
            const urlLine = lines[i + 1];
            if (urlLine && !urlLine.startsWith('#')) {
                const durationMatch = infoLine.match(/#EXTINF:([\d\.]+)/);
                const metadataMatch = infoLine.match(/,(.+)/);

                const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;
                let title = 'Unknown Title';
                let artist = 'Unknown Artist';

                if (metadataMatch) {
                    const metadata = metadataMatch[1];
                    // Handle format "Artist - [Album] Title"
                    const albumMatch = metadata.match(/(.+) - \[(.+)\] (.+)/);
                    if (albumMatch) {
                        artist = albumMatch[1].trim();
                        title = albumMatch[3].trim();
                    } else { // Handle format "Artist - Title"
                         const simpleMatch = metadata.split(' - ');
                         artist = simpleMatch[0].trim();
                         title = simpleMatch.length > 1 ? simpleMatch[1].trim() : artist;
                    }
                }
                
                newPlaylist.push({
                    id: `song_${newPlaylist.length}`,
                    title,
                    artist,
                    duration,
                    url: urlLine.trim(),
                });
                i++;
            }
        }
    }
    playlist = newPlaylist;
    console.log(`Playlist loaded successfully with ${playlist.length} songs.`);
}


// --- UI RENDERING ---

/**
 * Renders the entire playlist or a filtered version based on search text.
 */
function renderPlaylist(searchText = '') {
    playlistContainer.innerHTML = '';
    const filteredPlaylist = playlist.filter(song =>
        song.title.toLowerCase().includes(searchText.toLowerCase()) ||
        song.artist.toLowerCase().includes(searchText.toLowerCase())
    );

    if (filteredPlaylist.length === 0) {
        playlistContainer.innerHTML = `<p class="text-gray-400 p-4">No songs found.</p>`;
        return;
    }

    filteredPlaylist.forEach((song) => {
        const originalIndex = playlist.findIndex(p => p.id === song.id);
        const songEl = document.createElement('div');
        songEl.className = 'song-item flex items-center justify-between p-3 rounded-lg hover:bg-gray-800 cursor-pointer transition';
        if (originalIndex === currentIndex) {
            songEl.classList.add('active');
        }
        songEl.dataset.index = originalIndex;

        songEl.innerHTML = `
            <div class="flex items-center truncate">
                <span class="text-gray-400 w-6">${originalIndex + 1}.</span>
                <div class="truncate">
                    <p class="font-semibold truncate">${song.title}</p>
                    <p class="text-sm text-gray-400 truncate">${song.artist}</p>
                </div>
            </div>
            <span class="text-sm text-gray-400 flex-shrink-0 ml-2">${formatTime(song.duration)}</span>
        `;
        songEl.addEventListener('click', () => playSong(originalIndex));
        playlistContainer.appendChild(songEl);
    });
}

/**
 * Updates the UI for the currently playing song in the player bar and playlist.
 */
function updateActiveSongUI() {
    if (currentIndex > -1 && playlist[currentIndex]) {
        const song = playlist[currentIndex];
        playerSongTitle.textContent = song.title;
        playerSongArtist.textContent = song.artist;
        playerAlbumArt.src = `https://placehold.co/64x64/1f2937/ffffff?text=${song.title.charAt(0)}`;
        document.title = `${song.title} - EvilTwins`;

        document.querySelectorAll('.song-item').forEach(item => {
            item.classList.remove('active');
            if (parseInt(item.dataset.index) === currentIndex) {
                item.classList.add('active');
            }
        });

        downloadBtn.disabled = false;
        downloadBtn.classList.remove('text-gray-600', 'cursor-not-allowed');
    } else {
        downloadBtn.disabled = true;
        downloadBtn.classList.add('text-gray-600', 'cursor-not-allowed');
    }
}


// --- PLAYER LOGIC ---

/**
 * Plays a song from the playlist at a given index.
 */
function playSong(index) {
    if (index < 0 || index >= playlist.length) return;
    
    currentIndex = index;
    const song = playlist[index];

    if (Hls.isSupported()) {
        if (hls) hls.destroy();
        hls = new Hls();
        hls.on(Hls.Events.ERROR, function (event, data) {
            console.error('HLS.js Error:', data);
        });

        hls.loadSource(song.url);
        hls.attachMedia(audioPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, () => audioPlayer.play());
    } else if (audioPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        audioPlayer.src = song.url;
        audioPlayer.addEventListener('loadedmetadata', () => audioPlayer.play());
    }
    
    updateActiveSongUI();
    fetchLyrics(song.title, song.artist);
    trackSongPlay(song);
}

function togglePlayPause() {
    if (currentIndex === -1 && playlist.length > 0) {
        playSong(0);
        return;
    }
    if (!audioPlayer.src) return;

    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
}

audioPlayer.onplay = () => {
    isPlaying = true;
    playPauseIcon.className = 'fas fa-pause';
};
audioPlayer.onpause = () => {
    isPlaying = false;
    playPauseIcon.className = 'fas fa-play';
};

function playNext() {
    let nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.length) nextIndex = 0;
    playSong(nextIndex);
}

function playPrev() {
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = playlist.length - 1;
    playSong(prevIndex);
}

// --- LYRICS ---
async function fetchLyrics(title, artist) {
    lyricsSongTitle.textContent = title;
    lyricsSongArtist.textContent = artist;
    lyricsContent.innerHTML = `<i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-2">Searching for lyrics...</p>`;
    try {
        const response = await fetch(`${geniusApiUrl}?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
        if (!response.ok) throw new Error('Lyrics API error.');
        const data = await response.json();
        lyricsContent.textContent = data.lyrics || "Lyrics not available for this song.";
    } catch (error) {
        console.error("Error fetching lyrics:", error);
        lyricsContent.textContent = "Could not load lyrics.";
    }
}

// --- AUTHENTICATION ---

function setupAuthObserver(auth) {
    onAuthStateChanged(auth, user => {
        currentUser = user;
        if (user) {
            renderUserProfile(user);
        } else {
            renderLoginButton();
        }
    });
}

function renderUserProfile(user) {
    userAuthContainer.innerHTML = `
        <img src="${user.photoURL || 'https://placehold.co/40x40/374151/ffffff?text=U'}" alt="User Profile" id="userProfileBtn" class="w-10 h-10 rounded-full cursor-pointer hover:ring-2 hover:ring-purple-500 transition">
    `;
    document.getElementById('userProfileBtn').addEventListener('click', () => showAccountModal(user));
}

function renderLoginButton() {
    userAuthContainer.innerHTML = `
        <button id="loginBtn" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-full transition">
            Login
        </button>
    `;
    document.getElementById('loginBtn').addEventListener('click', signInWithGoogle);
}

async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(window.auth, provider);
    } catch (error) {
        console.error("Error signing in with Google:", error);
    }
}

async function signOutUser() {
    try {
        await signOut(window.auth);
        accountModal.classList.add('hidden');
    } catch (error) {
        console.error("Error signing out:", error);
    }
}

function showAccountModal(user) {
    accountInfoContainer.innerHTML = `
        <div class="flex items-center space-x-4">
            <img src="${user.photoURL}" alt="Profile" class="w-16 h-16 rounded-full">
            <div>
                <p class="text-xl font-bold">${user.displayName}</p>
                <p class="text-gray-400">${user.email}</p>
            </div>
        </div>
    `;
    accountModal.classList.remove('hidden');
}

// --- FIRESTORE DATA ---

async function trackSongPlay(song) {
    if (!song || !song.title) return;
    const db = window.db;
    const songId = song.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const songRef = doc(db, "songs", songId);
    try {
        await setDoc(songRef, {
            title: song.title,
            artist: song.artist,
            playCount: increment(1)
        }, { merge: true });
    } catch (error) {
        console.error("Error tracking song play:", error);
    }
}

function setupTopTracksListener(db) {
    const songsRef = collection(db, "songs");
    const q = query(songsRef);

    onSnapshot(q, (snapshot) => {
        let topSongs = [];
        snapshot.forEach(doc => topSongs.push({ id: doc.id, ...doc.data() }));
        
        topSongs.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
        renderTopTracks(topSongs.slice(0, 5));
    }, (error) => {
        console.error("Error getting top tracks:", error);
        let errorMessage = '<p class="text-red-400 p-2">Could not load top tracks.</p>';
        if (error.code === 'failed-precondition') {
            errorMessage = `
                <div class="p-2 text-center text-yellow-400 bg-yellow-900/20 rounded-lg text-sm">
                    <p class="font-bold">Action Required</p>
                    <p>To enable 'Most Listened', a database index needs to be created. Check the browser's developer console (F12) for a link to create it.</p>
                </div>
            `;
        }
        topTracksList.innerHTML = errorMessage;
    });
}

function renderTopTracks(songs) {
    if (songs.length === 0) {
        topTracksList.innerHTML = `<p class="text-gray-500 p-2">No listening data yet.</p>`;
        return;
    }
    topTracksList.innerHTML = '';
    songs.forEach((song, index) => {
        const trackEl = document.createElement('div');
        trackEl.className = 'flex items-center justify-between text-sm p-2 rounded hover:bg-gray-800';
        trackEl.innerHTML = `
            <div class="flex items-center truncate">
                <span class="text-gray-400 w-6">${index + 1}.</span>
                <div class="truncate">
                    <p class="font-semibold truncate">${song.title}</p>
                    <p class="text-xs text-gray-400 truncate">${song.artist}</p>
                </div>
            </div>
            <span class="text-gray-500 flex-shrink-0 ml-2"><i class="fas fa-headphones mr-1"></i> ${song.playCount}</span>
        `;
        topTracksList.appendChild(trackEl);
    });
}


// --- EVENT LISTENERS ---
function setupEventListeners() {
    playPauseBtn.addEventListener('click', togglePlayPause);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrev);

    audioPlayer.addEventListener('timeupdate', () => {
        if (audioPlayer.duration) {
            seekBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
        }
    });
    audioPlayer.addEventListener('loadedmetadata', () => durationEl.textContent = formatTime(audioPlayer.duration));
    audioPlayer.addEventListener('ended', playNext);
    
    audioPlayer.addEventListener('error', (e) => {
        console.error("Audio player error:", e);
        playerSongArtist.textContent = "Error: Cannot play audio";
    });

    seekBar.addEventListener('input', () => {
        if (audioPlayer.duration) {
            audioPlayer.currentTime = (audioPlayer.value / 100) * audioPlayer.duration;
        }
    });

    volumeBar.addEventListener('input', (e) => audioPlayer.volume = e.target.value);
    searchInput.addEventListener('input', (e) => renderPlaylist(e.target.value));
    closeModalBtn.addEventListener('click', () => accountModal.classList.add('hidden'));
    logoutBtn.addEventListener('click', signOutUser);
    downloadBtn.addEventListener('click', downloadCurrentSong);
    lyricsToggleBtn.addEventListener('click', () => lyricsSection.classList.toggle('hidden'));
}

// --- UTILITY FUNCTIONS ---
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

async function downloadCurrentSong() {
    if (currentIndex === -1) return;
    const song = playlist[currentIndex];
    
    const originalIcon = downloadBtn.innerHTML;
    downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    downloadBtn.disabled = true;

    try {
        const response = await fetch(song.url);
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${song.artist} - ${song.title}.mp3`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (error) {
        console.error('Download failed:', error);
        alert('Could not download the song. The file URL may be invalid or blocked by a security policy.');
    } finally {
        downloadBtn.innerHTML = originalIcon;
        downloadBtn.disabled = false;
    }
}
