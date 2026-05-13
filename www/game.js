const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const loginScreen = document.getElementById('login-screen');
const lbScreen = document.getElementById('leaderboard-screen');
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const overlay = document.getElementById('overlay');

const menuMoneyEl = document.getElementById('menu-money');
const menuWaveEl = document.getElementById('menu-wave-text');
const btnPlay = document.getElementById('btn-play');

const hudMoney = document.getElementById('hud-money');
const hudProgress = document.getElementById('hud-progress');
const hudLives = document.getElementById('hud-lives');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');
const overlayReward = document.getElementById('overlay-reward');
const btnContinue = document.getElementById('btn-continue');

// Game State
let gameState = 'LOGIN'; // LOGIN, MENU, PLAYING, END
let currentUser = null;
let wave = 1;
let money = 0;

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

function formatNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'k';
    return Math.floor(num).toString();
}

function getCost(key) {
    return Math.floor(upg[key].baseCost * Math.pow(upg[key].costMult, upg[key].lvl - 1));
}

function updateMenuUI() {
    menuMoneyEl.innerText = '$' + formatNumber(money);
    if (wave % 10 === 0) {
        menuWaveEl.innerText = 'BOSS WAVE ' + wave;
        menuWaveEl.style.color = '#ff0000';
    } else {
        menuWaveEl.innerText = 'WAVE ' + wave;
        menuWaveEl.style.color = '#fff';
    }
    btnPlay.innerText = 'START WAVE ' + wave;
    
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

function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
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
    waveProgress = 0;
    
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
    gameScreen.classList.remove('hidden');
    overlay.classList.add('hidden');
    
    resize();
    
    playerX = canvas.width / 2;
    playerY = canvas.height - 100;
    
    hudProgress.innerText = `0 / ${waveQuota}`;
    updateLivesHUD();
    hudMoney.innerText = '$' + formatNumber(money);
    
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function updateLivesHUD() {
    let str = '';
    for(let i=0; i<3; i++) {
        str += (i < lives) ? '❤️' : '🖤';
    }
    hudLives.innerText = str;
}

let lastTime = performance.now();

function gameLoop(currentTime) {
    if (gameState !== 'PLAYING') return;
    
    const dt = currentTime - lastTime;
    lastTime = currentTime;
    
    update(dt, currentTime);
    draw();
    
    requestAnimationFrame(gameLoop);
}

let gunRecoil = 0;

function update(dt, time) {
    // Decrement buffs
    if (activeBuffs.frenzy > 0) activeBuffs.frenzy -= dt;
    if (activeBuffs.doubleMoney > 0) activeBuffs.doubleMoney -= dt;
    if (activeBuffs.spread > 0) activeBuffs.spread -= dt;

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
        if (b.y < -50) bullets.splice(i, 1);
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
        lives--;
        updateLivesHUD();
        // Screen flash
        texts.push({ x: canvas.width/2, y: canvas.height/2, text: '-1 LIFE', color: '#ff0000', life: 1.0 });
        
        if (lives <= 0) {
            endWave(false);
        }
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
                
                t.hp -= upg.damage.val;
                
                createParticles(b.x, b.y, '#00f3ff', 2);
                
                if (t.hp <= 0) {
                    let multiplier = (activeBuffs.doubleMoney > 0) ? 2 : 1;
                    let bossBonus = t.isBoss ? 5 : 1;
                    let earned = Math.floor(t.maxHp * upg.income.val * multiplier * bossBonus);
                    money += earned;
                    hudMoney.innerText = '$' + formatNumber(money);
                    
                    texts.push({ x: t.x + t.size/2, y: t.y, text: '+$' + formatNumber(earned), color: '#00f3ff', life: 1.0 });
                    createParticles(t.x + t.size/2, t.y + t.size/2, t.color, t.isBoss ? 100 : 15);
                    
                    targets.splice(j, 1);
                    
                    waveProgress++;
                    hudProgress.innerText = `${waveProgress} / ${waveQuota}`;
                    
                    if (waveProgress >= waveQuota) {
                        endWave(true);
                    }
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
}

function endWave(victory) {
    gameState = 'END';
    overlay.classList.remove('hidden');
    
    if (victory) {
        overlayTitle.innerText = 'WAVE CLEARED';
        overlayTitle.style.color = '#00ff7a';
        overlayDesc.innerText = `You destroyed ${waveQuota} targets!`;
        
        let waveBonus = Math.floor(100 * wave * upg.income.val);
        money += waveBonus;
        overlayReward.innerText = 'Bonus: +$' + formatNumber(waveBonus);
        
        wave++;
    } else {
        overlayTitle.innerText = 'WAVE FAILED';
        overlayTitle.style.color = '#ff007a';
        overlayDesc.innerText = 'A target hit you or the ground.';
        overlayReward.innerText = 'Progress: ' + waveProgress + ' / ' + waveQuota;
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
    
    for (let i = 0; i < shots; i++) {
        bullets.push({
            x: startX + (i * spread) - 4,
            y: playerY - 30,
            width: 8,
            height: 25
        });
    }
    gunRecoil = 15;
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
        let earnedTotal = 0;
        let multiplier = (activeBuffs.doubleMoney > 0) ? 2 : 1;
        for (let i = targets.length - 1; i >= 0; i--) {
            let t = targets[i];
            if (t.isBoss) {
                t.hp -= Math.floor(t.maxHp * 0.2); // 20% damage to boss
                createParticles(t.x + t.size/2, t.y + t.size/2, '#ff0000', 30);
                if (t.hp <= 0) {
                    earnedTotal += Math.floor(t.maxHp * upg.income.val * multiplier * 5);
                    waveProgress++;
                    targets.splice(i, 1);
                } else {
                    t.flash = 0.5;
                }
            } else {
                earnedTotal += Math.floor(t.maxHp * upg.income.val * multiplier);
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
    
    let hpScale = 5 * Math.pow(1.2, wave - 1);
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
    let hpScale = 5 * Math.pow(1.2, wave - 1);
    let hp = Math.floor(Math.random() * hpScale) + hpScale;
    
    let colors = ['#ff007a', '#7a00ff', '#ffaa00', '#00ff7a'];
    let color = colors[Math.floor(Math.random() * colors.length)];
    
    targets.push({
        x: x, y: y, size: size,
        hp: hp, maxHp: hp,
        color: color, flash: 0
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
    ctx.fillStyle = '#0f0f16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
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
    
    ctx.fillStyle = '#00f3ff';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00f3ff';
    ctx.beginPath();
    ctx.moveTo(playerX, visualGunY - 25);
    ctx.lineTo(playerX + 25, visualGunY + 15);
    ctx.lineTo(playerX - 25, visualGunY + 15);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(playerX, visualGunY - 10);
    ctx.lineTo(playerX + 10, visualGunY + 10);
    ctx.lineTo(playerX - 10, visualGunY + 10);
    ctx.fill();
    
    for (let p of particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
        ctx.fillRect(p.x, p.y, 4, 4);
    }
    ctx.globalAlpha = 1;
    
    ctx.font = 'bold 22px Outfit';
    for (let txt of texts) {
        ctx.fillStyle = txt.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, txt.life));
        ctx.fillText(txt.text, txt.x, txt.y);
    }
    ctx.globalAlpha = 1;
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

// Buttons
btnPlay.addEventListener('click', startWave);
btnContinue.addEventListener('click', () => {
    gameScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    updateMenuUI();
});

// --- DATA SAVING ---
function saveGame() {
    if (!currentUser || gameState === 'LOGIN') return;
    let saveObj = {
        money: money,
        wave: wave,
        upgrades: {
            damage: { lvl: upg.damage.lvl, val: upg.damage.val },
            firerate: { lvl: upg.firerate.lvl, val: upg.firerate.val },
            income: { lvl: upg.income.lvl, val: upg.income.val },
            multishot: { lvl: upg.multishot.lvl, val: upg.multishot.val },
            spawn: { lvl: upg.spawn.lvl, val: upg.spawn.val },
            pierce: { lvl: upg.pierce.lvl, val: upg.pierce.val }
        }
    };
    localStorage.setItem('neonGunTycoonSave_' + currentUser, JSON.stringify(saveObj));
    
    // Ping real-time server
    fetch('https://neon-server-crhx.onrender.com/api/update_score', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ user: currentUser, wave: wave, money: money })
    }).catch(e => console.log("Backend not connected"));
}

function loadGame() {
    if (!currentUser) return;
    let savedStr = localStorage.getItem('neonGunTycoonSave_' + currentUser);
    if (savedStr) {
        try {
            let saveObj = JSON.parse(savedStr);
            if (typeof saveObj.money === 'number') money = saveObj.money;
            if (typeof saveObj.wave === 'number') wave = saveObj.wave;
            
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

// Passive menu update
setInterval(() => {
    if (gameState === 'MENU') updateMenuUI();
}, 1000);

// UI Logic for Login and Leaderboard
let lastUser = localStorage.getItem('neonLastUser');
if (lastUser) {
    document.getElementById('username').value = lastUser;
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
        if (accs[u] !== p) {
            document.getElementById('login-error').innerText = "Wrong password!";
            document.getElementById('login-error').style.display = "block";
            return;
        }
    } else {
        accs[u] = p; 
        localStorage.setItem('neonAccounts', JSON.stringify(accs));
    }
    
    currentUser = u;
    localStorage.setItem('neonLastUser', u);
    loadGame(); 
    
    loginScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
    gameState = 'MENU';
    updateMenuUI();
});

document.getElementById('btn-lb').addEventListener('click', async () => {
    menuScreen.classList.add('hidden');
    lbScreen.classList.remove('hidden');
    
    let lbList = document.getElementById('lb-list');
    lbList.innerHTML = '<div style="text-align:center; padding: 20px;">Loading real-time data...</div>';
    
    try {
        let res = await fetch('https://neon-server-crhx.onrender.com/api/leaderboard');
        let lb = await res.json();
        
        lbList.innerHTML = '';
        if (lb.length === 0) {
            lbList.innerHTML = '<div style="text-align:center; padding: 20px;">No players yet! Play a wave to rank up.</div>';
            return;
        }
        
        lb.forEach((entry, idx) => {
            let rankClass = '';
            if (idx === 0) rankClass = 'gold';
            else if (idx === 1) rankClass = 'silver';
            else if (idx === 2) rankClass = 'bronze';
            
            let item = document.createElement('div');
            item.className = 'lb-item';
            item.innerHTML = `
                <div class="lb-rank ${rankClass}">#${idx+1}</div>
                <div class="lb-name">${entry.user === currentUser ? entry.user + ' (YOU)' : entry.user}</div>
                <div class="lb-stats">
                    <div class="lb-wave">WAVE ${entry.wave}</div>
                    <div class="lb-money">$${formatNumber(entry.money)}</div>
                </div>
            `;
            if (entry.user === currentUser) item.style.border = '1px solid #00f3ff';
            lbList.appendChild(item);
        });
    } catch(e) {
        lbList.innerHTML = '<div style="text-align:center; padding: 20px; color: #ff007a;">Failed to connect to real-time server.<br><br>Make sure you run <b>python server.py</b> in the game folder!</div>';
    }
});

document.getElementById('btn-close-lb').addEventListener('click', () => {
    lbScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
});
