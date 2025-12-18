class Ring {
    constructor(owner, index, color) {
        this.owner = owner;
        this.index = index;
        this.color = color;
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.w = 16;
        this.h = 16;
        this.state = 'orbit';
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.isBurst = false;
        this.trail = [];
        this.waitTimer = 0;
    }

    getBox() {
        return { x: this.x - 8, y: this.y, z: this.z - 8, w: 16, h: 16 };
    }

    update(target) {
        if (this.state === 'waiting' || this.state === 'jump_boost') {
            this.waitTimer--;
            if (this.waitTimer <= 0) {
                this.state = 'returning';
            }
            if (this.state === 'jump_boost') {
                // Stay at jump origin
                if (this.jumpPos) {
                    this.x = this.jumpPos.x;
                    this.y = this.jumpPos.y;
                    this.z = this.jumpPos.z;
                }
            }
            return; // Stay in place
        }

        if (this.state !== 'orbit') {
            this.trail.push({ x: this.x, y: this.y, z: this.z, alpha: 0.5 });
            if (this.trail.length > 5) this.trail.shift();
        } else {
            this.trail = [];
        }

        if (this.state === 'orbit') {
            const angle = (Date.now() / 500) + (this.index * (Math.PI * 2 / 5));
            const offsetX = Math.cos(angle) * RING_ORBIT_RADIUS;
            const offsetY = Math.sin(angle) * (RING_ORBIT_RADIUS * 0.3);

            this.x = this.owner.centerX + offsetX;
            this.y = this.owner.centerY + offsetY;
            this.z = this.owner.z + 50;
        } else if (this.state === 'thrown') {
            this.x += this.vx;
            this.y += this.vy;
            this.z += this.vz;

            if (this.x < 0 || this.x > canvas.width || this.y < FLOOR_TOP - 100 || this.y > FLOOR_BOTTOM + 100) {
                this.startReturn(20); // Short delay when hitting bounds
            }

            const tBox = target.getBox();
            const rBox = this.getBox();

            if (checkCollision3D(rBox, tBox)) {
                // Calculate Damage with Multiplier
                const baseDmg = this.isBurst ? BURST_DAMAGE : RING_DAMAGE;
                target.takeDamage(baseDmg * this.owner.damageMultiplier);

                game.addEffect(this.x, this.y, this.z, this.color, this.isBurst ? 'burstHit' : 'hit');
                // Return immediately for smooth flow (removed delay 45 -> 0)
                this.startReturn(0);
            }

        } else if (this.state === 'whip') {
            // Line up in front of owner
            // Index 0 is closest, 4 is farthest
            const spacing = 40;
            const reach = (this.index + 1) * spacing + 40;
            const angle = this.owner.whipAngle || 0;

            // Dynamic extension using sin wave for 'crack' effect
            // Slower speed to match "Voice Length" (approx 1.4s)
            const time = (Date.now() - this.owner.whipStartTime) / 1400;
            // Extension phase: 0 to 1
            let extension = Math.sin(time * Math.PI);
            if (time > 1) extension = 0; // End

            if (extension <= 0 && time > 0.5) {
                this.state = 'returning';
                return;
            }

            const currentDist = reach * extension;

            this.x = this.owner.centerX + Math.cos(angle) * currentDist;
            this.y = this.owner.centerY + Math.sin(angle) * currentDist;
            this.z = this.owner.z + 40; // Waist height

            // Damage check in whip mode (continuous hitbox)
            if (extension > 0.5) { // Only hit at full extension
                const tBox = target.getBox();
                const rBox = this.getBox();
                if (checkCollision3D(rBox, tBox)) {
                    if (this.owner.canHitWhip) {
                        // target.takeDamage(5); 
                        target.vx = Math.cos(angle) * 5;
                        target.takeDamage(2 * this.owner.damageMultiplier); // Multi-hit potential, scaled
                        game.addEffect(this.x, this.y, this.z, '#fff', 'spark');
                    }
                }
            }

        } else if (this.state === 'returning') {
            const dx = this.owner.centerX - this.x;
            const dy = this.owner.centerY - this.y;
            const dz = (this.owner.z + 50) - this.z;

            let speed = RING_RETURN_SPEED_BASE;

            const toRingX = this.x - this.owner.centerX;
            if ((this.owner.vx > 0 && toRingX > 0) || (this.owner.vx < 0 && toRingX < 0)) {
                speed = RING_RETURN_SPEED_BOOST;
            }

            const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (totalDist > 0) {
                this.x += (dx / totalDist) * speed;
                this.y += (dy / totalDist) * speed;
                this.z += (dz / totalDist) * speed;
            }

            if (totalDist < 30) {
                this.state = 'orbit';
                this.isBurst = false;
            }
        }
    }

    throw(targetX, targetY, targetZ, isBurst = false, manualVector = null) {
        if (this.state !== 'orbit') return;
        this.state = 'thrown';
        this.isBurst = isBurst;

        let vx, vy, vz;

        if (manualVector) {
            // Manual Aim (Normalized 2D vector for direction, usually flat Z unless we add Z aim later)
            // Just shoot flat for now or maybe slightly up?
            // standard speed
            const angle = Math.atan2(manualVector.y, manualVector.x);
            vx = Math.cos(angle) * RING_SPEED;
            vy = Math.sin(angle) * RING_SPEED;
            vz = 0; // Flat throw
        } else {
            // Target Aim (3D)
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const dz = targetZ - this.z;

            let finalAngle = Math.atan2(dy, dx);
            if (isBurst) {
                finalAngle += (Math.random() - 0.5) * 0.5;
            }

            // To ensure constant speed in 3D
            // We calculate horizontal speed components first
            // Actually, keep it simple. Projectile speed RING_SPEED is total magnitude.
            const dist2d = Math.sqrt(dx * dx + dy * dy);
            const dist3d = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist3d < 0.1) {
                vx = RING_SPEED; vy = 0; vz = 0; // Default if on top of each other
            } else {
                vx = (dx / dist3d) * RING_SPEED;
                vy = (dy / dist3d) * RING_SPEED;
                vz = (dz / dist3d) * RING_SPEED;

                // Add burst randomization to final velocity vector slightly?
                // The angle logic above for burst was ignoring Z. 
                // Let's re-apply burst jitter if needed
                if (isBurst) {
                    vx += (Math.random() - 0.5) * 2;
                    vy += (Math.random() - 0.5) * 2;
                    vz += (Math.random() - 0.5) * 2;
                }
            }
        }

        this.vx = vx;
        this.vy = vy;
        this.vz = vz;
    }

    startReturn(delay = 0) {
        if (delay > 0) {
            this.state = 'waiting';
            this.waitTimer = delay;
        } else {
            this.state = 'returning';
        }
    }

    draw(ctx) {
        this.trail.forEach(t => {
            const drawY = t.y - t.z;
            ctx.fillStyle = this.color;
            ctx.globalAlpha = t.alpha;
            ctx.beginPath();
            ctx.arc(t.x, drawY, 6, 0, Math.PI * 2);
            ctx.fill();
            t.alpha -= 0.1;
        });

        ctx.globalAlpha = 1.0;
        const drawY = this.y - this.z;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;

        ctx.beginPath();
        ctx.arc(this.x, drawY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(this.x, drawY, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
    }
}

class Fighter {
    constructor(x, y, color, name, isAI = false, img) {
        this.x = x;
        this.y = y;
        this.z = 0;
        if (name === 'Father') {
            this.w = 70;
            this.h = 160;
        } else {
            // Son
            this.w = 55;
            this.h = 125;
        }

        this.vx = 0;
        this.vy = 0;
        this.vz = 0;

        this.color = color;
        this.name = name;
        this.isAI = isAI;
        this.img = img;
        this.hp = MAX_HP;
        this.facing = isAI ? -1 : 1;

        this.rings = [];
        for (let i = 0; i < 5; i++) {
            this.rings.push(new Ring(this, i, isAI ? '#2196f3' : '#ffd700'));
        }

        this.isGrounded = true;
        this.attackCooldown = 0;
        this.burstCooldown = 0;
        this.specialCooldown = 0;
        this.state = 'idle';
        this.stateTimer = 0;
        this.damageMultiplier = 1.0;
        this.rotation = 0; // For death anim
    }

    get centerX() { return this.x + this.w / 2; }
    get centerY() { return this.y; }
    get centerZ() { return this.z + this.h / 2; }

    getBox() {
        return { x: this.x, y: this.y, z: this.z, w: this.w, h: this.h };
    }

    update(target) {
        if (!this.isGrounded) {
            this.vz -= GRAVITY;
            this.z += this.vz;

            if (this.z <= 0) {
                this.z = 0;
                this.vz = 0;
                this.isGrounded = true;
                if (this.state !== 'dead') this.state = 'idle';
            }
        }

        // Death Physics
        if (this.state === 'dead') {
            // Slide friction
            this.x += this.vx;
            this.y += this.vy;
            this.vx *= 0.9;
            this.vy *= 0.9;

            if (this.isGrounded) {
                this.rotation = Math.min(Math.PI / 2, this.rotation + 0.1); // Fall over
            }
            return; // Skip normal update
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.isGrounded) {
            this.vx *= FRICTION;
            this.vy *= FRICTION;
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
            if (Math.abs(this.vy) < 0.1) this.vy = 0;
        }

        if (this.x < 0) this.x = 0;
        if (this.x + this.w > BASE_WIDTH) this.x = BASE_WIDTH - this.w;
        if (this.y < FLOOR_TOP) this.y = FLOOR_TOP;
        if (this.y > FLOOR_BOTTOM) this.y = FLOOR_BOTTOM;

        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.burstCooldown > 0) this.burstCooldown--;
        if (this.specialCooldown > 0) this.specialCooldown--;

        this.rings.forEach(ring => ring.update(target));

        if (this.stateTimer > 0) {
            this.stateTimer--;
            if (this.stateTimer <= 0) {
                if (['punch', 'kick', 'stun', 'burst', 'special', 'dragonWhip'].includes(this.state)) {
                    this.state = 'idle';
                }
            }
        }
    }

    move(dx, dy) {
        if (this.state === 'stun') return;

        this.vx += dx * 1.5;
        this.vy += dy * 1.5;

        const maxV = MOVE_SPEED;
        const maxVZ = Z_MOVE_SPEED;

        if (this.vx > maxV) this.vx = maxV;
        if (this.vx < -maxV) this.vx = -maxV;
        if (this.vy > maxVZ) this.vy = maxVZ;
        if (this.vy < -maxVZ) this.vy = -maxVZ;

        if (Math.abs(dx) > 0.1) {
            this.facing = dx > 0 ? 1 : -1;
            if (this.state === 'idle') this.state = 'run';
        }
    }

    jump() {
        if (this.isGrounded && this.state !== 'stun') {
            this.vz = JUMP_FORCE;
            this.isGrounded = false;
            this.state = 'jump';

            // Use 2 Rings for Jump Effect
            const readyRings = this.rings.filter(r => r.state === 'orbit');
            if (readyRings.length >= 2) {
                // Animate 2 rings
                const r1 = readyRings[0];
                const r2 = readyRings[1];

                [r1, r2].forEach(r => {
                    r.state = 'jump_boost';
                    r.waitTimer = 20; // Stay for a bit
                    r.jumpPos = { x: this.centerX, y: this.centerY, z: this.z };
                });

                if (game) game.addEffect(this.centerX, this.y, this.z, this.color, 'jumpLaunch');
            }

            if (typeof sfx !== 'undefined') sfx.playJump();
        }
    }

    meleeAttack(type, target) {
        if (this.attackCooldown > 0 || this.state === 'stun') return;

        this.state = type;
        this.stateTimer = 20;
        this.attackCooldown = 30;

        const range = type === 'punch' ? 60 : 70;
        let damage = type === 'punch' ? MELEE_DAMAGE : MELEE_DAMAGE + 2;
        damage *= this.damageMultiplier;

        // Improved Hitbox: Overlap slightly with self to catch close enemies
        const overlap = 30;
        const hitX = this.facing === 1 ? this.x + this.w - overlap : this.x - range + overlap;

        const attackBox = {
            x: hitX,
            y: this.y,
            z: this.z,
            w: range + overlap,
            h: this.h
        };

        if (checkCollision3D(attackBox, target.getBox())) {
            target.vx = this.facing * 8;
            target.takeDamage(damage);
            game.addEffect(target.centerX, target.centerY, target.z + 50, '#fff', 'hit');
        }
    }

    throwRing(target, manualVector = null) {
        if (this.state === 'stun') return;
        const ring = this.rings.find(r => r.state === 'orbit');
        if (ring) {
            // If manual vector, target coords are ignored by updated Ring.throw, but we pass placeholders
            ring.throw(target ? target.centerX : 0, target ? target.centerY : 0, target ? target.z + 50 : 0, false, manualVector);
            this.attackCooldown = 20;
            if (typeof sfx !== 'undefined') sfx.playThrow();
            return true;
        }
        return false;
    }

    burstAttack(target) {
        if (this.burstCooldown > 0 || this.state === 'stun') return;

        const availableRings = this.rings.filter(r => r.state === 'orbit');
        if (availableRings.length === 5) {
            availableRings.forEach(r => r.throw(target.centerX, target.centerY, target.z + 50, true));
            this.burstCooldown = 900;
            this.state = 'burst';
            this.stateTimer = 35; // Matches slower animation (5 frames * 90ms = 450ms approx 27 ticks)

            game.addEffect(this.centerX, this.centerY, this.z, this.color, 'shockwave');
            if (typeof sfx !== 'undefined') sfx.playBurst();
        }
    }

    whipAttack(target) {
        if (this.state === 'stun' || this.specialCooldown > 0) return;
        // Let's use attackCooldown for this one, but longer.
        if (this.attackCooldown > 0) return;

        const availableRings = this.rings.filter(r => r.state === 'orbit');
        if (availableRings.length === 5) {
            this.attackCooldown = 100; // Animation Lock (~1.6s)
            this.specialCooldown = 540; // Refill Time (9s) increased from 5s
            this.whipStartTime = Date.now();
            this.canHitWhip = true; // Reset hit flag? Actually in update we do continuous per frame safe damage

            // Calculate angle
            let angle = 0;
            if (this.isAI) {
                angle = Math.atan2(target.centerY - this.y, target.centerX - this.x);
            } else {
                // Player aims with Stick if active, else towards enemy
                if (aimStick.active) {
                    angle = Math.atan2(aimStick.input.y, aimStick.input.x);
                } else {
                    angle = Math.atan2(target.centerY - this.y, target.centerX - this.x);
                }
            }
            this.whipAngle = angle;

            availableRings.forEach(r => r.state = 'whip');
            game.addEffect(this.centerX, this.centerY, this.z, this.color, 'shockwave');
            if (typeof sfx !== 'undefined') sfx.playSnake();
        }
    }

    takeDamage(amount) {
        if (this.hp <= 0) return;

        this.hp -= amount;
        if (game) game.addEffect(this.x + this.w / 2, this.y + 20, this.z, '#fff', 'spark');

        if (this.hp < 0) this.hp = 0;

        if (this.hp <= 0) {
            this.state = 'dead';
            this.vx = -this.facing * 5; // Knockback
            this.vz = 10; // Pop up
            this.isGrounded = false;
            if (typeof sfx !== 'undefined') sfx.playBurst(); // Death sound
        } else {
            if (typeof sfx !== 'undefined') sfx.playHit();
        }
    }

    draw(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        const shadowScale = Math.max(0.5, 1 - (this.z / 200));
        const sW = this.w * shadowScale;
        const sH = 15 * shadowScale;

        ctx.beginPath();
        ctx.ellipse(this.centerX, this.y, sW / 2, sH / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        const drawX = this.x;
        // Adjust drawY to be grounded at foot level
        const drawY = this.y - this.h - this.z;

        ctx.save();
        if (this.hp <= 0) ctx.globalAlpha = 0.5;

        // Draw Image (Sprite Sheet Logic)
        if (this.img && this.img.complete) {

            // 1. Determine Animation State
            let animState = 'idle';
            // Include complex attacks for animation so he doesn't slide
            if (['punch', 'kick', 'burst', 'special', 'dragonWhip'].includes(this.state)) {
                animState = 'attack';
            } else if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
                animState = 'run';
            }

            // 2. Frame Calculation
            // 2. Frame Logic
            const cols = 6;
            const rows = 3;
            const frameW = this.img.width / cols;
            const frameH = this.img.height / rows;

            let row = 0;
            let startFrame = 0;
            let frameCount = 4;
            let speed = 200;
            let isLoop = true;

            if (animState === 'run') {
                row = 1;
                frameCount = 6;
                speed = 120; // Slower run
            } else if (animState === 'attack') {
                row = 2;
                speed = 90; // Heavier attacks
                isLoop = false; // Sync with state timer

                // Split Punch/Kick/Combo
                if (this.state === 'punch') {
                    startFrame = 0;
                    frameCount = 3;
                } else if (this.state === 'kick') {
                    // Kick is later in the row
                    startFrame = 3;
                    frameCount = 2; // Frames 3, 4
                } else {
                    // Burst/Special -> Full Combo
                    startFrame = 0;
                    frameCount = 5;
                }
            } else {
                // Idle
                startFrame = 0;
                frameCount = 4;
            }

            let frameIndex = 0;

            if (isLoop) {
                frameIndex = Math.floor(Date.now() / speed) % frameCount;
            } else {
                // One-shot animation based on State Timer
                // We want to map maxTime..0 to 0..frameCount-1
                let maxTime = 20;
                if (this.state === 'burst') maxTime = 35;

                // Inverse: 0 at maxTime, 1 at 0
                const progress = Math.max(0, Math.min(1, (maxTime - this.stateTimer) / maxTime));
                frameIndex = Math.floor(progress * frameCount);
                if (frameIndex >= frameCount) frameIndex = frameCount - 1;
            }

            const finalFrame = startFrame + frameIndex;
            const sx = finalFrame * frameW;
            const sy = row * frameH;


            // 3. Render Offsets & Scaling (Tuning)
            // 3. Render Offsets & Scaling (Tuning)
            // Revised scaling since Hitboxes are now accurate (1:1 with Visuals)
            let spriteOffsetX = 0;
            let spriteOffsetY = -10;
            let spriteScale = 1.0;

            // FATHER SPECIFIC ALIGNMENT
            if (this.name === 'Father') {
                spriteScale = 1.0;
                spriteOffsetY = -20;
            }

            // SOURCE RECTANGLE CLIPPING (Crucial for AI Sprite Sheets)
            // 1. Prevent "Sprite Below" showing: Clip bottom height significantly
            // 2. Prevent "Head Cut Off": Keep Top Y (sy) at 0 relative to row
            const bleedPadX = 2;
            const bleedPadBottom = 2; // Minimal crop to show Feet/Toes

            const srcX = sx + bleedPadX;
            const srcY = sy; // Start at very top of row to capture full head
            const srcW = frameW - (bleedPadX * 2);
            const srcH = frameH - bleedPadBottom;

            // Calculate dimensions preserving Aspect Ratio of the CASHED source
            const destH = Math.floor((this.h) * spriteScale);
            const aspectRatio = srcW / srcH;
            const destW = Math.floor(destH * aspectRatio);

            // Recalculate X offset to center the sprite on the hitbox
            // Hitbox Center: drawX + this.w / 2
            // Sprite Center: destX + destW / 2
            // We want Sprite Center = Hitbox Center
            // destX = (drawX + this.w / 2) - destW / 2 + customOffset

            // We'll use local translate for center-pivot drawing below, so we just need size here.

            // Draw Center Pivot Logic is best for handling width changes
            const centerX = Math.floor(drawX + this.w / 2);
            const bottomY = Math.floor(drawY + this.h);

            ctx.save();

            // Translate to feet position
            ctx.translate(centerX, bottomY + spriteOffsetY);

            // Flip if needed
            ctx.scale(this.facing, 1);

            // Death Rotation
            if (this.state === 'dead') {
                // pivot is feet, so this looks like falling backward
                ctx.rotate(-this.rotation * this.facing); // Rotate opposite to facing to fall 'back'
                ctx.translate(0, -10); // Adjust pivot slightly
            }

            // Draw image centered on X, anchored at bottom Y
            // (0,0) is now the feet pivot
            // Use calculated source rects
            ctx.drawImage(this.img, srcX, srcY, srcW, srcH, -destW / 2, -destH, destW, destH);

            ctx.restore();
        } else {
            // Fallback Rect
            ctx.fillStyle = this.color;
            ctx.fillRect(drawX, drawY, this.w, this.h);
            ctx.fillStyle = '#fff';
            const eyeOffset = this.facing === 1 ? this.w - 15 : 5;
            ctx.fillRect(drawX + eyeOffset, drawY + 10, 10, 10);
        }

        // Overhead HP bar removed; UI health bar displayed at top

        ctx.restore();

        this.rings.forEach(r => r.draw(ctx));
    }
}
