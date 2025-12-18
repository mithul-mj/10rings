class AIController {
    constructor(fighter, opponent, level = 1) {
        this.fighter = fighter;
        this.opponent = opponent;
        this.state = 'idle'; // idle, chase, retreat, orbit, aggressive
        this.stateTimer = 0;
        this.moveDir = { x: 0, y: 0 };
        this.reactionDelay = 0;

        // Difficulty Scaling
        this.level = level;
        // Reduce reaction delay as level increases. Base 15, -1 per level, min 0
        this.reactionBase = Math.max(0, 15 - (level * 2));
    }

    update() {
        if (this.fighter.hp <= 0) return;

        const dist = getDistance3D(this.fighter, this.opponent);
        const yDiff = this.fighter.y - this.opponent.y; // Signed Y diff
        const absYDiff = Math.abs(yDiff);
        const hasAmmo = this.fighter.rings.some(r => r.state === 'orbit');

        // State Machine Update
        this.stateTimer--;
        if (this.stateTimer <= 0) {
            this.pickNewState(dist, hasAmmo);
        }

        // --- Critical Reactions (Override State) ---

        // 1. Dodge Projectiles (with slight delay/chance)
        const incomingRing = this.opponent.rings.find(r => {
            return r.state === 'thrown' && getDistance3D(r, this.fighter) < 150;
        });

        if (incomingRing) {
            if (this.reactionDelay <= 0) {
                if (Math.random() < 0.15) this.fighter.jump(); // Jump dodge
                else if (Math.random() < 0.2) {
                    // Sidestep dodge
                    this.moveDir.y = Math.sign(this.fighter.y - incomingRing.y) || (Math.random() > 0.5 ? 1 : -1);
                    this.state = 'dodge';
                    this.stateTimer = 10;
                    this.reactionDelay = this.reactionBase + 15; // Reset cooldown
                }
                this.reactionDelay = this.reactionBase + 15; // Reset cooldown
            }
        }
        if (this.reactionDelay > 0) this.reactionDelay--;


        // --- State Execution ---

        let dx = this.moveDir.x;
        let dy = this.moveDir.y;

        if (this.state === 'idle') {
            // Just stand still or micro movements
            dx = 0; dy = 0;
            // Occasional pot shot
            // Occasional pot shot
            if (hasAmmo && dist < 500 && Math.random() < 0.005) this.fighter.throwRing(this.opponent);

        } else if (this.state === 'chase') {
            // Close distance
            dx = (this.fighter.x < this.opponent.x) ? 1 : -1;
            dy = (yDiff < -10) ? 1 : (yDiff > 10 ? -1 : 0);

            // If close enough, attack
            // Aggression Scales with level: 0.02 base * level multiplier
            const aggroMult = 1 + (this.level * 0.2);
            if (dist < 300 && hasAmmo && Math.random() < 0.02 * aggroMult) {
                this.fighter.throwRing(this.opponent);
            }
            if (dist < 60 && absYDiff < 30) {
                if (Math.random() < 0.5) this.fighter.meleeAttack('punch', this.opponent);
                else this.fighter.meleeAttack('kick', this.opponent);
            }

        } else if (this.state === 'retreat') {
            // Back off
            dx = (this.fighter.x < this.opponent.x) ? -1 : 1;
            dy = (yDiff < -20) ? 1 : (yDiff > 20 ? -1 : 0); // Align vaguely

            // Wall avoidance jump
            if ((this.fighter.x < 50 && dx === -1) ||
                (this.fighter.x > canvas.width - 50 && dx === 1)) {
                this.fighter.jump();
                dx = -dx; // Bounce off wall
            }

            // Defend while retreating
            if (hasAmmo && Math.random() < 0.02) this.fighter.throwRing(this.opponent);

        } else if (this.state === 'orbit') {
            // Circle around or drift vertically
            dx = 0;
            // Move vertically perpendicular to opponent line-ish
            dy = this.moveDir.y;

            // Keep X distance somewhat constant
            if (dist < 200) dx = (this.fighter.x < this.opponent.x) ? -1 : 1;
            else if (dist > 400) dx = (this.fighter.x < this.opponent.x) ? 1 : -1;

            if (hasAmmo && Math.random() < 0.01) this.fighter.throwRing(this.opponent);
        } else if (this.state === 'retrieve') {
            // Find nearest ring
            const returningRing = this.fighter.rings
                .filter(r => r.state === 'returning')
                .sort((a, b) => getDistance3D(a, this.fighter) - getDistance3D(b, this.fighter))[0];

            if (returningRing) {
                if (returningRing.x < this.fighter.x) dx = -1; else dx = 1;
                if (returningRing.y < this.fighter.y) dy = -1; else dy = 1;
            } else {
                this.state = 'retreat'; // Panic?
            }
        }

        this.fighter.move(dx, dy);
    }

    pickNewState(dist, hasAmmo) {
        const rand = Math.random();

        // Default Logic based on situation
        if (!hasAmmo) {
            // Prioritize retrieving rings or avoiding combat
            this.state = 'retrieve';
            this.stateTimer = 40;
            return;
        }

        if (dist < 100) {
            // Close Quarters
            if (rand < 0.6) {
                this.state = 'retreat';
                this.stateTimer = 20 + Math.random() * 20;
            } else {
                this.state = 'chase'; // Aggressive melee
                this.stateTimer = 15;
            }
        } else {
            // Mid/Long Range
            if (rand < 0.4) {
                this.state = 'orbit';
                this.moveDir.y = Math.random() > 0.5 ? 1 : -1;
                this.stateTimer = 50 + Math.random() * 50; // Longer orbit
            } else if (rand < 0.6) {
                this.state = 'chase';
                this.stateTimer = 30 + Math.random() * 30;
            } else {
                this.state = 'idle'; // Pause/Wait - More frequent
                this.stateTimer = 30 + Math.random() * 40; // Longer pause
            }
        }

        this.moveDir.x = (Math.random() - 0.5) * 2; // unused mostly
    }
}
