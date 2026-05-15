const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const bgCanvas = document.getElementById('bgCanvas');
const bgCtx = bgCanvas.getContext('2d');

const loginScreen = document.getElementById('login-screen');
const lbScreen = document.getElementById('leaderboard-screen');
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const overlay = document.getElementById('overlay');

const SERVER_URL = 'https://neon-server-crhx.onrender.com';
const safeListen = (id, event, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
};

const hubScreen = document.getElementById('hub-screen');
const btnHubPlay = document.getElementById('btn-hub-play');
const btnHubUpgrades = document.getElementById('btn-hub-upgrades');
const btnHubLb = document.getElementById('btn-hub-lb');
const btnDifficulty = document.getElementById('btn-difficulty');
const hubWaveText = document.getElementById('hub-wave-text');
const hubMoney = document.getElementById('hub-money');
const btnBackHub = document.getElementById('btn-back-hub');

const menuMoneyEl = document.getElementById('menu-money');
const menuWaveEl = document.getElementById('menu-wave-text');

const hudMoney = document.getElementById('hud-money');
const hudProgress = document.getElementById('hud-progress');
const hudLives = document.getElementById('hud-lives');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');
const overlayReward = document.getElementById('overlay-reward');
const btnContinue = document.getElementById('btn-continue');

const btnPause = document.getElementById('btn-pause');
const pauseMenu = document.getElementById('pause-menu');
const btnResume = document.getElementById('btn-resume');
const btnQuit = document.getElementById('btn-quit');

const btnPrestige = document.getElementById('btn-prestige');
const idlePopup = document.getElementById('idle-popup');
const idleAmount = document.getElementById('idle-amount');
const btnCollectIdle = document.getElementById('btn-collect-idle');

// Game State
const OWNER_IDS = ['GWHT00U4', 'U95I7XBL', '5HF0MWUJ', 'V20DJ5G5', '32X416GA'];
let gameState = 'LOGIN'; // LOGIN, MENU, PLAYING, END

// --- TRADING HUB STATE ---
let incomingTrades = [];
let tradeOfferYourItems = [];
let tradeOfferTheirItems = [];
let tradeTargetName = "";

// Tab Switching Logic (handled by switchTradeTab below)

function renderTradeRequests() {
    const list = document.getElementById('trade-request-list');
    const badge = document.getElementById('trade-notify-badge');
    if (!list || !badge) return;
    
    if (incomingTrades.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:40px; color:#505070;">No pending requests.</div>`;
        badge.classList.add('hidden');
        return;
    }
    
    badge.classList.remove('hidden');
    badge.innerText = incomingTrades.length;
    
    list.innerHTML = incomingTrades.map((req, idx) => `
        <div class="lb-item" style="border-color:#ff007a; background:rgba(255,0,122,0.05); margin-bottom:10px;">
            <div style="flex:1;">
                <div class="lb-name" style="color:#ff007a;">INCOMING: ${req.from}</div>
                <div style="font-size:10px; opacity:0.6; color:#fff;">Wants to trade with you!</div>
            </div>
            <div style="display:flex; gap:5px;">
                <button onclick="acceptTradeRequest(${idx})" style="width:auto; padding:8px 15px; font-size:11px; background:#00ff7a; color:#000; font-weight:900;">ACCEPT</button>
                <button onclick="declineTradeRequest(${idx})" style="width:auto; padding:8px 15px; font-size:11px; background:#333; color:#fff; border:none;">✕</button>
            </div>
        </div>
    `).join('');
}

async function acceptTradeRequest(idx) {
    const req = incomingTrades[idx];
    
    // Check if you have the items they requested
    const tempInv = [...inventory];
    let hasAll = true;
    req.request.forEach(id => {
        const i = tempInv.indexOf(id);
        if (i === -1) hasAll = false;
        else tempInv.splice(i, 1);
    });

    if (!hasAll) {
        alert("You don't have the items requested in this trade!");
        incomingTrades.splice(idx, 1);
        renderTradeRequests();
        return;
    }

    // Process trade
    req.request.forEach(id => {
        const i = inventory.indexOf(id);
        if (i > -1) inventory.splice(i, 1);
    });
    req.offer.forEach(id => {
        inventory.push(id);
        if (!ownedSkins.includes(id)) ownedSkins.push(id);
    });

    // Notify server
    if (req.id && typeof req.id === 'number') {
        await fetch(`${SERVER_URL}/api/complete_trade`, {
            method: 'POST',
            body: JSON.stringify({ tradeId: req.id, action: 'accept' })
        });
    }

    incomingTrades.splice(idx, 1);
    saveGame();
    renderTradeRequests();
    renderInventory();
    alert("🤝 TRADE COMPLETED!");
}

window.acceptTradeRequest = acceptTradeRequest; // Make global for onclick

function declineTradeRequest(idx) {
    incomingTrades.splice(idx, 1);
    renderTradeRequests();
}

window.declineTradeRequest = declineTradeRequest; // Make global for onclick

let currentTradeRoom = null;
let tradeLocked = false;

// Real-Time Trade Polling
setInterval(async () => {
    if (!currentUser || gameState !== 'HUB') return;
    
    try {
        // 1. Check for incoming invites if NOT in a room
        if (!currentTradeRoom) {
            const res = await fetch(`${SERVER_URL}/api/find_trade?user=${currentUser}`);
            const invites = await res.json();
            if (invites.length > 0) {
                const inv = invites[0];
                if (confirm(`INCOMING TRADE: ${inv.from} wants to trade live! Join?`)) {
                    joinTradeRoom(inv.id);
                }
            }
        } else {
            // 2. Sync active room
            const res = await fetch(`${SERVER_URL}/api/trade_room?id=${currentTradeRoom}`);
            const room = await res.json();
            
            if (room.status === 'completed') {
                finalizeLiveTrade(room);
                return;
            }

            // Update UI with remote data
            const isFrom = room.from === currentUser;
            tradeOfferYourItems = isFrom ? room.offer_from : room.offer_to;
            tradeOfferTheirItems = isFrom ? room.offer_to : room.offer_from;
            
            const myLocked = isFrom ? room.lock_from : room.lock_to;
            const theirLocked = isFrom ? room.lock_to : room.lock_from;
            
            document.getElementById('trade-your-status').innerText = myLocked ? '🔒 LOCKED' : '⏳ EDITING...';
            document.getElementById('trade-your-status').style.color = myLocked ? '#00ff7a' : '#ffaa00';
            
            document.getElementById('trade-their-status').innerText = theirLocked ? '🔒 LOCKED' : '⏳ EDITING...';
            document.getElementById('trade-their-status').style.color = theirLocked ? '#00ff7a' : '#ffaa00';
            
            // Enable/Disable Complete button
            const completeBtn = document.getElementById('btn-send-trade');
            if (myLocked && theirLocked) {
                completeBtn.classList.remove('disabled');
                completeBtn.style.background = "#00ff7a";
                completeBtn.style.color = "#000";
                completeBtn.style.opacity = "1";
            } else {
                completeBtn.classList.add('disabled');
                completeBtn.style.background = "#505070";
                completeBtn.style.color = "#fff";
                completeBtn.style.opacity = "0.5";
            }
            
            updateTradeUI();
        }
    } catch (e) {}
}, 1000);

async function joinTradeRoom(roomId) {
    currentTradeRoom = roomId;
    tradeLocked = false;
    await fetch(`${SERVER_URL}/api/join_trade`, {
        method: 'POST',
        body: JSON.stringify({ room_id: roomId })
    });
    document.getElementById('trade-modal').classList.remove('hidden');
    document.getElementById('btn-lock-trade').classList.remove('hidden');
    document.getElementById('btn-lock-trade').innerText = "🔒 LOCK OFFER";
}

async function syncLiveTrade() {
    if (!currentTradeRoom) return;
    await fetch(`${SERVER_URL}/api/sync_trade`, {
        method: 'POST',
        body: JSON.stringify({
            room_id: currentTradeRoom,
            user: currentUser,
            offer: tradeOfferYourItems,
            lock: tradeLocked
        })
    });
}

function finalizeLiveTrade(room) {
    const isFrom = room.from === currentUser;
    const finalYourItems = isFrom ? room.offer_from : room.offer_to;
    const finalTheirItems = isFrom ? room.offer_to : room.offer_from;
    
    // Process items
    finalYourItems.forEach(id => {
        const idx = inventory.indexOf(id);
        if (idx > -1) inventory.splice(idx, 1);
    });
    finalTheirItems.forEach(id => {
        inventory.push(id);
        if (!ownedSkins.includes(id)) ownedSkins.push(id);
    });
    
    saveGame();
    alert("🤝 LIVE TRADE COMPLETED!");
    currentTradeRoom = null;
    document.getElementById('trade-modal').classList.add('hidden');
    renderInventory();
}
let isPaused = false;
let currentUser = null;
let currentUserUid = null;
let wave = 1;
let money = 0;
let prestigeLevel = 0;
let difficulty = 'easy';
let godMode = false;
let lastGodModeText = 0;

// Cosmetics State
// Rarity Definitions
const RARITY = {
    COMMON: { name: 'COMMON', color: '#a0a0b0', weight: 60, value: 1 },
    RARE: { name: 'RARE', color: '#00f3ff', weight: 25, value: 5 },
    EPIC: { name: 'EPIC', color: '#aa00ff', weight: 10, value: 20 },
    LEGENDARY: { name: 'LEGENDARY', color: '#ffd700', weight: 5, value: 100 },
    OWNER: { name: 'OWNER', color: '#ff0000', weight: 0, value: 99999 }
};

// Cosmetics State
const COSMETICS = {
    player: [
        { id: 'player_default', name: 'Neon Cyan', color: '#00f3ff', rarity: 'COMMON', price: 0 },
        { id: 'player_red', name: 'Blazing Red', color: '#ff0055', rarity: 'COMMON', price: 50000 },
        { id: 'player_green', name: 'Electric Green', color: '#00ff7a', rarity: 'RARE', price: 100000 },
        { id: 'player_purple', name: 'Royal Purple', color: '#aa00ff', rarity: 'RARE', price: 250000 },
        { id: 'player_gold', name: 'Pure Gold', color: '#ffd700', rarity: 'EPIC', price: 1000000 },
        { id: 'player_void', name: 'Blood Void', color: '#000', borderColor: '#ff0000', glow: '#ff0000', rarity: 'LEGENDARY', price: 5000000 },
        { id: 'player_galaxy', name: 'Galaxy Core', color: '#ff00ff', borderColor: '#00ffff', glow: '#ff00ff', rarity: 'LEGENDARY', price: 10000000 },
        { id: 'player_unicorn', name: 'Mystic Unicorn', color: '#ff66ff', borderColor: '#00ffff', glow: '#ffd700', rarity: 'LEGENDARY', price: 15000000, isEmoji: true },
        { id: 'player_alien', name: 'Cosmic Alien', color: '#00ff88', borderColor: '#00ffaa', glow: '#00ff88', rarity: 'EPIC', price: 3000000, isEmoji: true },
        { id: 'player_skull', name: 'Skull King', color: '#ffffff', borderColor: '#ff0000', glow: '#ff4444', rarity: 'LEGENDARY', price: 20000000, isEmoji: true },
        { id: 'player_crown', name: 'Royal Crown', color: '#ffd700', borderColor: '#ff8800', glow: '#ffd700', rarity: 'EPIC', price: 5000000, isEmoji: true },
        { id: 'player_ghost', name: 'Phantom', color: '#ccccff', borderColor: '#8888ff', glow: '#aaaaff', rarity: 'RARE', price: 1000000, isEmoji: true },
        { id: 'player_trident', name: 'Poseidon', color: '#00ccff', borderColor: '#0066ff', glow: '#00aaff', rarity: 'OWNER', price: Infinity, isEmoji: true, isOwner: true },
        { id: 'player_lightning', name: 'Thunder God', color: '#ffff00', borderColor: '#ff8800', glow: '#ffff00', rarity: 'OWNER', price: Infinity, isEmoji: true, isOwner: true },
        { id: 'player_diamond', name: 'Diamond Core', color: '#b9f2ff', borderColor: '#00ffff', glow: '#b9f2ff', rarity: 'OWNER', price: Infinity, isEmoji: true, isOwner: true },
        { id: 'player_vortex', name: 'Void Vortex', color: '#8800ff', borderColor: '#ff00ff', glow: '#aa00ff', rarity: 'OWNER', price: Infinity, isEmoji: true, isOwner: true }
    ],
    bullet: [
        { id: 'bullet_default', name: 'Cyan Pulse', color: '#00f3ff', rarity: 'COMMON', price: 0 },
        { id: 'bullet_red', name: 'Plasma Red', color: '#ff0055', rarity: 'COMMON', price: 75000 },
        { id: 'bullet_green', name: 'Toxic Green', color: '#00ff7a', rarity: 'RARE', price: 150000 },
        { id: 'bullet_rainbow', name: 'Rainbow', color: 'rainbow', rarity: 'EPIC', price: 2000000 },
        { id: 'bullet_gold', name: 'Gold Tracers', color: '#ffd700', rarity: 'LEGENDARY', price: 5000000 },
        { id: 'bullet_inferno', name: 'Inferno Rounds', color: '#ff4400', rarity: 'OWNER', price: Infinity, isOwner: true },
        { id: 'bullet_void', name: 'Void Beams', color: '#8800ff', rarity: 'OWNER', price: Infinity, isOwner: true },
        { id: 'bullet_plasma', name: 'Plasma Storm', color: '#ff0066', rarity: 'OWNER', price: Infinity, isOwner: true },
        { id: 'bullet_divine', name: 'Divine Light', color: '#ffffff', rarity: 'OWNER', price: Infinity, isOwner: true }
    ]
};

let inventory = ['player_default', 'bullet_default']; // Stores all instances
let ownedSkins = ['player_default', 'bullet_default']; // For backwards compatibility & simple checking
let equippedPlayerSkin = 'player_default';
let equippedBulletSkin = 'bullet_default';
let currentSkinTab = 'player';

// Audio Engine
let masterVolume = parseFloat(localStorage.getItem('neonVolume') || '1.0');
let audioCtx, masterGain;
try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    masterGain.gain.value = masterVolume;
} catch (e) {
    console.warn("Audio Context blocked or failed:", e);
}

function playSound(type) {
    if (masterVolume <= 0) return;
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(masterGain);
    
    if (type === 'shoot') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'buy') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'nuke') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 1.0);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.0);
        osc.start(); osc.stop(audioCtx.currentTime + 1.0);
    }
}

let waveProgress = 0;
let waveQuota = 10;
let lives = 3;

// Upgrades
const upg = {
    damage: { btn: document.getElementById('btn-damage'), costEl: document.getElementById('cost-damage'), lvlEl: document.getElementById('lvl-damage'), lvl: 1, baseCost: 10, costMult: 1.6, val: 1 }, 
    firerate: { btn: document.getElementById('btn-firerate'), costEl: document.getElementById('cost-firerate'), lvlEl: document.getElementById('lvl-firerate'), lvl: 1, baseCost: 15, costMult: 1.8, val: 800 }, 
    income: { btn: document.getElementById('btn-income'), costEl: document.getElementById('cost-income'), lvlEl: document.getElementById('lvl-income'), lvl: 1, baseCost: 25, costMult: 1.7, val: 1 },
    multishot: { btn: document.getElementById('btn-multishot'), costEl: document.getElementById('cost-multishot'), lvlEl: document.getElementById('lvl-multishot'), lvl: 1, baseCost: 250, costMult: 4.5, val: 1 },
    spawn: { btn: document.getElementById('btn-spawn'), costEl: document.getElementById('cost-spawn'), lvlEl: document.getElementById('lvl-spawn'), lvl: 1, baseCost: 50, costMult: 1.8, val: 1 },
    pierce: { btn: document.getElementById('btn-pierce'), costEl: document.getElementById('cost-pierce'), lvlEl: document.getElementById('lvl-pierce'), lvl: 1, baseCost: 2500000, costMult: 10, val: 0 }
};

const NUMBER_SUFFIXES = [
    "", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "Ud", "Dd", "Td", "Qd", "Qnd", "Sxd", "Spd", "Od", "Nd", 
    "V", "Uv", "Dv", "Tv", "Qtv", "Qnv", "Sxv", "Spv", "Ocv", "Nvv", 
    "Tg", "Utg", "Dtg", "Ttg", "Qttg", "Qntg", "Sxtg", "Sptg", "Octg", "Nvtg", 
    "Qg", "Uqg", "Dqg", "Tqg", "Qtqg", "Qnqg", "Sxqg", "Spqg", "Ocqg", "Nvqg", 
    "Qq", "Uqq", "Dqq", "Tqq", "Qtqq", "Qnqq", "Sxqq", "Spqq", "Ocqq", "Nvqq", 
    "Sxg", "Usxg", "Dsxg", "Tsxg", "Qtsxg", "Qnsxg", "Sxsxg", "Spsxg", "Ocsxg", "Nvsxg", 
    "Spg", "Uspg", "Dspg", "Tspg", "Qtspg", "Qnspg", "Sxspg", "Spspg", "Ocspg", "Nvspg", 
    "Og", "Uog", "Dog", "Tog", "Qtog", "Qnog", "Sxog", "Spog", "Ocog", "Nvog", 
    "Ng", "Ung", "Dng", "Tng", "Qtng", "Qnng", "Sxng", "Spng", "Ocng", "Nvng", 
    "Ce", "Uce"
];

function formatNumber(num) {
    if (num < 1000) return Math.floor(num).toString();
    let suffixIndex = Math.floor(Math.log10(num) / 3);
    let shortNum = num / Math.pow(10, suffixIndex * 3);
    if (shortNum >= 999.995) {
        shortNum /= 1000;
        suffixIndex++;
    }
    if (suffixIndex >= NUMBER_SUFFIXES.length || !isFinite(num)) return num.toExponential(2);
    return shortNum.toFixed(2) + NUMBER_SUFFIXES[suffixIndex];
}

function getCost(key) {
    return Math.floor(upg[key].baseCost * Math.pow(upg[key].costMult, upg[key].lvl - 1));
}

function updateMenuUI() {
    const ownerBtn = document.getElementById('btn-owner-panel');
    if (ownerBtn) {
        if (OWNER_IDS.includes(currentUserUid)) {
            ownerBtn.classList.remove('hidden');
        } else {
            ownerBtn.classList.add('hidden');
        }
    }

    menuMoneyEl.innerText = '$' + formatNumber(money);
    hubMoney.innerText = '$' + formatNumber(money);
    
    if (wave % 10 === 0) {
        hubWaveText.innerText = 'BOSS WAVE ' + wave;
        hubWaveText.style.color = '#ff0000';
    } else {
        hubWaveText.innerText = 'WAVE ' + wave;
        hubWaveText.style.color = '#fff';
    }
    btnHubPlay.innerText = '▶ PLAY WAVE ' + wave;
    
    for (let key in upg) {
        let cost = getCost(key);
        upg[key].costEl.innerText = '$' + formatNumber(cost);
        upg[key].lvlEl.innerText = 'Lv ' + upg[key].lvl;
        
        if (money >= cost) {
            upg[key].btn.classList.remove('disabled');
        } else {
            upg[key].btn.classList.add('disabled');
        }
    }
    
    if (wave >= 100) {
        btnPrestige.classList.remove('hidden');
        btnPrestige.innerText = `⭐ PRESTIGE (WAVE 100) -> LEVEL ${prestigeLevel + 1}`;
    } else {
        btnPrestige.classList.add('hidden');
    }

    const prestigeText = document.getElementById('hub-prestige-text');
    if (prestigeLevel > 0) {
        if (prestigeText) {
            prestigeText.classList.remove('hidden');
            let multiplier = (1 + prestigeLevel).toFixed(1);
            prestigeText.innerText = `⭐ PRESTIGE ${prestigeLevel} (${multiplier}x MULTIPLIER)`;
        }
    } else {
        if (prestigeText) prestigeText.classList.add('hidden');
    }
}

function buyUpgrade(key) {
    let cost = getCost(key);
    if (money >= cost) {
        money -= cost;
        upg[key].lvl++;
        
        if (key === 'damage') upg.damage.val = Math.floor(upg.damage.val * 1.5) + 1;
        if (key === 'firerate') upg.firerate.val = Math.max(30, upg.firerate.val * 0.85);
        if (key === 'income') upg.income.val *= 1.5;
        if (key === 'multishot') upg.multishot.val += 1;
        if (key === 'spawn') upg.spawn.val += 1;
        if (key === 'pierce') upg.pierce.val += 1;
        
        playSound('buy');
        updateMenuUI();
    }
}

for (let key in upg) {
    upg[key].btn.addEventListener('click', () => buyUpgrade(key));
}

// Game Objects
let bullets = [];
let targets = [];
let particles = [];
let texts = []; 
let powerups = [];
let activeBuffs = { frenzy: 0, doubleMoney: 0, spread: 0 };
let lastShotTime = 0;
let lastTargetTime = 0;
let lastPowerupTime = 0;

let playerX = window.innerWidth / 2;
let playerY = 0; 
let isDragging = false;

// Shield System
let hasShield = false;
let shieldCooldown = 0;
const SHIELD_COOLDOWN = 15000;

// Screen Shake
let shakeTime = 0;
let shakePower = 0;
function triggerShake(power, duration) { shakePower = power; shakeTime = duration; }

// Kill Feed
let killFeedItems = [];
function addKillFeed(color) {
    killFeedItems.unshift({ color, age: 0 });
    if (killFeedItems.length > 5) killFeedItems.pop();
}
function updateKillFeed(dt) {
    const kf = document.getElementById('kill-feed');
    if (!kf) return;
    killFeedItems.forEach(k => k.age += dt);
    killFeedItems = killFeedItems.filter(k => k.age < 2000);
    kf.innerHTML = killFeedItems.map(k =>
        `<div style="background:${k.color}; width:${Math.max(0,(1-k.age/2000)*80)}px; height:8px; border-radius:4px; opacity:${Math.max(0,1-k.age/2000)}; box-shadow:0 0 8px ${k.color}; transition:none;"></div>`
    ).join('');
}

// Total kills tracker
let totalKills = 0;
let wavesCompleted = 0;
let perfectWaves = 0; // waves completed without taking damage
let waveHitsTaken = 0;

// ============ ACHIEVEMENTS ============
const ACHIEVEMENTS = [
    { id:'first_kill', icon:'🎯', name:'First Blood', desc:'Kill your first enemy', check:()=>totalKills>=1 },
    { id:'kills_100', icon:'💀', name:'Centurion', desc:'Kill 100 enemies', check:()=>totalKills>=100 },
    { id:'kills_1000', icon:'⚔️', name:'Thousand Cuts', desc:'Kill 1,000 enemies', check:()=>totalKills>=1000 },
    { id:'wave_10', icon:'🌊', name:'Survivor', desc:'Reach Wave 10', check:()=>wave>=10 },
    { id:'wave_50', icon:'🔥', name:'Veteran', desc:'Reach Wave 50', check:()=>wave>=50 },
    { id:'wave_100', icon:'👑', name:'Legend', desc:'Reach Wave 100', check:()=>wave>=100 },
    { id:'prestige_1', icon:'⭐', name:'Ascended', desc:'Prestige for the first time', check:()=>prestigeLevel>=1 },
    { id:'prestige_3', icon:'🌟', name:'Transcendent', desc:'Prestige 3 times', check:()=>prestigeLevel>=3 },
    { id:'perfect_wave', icon:'✨', name:'Untouchable', desc:'Complete a wave without getting hit', check:()=>perfectWaves>=1 },
    { id:'perfect_5', icon:'🛡️', name:'Iron Skin', desc:'Complete 5 waves without getting hit', check:()=>perfectWaves>=5 },
    { id:'rich', icon:'💰', name:'Millionaire', desc:'Earn $1,000,000', check:()=>money>=1000000 },
    { id:'shield_save', icon:'🛡️', name:'Safety Net', desc:'Block a hit with your shield', check:()=>(localStorage.getItem('neon_ach_shield_save_'+currentUser)==='1') },
];
let unlockedAchievements = new Set();

function loadAchievements() {
    unlockedAchievements = new Set();
    ACHIEVEMENTS.forEach(a => {
        if (localStorage.getItem('neon_ach_' + a.id + '_' + currentUser) === '1') {
            unlockedAchievements.add(a.id);
        }
    });
}
function checkAchievements() {
    ACHIEVEMENTS.forEach(a => {
        if (!unlockedAchievements.has(a.id) && a.check()) {
            unlockedAchievements.add(a.id);
            localStorage.setItem('neon_ach_' + a.id + '_' + currentUser, '1');
            showAchievementPopup(a);
        }
    });
}
let achPopupTimeout = null;
function showAchievementPopup(a) {
    const pop = document.getElementById('achievement-popup');
    document.getElementById('ach-icon').innerText = a.icon;
    document.getElementById('ach-name').innerText = a.name;
    document.getElementById('ach-desc').innerText = a.desc;
    pop.style.display = 'flex';
    if (achPopupTimeout) clearTimeout(achPopupTimeout);
    achPopupTimeout = setTimeout(() => { pop.style.display = 'none'; }, 4000);
}
function renderAchievements() {
    const list = document.getElementById('ach-list');
    if (!list) return;
    list.innerHTML = ACHIEVEMENTS.map(a => {
        const done = unlockedAchievements.has(a.id);
        return `<div style="display:flex;align-items:center;gap:15px;background:${done?'rgba(255,215,0,0.1)':'rgba(255,255,255,0.03)'};border:1px solid ${done?'#ffd700':'rgba(255,255,255,0.1)'};border-radius:12px;padding:15px;">
            <div style="font-size:28px;opacity:${done?1:0.3}">${a.icon}</div>
            <div style="flex:1">
                <div style="font-weight:900;color:${done?'#ffd700':'#888'};font-size:16px">${a.name}</div>
                <div style="color:#a0a0b0;font-size:13px">${a.desc}</div>
            </div>
            <div style="font-size:20px">${done?'✅':'🔒'}</div>
        </div>`;
    }).join('');
}

// ============ COSMETICS SYSTEM ============
function renderCosmetics() {
    const list = document.getElementById('skins-list');
    const moneyEl = document.getElementById('skins-money');
    if (!list || !moneyEl) return;
    moneyEl.innerText = '$' + formatNumber(money);
    
    const items = COSMETICS[currentSkinTab].filter(i => !i.isEmoji && !i.isOwner);
    list.innerHTML = items.map(item => {
        const isOwned = ownedSkins.includes(item.id);
        const isEquipped = (currentSkinTab === 'player' ? equippedPlayerSkin : equippedBulletSkin) === item.id;
        
        let previewHTML = '';
        if (currentSkinTab === 'player') {
            previewHTML = `<div style="width:0; height:0; border-left:15px solid transparent; border-right:15px solid transparent; border-bottom:30px solid ${item.color}; filter:drop-shadow(0 0 5px ${item.color});"></div>`;
        } else {
            previewHTML = `<div style="width:8px; height:20px; background:${item.color === 'rainbow' ? 'linear-gradient(to bottom, red, orange, yellow, green, cyan, blue, purple)' : item.color}; box-shadow:0 0 10px ${item.color === 'rainbow' ? 'white' : item.color};"></div>`;
        }

        return `
            <div class="cosmetic-card ${isOwned ? 'owned' : ''} ${isEquipped ? 'equipped' : ''}" onclick="handleCosmeticClick('${item.id}')">
                <div class="cosmetic-preview">${previewHTML}</div>
                <div class="cosmetic-name">${item.name}</div>
                <div class="cosmetic-price ${isOwned ? 'owned' : ''}">
                    ${isEquipped ? 'EQUIPPED' : isOwned ? 'EQUIP' : '$' + formatNumber(item.price)}
                </div>
            </div>
        `;
    }).join('');
}

function handleCosmeticClick(id) {
    const item = COSMETICS[currentSkinTab].find(i => i.id === id);
    if (ownedSkins.includes(id)) {
        if (currentSkinTab === 'player') equippedPlayerSkin = id;
        else equippedBulletSkin = id;
        playSound('buy');
    } else {
        if (money >= item.price) {
            money -= item.price;
            ownedSkins.push(id);
            if (currentSkinTab === 'player') equippedPlayerSkin = id;
            else equippedBulletSkin = id;
            playSound('buy');
        } else {
            return;
        }
    }
    saveGame();
    renderCosmetics();
}

window.handleCosmeticClick = handleCosmeticClick;


// ============ DAILY CHALLENGES ============
const DAILY_DEFS = [
    { id:'d_waves', icon:'🌊', name:'Wave Rider', desc:'Complete 3 waves today', target:3, reward:5000, key:'wavesT' },
    { id:'d_kills', icon:'💀', name:'Kill Quota', desc:'Kill 50 enemies today', target:50, reward:10000, key:'killsT' },
    { id:'d_perfect', icon:'✨', name:'Flawless', desc:'Complete 1 wave without getting hit', target:1, reward:25000, key:'perfectT' },
];
let dailyProgress = {};
let dailyClaimed = {};

function getDailySeed() { return Math.floor(Date.now() / 86400000).toString(); }
function loadDailies() {
    const seed = getDailySeed();
    const saved = JSON.parse(localStorage.getItem('neon_daily_' + currentUser) || '{}');
    if (saved.seed !== seed) {
        dailyProgress = {}; dailyClaimed = {};
        localStorage.setItem('neon_daily_' + currentUser, JSON.stringify({ seed, progress:{}, claimed:{} }));
    } else {
        dailyProgress = saved.progress || {};
        dailyClaimed = saved.claimed || {};
    }
}
function saveDailies() {
    localStorage.setItem('neon_daily_' + currentUser, JSON.stringify({
        seed: getDailySeed(), progress: dailyProgress, claimed: dailyClaimed
    }));
}
function incrementDaily(key, amount = 1) {
    dailyProgress[key] = (dailyProgress[key] || 0) + amount;
    saveDailies();
}
function renderDailies() {
    const list = document.getElementById('daily-list');
    if (!list) return;
    list.innerHTML = DAILY_DEFS.map(d => {
        const prog = Math.min(d.target, dailyProgress[d.key] || 0);
        const done = prog >= d.target;
        const claimed = dailyClaimed[d.id];
        const pct = (prog / d.target) * 100;
        return `<div style="background:rgba(170,0,255,0.08);border:1px solid ${done?'#aa00ff':'rgba(170,0,255,0.2)'};border-radius:12px;padding:15px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                <span style="font-size:24px">${d.icon}</span>
                <div style="flex:1"><div style="font-weight:900;color:#fff;font-size:15px">${d.name}</div><div style="color:#a0a0b0;font-size:12px">${d.desc}</div></div>
                <div style="color:#ffd700;font-weight:900;font-size:13px">+$${formatNumber(d.reward)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.1);border-radius:5px;height:8px;margin-bottom:10px;overflow:hidden">
                <div style="background:#aa00ff;height:100%;width:${pct}%;border-radius:5px;box-shadow:0 0 8px #aa00ff"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:#a0a0b0;font-size:13px">${prog} / ${d.target}</span>
                <button onclick="claimDaily('${d.id}')" ${(!done||claimed)?'disabled':''} style="padding:8px 16px;font-size:13px;background:${claimed?'#1a1a2e':(done?'#aa00ff':'#333')};color:${claimed?'#555':(done?'#fff':'#555')};border:1px solid ${claimed?'#333':(done?'#aa00ff':'#333')};border-radius:8px;box-shadow:${done&&!claimed?'0 0 10px rgba(170,0,255,0.5)':'none'}">${claimed?'CLAIMED':done?'CLAIM':'LOCKED'}</button>
            </div>
        </div>`;
    }).join('');
}
function claimDaily(id) {
    const d = DAILY_DEFS.find(x => x.id === id);
    if (!d) return;
    const prog = dailyProgress[d.key] || 0;
    if (prog >= d.target && !dailyClaimed[id]) {
        dailyClaimed[id] = true;
        money += d.reward;
        saveDailies(); updateMenuUI(); renderDailies();
        texts.push({ x: canvas.width/2, y: canvas.height/2, text: '+$'+formatNumber(d.reward)+' DAILY REWARD!', color:'#aa00ff', life:2 });
    }
}

// ============ WAVE PREVIEW ============
function showWavePreview(callback) {
    const wp = document.getElementById('wave-preview');
    const isBoss = (wave % 10 === 0);
    const quota = isBoss ? 1 : (30 + wave * 15);
    const col = isBoss ? '#ff0000' : (difficulty==='impossible'?'#ff0000':difficulty==='hard'?'#ff007a':'#00f3ff');
    document.getElementById('wp-title').innerText = isBoss ? '⚠️ BOSS WAVE ' + wave : 'WAVE ' + wave;
    document.getElementById('wp-title').style.color = col;
    document.getElementById('wp-title').style.textShadow = `0 0 30px ${col}`;
    document.getElementById('wp-label').innerText = isBoss ? '⚠️ DANGER' : 'INCOMING';
    document.getElementById('wp-subtitle').innerText = isBoss ? 'ONE MASSIVE BOSS ENEMY' : `${quota} Enemies`;
    wp.classList.remove('hidden');
    let cd = 3;
    document.getElementById('wp-countdown').innerText = cd;
    const iv = setInterval(() => {
        cd--;
        if (cd <= 0) { clearInterval(iv); wp.classList.add('hidden'); callback(); }
        else document.getElementById('wp-countdown').innerText = cd;
    }, 1000);
}

// ============ BLACK MARKET ============
const BM_POOL = [
    { id:'bm_shield', icon:'🛡️', name:'Emergency Shield', desc:'Get a shield for 1 hit', price:()=>Math.floor(500*wave), apply:()=>{ hasShield=true; updateShieldHUD(); } },
    { id:'bm_frenzy', icon:'🔥', name:'Frenzy Shot (30s)', desc:'Max fire rate for 30 seconds', price:()=>Math.floor(800*wave), apply:()=>{ activeBuffs.frenzy=30000; } },
    { id:'bm_money', icon:'💰', name:'2x Money (20s)', desc:'Double all earnings for 20s', price:()=>Math.floor(600*wave), apply:()=>{ activeBuffs.doubleMoney=20000; } },
    { id:'bm_spread', icon:'💨', name:'Spread Shot (15s)', desc:'Wide spread shot for 15s', price:()=>Math.floor(400*wave), apply:()=>{ activeBuffs.spread=15000; } },
    { id:'bm_nuke', icon:'💥', name:'Instant Nuke', desc:'Destroy all enemies on screen', price:()=>Math.floor(2000*wave), apply:()=>{ activatePowerup('nuke'); } },
    { id:'bm_income', icon:'📈', name:'Income Surge', desc:'+50% income this wave', price:()=>Math.floor(1000*wave), apply:()=>{ upg.income.val *= 1.5; } },
];
let bmDeals = [];
let bmCallback = null;
function openBlackMarket(afterCallback) {
    bmCallback = afterCallback;
    const screen = document.getElementById('blackmarket-screen');
    screen.classList.remove('hidden');
    bmDeals = [];
    let pool = [...BM_POOL];
    for (let i = 0; i < 3; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        bmDeals.push(pool.splice(idx, 1)[0]);
    }
    document.getElementById('bm-money').innerText = '$' + formatNumber(money);
    const dealsEl = document.getElementById('bm-deals');
    dealsEl.innerHTML = bmDeals.map((d,i) => {
        const price = d.price();
        const canAfford = money >= price;
        return `<div style="background:rgba(170,0,255,0.08);border:1px solid rgba(170,0,255,0.3);border-radius:12px;padding:15px;display:flex;align-items:center;gap:12px;">
            <span style="font-size:28px">${d.icon}</span>
            <div style="flex:1"><div style="font-weight:900;color:#fff">${d.name}</div><div style="color:#a0a0b0;font-size:12px">${d.desc}</div></div>
            <button onclick="buyBMDeal(${i})" ${canAfford?'':'disabled'} style="padding:8px 14px;background:${canAfford?'#aa00ff':'#222'};color:${canAfford?'#fff':'#555'};border:1px solid ${canAfford?'#aa00ff':'#333'};border-radius:8px;font-weight:900;font-size:13px;box-shadow:${canAfford?'0 0 10px rgba(170,0,255,0.5)':'none'}">$${formatNumber(price)}</button>
        </div>`;
    }).join('');
    document.getElementById('btn-bm-skip').onclick = () => { screen.classList.add('hidden'); if(bmCallback) bmCallback(); };
}
function buyBMDeal(i) {
    const d = bmDeals[i];
    const price = d.price();
    if (money < price) return;
    money -= price;
    d.apply();
    document.getElementById('blackmarket-screen').classList.add('hidden');
    updateMenuUI();
    if (bmCallback) bmCallback();
}

// ============ BACKGROUND MUSIC ============
let musicNodes = [];
let musicPlaying = false;
function startMusic() {
    if (musicPlaying || masterVolume <= 0) return;
    musicPlaying = true;
    playMusicLoop();
}
function stopMusic() {
    musicPlaying = false;
    musicNodes.forEach(n => { try { n.stop(); } catch(e) {} });
    musicNodes = [];
}
function playMusicLoop() {
    if (!musicPlaying) return;
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const bassNotes = [55, 55, 65.4, 73.4];
    const bpm = difficulty === 'impossible' ? 160 : difficulty === 'hard' ? 140 : 120;
    const beat = 60 / bpm;
    let t = audioCtx.currentTime;
    bassNotes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.connect(gain); gain.connect(masterGain);
        gain.gain.setValueAtTime(0, t + i*beat);
        gain.gain.linearRampToValueAtTime(0.06, t + i*beat + 0.05);
        gain.gain.linearRampToValueAtTime(0, t + i*beat + beat*0.9);
        osc.start(t + i*beat);
        osc.stop(t + i*beat + beat);
        musicNodes.push(osc);
    });
    setTimeout(playMusicLoop, bassNotes.length * beat * 1000 * 0.95);
}

// ============ SHIELD HUD ============
function updateShieldHUD() {
    const hud = document.getElementById('hud-shield');
    if (hud) hud.style.display = hasShield ? 'block' : 'none';
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    if (playerY === 0) {
        playerX = canvas.width / 2;
        playerY = canvas.height - 100;
    }
}
window.addEventListener('resize', resize);
resize();

let isBossWave = false;

function startWave() {
    gameState = 'PLAYING';
    isPaused = false;
    waveHitsTaken = 0;
    killFeedItems = [];
    
    isBossWave = (wave % 10 === 0);
    waveQuota = isBossWave ? 1 : (30 + wave * 15);
    lives = 3;
    
    bullets = [];
    targets = [];
    particles = [];
    texts = [];
    powerups = [];
    activeBuffs = { frenzy: 0, doubleMoney: 0, spread: 0 };
    
    menuScreen.classList.add('hidden');
    hubScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    overlay.classList.add('hidden');
    bgCanvas.style.display = 'none';
    
    resize();
    playerX = canvas.width / 2;
    playerY = canvas.height - 100;
    
    hudProgress.innerText = `${waveProgress} / ${waveQuota}`;
    updateLivesHUD();
    updateShieldHUD();
    hudMoney.innerText = '$' + formatNumber(money);
    startMusic();
    lastTime = performance.now();
}

function updateLivesHUD() {
    let str = '';
    for(let i=0; i<3; i++) {
        str += (i < lives) ? '❤️' : '🖤';
    }
    hudLives.innerText = str;
}

let lastTime = performance.now();
let bgParticles = [];
let bgTargets = [];
let bgBullets = [];
let bgPlayerX = window.innerWidth / 2;
let bgPlayerY = window.innerHeight - 100;
let bgLastShotTime = 0;
let bgShootDir = 1;

function gameLoop(currentTime) {
    if (gameState !== 'PLAYING') {
        const dt = currentTime - lastTime || 16;
        lastTime = currentTime;
        
        bgPlayerY = bgCanvas.height - 100;
        
        // Auto player movement
        bgPlayerX += 150 * bgShootDir * (dt / 1000);
        if (bgPlayerX < 50) bgShootDir = 1;
        if (bgPlayerX > bgCanvas.width - 50) bgShootDir = -1;
        
        // Auto shooting
        if (currentTime - bgLastShotTime > 150) {
            bgLastShotTime = currentTime;
            bgBullets.push({x: bgPlayerX - 4, y: bgPlayerY - 20, width: 8, height: 20});
        }
        
        // Spawn targets
        if (Math.random() < 0.03) {
            let size = 40;
            let colors = ['#00f3ff', '#ff007a', '#7a00ff', '#ffaa00'];
            bgTargets.push({
                x: Math.random() * (bgCanvas.width - size),
                y: -size,
                size: size,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }
        
        // Move bullets
        for (let i = bgBullets.length - 1; i >= 0; i--) {
            let b = bgBullets[i];
            b.y -= 800 * (dt / 1000);
            if (b.y < -50) bgBullets.splice(i, 1);
        }
        
        // Move targets
        for (let i = bgTargets.length - 1; i >= 0; i--) {
            let t = bgTargets[i];
            t.y += 100 * (dt / 1000);
            if (t.y > bgCanvas.height) bgTargets.splice(i, 1);
        }
        
        // Check collisions
        for (let i = bgBullets.length - 1; i >= 0; i--) {
            let b = bgBullets[i];
            for (let j = bgTargets.length - 1; j >= 0; j--) {
                let t = bgTargets[j];
                if (b.x < t.x + t.size && b.x + b.width > t.x && b.y < t.y + t.size && b.y + b.height > t.y) {
                    for (let k=0; k<10; k++) {
                        bgParticles.push({
                            x: t.x + t.size/2, y: t.y + t.size/2,
                            vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300,
                            color: t.color, size: Math.random() * 4 + 2, life: 1
                        });
                    }
                    bgTargets.splice(j, 1);
                    bgBullets.splice(i, 1);
                    break;
                }
            }
        }
        
        // Update particles
        for (let i = bgParticles.length - 1; i >= 0; i--) {
            let p = bgParticles[i];
            p.x += p.vx * (dt / 1000);
            p.y += p.vy * (dt / 1000);
            p.life -= dt / 1000;
            if (p.life <= 0) bgParticles.splice(i, 1);
        }
        
        bgCtx.fillStyle = '#0f0f16';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        
        for (let t of bgTargets) {
            bgCtx.fillStyle = t.color;
            bgCtx.shadowBlur = 15; bgCtx.shadowColor = t.color;
            bgCtx.fillRect(t.x, t.y, t.size, t.size);
        }
        for (let b of bgBullets) {
            bgCtx.fillStyle = '#00f3ff';
            bgCtx.shadowBlur = 10; bgCtx.shadowColor = '#00f3ff';
            bgCtx.fillRect(b.x, b.y, b.width, b.height);
        }
        for (let p of bgParticles) {
            bgCtx.fillStyle = p.color;
            bgCtx.globalAlpha = Math.max(0, p.life);
            bgCtx.fillRect(p.x, p.y, p.size, p.size);
        }
        bgCtx.globalAlpha = 1;
        bgCtx.shadowBlur = 0;
        
        // Draw player
        bgCtx.fillStyle = '#00f3ff';
        bgCtx.shadowBlur = 20; bgCtx.shadowColor = '#00f3ff';
        bgCtx.beginPath();
        bgCtx.moveTo(bgPlayerX, bgPlayerY - 25);
        bgCtx.lineTo(bgPlayerX + 25, bgPlayerY + 15);
        bgCtx.lineTo(bgPlayerX - 25, bgPlayerY + 15);
        bgCtx.fill();
        bgCtx.shadowBlur = 0;
        
        requestAnimationFrame(gameLoop);
        return;
    }
    
    if (isPaused) {
        lastTime = currentTime;
        requestAnimationFrame(gameLoop);
        return;
    }
    
    const dt = currentTime - lastTime;
    lastTime = currentTime;
    
    update(dt, currentTime);
    draw();
    
    requestAnimationFrame(gameLoop);
}

// Start loop
requestAnimationFrame(gameLoop);

let gunRecoil = 0;

function update(dt, time) {
    // Decrement buffs
    if (activeBuffs.frenzy > 0) activeBuffs.frenzy -= dt;
    if (activeBuffs.doubleMoney > 0) activeBuffs.doubleMoney -= dt;
    if (activeBuffs.spread > 0) activeBuffs.spread -= dt;

    // Update powerup UI
    let puHTML = '';
    if (activeBuffs.frenzy > 0) {
        puHTML += `<div style="background: rgba(255,100,0,0.8); color: #fff; padding: 5px 10px; border-radius: 5px; font-weight: bold; border: 1px solid #ff6400; box-shadow: 0 0 10px #ff6400; text-shadow: 1px 1px 2px #000; font-size: 14px;">🔥 FRENZY: ${(activeBuffs.frenzy/1000).toFixed(1)}s</div>`;
    }
    if (activeBuffs.doubleMoney > 0) {
        puHTML += `<div style="background: rgba(255,215,0,0.8); color: #000; padding: 5px 10px; border-radius: 5px; font-weight: bold; border: 1px solid #ffd700; box-shadow: 0 0 10px #ffd700; font-size: 14px;">💰 2x MONEY: ${(activeBuffs.doubleMoney/1000).toFixed(1)}s</div>`;
    }
    if (activeBuffs.spread > 0) {
        puHTML += `<div style="background: rgba(0,255,100,0.8); color: #000; padding: 5px 10px; border-radius: 5px; font-weight: bold; border: 1px solid #00ff64; box-shadow: 0 0 10px #00ff64; font-size: 14px;">💨 SPREAD: ${(activeBuffs.spread/1000).toFixed(1)}s</div>`;
    }
    document.getElementById('powerup-timers').innerHTML = puHTML;

    // Auto-fire
    let fireDelay = upg.firerate.val;
    if (activeBuffs.frenzy > 0) fireDelay = Math.min(fireDelay, 60);
    
    if (time - lastShotTime > fireDelay) {
        lastShotTime = time;
        shoot();
    }
    
    // Spawn powerups
    if (time - lastPowerupTime > 12000) { 
        lastPowerupTime = time;
        if (Math.random() < 0.6) spawnPowerup();
    }
    
    // Move powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
        let p = powerups[i];
        p.y += 3 * (dt / 16);
        
        if (Math.abs(p.x - playerX) < p.radius + 20 &&
            Math.abs(p.y - playerY) < p.radius + 20) {
            activatePowerup(p.type);
            createParticles(p.x, p.y, p.color, 30);
            texts.push({ x: playerX, y: playerY - 40, text: p.name, color: p.color, life: 1.5 });
            powerups.splice(i, 1);
            continue;
        }
        if (p.y > canvas.height + 50) powerups.splice(i, 1);
    }
    
    // Spawn targets
    if (isBossWave) {
        if (targets.length === 0 && waveProgress === 0) {
            spawnBoss();
        }
    } else {
        let targetCount = Math.floor(upg.firerate.lvl / 4) + upg.spawn.val + 2; 
        let spawnDelay = Math.max(150, 800 - (upg.spawn.val * 30));
        if (targets.length < targetCount && time - lastTargetTime > spawnDelay) {
            lastTargetTime = time;
            spawnTarget();
        }
    }
    
    // Move bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        
        b.y -= 14 * (dt / 16);
        
        if (b.y < -50 || b.x < -50 || b.x > canvas.width + 50 || b.y > canvas.height + 50) bullets.splice(i, 1);
    }
    
    // Move targets
    for (let i = targets.length - 1; i >= 0; i--) {
        let t = targets[i];
        
        if (t.isBoss) {
            if (t.y < 50) {
                t.y += 2 * (dt / 16);
            } else {
                t.x += t.vx * (dt / 16);
                if (t.x <= 0 || t.x + t.size >= canvas.width) {
                    t.vx *= -1;
                }
            }
        } else {
            t.y += 2 * (dt / 16); // Fall speed
            if (t.zigZag) {
                t.x = t.baseX + Math.sin(time / 500 + t.timeOffset) * 100;
                t.x = Math.max(0, Math.min(canvas.width - t.size, t.x));
            }
        }
        
        // Target hits player physically
        if (Math.abs(t.x + t.size/2 - playerX) < t.size/2 + 15 &&
            Math.abs(t.y + t.size/2 - playerY) < t.size/2 + 15) {
            
            createParticles(t.x + t.size/2, t.y + t.size/2, '#ff0000', 20);
            if (!t.isBoss) targets.splice(i, 1);
            takeDamage();
            continue;
        }

        // Target passes bottom of screen
        if (t.y > canvas.height) {
            targets.splice(i, 1);
            continue;
        }
    }
    
    function takeDamage() {
        if (godMode) {
            let now = Date.now();
            if (now - lastGodModeText > 2000) {
                texts.push({ x: playerX, y: playerY - 40, text: '😇 GOD MODE!', color: '#ffff00', life: 1.5 });
                lastGodModeText = now;
            }
            return;
        }
        if (hasShield) {
            hasShield = false;
            updateShieldHUD();
            localStorage.setItem('neon_ach_shield_save_'+currentUser, '1');
            triggerShake(5, 200);
            texts.push({ x: canvas.width/2, y: canvas.height/2-40, text: '🛡️ SHIELD ABSORBED HIT!', color: '#00f3ff', life: 1.5 });
            createParticles(playerX, playerY, '#00f3ff', 20);
            return;
        }
        lives--;
        waveHitsTaken++;
        updateLivesHUD();
        triggerShake(8, 300);
        texts.push({ x: canvas.width/2, y: canvas.height/2, text: '-1 LIFE', color: '#ff0000', life: 1.0 });
        if (lives <= 0) endWave(false);
    }
    
    // Collisions
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        let hit = false;
        
        for (let j = targets.length - 1; j >= 0; j--) {
            let t = targets[j];
            
            if (b.x < t.x + t.size && b.x + b.width > t.x &&
                b.y < t.y + t.size && b.y + b.height > t.y) {
                
                if (!b.hitTargets) b.hitTargets = [];
                if (b.hitTargets.includes(t)) continue;
                b.hitTargets.push(t);
                
                t.hp -= upg.damage.val * (1 + prestigeLevel);
                
                playSound('hit');
                createParticles(b.x, b.y, '#00f3ff', 2);
                
                if (t.hp <= 0) {
                    let multiplier = (activeBuffs.doubleMoney > 0) ? 2 : 1;
                    let bossBonus = t.isBoss ? 5 : 1;
                    let baseHpForMoney = 5 * Math.pow(1.65, wave - 1);
                    let earned = Math.floor(baseHpForMoney * upg.income.val * multiplier * bossBonus * (1 + prestigeLevel));
                    if (earned < 1) earned = 1;
                    money += earned;
                    hudMoney.innerText = '$' + formatNumber(money);
                    
                    // Big text for big kills
                    const textSize = t.isBoss ? 1.5 : 1;
                    texts.push({ x: t.x + t.size/2, y: t.y, text: '+$' + formatNumber(earned), color: t.isBoss?'#ffd700':'#00f3ff', life: 1.0 + textSize*0.5, size: textSize });
                    createParticles(t.x + t.size/2, t.y + t.size/2, t.color, t.isBoss ? 100 : 15);
                    if (t.isBoss) triggerShake(15, 500);
                    
                    addKillFeed(t.color);
                    totalKills++;
                    incrementDaily('killsT');
                    checkAchievements();
                    
                    targets.splice(j, 1);
                    waveProgress++;
                    hudProgress.innerText = `${waveProgress} / ${waveQuota}`;
                    
                    if (waveProgress >= waveQuota) endWave(true);
                } else {
                    t.flash = 0.1;
                }
                
                if (b.hitTargets.length > upg.pierce.val) {
                    hit = true;
                    break;
                }
            }
        }
        if (hit) bullets.splice(i, 1);
    }
    
    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.life -= dt / 1000;
        if (p.life <= 0) particles.splice(i, 1);
    }
    
    // Update texts
    for (let i = texts.length - 1; i >= 0; i--) {
        let t = texts[i];
        t.y -= 1.5 * (dt / 16);
        t.life -= dt / 1000;
        if (t.life <= 0) texts.splice(i, 1);
    }
    // Update kill feed
    updateKillFeed(dt);
}

function endWave(victory) {
    gameState = 'END';
    stopMusic();
    overlay.classList.remove('hidden');
    
    if (victory) {
        wavesCompleted++;
        if (waveHitsTaken === 0) {
            perfectWaves++;
            incrementDaily('perfectT');
        }
        incrementDaily('wavesT');
        checkAchievements();
        overlayTitle.innerText = waveHitsTaken===0 ? '✨ PERFECT CLEAR!' : 'WAVE CLEARED';
        overlayTitle.style.color = waveHitsTaken===0 ? '#ffd700' : '#00ff7a';
        overlayDesc.innerText = `You destroyed ${waveQuota} targets!`;
        
        let waveBonus = Math.floor(100 * wave * upg.income.val * (1 + prestigeLevel));
        if (waveHitsTaken === 0) waveBonus = Math.floor(waveBonus * 1.5);
        money += waveBonus;
        overlayReward.innerText = (waveHitsTaken===0?'PERFECT BONUS: ':'Bonus: ') + '+$' + formatNumber(waveBonus);
        
        wave++;
        waveProgress = 0;
        saveGame();
    } else {
        overlayTitle.innerText = 'WAVE FAILED';
        overlayTitle.style.color = '#ff007a';
        overlayDesc.innerText = 'A target hit you or the ground.';
        overlayReward.innerText = 'Progress: ' + waveProgress + ' / ' + waveQuota;
        waveProgress = 0;
    }
}

function shoot() {
    let shots = Math.min(5, upg.multishot.val);
    let spread = 15;
    
    if (activeBuffs.spread > 0) {
        shots += 4;
        spread = 22;
    }
    
    let startX = playerX - ((shots - 1) * spread) / 2;
    
    let bulletColor = '#00f3ff';
    const bSkin = COSMETICS.bullet.find(s => s.id === equippedBulletSkin);
    if (bSkin) bulletColor = bSkin.color;

    for (let i = 0; i < shots; i++) {
        let finalColor = bulletColor;
        if (bulletColor === 'rainbow') {
            finalColor = `hsl(${(performance.now() / 5) % 360}, 100%, 50%)`;
        }
        bullets.push({
            x: startX + (i * spread) - 4,
            y: playerY - 30,
            width: 8,
            height: 25,
            isHoming: false,
            color: finalColor
        });
    }
    
    gunRecoil = 15;
    playSound('shoot');
}

function spawnPowerup() {
    let types = [
        { type: 'nuke', name: 'NUKE!', color: '#ff0000', symbol: '☢️' },
        { type: 'frenzy', name: 'FRENZY!', color: '#00ff7a', symbol: '⚡' },
        { type: 'money', name: '2X MONEY!', color: '#ffaa00', symbol: '💰' },
        { type: 'spread', name: 'MEGA SHOT!', color: '#7a00ff', symbol: '✨' }
    ];
    let t = types[Math.floor(Math.random() * types.length)];
    
    powerups.push({
        x: Math.random() * (canvas.width - 60) + 30,
        y: -40,
        radius: 20,
        ...t
    });
}

function activatePowerup(type) {
    if (type === 'nuke') {
        playSound('nuke');
        let earnedTotal = 0;
        let multiplier = (activeBuffs.doubleMoney > 0) ? 2 : 1;
        for (let i = targets.length - 1; i >= 0; i--) {
            let t = targets[i];
            if (t.isBoss) {
                t.hp -= Math.floor(t.maxHp * 0.2); // 20% damage to boss
                createParticles(t.x + t.size/2, t.y + t.size/2, '#ff0000', 30);
                if (t.hp <= 0) {
                    earnedTotal += Math.floor(t.maxHp * upg.income.val * multiplier * 5 * (1 + prestigeLevel));
                    waveProgress++;
                    targets.splice(i, 1);
                } else {
                    t.flash = 0.5;
                }
            } else {
                let nukeMult = (difficulty === 'impossible') ? 0.1 : (difficulty === 'hard' ? 0.3 : 1.0);
                earnedTotal += Math.floor(t.maxHp * upg.income.val * multiplier * (1 + prestigeLevel) * nukeMult);
                createParticles(t.x + t.size/2, t.y + t.size/2, t.color, 10);
                waveProgress++;
                targets.splice(i, 1);
            }
        }
        money += earnedTotal;
        if (earnedTotal > 0) {
            texts.push({ x: canvas.width/2, y: canvas.height/2, text: '+$' + formatNumber(earnedTotal), color: '#ff0000', life: 1.5 });
        }
        hudMoney.innerText = '$' + formatNumber(money);
        hudProgress.innerText = `${waveProgress} / ${waveQuota}`;
        if (waveProgress >= waveQuota) endWave(true);
    } else if (type === 'frenzy') {
        activeBuffs.frenzy = 6000;
    } else if (type === 'money') {
        activeBuffs.doubleMoney = 10000;
    } else if (type === 'spread') {
        activeBuffs.spread = 8000;
    }
}

function spawnBoss() {
    let size = 120;
    let x = (canvas.width - size) / 2;
    let y = -size;
    
    let multiplier = difficulty === 'impossible' ? 10.0 : (difficulty === 'hard' ? 3.0 : 1.65);
    let hpScale = 5 * Math.pow(multiplier, wave - 1);
    let hp = Math.floor(hpScale * 50); // Massive Boss HP
    
    targets.push({
        x: x, y: y, size: size,
        hp: hp, maxHp: hp,
        color: '#ff0000', flash: 0,
        isBoss: true,
        vx: 3 
    });
}

function spawnTarget() {
    let size = 40 + Math.random() * 20;
    let x = Math.random() * (canvas.width - size);
    let y = -size;
    
    // HP scales with wave
    let multiplier = difficulty === 'impossible' ? 10.0 : (difficulty === 'hard' ? 3.0 : 1.65);
    let hpScale = 5 * Math.pow(multiplier, wave - 1);
    let hp = Math.floor(Math.random() * hpScale) + hpScale;
    
    let colors = ['#ff007a', '#7a00ff', '#ffaa00', '#00ff7a'];
    let color = colors[Math.floor(Math.random() * colors.length)];
    
    targets.push({
        x: x, y: y, size: size,
        hp: hp, maxHp: hp,
        color: color, flash: 0,
        baseX: x, timeOffset: Math.random() * 100,
        zigZag: Math.random() < 0.3 // 30% chance to zig-zag
    });
}

function createParticles(x, y, color, count = 5) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 0.3 + Math.random() * 0.4,
            color: color
        });
    }
}

function draw() {
    // Screen shake
    let sx = 0, sy = 0;
    if (shakeTime > 0) {
        sx = (Math.random()-0.5)*shakePower;
        sy = (Math.random()-0.5)*shakePower;
        ctx.save();
        ctx.translate(sx, sy);
    }
    
    ctx.fillStyle = '#0f0f16';
    ctx.fillRect(-Math.abs(sx)-5, -Math.abs(sy)-5, canvas.width+Math.abs(sx)*2+10, canvas.height+Math.abs(sy)*2+10);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    let tOffset = (performance.now() * 0.05) % 40;
    for(let y=tOffset; y<canvas.height; y+=40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    
    ctx.font = 'bold 16px Outfit';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let t of targets) {
        if (t.flash > 0) {
            ctx.fillStyle = '#fff';
            t.flash -= 0.016;
        } else {
            ctx.fillStyle = t.color;
        }
        
        ctx.shadowBlur = 20;
        ctx.shadowColor = t.color;
        ctx.fillRect(t.x, t.y, t.size, t.size);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#fff';
        ctx.fillText(formatNumber(t.hp), t.x + t.size/2, t.y + t.size/2);
    }
    
    ctx.fillStyle = '#00f3ff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f3ff';
    for (let b of bullets) {
        if (b.isHoming) {
            ctx.fillStyle = '#ffd700';
            ctx.shadowColor = '#ffd700';
        } else {
            ctx.fillStyle = b.color || '#00f3ff';
            ctx.shadowColor = b.color || '#00f3ff';
        }
        ctx.fillRect(b.x, b.y, b.width, b.height);
    }
    ctx.shadowBlur = 0;
    
    for (let p of powerups) {
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = p.color;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.fillText(p.symbol, p.x, p.y + 7);
    }
    
    if (gunRecoil > 0) gunRecoil -= 1.5;
    let visualGunY = playerY + gunRecoil;
    
    let pColor = '#00f3ff';
    let pBorder = null;
    let pGlow = '#00f3ff';
    const pSkin = COSMETICS.player.find(s => s.id === equippedPlayerSkin);
    if (pSkin) {
        pColor = pSkin.color;
        pBorder = pSkin.borderColor;
        pGlow = pSkin.glow || pColor;
    }

    const EMOJI_MAP = { player_unicorn: '🦄', player_alien: '👽', player_skull: '💀', player_crown: '👑', player_ghost: '👻', player_trident: '🔱', player_lightning: '⚡', player_diamond: '💎', player_vortex: '🌀' };
    if (EMOJI_MAP[equippedPlayerSkin]) {
        ctx.font = '50px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 30;
        ctx.shadowColor = pGlow;
        ctx.fillText(EMOJI_MAP[equippedPlayerSkin], playerX, visualGunY - 5);
        ctx.shadowBlur = 0;
    } else {
        ctx.fillStyle = pColor;
        ctx.shadowBlur = 15; // Tighter glow
        ctx.shadowColor = pGlow;
        ctx.beginPath();
        ctx.moveTo(playerX, visualGunY - 25);
        ctx.lineTo(playerX + 25, visualGunY + 15);
        ctx.lineTo(playerX - 25, visualGunY + 15);
        ctx.fill();
        if (pBorder) {
            ctx.strokeStyle = pBorder;
            ctx.lineWidth = 1.5; // Thinner, sharper outline
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        
        // Power Core Detail
        ctx.fillStyle = pGlow;
        ctx.shadowBlur = 10;
        ctx.shadowColor = pGlow;
        ctx.beginPath();
        ctx.arc(playerX, visualGunY + 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    for (let p of particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
        ctx.fillRect(p.x, p.y, 4, 4);
    }
    ctx.globalAlpha = 1;
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let txt of texts) {
        const scale = txt.size || 1;
        ctx.font = `bold ${Math.floor(22*scale)}px Outfit`;
        ctx.fillStyle = txt.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, txt.life));
        ctx.shadowBlur = scale > 1 ? 15 : 0; ctx.shadowColor = txt.color;
        ctx.fillText(txt.text, txt.x, txt.y);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    
    if (shakeTime > 0) { shakeTime -= 16; ctx.restore(); }
}

// Input Handling
function handleMove(clientX, clientY) {
    if (gameState !== 'PLAYING') return;
    let rect = canvas.getBoundingClientRect();
    playerX = clientX - rect.left;
    playerY = clientY - rect.top;
    
    playerX = Math.max(25, Math.min(canvas.width - 25, playerX));
    playerY = Math.max(25, Math.min(canvas.height - 25, playerY));
}

canvas.addEventListener('touchstart', (e) => {
    if (gameState !== 'PLAYING') return;
    e.preventDefault();
    isDragging = true;
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
}, {passive: false});

canvas.addEventListener('touchmove', (e) => {
    if (gameState !== 'PLAYING') return;
    e.preventDefault();
    if (isDragging) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }
}, {passive: false});

canvas.addEventListener('touchend', () => { isDragging = false; });

canvas.addEventListener('mousedown', (e) => {
    if (gameState !== 'PLAYING') return;
    isDragging = true;
    handleMove(e.clientX, e.clientY);
});
canvas.addEventListener('mousemove', (e) => {
    if (isDragging) handleMove(e.clientX, e.clientY);
});
window.addEventListener('mouseup', () => { isDragging = false; });

// Hub Navigation
btnHubPlay.addEventListener('click', () => {
    showWavePreview(() => {
        if (wave > 1 && wave % 5 === 0) {
            openBlackMarket(startWave);
        } else {
            startWave();
        }
    });
});

document.getElementById('btn-hub-achievements').addEventListener('click', () => {
    hubScreen.classList.add('hidden');
    document.getElementById('achievements-screen').classList.remove('hidden');
    renderAchievements();
});
document.getElementById('btn-close-achievements').addEventListener('click', () => {
    document.getElementById('achievements-screen').classList.add('hidden');
    hubScreen.classList.remove('hidden');
});
document.getElementById('btn-hub-daily').addEventListener('click', () => {
    hubScreen.classList.add('hidden');
    document.getElementById('daily-screen').classList.remove('hidden');
    renderDailies();
});
document.getElementById('btn-close-daily').addEventListener('click', () => {
    document.getElementById('daily-screen').classList.add('hidden');
    hubScreen.classList.remove('hidden');
});

function updateDifficultyUI() {
    let mainColor = '#00f3ff';
    let mainShadow = '0 0 15px rgba(0, 243, 255, 0.5)';
    
    if (difficulty === 'easy') {
        btnDifficulty.innerText = 'MODE: EASY (1.65x)';
        btnDifficulty.style.background = '#00f3ff';
        btnDifficulty.style.boxShadow = mainShadow;
        btnDifficulty.style.color = '#000';
        btnDifficulty.style.border = 'none';
    } else if (difficulty === 'hard') {
        mainColor = '#ff007a';
        mainShadow = '0 0 15px rgba(255, 0, 122, 0.5)';
        btnDifficulty.innerText = 'MODE: HARD (3.0x)';
        btnDifficulty.style.background = mainColor;
        btnDifficulty.style.boxShadow = mainShadow;
        btnDifficulty.style.color = '#fff';
        btnDifficulty.style.border = 'none';
    } else {
        mainColor = '#ff0000';
        mainShadow = '0 0 20px rgba(255, 0, 0, 0.8)';
        btnDifficulty.innerText = 'MODE: IMPOSSIBLE (10.0x)';
        btnDifficulty.style.background = '#000';
        btnDifficulty.style.boxShadow = mainShadow;
        btnDifficulty.style.color = mainColor;
        btnDifficulty.style.border = '2px solid #ff0000';
    }

    // Apply global theming
    const gameTitle = document.getElementById('game-title');
    const hubMoney = document.getElementById('hub-money');
    const settingsTitle = document.getElementById('settings-title');
    const settingsPanel = document.getElementById('settings-panel');
    const closeBtn = document.getElementById('btn-close-settings');
    const volSlider = document.getElementById('volume-slider');
    
    if (gameTitle) {
        gameTitle.style.color = mainColor;
        gameTitle.style.textShadow = mainShadow;
    }
    if (hubMoney) {
        hubMoney.style.color = mainColor;
        hubMoney.style.textShadow = mainShadow;
    }
    if (settingsTitle) settingsTitle.style.color = mainColor;
    if (settingsPanel) {
        settingsPanel.style.borderColor = mainColor;
        settingsPanel.style.boxShadow = mainShadow;
    }
    if (closeBtn) {
        if (difficulty === 'impossible') {
            closeBtn.style.background = '#000';
            closeBtn.style.color = '#ff0000';
            closeBtn.style.border = '2px solid #ff0000';
        } else {
            closeBtn.style.background = mainColor;
            closeBtn.style.color = difficulty === 'hard' ? '#fff' : '#000';
            closeBtn.style.border = 'none';
        }
        closeBtn.style.boxShadow = mainShadow;
    }
    if (volSlider) volSlider.style.accentColor = mainColor;
    
    if (btnHubPlay) {
        if (difficulty === 'impossible') {
            btnHubPlay.style.background = '#000';
            btnHubPlay.style.color = '#ff0000';
            btnHubPlay.style.border = '2px solid #ff0000';
        } else if (difficulty === 'hard') {
            btnHubPlay.style.background = 'linear-gradient(135deg, #ff007a, #aa0055)';
            btnHubPlay.style.color = '#fff';
            btnHubPlay.style.border = 'none';
        } else {
            btnHubPlay.style.background = 'linear-gradient(135deg, #00f3ff, #0088ff)';
            btnHubPlay.style.color = '#000';
            btnHubPlay.style.border = 'none';
        }
        btnHubPlay.style.boxShadow = mainShadow;
    }
}

btnDifficulty.addEventListener('click', () => {
    saveGame();
    if (difficulty === 'easy') difficulty = 'hard';
    else if (difficulty === 'hard') difficulty = 'impossible';
    else difficulty = 'easy';
    updateDifficultyUI();
    loadGame();
    updateMenuUI();
});

btnHubUpgrades.addEventListener('click', () => {
    hubScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
});
btnBackHub.addEventListener('click', () => {
    menuScreen.classList.add('hidden');
    hubScreen.classList.remove('hidden');
    updateMenuUI();
});

btnContinue.addEventListener('click', () => {
    gameScreen.classList.add('hidden');
    hubScreen.classList.remove('hidden');
    bgCanvas.style.display = 'block';
    gameState = 'HUB';
    updateMenuUI();
});

btnPause.addEventListener('click', () => {
    if (gameState === 'PLAYING' && !isPaused) {
        isPaused = true;
        pauseMenu.classList.remove('hidden');
    }
});

btnResume.addEventListener('click', () => {
    isPaused = false;
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
});

btnQuit.addEventListener('click', () => {
    isPaused = false;
    pauseMenu.classList.add('hidden');
    gameScreen.classList.add('hidden');
    hubScreen.classList.remove('hidden');
    bgCanvas.style.display = 'block';
    gameState = 'HUB';
    updateMenuUI();
});

btnPrestige.addEventListener('click', () => {
    if (wave >= 100) {
        if (confirm("Are you sure? This resets your wave, money, and upgrades, but gives a permanent multiplier!")) {
            prestigeLevel++;
            wave = 1;
            waveProgress = 0;
            money = 0;
            for (let key in upg) {
                upg[key].lvl = 1;
                upg[key].val = key === 'firerate' ? 800 : (key === 'pierce' ? 0 : 1);
            }
            saveGame();
            updateMenuUI();
        }
    }
});

btnCollectIdle.addEventListener('click', () => {
    idlePopup.classList.add('hidden');
    updateMenuUI();
});

// --- DATA SAVING ---
function saveGame() {
    if (!currentUser || gameState === 'LOGIN') return;
    let saveObj = {
        money: money,
        wave: wave,
        waveProgress: waveProgress,
        prestige: prestigeLevel,
        difficulty: difficulty,
        lastSaveTime: Date.now(),
        inventory: inventory,
        ownedSkins: ownedSkins,
        equippedPlayerSkin: equippedPlayerSkin,
        equippedBulletSkin: equippedBulletSkin,
        upgrades: {
            damage: { lvl: upg.damage.lvl, val: upg.damage.val },
            firerate: { lvl: upg.firerate.lvl, val: upg.firerate.val },
            income: { lvl: upg.income.lvl, val: upg.income.val },
            multishot: { lvl: upg.multishot.lvl, val: upg.multishot.val },
            spawn: { lvl: upg.spawn.lvl, val: upg.spawn.val },
            pierce: { lvl: upg.pierce.lvl, val: upg.pierce.val }
        }
    };
    localStorage.setItem('neonGunTycoonSave_' + difficulty.toUpperCase() + '_' + currentUser, JSON.stringify(saveObj));
    
    // Ping real-time server
    fetch(`${SERVER_URL}/api/update_score`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ user: `[${difficulty.toUpperCase()}] ${currentUser}`, wave: wave, money: money })
    }).catch(e => console.log("Backend not connected"));

    // Ping prestige leaderboard
    if (prestigeLevel > 0) {
        fetch(`${SERVER_URL}/api/update_score`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ user: `[PRESTIGE] ${currentUser}`, wave: prestigeLevel, money: prestigeLevel })
        }).catch(e => console.log("Backend not connected"));
    }
}

function resetGameToDefaults() {
    wave = 1;
    waveProgress = 0;
    money = 0;
    prestigeLevel = 0;
    inventory = ['player_default', 'bullet_default'];
    ownedSkins = ['player_default', 'bullet_default'];
    for (let key in upg) {
        upg[key].lvl = 1;
        upg[key].val = key === 'firerate' ? 800 : (key === 'pierce' ? 0 : 1);
    }
}

function loadGame() {
    if (!currentUser) return;
    
    if (difficulty === 'easy' && !localStorage.getItem('neonGunTycoonSave_EASY_' + currentUser)) {
        let legacyStr = localStorage.getItem('neonGunTycoonSave_' + currentUser);
        if (legacyStr) {
            localStorage.setItem('neonGunTycoonSave_EASY_' + currentUser, legacyStr);
            localStorage.removeItem('neonGunTycoonSave_' + currentUser);
        }
    }
    
    let savedStr = localStorage.getItem('neonGunTycoonSave_' + difficulty.toUpperCase() + '_' + currentUser);
    
    resetGameToDefaults();
    
    if (savedStr) {
        try {
            let saveObj = JSON.parse(savedStr);
            if (typeof saveObj.money === 'number') money = saveObj.money;
            if (typeof saveObj.wave === 'number') wave = saveObj.wave;
            if (typeof saveObj.waveProgress === 'number') waveProgress = saveObj.waveProgress;
            if (typeof saveObj.prestige === 'number') prestigeLevel = saveObj.prestige;
            if (saveObj.inventory) inventory = saveObj.inventory;
            if (saveObj.ownedSkins) ownedSkins = saveObj.ownedSkins;
            if (saveObj.equippedPlayerSkin) equippedPlayerSkin = saveObj.equippedPlayerSkin;
            if (saveObj.equippedBulletSkin) equippedBulletSkin = saveObj.equippedBulletSkin;
            
            // Offline Earnings Calculation
            if (saveObj.lastSaveTime) {
                let secondsOffline = Math.floor((Date.now() - saveObj.lastSaveTime) / 1000);
                if (secondsOffline > 86400) secondsOffline = 86400; // max 24 hours
                if (secondsOffline > 60 && (wave > 1 || money > 0)) {
                    let idleRate = wave * upg.income.val * 2 * (1 + prestigeLevel);
                    let earned = secondsOffline * idleRate;
                    money += earned;
                    idleAmount.innerText = '+$' + formatNumber(earned);
                    idlePopup.classList.remove('hidden');
                }
            }
            
            if (saveObj.upgrades) {
                for (let key in upg) {
                    if (saveObj.upgrades[key]) {
                        upg[key].lvl = saveObj.upgrades[key].lvl;
                        upg[key].val = saveObj.upgrades[key].val;
                    }
                }
            }
        } catch(e) {
            console.error("Save file corrupted");
        }
    }
}

// Auto-save every 2 seconds
setInterval(saveGame, 2000);

function generateUID(u, p) {
    let str = u.toLowerCase() + ":" + p;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36).toUpperCase().padStart(8, '0');
}

// Passive menu update
setInterval(() => {
    if (gameState === 'HUB' || gameState === 'MENU') updateMenuUI();
}, 1000);

// UI Logic for Login and Leaderboard
let lastUser = localStorage.getItem('neonLastUser');
if (lastUser) {
    document.getElementById('username').value = lastUser;
    
    // Auto-login
    let accs = JSON.parse(localStorage.getItem('neonAccounts') || '{}');
    if (accs[lastUser]) {
        currentUser = lastUser;
        if (typeof accs[lastUser] === 'string') {
            accs[lastUser] = { pass: accs[lastUser], uid: generateUID(lastUser, accs[lastUser]) };
            localStorage.setItem('neonAccounts', JSON.stringify(accs));
        }
        currentUserUid = accs[lastUser].uid;
        loadGame();
        
        loginScreen.classList.add('hidden');
        hubScreen.classList.remove('hidden');
        gameState = 'HUB';
        updateMenuUI();
    }
}

document.getElementById('btn-login').addEventListener('click', () => {
    let u = document.getElementById('username').value.trim();
    let p = document.getElementById('password').value;
    
    if (u.length < 3 || p.length < 3) {
        document.getElementById('login-error').innerText = "Must be at least 3 characters";
        document.getElementById('login-error').style.display = "block";
        return;
    }
    
    let accs = JSON.parse(localStorage.getItem('neonAccounts') || '{}');
    if (accs[u]) {
        if (typeof accs[u] === 'string') {
            if (accs[u] !== p) {
                document.getElementById('login-error').innerText = "Wrong password!";
                document.getElementById('login-error').style.display = "block";
                return;
            }
            accs[u] = { pass: p, uid: generateUID(u, p) };
            localStorage.setItem('neonAccounts', JSON.stringify(accs));
        } else if (accs[u].pass !== p) {
            document.getElementById('login-error').innerText = "Wrong password!";
            document.getElementById('login-error').style.display = "block";
            return;
        }
    } else {
        accs[u] = { pass: p, uid: generateUID(u, p) }; 
        localStorage.setItem('neonAccounts', JSON.stringify(accs));
    }
    
    currentUser = u;
    currentUserUid = accs[u].uid;
    localStorage.setItem('neonLastUser', u);
    loadGame();
    loadAchievements();
    loadDailies();
    
    loginScreen.classList.add('hidden');
    hubScreen.classList.remove('hidden');
    gameState = 'HUB';
    updateMenuUI();
});

let currentLbMode = 'waves';

async function refreshLeaderboard() {
    let lbList = document.getElementById('lb-list');
    lbList.innerHTML = `<div style="text-align:center; padding: 20px;">Loading leaderboards...</div>`;
    
    try {
        let res = await fetch(`${SERVER_URL}/api/leaderboard`);
        let lb = await res.json();
        
        lbList.innerHTML = '';
        
        let diffPrefix = currentLbMode === 'prestiges' ? '[PRESTIGE]' : `[${difficulty.toUpperCase()}]`;
        let filteredLb = lb.filter(entry => entry.user.startsWith(diffPrefix));
        
        let diffTitle = document.createElement('div');
        diffTitle.style.textAlign = 'center';
        diffTitle.style.color = currentLbMode === 'prestiges' ? '#ffd700' : (difficulty === 'impossible' ? '#ff0000' : (difficulty === 'hard' ? '#ff007a' : '#00f3ff'));
        diffTitle.style.fontWeight = '900';
        diffTitle.style.fontSize = '24px';
        diffTitle.style.marginBottom = '20px';
        diffTitle.innerText = currentLbMode === 'prestiges' ? 'PRESTIGE LEADERBOARD' : `${difficulty.toUpperCase()} MODE LEADERBOARD`;
        lbList.appendChild(diffTitle);
        
        if (filteredLb.length === 0) {
            lbList.innerHTML += '<div style="text-align:center; padding: 20px;">No players on this leaderboard yet!</div>';
            return;
        }
        
        filteredLb.forEach((entry, idx) => {
            let rankClass = '';
            if (idx === 0) rankClass = 'gold';
            else if (idx === 1) rankClass = 'silver';
            else if (idx === 2) rankClass = 'bronze';
            
            let displayUser = entry.user.replace(diffPrefix + ' ', '');
            let isMe = displayUser === currentUser;
            
            let item = document.createElement('div');
            item.className = 'lb-item';
            item.innerHTML = `
                <div class="lb-rank ${rankClass}">#${idx+1}</div>
                <div class="lb-name">${isMe ? displayUser + ' (YOU)' : displayUser}</div>
                <div class="lb-stats">
                    <div class="lb-wave">${currentLbMode === 'prestiges' ? 'PRESTIGE ' : 'WAVE '}${entry.wave}</div>
                    <div class="lb-money" style="${currentLbMode === 'prestiges' ? 'display:none;' : ''}">$${formatNumber(entry.money)}</div>
                </div>
            `;
            if (isMe) item.style.border = '1px solid #00f3ff';
            lbList.appendChild(item);
        });
    } catch(e) {
        lbList.innerHTML = '<div style="text-align:center; padding: 20px; color: #ff007a;">Failed to connect to real-time server.<br><br>Make sure you run <b>python server.py</b> in the game folder!</div>';
    }
}

safeListen('btn-lb-waves', 'click', () => {
    currentLbMode = 'waves';
    const btn = document.getElementById('btn-lb-waves');
    if (btn) {
        btn.style.background = '#00f3ff';
        btn.style.color = '#000';
        btn.style.boxShadow = '0 0 10px rgba(0,243,255,0.5)';
    }
    const btnP = document.getElementById('btn-lb-prestiges');
    if (btnP) {
        btnP.style.background = '#2a2a45';
        btnP.style.color = '#fff';
        btnP.style.boxShadow = 'none';
    }
    refreshLeaderboard();
});

safeListen('btn-lb-prestiges', 'click', () => {
    currentLbMode = 'prestiges';
    const btn = document.getElementById('btn-lb-prestiges');
    if (btn) {
        btn.style.background = '#ffd700';
        btn.style.color = '#000';
        btn.style.boxShadow = '0 0 10px rgba(255,215,0,0.5)';
    }
    const btnW = document.getElementById('btn-lb-waves');
    if (btnW) {
        btnW.style.background = '#2a2a45';
        btnW.style.color = '#fff';
        btnW.style.boxShadow = 'none';
    }
    refreshLeaderboard();
});

safeListen('btn-hub-lb', 'click', () => {
    hubScreen.classList.add('hidden');
    lbScreen.classList.remove('hidden');
    refreshLeaderboard();
});

safeListen('btn-close-lb', 'click', () => {
    lbScreen.classList.add('hidden');
    hubScreen.classList.remove('hidden');
});

const settingsScreen = document.getElementById('settings-screen');
const volSlider = document.getElementById('volume-slider');
const volValue = document.getElementById('vol-value');

volSlider.value = masterVolume;
volValue.innerText = Math.round(masterVolume * 100);

volSlider.addEventListener('input', (e) => {
    masterVolume = parseFloat(e.target.value);
    masterGain.gain.value = masterVolume;
    volValue.innerText = Math.round(masterVolume * 100);
    localStorage.setItem('neonVolume', masterVolume);
});

safeListen('btn-hub-settings', 'click', () => {
    hubScreen.classList.add('hidden');
    settingsScreen.classList.remove('hidden');
    document.getElementById('settings-uid').innerText = currentUserUid;
});

safeListen('btn-close-settings', 'click', () => {
    settingsScreen.classList.add('hidden');
    hubScreen.classList.remove('hidden');
});

safeListen('btn-wipe-save', 'click', () => {
    if (confirm("Are you absolutely sure you want to reset your progress? This only deletes saves on YOUR device!")) {
        let keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key && key.startsWith('neonGunTycoonSave_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        
        resetGameToDefaults();
        saveGame();
        updateMenuUI();
    }
});

// Owner Panel Listeners
const ownerScreen = document.getElementById('owner-screen');
document.getElementById('btn-owner-panel').addEventListener('click', () => {
    hubScreen.classList.add('hidden');
    ownerScreen.classList.remove('hidden');
});
document.getElementById('btn-close-owner').addEventListener('click', () => {
    ownerScreen.classList.add('hidden');
    hubScreen.classList.remove('hidden');
});
document.getElementById('btn-owner-money').addEventListener('click', () => {
    money += 100000000000;
    saveGame();
    updateMenuUI();
    alert('+ $100,000,000,000 ADDED');
});
document.getElementById('btn-owner-wave').addEventListener('click', () => {
    wave += 10;
    saveGame();
    updateMenuUI();
    alert('+ 10 WAVES ADDED');
});
document.getElementById('btn-owner-buff').addEventListener('click', () => {
    activeBuffs.frenzy = 60000;
    activeBuffs.doubleMoney = 60000;
    activeBuffs.spread = 60000;
    saveGame();
    alert('ALL BUFFS ACTIVATED FOR 60s');
});

document.getElementById('btn-owner-nuke').addEventListener('click', () => {
    targets.forEach(t => {
        spawnExplosion(t.x, t.y, '#ff4400');
        spawnText(t.x, t.y, '☢️ NUKE', '#ff4400');
    });
    targets = [];
    waveQuota = 0;
    alert('WAVE NUKED!');
});

document.getElementById('btn-owner-skins').addEventListener('click', () => {
    COSMETICS.player.forEach(s => { if (!ownedSkins.includes(s.id)) ownedSkins.push(s.id); });
    COSMETICS.bullet.forEach(s => { if (!ownedSkins.includes(s.id)) ownedSkins.push(s.id); });
    saveGame();
    alert('ALL SKINS UNLOCKED!');
});

document.getElementById('btn-owner-max').addEventListener('click', () => {
    for (let key in upg) {
        upg[key].lvl = 999;
        if (key === 'damage') upg.damage.val = 1e100; // Googol Damage
        if (key === 'firerate') upg.firerate.val = 30; // Max speed
        if (key === 'income') upg.income.val = 1e50; // Quindecillion income
        if (key === 'multishot') upg.multishot.val = 20; // 20 bullets
        if (key === 'spawn') upg.spawn.val = 50; // Max spawn speed
        if (key === 'pierce') upg.pierce.val = 10000; // 10k Pierce (Infinite)
    }
    money = 1e100;
    saveGame();
    updateMenuUI();
    alert('🌌 CENTILLION MODE ACTIVATED! Nothing can stop you now.');
});

document.getElementById('btn-owner-god').addEventListener('click', () => {
    godMode = !godMode;
    alert('GOD MODE: ' + (godMode ? 'ON' : 'OFF'));
});

document.getElementById('btn-owner-prestige').addEventListener('click', () => {
    prestigeLevel++;
    saveGame();
    updateMenuUI();
    alert('PRESTIGE ADDED! Current Level: ' + prestigeLevel);
});

document.getElementById('btn-owner-crate').addEventListener('click', () => {
    // Owner crate is free - just open it directly
    const overlay = document.getElementById('crate-anim-overlay');
    const roll = document.getElementById('crate-opening-roll');
    overlay.classList.remove('hidden');
    
    roll.style.position = 'absolute';
    roll.style.left = '0';
    roll.style.paddingLeft = '0px';
    roll.style.width = '10000px';
    roll.style.transition = 'none';
    roll.style.transform = 'translateX(50vw)';
    void roll.offsetWidth;
    
    let pool = [...COSMETICS.player, ...COSMETICS.bullet].filter(it => it.isOwner);
    if (pool.length === 0) pool = [...COSMETICS.player, ...COSMETICS.bullet];
    
    roll.innerHTML = '';
    const rollCount = 50;
    let winningItem = null;

    const CRATE_EMOJI = { player_trident: '🔱', player_lightning: '⚡', player_diamond: '💎', player_vortex: '🌀', bullet_inferno: '🔥', bullet_void: '🕳️', bullet_plasma: '⚡', bullet_divine: '✨' };

    for (let i = 0; i < rollCount; i++) {
        const item = pool[Math.floor(Math.random() * pool.length)];
        if (i === 45) winningItem = item;
        
        const card = document.createElement('div');
        card.style.minWidth = '150px';
        card.style.width = '150px';
        card.style.height = '200px';
        card.style.flexShrink = '0';
        card.style.background = '#1a0000';
        card.style.border = '4px solid #ff0000';
        card.style.borderRadius = '15px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'center';
        card.style.gap = '10px';
        card.style.boxShadow = '0 0 15px rgba(255,0,0,0.3)';
        
        const emoji = CRATE_EMOJI[item.id] || '👑';
        const typeLabel = item.id.includes('bullet') ? '🔫 BULLET' : '🛸 PLAYER';
        let previewHTML = `<div style="font-size:40px;">${emoji}</div>`;
        card.innerHTML = `
            ${previewHTML}
            <div style="color:#fff; font-weight:bold; font-size:12px; text-align:center;">${item.name}</div>
            <div style="color:#ff0000; font-size:10px; font-weight:900;">OWNER EXCLUSIVE</div>
            <div style="color:#aaa; font-size:9px;">${typeLabel}</div>
        `;
        roll.appendChild(card);
    }

    setTimeout(() => {
        roll.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
        const offset = Math.random() * 100 - 50;
        roll.style.transform = `translateX(calc(50vw - ${45 * 160 + 75 + offset}px))`;
    }, 100);

    setTimeout(() => {
        inventory.push(winningItem.id);
        if (!ownedSkins.includes(winningItem.id)) ownedSkins.push(winningItem.id);
        saveGame();
        alert(`👑 OWNER DROP: ${winningItem.name}!`);
        overlay.classList.add('hidden');
    }, 4500);
});

// Tab Listeners
document.getElementById('tab-player-skins').addEventListener('click', () => {
    currentSkinTab = 'player';
    document.getElementById('tab-player-skins').style.background = '#00f3ff';
    document.getElementById('tab-player-skins').style.color = '#000';
    document.getElementById('tab-bullet-skins').style.background = 'transparent';
    document.getElementById('tab-bullet-skins').style.color = '#fff';
    renderCosmetics();
});

document.getElementById('tab-bullet-skins').addEventListener('click', () => {
    currentSkinTab = 'bullet';
    document.getElementById('tab-bullet-skins').style.background = '#00f3ff';
    document.getElementById('tab-bullet-skins').style.color = '#000';
    document.getElementById('tab-player-skins').style.background = 'transparent';
    document.getElementById('tab-player-skins').style.color = '#fff';
    renderCosmetics();
});

document.getElementById('btn-hub-skins').addEventListener('click', () => {
    hubScreen.classList.add('hidden');
    document.getElementById('skins-screen').classList.remove('hidden');
    renderCosmetics();
});

document.getElementById('btn-close-skins').addEventListener('click', () => {
    document.getElementById('skins-screen').classList.add('hidden');
    hubScreen.classList.remove('hidden');
    updateMenuUI();
});

// ============ MARKET & TRADING SYSTEM ============

function openCrate(type) {
    const cost = 10000000;
    if (money < cost) return alert(`Not enough money! Need $${formatNumber(cost)}.`);
    money -= cost;
    updateMenuUI();
    
    const overlay = document.getElementById('crate-anim-overlay');
    const roll = document.getElementById('crate-opening-roll');
    overlay.classList.remove('hidden');
    
    // Reset animation state
    roll.style.position = 'absolute';
    roll.style.left = '0';
    roll.style.paddingLeft = '0px';
    roll.style.width = '10000px'; // Force browser to render all items without clipping
    roll.style.transition = 'none';
    roll.style.transform = 'translateX(50vw)';
    
    // Force browser to register the reset before animating
    void roll.offsetWidth;
    
    // Generate items for the roll - all non-owner items in one pool
    let pool = [...COSMETICS.player, ...COSMETICS.bullet].filter(it => !it.isOwner);
    if (pool.length === 0) pool = [...COSMETICS.player, ...COSMETICS.bullet]; // Fallback
    
    // Item-specific drop weights (lower = rarer, Unicorn is hardest)
    const ITEM_WEIGHTS = {
        player_unicorn: 1,    // Ultra-rare (hardest to get)
        player_skull: 3,      // Very rare
        player_galaxy: 5,     // Rare legendary
        player_alien: 8,      // Uncommon emoji
        player_crown: 8,      // Uncommon emoji
        player_ghost: 12      // Common emoji
    };
    
    function pickItem() {
        // First pick rarity tier
        const rand = Math.random() * 100;
        let rarityKey = 'COMMON';
        if (rand < 2) rarityKey = 'LEGENDARY';       // 2% legendary
        else if (rand < 10) rarityKey = 'EPIC';       // 8% epic
        else if (rand < 35) rarityKey = 'RARE';       // 25% rare
        
        let candidates = pool.filter(it => it.rarity === rarityKey);
        if (candidates.length === 0) candidates = pool;
        
        // Weighted random selection within the rarity tier
        const weights = candidates.map(it => ITEM_WEIGHTS[it.id] || 10);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let roll = Math.random() * totalWeight;
        for (let j = 0; j < candidates.length; j++) {
            roll -= weights[j];
            if (roll <= 0) return candidates[j];
        }
        return candidates[candidates.length - 1];
    }
    
    roll.innerHTML = '';
    const rollCount = 50;
    let winningItem = null;

    for (let i = 0; i < rollCount; i++) {
        const item = pickItem();
        
        if (i === 45) winningItem = item; // 45 is our target index
        
        const card = document.createElement('div');
        card.style.minWidth = '150px';
        card.style.width = '150px';
        card.style.height = '200px';
        card.style.flexShrink = '0'; // Prevent mobile browsers from shrinking items
        card.style.background = '#1a1a2e';
        card.style.border = `4px solid ${RARITY[item.rarity].color}`;
        card.style.borderRadius = '15px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'center';
        card.style.gap = '10px';
        
        const CRATE_EMOJI = { player_unicorn: '🦄', player_alien: '👽', player_skull: '💀', player_crown: '👑', player_ghost: '👻', player_trident: '🔱', player_lightning: '⚡', player_diamond: '💎', player_vortex: '🌀' };
        let iconHTML;
        if (CRATE_EMOJI[item.id]) {
            iconHTML = `<div style="font-size:40px;">${CRATE_EMOJI[item.id]}</div>`;
        } else if (item.id.includes('bullet')) {
            const bColor = item.color === 'rainbow' ? 'linear-gradient(to bottom, red, orange, yellow, green, cyan, blue, purple)' : item.color;
            iconHTML = `<div style="width:8px;height:30px;background:${bColor};box-shadow:0 0 12px ${item.color === 'rainbow' ? '#fff' : item.color};border-radius:3px;"></div>`;
        } else {
            const triColor = item.color || '#00f3ff';
            const triGlow = item.glow || triColor;
            iconHTML = `<svg width="45" height="45" viewBox="0 0 45 45"><polygon points="22.5,5 40,40 5,40" fill="${triColor}" style="filter:drop-shadow(0 0 8px ${triGlow})"/>${item.borderColor ? `<polygon points="22.5,5 40,40 5,40" fill="none" stroke="${item.borderColor}" stroke-width="2"/>` : ''}</svg>`;
        }
        
        card.innerHTML = `
            ${iconHTML}
            <div style="color:#fff; font-weight:bold; font-size:12px; text-align:center;">${item.name}</div>
            <div style="color:${RARITY[item.rarity].color}; font-size:10px; font-weight:900;">${item.rarity}</div>
        `;
        roll.appendChild(card);
    }

    setTimeout(() => {
        // Restore transition for smooth rolling
        roll.style.transition = 'transform 4s cubic-bezier(0.15, 0, 0.15, 1)';
        // Add a slight random offset so it doesn't land on the exact dead center pixel every time
        const offset = Math.random() * 100 - 50;
        roll.style.transform = `translateX(calc(50vw - ${45 * 160 + 75 + offset}px))`;
    }, 100);

    setTimeout(() => {
        inventory.push(winningItem.id);
        if (!ownedSkins.includes(winningItem.id)) ownedSkins.push(winningItem.id);
        saveGame();
        alert(`🎉 UNLOCKED: ${winningItem.name} (${winningItem.rarity})!`);
        overlay.classList.add('hidden');
    }, 4500);
}

function renderInventory() {
    const list = document.getElementById('inventory-list');
    const search = document.getElementById('inv-search').value.toLowerCase();
    
    // Group duplicates
    const counts = {};
    inventory.forEach(id => counts[id] = (counts[id] || 0) + 1);
    
    const EMOJI_MAP = { player_unicorn: '🦄', player_alien: '👽', player_skull: '💀', player_crown: '👑', player_ghost: '👻', player_trident: '🔱', player_lightning: '⚡', player_diamond: '💎', player_vortex: '🌀', bullet_inferno: '🔥', bullet_void: '🕳️', bullet_plasma: '⚡', bullet_divine: '✨' };
    const allSkins = [...COSMETICS.player, ...COSMETICS.bullet];
    list.innerHTML = allSkins.filter(s => inventory.includes(s.id) && s.name.toLowerCase().includes(search)).map(item => {
        const count = counts[item.id];
        const isEquipped = (equippedPlayerSkin === item.id || equippedBulletSkin === item.id);
        
        let previewHTML;
        if (EMOJI_MAP[item.id]) {
            previewHTML = `<div style="font-size:32px;">${EMOJI_MAP[item.id]}</div>`;
        } else if (item.id.includes('bullet')) {
            const bColor = item.color === 'rainbow' ? 'linear-gradient(to bottom, red, orange, yellow, green, cyan, blue, purple)' : item.color;
            previewHTML = `<div style="width:6px;height:24px;background:${bColor};box-shadow:0 0 10px ${item.color === 'rainbow' ? '#fff' : item.color};border-radius:2px;"></div>`;
        } else {
            const triColor = item.color || '#00f3ff';
            const triGlow = item.glow || triColor;
            previewHTML = `<svg width="36" height="36" viewBox="0 0 45 45"><polygon points="22.5,5 40,40 5,40" fill="${triColor}" style="filter:drop-shadow(0 0 6px ${triGlow})"/>${item.borderColor ? `<polygon points="22.5,5 40,40 5,40" fill="none" stroke="${item.borderColor}" stroke-width="2"/>` : ''}</svg>`;
        }
        
        return `
            <div onclick="handleInventoryClick('${item.id}')" style="width:100px;height:100px;background:${item.rarity === 'OWNER' ? (isEquipped ? 'rgba(255,0,0,0.15)' : '#1a0000') : (isEquipped ? 'rgba(0,243,255,0.15)' : '#1a1a2e')};border:2px solid ${item.rarity === 'OWNER' ? '#ff0000' : (isEquipped ? '#00f3ff' : RARITY[item.rarity].color)};border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;position:relative;cursor:pointer;flex-shrink:0;">
                <div style="position:absolute;top:4px;right:6px;color:#fff;font-weight:900;font-size:10px;background:rgba(0,0,0,0.5);padding:1px 5px;border-radius:6px;">x${count}</div>
                ${previewHTML}
                <div style="color:#fff;font-size:9px;font-weight:bold;text-align:center;line-height:1.1;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.name}</div>
                <div style="color:${RARITY[item.rarity].color};font-size:8px;font-weight:900;">${item.rarity}</div>
            </div>
        `;
    }).join('');
}

function handleInventoryClick(id) {
    if (id.startsWith('player')) equippedPlayerSkin = id;
    else equippedBulletSkin = id;
    playSound('buy');
    saveGame();
    renderInventory();
}

function openTradeHub() {
    const list = document.getElementById('trade-player-list');
    list.innerHTML = `<div style="text-align:center; padding: 20px; color:#a0a0b0;">Fetching active traders...</div>`;
    
    // Fetch real players from the leaderboard
    fetch('https://neon-server-crhx.onrender.com/api/leaderboard')
        .then(res => res.json())
        .then(lb => {
            // Remove the [TAG] and get unique names
            let traders = [...new Set(lb.map(entry => entry.user.split(' ').slice(1).join(' ')))];
            // Don't trade with yourself
            traders = traders.filter(t => t !== currentUser && t.length > 0);
            
            if (traders.length === 0) {
                list.innerHTML = `<div style="text-align:center; padding: 20px; color:#ff007a;">No other players found. Try again later!</div>`;
                return;
            }

            list.innerHTML = traders.map(name => `
                <div class="lb-item" style="border-color:rgba(0,255,122,0.3);">
                    <div class="lb-name">${name}</div>
                    <button onclick="startTrade('${name}')" style="width:auto; padding:8px 15px; font-size:12px; background:#00ff7a; color:#000;">TRADE</button>
                </div>
            `).join('');
        })
        .catch(err => {
            list.innerHTML = `<div style="text-align:center; padding: 20px; color:#ff007a;">Offline: Using Local Traders</div>`;
            const localTraders = ["NeonKing", "ShadowStrike", "VoidMaster"];
            list.innerHTML += localTraders.map(name => `
                <div class="lb-item" style="border-color:rgba(0,255,122,0.3);">
                    <div class="lb-name">${name}</div>
                    <button onclick="startTrade('${name}')" style="width:auto; padding:8px 15px; font-size:12px; background:#00ff7a; color:#000;">TRADE</button>
                </div>
            `).join('');
        });
}

async function startTrade(name) {
    tradeTargetName = name;
    tradeOfferYourItems = [];
    tradeOfferTheirItems = [];
    tradeLocked = false;
    
    document.getElementById('trade-target-name').innerText = name.toUpperCase();
    document.getElementById('trade-modal').classList.remove('hidden');
    renderValueChart('trade-modal-value-chart');
    
    // Create room on server
    const res = await fetch(`${SERVER_URL}/api/create_trade`, {
        method: 'POST',
        body: JSON.stringify({ from: currentUser, to: name })
    });
    const data = await res.json();
    currentTradeRoom = data.room_id;
    
    updateTradeUI();
}

function updateTradeUI() {
    const yourEl = document.getElementById('trade-your-offer');
    const theirEl = document.getElementById('trade-their-offer');
    
    const renderOffer = (items, isYours) => {
        const counts = {};
        items.forEach(id => counts[id] = (counts[id] || 0) + 1);
        const unique = [...new Set(items)];
        
        return unique.map(id => {
            const item = [...COSMETICS.player, ...COSMETICS.bullet].find(s => s.id === id);
            if (!item) return '';
            const rarityColor = RARITY[item.rarity] ? RARITY[item.rarity].color : '#fff';
            const countStr = counts[id] > 1 ? ` <span style="color:#ffd700; font-weight:900;">x${counts[id]}</span>` : '';
            const icon = id.includes('bullet') ? '☄️' : '🛸';
            
            const removeBtn = isYours ? `<span onclick="removeFromOffer('${id}')" style="color:#ff007a; cursor:pointer; font-weight:900; margin-left:8px;">✖</span>` : '';
            
            return `<div style="background:#2a2a45; border-radius:8px; padding:6px 10px; border:1px solid ${rarityColor}; font-size:11px; color:#fff; display:flex; align-items:center; gap:6px;">
                <span style="color:${item.color}; font-size:14px;">${icon}</span>
                <span>${item.name}${countStr}</span>
                ${removeBtn}
            </div>`;
        }).join('');
    };
    
    yourEl.innerHTML = renderOffer(tradeOfferYourItems, true);
    theirEl.innerHTML = renderOffer(tradeOfferTheirItems, false);
}

function removeFromOffer(id) {
    if (tradeLocked) return alert("Unlock your offer to change items!");
    const idx = tradeOfferYourItems.indexOf(id);
    if (idx > -1) {
        tradeOfferYourItems.splice(idx, 1);
        updateTradeUI();
        syncLiveTrade();
    }
}


function pickTradeItem(isYours) {
    if (tradeLocked) return alert("Unlock your offer to change items!");
    const modal = document.getElementById('item-select-modal');
    const list = document.getElementById('item-select-list');
    modal.classList.remove('hidden');
    
    if (isYours) {
        const counts = {};
        inventory.forEach(id => counts[id] = (counts[id] || 0) + 1);
        const uniqueItems = [...new Set(inventory)];
        list.innerHTML = uniqueItems.map(id => {
            const item = [...COSMETICS.player, ...COSMETICS.bullet].find(s => s.id === id);
            if (!item) return '';
            const rarityColor = RARITY[item.rarity] ? RARITY[item.rarity].color : '#fff';
            const icon = id.includes('bullet') ? '☄️' : '🛸';
            return `<div onclick="addToOffer('${id}', true)" style="background:#2a2a45; border-radius:10px; padding:10px; border:2px solid ${rarityColor}; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:5px;">
                <div style="color:${item.color}; font-size:24px;">${icon}</div>
                <div style="font-size:12px; color:#fff; text-align:center; font-weight:bold;">${item.name}</div>
                <div style="font-size:10px; color:#ffd700;">Owned: ${counts[id]}</div>
            </div>`;
        }).join('');
    } else {
        const allSkins = [...COSMETICS.player, ...COSMETICS.bullet];
        list.innerHTML = allSkins.map(item => {
            const rarityColor = RARITY[item.rarity] ? RARITY[item.rarity].color : '#fff';
            const icon = item.id.includes('bullet') ? '☄️' : '🛸';
            return `<div onclick="addToOffer('${item.id}', false)" style="background:#2a2a45; border-radius:10px; padding:10px; border:2px solid ${rarityColor}; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:5px;">
                <div style="color:${item.color}; font-size:24px;">${icon}</div>
                <div style="font-size:12px; color:#fff; text-align:center; font-weight:bold;">${item.name}</div>
            </div>`;
        }).join('');
    }
}

function addToOffer(id, isYours) {
    if (tradeLocked) return alert("Unlock your offer to change items!");
    if (isYours) tradeOfferYourItems.push(id);
    else return alert("Live Trading: They must add their own items!");
    
    document.getElementById('item-select-modal').classList.add('hidden');
    updateTradeUI();
    syncLiveTrade(); // Send to server immediately
}

async function toggleLockOffer() {
    tradeLocked = !tradeLocked;
    const btn = document.getElementById('btn-lock-trade');
    btn.innerText = tradeLocked ? "🔓 UNLOCK OFFER" : "🔒 LOCK OFFER";
    btn.style.background = tradeLocked ? "#ffaa00" : "#00ff7a";
    
    await syncLiveTrade();
}

async function sendTradeProposal() {
    if (tradeOfferYourItems.length === 0 || tradeOfferTheirItems.length === 0) return alert("Offer must include items on both sides!");
    
    // Ownership Check
    const tempInv = [...inventory];
    for (let id of tradeOfferYourItems) {
        const idx = tempInv.indexOf(id);
        if (idx === -1) return alert("Error: You no longer have one of the items in your offer!");
        tempInv.splice(idx, 1);
    }

    // Remove from inventory IMMEDIATELY (Escrow)
    tradeOfferYourItems.forEach(id => {
        const idx = inventory.indexOf(id);
        if (idx > -1) inventory.splice(idx, 1);
    });
    saveGame();

    // Send to Server
    try {
        const res = await fetch(`${SERVER_URL}/api/send_trade`, {
            method: 'POST',
            body: JSON.stringify({
                from: currentUser,
                to: tradeTargetName,
                offer: tradeOfferYourItems,    // What you are giving
                request: tradeOfferTheirItems  // What you want
            })
        });
        const result = await res.json();
        alert(`🤝 Trade proposal sent to ${tradeTargetName}! Your items are in escrow.`);
    } catch (e) {
        // Fallback: Refund if server fails
        tradeOfferYourItems.forEach(id => inventory.push(id));
        saveGame();
        alert("Server error. Items refunded to inventory.");
    }
    
    document.getElementById('trade-modal').classList.add('hidden');
    renderInventory();
}




safeListen('btn-hub-crates', 'click', () => { hubScreen.classList.add('hidden'); document.getElementById('crate-screen').classList.remove('hidden'); });
safeListen('btn-close-crates', 'click', () => { document.getElementById('crate-screen').classList.add('hidden'); hubScreen.classList.remove('hidden'); });
safeListen('btn-open-crate', 'click', () => openCrate('normal'));

safeListen('btn-hub-inventory', 'click', () => { hubScreen.classList.add('hidden'); document.getElementById('inventory-screen').classList.remove('hidden'); renderInventory(); });
safeListen('btn-close-inventory', 'click', () => { document.getElementById('inventory-screen').classList.add('hidden'); hubScreen.classList.remove('hidden'); });
safeListen('inv-search', 'input', renderInventory);

function switchTradeTab(activeTab) {
    const tabs = ['browse', 'requests', 'values'];
    tabs.forEach(t => {
        const view = document.getElementById('view-trade-' + t);
        const btn = document.getElementById('tab-trade-' + t);
        if (view && btn) {
            if (t === activeTab) {
                view.classList.remove('hidden');
                btn.style.background = '#00ff7a';
                btn.style.color = '#000';
            } else {
                view.classList.add('hidden');
                btn.style.background = 'transparent';
                btn.style.color = '#fff';
            }
        }
    });
    if (activeTab === 'values') renderValueChart();
}

safeListen('tab-trade-browse', 'click', () => switchTradeTab('browse'));
safeListen('tab-trade-requests', 'click', () => switchTradeTab('requests'));
safeListen('tab-trade-values', 'click', () => switchTradeTab('values'));

function renderValueChart(targetId) {
    const allItems = [...COSMETICS.player, ...COSMETICS.bullet];
    const rarityOrder = { OWNER: 5, LEGENDARY: 4, EPIC: 3, RARE: 2, COMMON: 1 };
    const sorted = allItems.slice().sort((a, b) => {
        const rDiff = (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
        if (rDiff !== 0) return rDiff;
        return (b.price === Infinity ? 999999999 : b.price) - (a.price === Infinity ? 999999999 : a.price);
    });
    const EMOJI_MAP = { player_unicorn: '\u{1F984}', player_alien: '\u{1F47D}', player_skull: '\u{1F480}', player_crown: '\u{1F451}', player_ghost: '\u{1F47B}', player_trident: '\u{1F531}', player_lightning: '\u26A1', player_diamond: '\u{1F48E}', player_vortex: '\u{1F300}', bullet_inferno: '\u{1F525}', bullet_void: '\u{1F573}\uFE0F', bullet_plasma: '\u26A1', bullet_divine: '\u2728' };
    
    const html = sorted.map(item => {
        const rarityColor = RARITY[item.rarity] ? RARITY[item.rarity].color : '#fff';
        const icon = EMOJI_MAP[item.id] || (item.id.includes('bullet') ? '\u2604\uFE0F' : '\u{1F6F8}');
        const typeTag = item.id.includes('bullet') ? 'BULLET' : 'PLAYER';
        const isCompact = !!targetId && targetId === 'trade-modal-value-chart';
        
        if (isCompact) {
            return `<div style="display:flex; align-items:center; gap:6px; padding:4px 6px; background:rgba(255,255,255,0.03); border-radius:6px; border-left:3px solid ${rarityColor};">
                <span style="font-size:12px;">${icon}</span>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:9px; color:#fff; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
                    <div style="font-size:8px; color:${rarityColor}; font-weight:900;">${item.rarity}</div>
                </div>
                <div style="font-size:8px; color:#ffd700; font-weight:900; white-space:nowrap;">${item.price === Infinity ? '∞' : '$' + formatNumber(item.price)}</div>
            </div>`;
        }
        
        return `<div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:${item.rarity === 'OWNER' ? 'rgba(255,0,0,0.08)' : 'rgba(255,255,255,0.03)'}; border-radius:10px; border:1px solid ${rarityColor}30;">
            <span style="font-size:20px;">${icon}</span>
            <div style="flex:1; min-width:0;">
                <div style="font-size:12px; color:#fff; font-weight:bold;">${item.name}</div>
                <div style="font-size:10px; color:${rarityColor}; font-weight:900;">${item.rarity} <span style="color:#505070; font-weight:400;">${typeTag}</span></div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:12px; color:#ffd700; font-weight:900;">${item.price === Infinity ? '∞' : '$' + formatNumber(item.price)}</div>
                <div style="font-size:9px; color:#a0a0b0;">VALUE: ${RARITY[item.rarity] ? RARITY[item.rarity].value : '?'}</div>
            </div>
        </div>`;
    }).join('');
    
    if (targetId) {
        const el = document.getElementById(targetId);
        if (el) el.innerHTML = html;
    } else {
        const chart = document.getElementById('trade-value-chart');
        if (chart) chart.innerHTML = html;
        const sidebar = document.getElementById('trade-modal-value-chart');
        if (sidebar) sidebar.innerHTML = renderValueChart('trade-modal-value-chart') || '';
    }
    return html;
}

safeListen('btn-cancel-trade', 'click', () => {
    document.getElementById('trade-modal').classList.add('hidden');
    currentTradeRoom = null;
});

safeListen('btn-hub-trade', 'click', () => { hubScreen.classList.add('hidden'); document.getElementById('trade-screen').classList.remove('hidden'); openTradeHub(); switchTradeTab('browse'); });
safeListen('btn-close-trade', 'click', () => { document.getElementById('trade-screen').classList.add('hidden'); hubScreen.classList.remove('hidden'); });
safeListen('btn-search-player', 'click', () => {
    const val = document.getElementById('trade-user-search').value;
    if (val) startTrade(val);
});

safeListen('btn-lock-trade', 'click', toggleLockOffer);
safeListen('btn-send-trade', 'click', () => {
    if (document.getElementById('btn-send-trade').classList.contains('disabled')) return;
    sendTradeProposal();
});

safeListen('btn-add-your-item', 'click', () => pickTradeItem(true));
safeListen('btn-add-their-item', 'click', () => pickTradeItem(false));
safeListen('btn-close-item-select', 'click', () => document.getElementById('item-select-modal').classList.add('hidden'));

safeListen('btn-hub-achievements', 'click', () => { hubScreen.classList.add('hidden'); document.getElementById('achievements-screen').classList.remove('hidden'); renderAchievements(); });
safeListen('btn-close-achievements', 'click', () => { document.getElementById('achievements-screen').classList.add('hidden'); hubScreen.classList.remove('hidden'); });

// --- LOADING LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        initDOMElements();
        initSettings();
        attachUpgradeListeners();
        
        const fill = document.getElementById('loader-bar-fill');
        const screen = document.getElementById('loading-screen');
        if (!fill || !screen) {
            console.error("Critical: Loader elements missing");
            return;
        }
        
        let p = 0;
        const interval = setInterval(() => {
            try {
                p += Math.random() * 15;
                if (p >= 100) {
                    p = 100;
                    clearInterval(interval);
                    setTimeout(() => {
                        screen.style.opacity = '0';
                        setTimeout(() => screen.classList.add('hidden'), 800);
                        // Emergency check: if game is still not showing, force it
                        setTimeout(() => {
                            if (gameState === 'LOGIN' && loginScreen) {
                                loginScreen.classList.remove('hidden');
                            }
                        }, 1000);
                    }, 500);
                }
                fill.style.width = p + '%';
            } catch (e) {
                console.error("Loader Interval Error:", e);
                clearInterval(interval);
                if (screen) screen.classList.add('hidden');
            }
        }, 100);
    } catch (e) {
        console.error("Global Initialization Error:", e);
        const screen = document.getElementById('loading-screen');
        if (screen) screen.classList.add('hidden');
    }
});

