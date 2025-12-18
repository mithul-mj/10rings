class Particle {
    constructor(x, y, z, color, type) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.color = color;
        this.type = type;
        this.life = 1.0;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.vz = (Math.random() - 0.5) * 10;
        this.size = Math.random() * 5 + 2;
    }

    update() {
        // Type Specific Physics
        if (this.type === 'crater') {
            this.life -= 0.03;
            return; // Static
        }

        if (this.type === 'dust') {
            this.x += this.vx;
            this.y += this.vy;
            this.z += this.vz;
            this.vx *= 0.85; // Heavy Air resistance
            this.vy *= 0.85;
            this.size *= 1.05; // Expand
            this.life -= 0.03;
            return;
        }

        this.x += this.vx;
        this.y += this.vy;
        this.z += this.vz;
        this.vz -= GRAVITY * 0.5;
        this.vx *= 0.95; // Air resistance
        this.vy *= 0.95;

        // Floor bounce
        if (this.y > FLOOR_BOTTOM && this.vz < 0) {
            this.y = FLOOR_BOTTOM;
            this.vz *= -0.6;
            this.vx *= 0.8;
        }

        if (this.z < 0) {
            this.z = 0;
            this.vz *= -0.6;
            this.vx *= 0.8;
        }

        this.life -= 0.04;
        this.size *= 0.95;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();

        const drawY = this.y - this.z;

        if (this.type === 'dust') {
            ctx.fillStyle = `rgba(180, 170, 160, ${this.life * 0.4})`; // Dust color
            ctx.beginPath();
            ctx.arc(this.x, drawY, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'spike') {
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = this.life;
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.moveTo(this.x, drawY);
            ctx.lineTo(this.x, drawY - this.size * 3); // Long vertical streak
            ctx.stroke();
        } else if (this.type === 'crater') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.globalAlpha = this.life;
            // Scale Y to look flat
            ctx.beginPath();
            ctx.ellipse(this.x, drawY, this.size, this.size * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Standard Spark/Particle
            ctx.globalCompositeOperation = 'lighter'; // Core change for "glowing" look
            ctx.globalAlpha = this.life;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, drawY, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

class Shockwave {
    constructor(x, y, z, color, type = 'normal') {
        this.x = x;
        this.y = y;
        this.z = z;
        this.color = color;
        this.type = type;
        this.radius = (type === 'burst' || type === 'jump') ? 20 : 10;
        this.life = 1.0;
        this.lineWidth = (type === 'burst' || type === 'jump') ? 8 : 4;
        this.growthRate = type === 'jump' ? 15 : (type === 'burst' ? 25 : 12);
    }

    update() {
        this.radius += this.growthRate;
        this.life -= 0.08;
        this.lineWidth *= 0.9;
        this.growthRate *= 0.9; // Decelerate expansion
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.life;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.translate(this.x, this.y - this.z);
        ctx.scale(1, 0.4); // Perspective
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

class ImpactFlash {
    constructor(x, y, z, color, size = 30) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.color = '#ffffff'; // Always bright white core
        this.glowColor = color;
        this.size = size;
        this.life = 1.0;
        this.decay = 0.2; // Fast fade
    }

    update() {
        this.life -= this.decay;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.life;

        // Core
        ctx.fillStyle = this.color;
        const drawY = this.y - this.z;

        ctx.beginPath();
        ctx.arc(this.x, drawY, this.size * this.life, 0, Math.PI * 2);
        ctx.fill();

        // Outer Glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.glowColor;
        ctx.strokeStyle = this.glowColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, drawY, this.size * 1.5 * this.life, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}
