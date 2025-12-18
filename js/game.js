class Game {
    constructor() {
        this.level = 1;
        this.reset(false);
        this.running = false; // Start paused
        this.deathTimer = 0;
        // Link initial global sprites if they loaded before reset was called (edge case)
        if (this.player && typeof sonRunSprite !== 'undefined') this.player.runImg = sonRunSprite;
        if (this.enemy && typeof fatherRunSprite !== 'undefined') this.enemy.runImg = fatherRunSprite;
    }

    reset(nextLevel = false) {
        if (nextLevel) {
            this.level++;
        } else {
            this.level = 1;
        }

        // Apply Scaling
        // Son (Player): Reduce power each level. Min 0.5
        const playerPower = Math.max(0.5, 1.0 - ((this.level - 1) * 0.1));

        // Father (Enemy): Increase power each level. Base power boosted to 1.4
        const enemyPower = 1.4 + ((this.level - 1) * 0.15);

        this.player = new Fighter(100, 400, '#ff4400', 'Son', false, typeof sonSprite !== 'undefined' ? sonSprite : null);
        this.player.damageMultiplier = playerPower;
        this.player.runImg = typeof sonRunSprite !== 'undefined' ? sonRunSprite : null; // Link run sprite

        this.enemy = new Fighter(800, 400, '#00ff00', 'Father', true, typeof fatherSprite !== 'undefined' ? fatherSprite : null);
        this.enemy.damageMultiplier = enemyPower;
        this.enemy.runImg = typeof fatherRunSprite !== 'undefined' ? fatherRunSprite : null; // Link run sprite

        this.ai = new AIController(this.enemy, this.player, this.level);
        this.effects = [];

        this.running = true;
        document.getElementById('game-over-screen').classList.add('hidden');

        const lvlDisplay = document.getElementById('level-display');
        if (lvlDisplay) lvlDisplay.textContent = "Level " + this.level;
    }

    update() {
        if (!this.running) return;

        let dx = 0; let dy = 0;

        // Keyboard
        if (keysPressed[KEYS.A]) dx = -1;
        if (keysPressed[KEYS.D]) dx = 1;
        if (keysPressed[KEYS.W]) dy = -1;
        if (keysPressed[KEYS.S]) dy = 1;

        // Joystick override (if active)
        if (Math.abs(moveStick.input.x) > 0.1 || Math.abs(moveStick.input.y) > 0.1) {
            dx = moveStick.input.x;
            dy = moveStick.input.y;
        }

        this.player.move(dx, dy);

        // Jump
        if (keysPressed[KEYS.SPACE] || touchButtons[' ']) this.player.jump();

        // Actions
        // if (checkTrigger(KEYS.J) || checkTouchTrigger('j')) this.player.meleeAttack('punch', this.enemy);
        // if (checkTrigger(KEYS.K) || checkTouchTrigger('k')) this.player.meleeAttack('kick', this.enemy);
        if (checkTrigger(KEYS.I) || checkTouchTrigger('i')) this.player.burstAttack(this.enemy);

        // Special Attack (Dragon Whip)
        if (checkTrigger(KEYS.L) || checkTouchTrigger('l')) this.player.whipAttack(this.enemy);

        // Aim / Throw
        if (aimStick.active) {
            // Can add aiming visual here in future
        } else if (aimStick.wasActive) {
            // Throw on Release
            if (Math.sqrt(aimStick.lastInput.x ** 2 + aimStick.lastInput.y ** 2) > 0.3) {
                this.player.throwRing(null, aimStick.lastInput);
            }
            aimStick.wasActive = false;
        }


        this.player.update(this.enemy);
        this.enemy.update(this.player);
        this.ai.update();

        this.effects.forEach((e, i) => {
            e.update();
            if (e.life <= 0) this.effects.splice(i, 1);
        });

        if (this.player.hp <= 0 || this.enemy.hp <= 0) {
            if (this.deathTimer === 0) this.deathTimer = 120; // 2 seconds before menu
            this.deathTimer--;
            if (this.deathTimer <= 0) {
                this.endGame();
            }
        }

        // Running Sound Logic
        const isPlayerRunning = this.player.hp > 0 && (Math.abs(this.player.vx) > 0.1 || Math.abs(this.player.vy) > 0.1) && this.player.isGrounded;
        if (typeof sfx !== 'undefined' && sfx.updateRunSound) sfx.updateRunSound(isPlayerRunning);

        this.updateUI();

        aimStick.wasActive = aimStick.active;
        if (aimStick.active) aimStick.lastInput = { ...aimStick.input };

        Object.assign(prevKeys, keysPressed);
        Object.assign(prevTouch, touchButtons);
    }

    draw() {
        // 1. Draw Background (Screen Space) - Cover mode (No Stretch)
        if (bgImage.complete) {
            const screenRatio = canvas.width / canvas.height;
            const imgRatio = bgImage.width / bgImage.height;

            let drawW, drawH, startX, startY;

            if (screenRatio > imgRatio) {
                // Screen is wider than image: Fill width, crop height
                drawW = canvas.width;
                drawH = bgImage.height * (canvas.width / bgImage.width);
                startX = 0;
                startY = (canvas.height - drawH) / 2;
            } else {
                // Screen is taller than image: Fill height, crop width
                drawH = canvas.height;
                drawW = bgImage.width * (canvas.height / bgImage.height);
                startX = (canvas.width - drawW) / 2;
                startY = 0;
            }

            ctx.drawImage(bgImage, startX, startY, drawW, drawH);
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.save();
        // Apply scaling and centering
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // Calculate visible bounds in game-space coordinates
        const viewLeft = -offsetX / scale;
        const viewRight = (canvas.width - offsetX) / scale;
        const viewTop = -offsetY / scale;
        const viewBottom = (canvas.height - offsetY) / scale;



        // Draw Floor Area (Extended infinitely)
        // Made transparent as requested to show background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(viewLeft, FLOOR_TOP, (viewRight - viewLeft), FLOOR_BOTTOM - FLOOR_TOP);

        // Draw "Arena" boundaries/markings
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Left Wall Marker
        ctx.moveTo(0, FLOOR_TOP); ctx.lineTo(0, FLOOR_BOTTOM);
        // Right Wall Marker
        ctx.moveTo(BASE_WIDTH, FLOOR_TOP); ctx.lineTo(BASE_WIDTH, FLOOR_BOTTOM);
        ctx.stroke();

        // Floor Grid (Everywhere)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Vertical lines every 100px, extending to view lines
        const startGrid = Math.floor(viewLeft / 100) * 100;
        const endGrid = Math.ceil(viewRight / 100) * 100;

        for (let i = startGrid; i <= endGrid; i += 100) {
            ctx.moveTo(i, FLOOR_TOP); ctx.lineTo(i, FLOOR_BOTTOM);
        }
        ctx.stroke();

        const renderList = [
            { type: 'fighter', obj: this.player },
            { type: 'fighter', obj: this.enemy },
            ...this.effects.map(e => ({ type: 'effect', obj: e }))
        ];

        renderList.sort((a, b) => a.obj.y - b.obj.y);

        renderList.forEach(item => {
            item.obj.draw(ctx);
        });

        // Semi-transparent walls at edges to show bounds clearly
        ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
        ctx.fillRect(-20, FLOOR_TOP, 20, FLOOR_BOTTOM - FLOOR_TOP);
        ctx.fillRect(BASE_WIDTH, FLOOR_TOP, 20, FLOOR_BOTTOM - FLOOR_TOP);

        ctx.restore(); // Restore context for next frame/UI if any
    }

    addEffect(x, y, z, color, type) {
        if (type === 'hit') {
            // Normal Hit
            this.effects.push(new ImpactFlash(x, y, z, color, 30));
            this.effects.push(new Shockwave(x, y, z, color, 'normal'));
            for (let i = 0; i < 6; i++) {
                this.effects.push(new Particle(x, y, z, color, 'spark'));
            }
        } else if (type === 'burstHit') {
            // Big Burst Hit
            this.effects.push(new ImpactFlash(x, y, z, color, 60));
            this.effects.push(new Shockwave(x, y, z, color, 'burst'));
            // Add extra sparkles
            for (let i = 0; i < 15; i++) {
                this.effects.push(new Particle(x, y, z, color, 'spark'));
                this.effects.push(new Particle(x, y, z, '#fff', 'spark')); // White sparks too
            }
        } else if (type === 'shockwave') { // Activation
            this.effects.push(new Shockwave(x, y, z, color, 'burst'));
            for (let i = 0; i < 10; i++) {
                this.effects.push(new Particle(x, y, z, color, 'spark'));
            }
        } else if (type === 'jumpLaunch') {
            // 1. Double Rings
            this.effects.push(new Shockwave(x, y, z, color, 'jump')); // Inner
            const outer = new Shockwave(x, y, z, color, 'jump');
            outer.radius = 35; // Start larger
            outer.lineWidth = 6;
            this.effects.push(outer);

            // 2. Impact Crater
            const crater = new Particle(x, y, z, '#000', 'crater');
            crater.size = 40;
            crater.life = 1.0;
            this.effects.push(crater);

            // 3. Cinematic Dust Clouds
            for (let i = 0; i < 12; i++) {
                const angle = (Math.PI * 2 / 12) * i;
                const speed = 6 + Math.random() * 5;
                const p = new Particle(x, y, z, '#aaa', 'dust');
                p.vx = Math.cos(angle) * speed;
                p.vy = Math.sin(angle) * speed; // On ground plane
                p.vz = Math.random() * 3; // Slight pop up
                p.size = 15 + Math.random() * 10;
                this.effects.push(p);
            }

            // 4. Energy Spikes (Upward streaks)
            for (let i = 0; i < 6; i++) {
                const p = new Particle(
                    x + (Math.random() - 0.5) * 30,
                    y + (Math.random() - 0.5) * 15,
                    z, color, 'spike');
                p.vx = 0; p.vy = 0;
                p.vz = 20 + Math.random() * 10; // Fast up
                p.size = 15; // Length base
                this.effects.push(p);
            }
        } else {
            this.effects.push(new Particle(x, y, z, color, type));
        }
    }

    updateUI() {
        const currentScale = scale || 1; // define currentScale within scope if needed, but 'scale' is global
        // We need to use valid values here.
        // Actually, let's keep it simple.
        document.getElementById('player-hp').style.width = (this.player.hp / MAX_HP * 100) + '%';
        document.getElementById('enemy-hp').style.width = (this.enemy.hp / MAX_HP * 100) + '%';

        const playerReady = this.player.rings.filter(r => r.state === 'orbit').length;
        const enemyReady = this.enemy.rings.filter(r => r.state === 'orbit').length;

        // Render Visual Rings
        const updateRingDisplay = (containerId, count, total, type) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            // Simple rebuild (active vs inactive)
            let html = '';
            for (let i = 0; i < total; i++) {
                const isActive = i < count ? 'active' : '';
                html += `<div class="ring-dot ${type}-ring ${isActive}"></div>`;
            }
            // Only update if changed to avoid thrashing? actually innerHTML is fast enough for 5 div
            if (container.dataset.lastCount != count) {
                container.innerHTML = html;
                container.dataset.lastCount = count;
            }
        };

        updateRingDisplay('player-rings-display', playerReady, 5, 'son');
        updateRingDisplay('enemy-rings-display', enemyReady, 5, 'father');

        // Visual Cooldowns
        const burstBtn = document.getElementById('btn-burst');
        if (burstBtn) {
            const burstFill = burstBtn.querySelector('.btn-fill');
            if (burstFill) {
                // Burst CD is 900
                const pct = Math.max(0, Math.min(100, (1 - (this.player.burstCooldown / 900)) * 100));
                burstFill.style.height = pct + '%';

                // Optional: Grey out if not enough rings?
                // Burst requires 5 rings.
                if (playerReady < 5) {
                    burstBtn.style.opacity = '0.5';
                } else {
                    burstBtn.style.opacity = '1';
                }
            }
        }

        const specialBtn = document.getElementById('btn-special');
        if (specialBtn) {
            const specialFill = specialBtn.querySelector('.btn-fill');
            if (specialFill) {
                // Special Attack CD is 540
                // Normalize against 540 for full drain visualization
                const pct = Math.max(0, Math.min(100, (1 - (this.player.specialCooldown / 540)) * 100));
                specialFill.style.height = pct + '%';

                if (playerReady < 5) {
                    specialBtn.style.opacity = '0.5';
                } else {
                    specialBtn.style.opacity = '1';
                }
            }
        }
    }

    endGame() {
        this.running = false;
        if (typeof sfx !== 'undefined' && sfx.updateRunSound) sfx.updateRunSound(false);
        const screen = document.getElementById('game-over-screen');
        const text = document.getElementById('winner-text');
        const btn = screen.querySelector('button');

        screen.classList.remove('hidden');
        if (this.player.hp <= 0) {
            text.textContent = "Father Wins!";
            text.style.color = '#f00';
            btn.textContent = "Restart Game";
            btn.onclick = () => game.reset(false);
        } else {
            text.textContent = "Level " + this.level + " Complete!";
            text.style.color = '#0f0';
            btn.textContent = "Next Level >>";
            btn.onclick = () => game.reset(true);
        }
    }
}


const game = new Game();
function loop() {
    if (game.running) game.update();
    game.draw();
    requestAnimationFrame(loop);
}
loop();

// Global Start Function
window.startGame = function () {
    const home = document.getElementById('home-screen');
    home.style.display = 'none';
    game.running = true;

    // Start BGM
    if (typeof sfx !== 'undefined') sfx.playBGM();

    // Attempt fullscreen + landscape lock
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
        docEl.requestFullscreen().then(() => {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => { });
            }
        }).catch(() => { });
    }

    // Reposition Fullscreen Button
    const fsBtn = document.getElementById('btn-fullscreen');
    if (fsBtn) fsBtn.classList.add('gameplay-pos');
};
